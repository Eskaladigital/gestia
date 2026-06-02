/**
 * Reanaliza todas las imágenes de referencia ya subidas (clasificación + rol +
 * reglas físicas automáticas). Útil tras aplicar la migración 028.
 *
 * Uso:
 *   npx tsx scripts/reanalyze-reference-images.ts
 *   npx tsx scripts/reanalyze-reference-images.ts --project-name=Nine Waves
 *   npx tsx scripts/reanalyze-reference-images.ts --project-id=<uuid>
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY (o clave en provider_api_keys del propietario del proyecto)
 *
 * En Windows con antivirus/proxy corporativo, si ves "fetch failed" / certificado SSL,
 * usa: npm run references:reanalyze  (launcher scripts/run-reanalyze.mjs)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  countReferenceImagesNeedingReanalysis,
  reanalyzeProjectReferenceImages,
} from '../src/lib/projects/reference-images';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) {
    console.error(`No existe ${p}. Copia .env.example → .env.local y rellena Supabase + OpenAI.`);
    return;
  }
  const text = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function formatFetchError(err: unknown, context: string): string {
  const e = err as Error & { cause?: unknown };
  const parts = [`${context}: ${e?.message || String(err)}`];
  if (e?.cause) {
    parts.push(`  causa: ${e.cause instanceof Error ? e.cause.message : String(e.cause)}`);
  }
  return parts.join('\n');
}

async function testSupabaseConnection(url: string, serviceKey: string): Promise<void> {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '(URL inválida)';
    }
  })();
  console.log(`Comprobando Supabase en ${host}…`);
  try {
    const probe = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!probe.ok && probe.status !== 401 && probe.status !== 404) {
      console.warn(`REST respondió HTTP ${probe.status} (seguimos con consulta a projects).`);
    }
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await service.from('projects').select('id').limit(1);
    if (error) {
      throw Object.assign(new Error(error.message), { cause: error });
    }
    console.log('Conexión a Supabase OK.\n');
  } catch (err) {
    console.error(formatFetchError(err, 'No se pudo conectar a Supabase'));
    console.error(`
Revisa en .env.local:
  - NEXT_PUBLIC_SUPABASE_URL debe ser https://xxxx.supabase.co (sin espacios ni comillas rotas)
  - SUPABASE_SERVICE_ROLE_KEY debe ser la service_role (no la anon)

Si la app en localhost SÍ funciona pero este script no, prueba:
  1. Abrir el proyecto en el navegador (clasifica solas al cargar la ficha)
  2. VPN/firewall/antivirus que bloquee Node hacia supabase.co
  3. npm run dev en otra terminal y PATCH manual vía la UI
`);
    process.exit(1);
  }
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : null;
}

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }
  if (!/^https:\/\/.+/i.test(url)) {
    console.error(`NEXT_PUBLIC_SUPABASE_URL no parece válida: "${url.slice(0, 40)}…"`);
    process.exit(1);
  }

  await testSupabaseConnection(url, serviceKey);

  const projectIdArg = getArg('project-id');
  const projectNameArg = getArg('project-name');

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let projectQuery = service.from('projects').select('id, name, user_id, physical_constraints');
  if (projectIdArg) {
    projectQuery = projectQuery.eq('id', projectIdArg);
  } else if (projectNameArg) {
    projectQuery = projectQuery.ilike('name', projectNameArg);
  }

  let projects: Array<{
    id: string;
    name: string;
    user_id: string;
    physical_constraints: string | null;
  }> | null = null;
  try {
    const { data, error: projErr } = await projectQuery;
    if (projErr) {
      console.error('Error leyendo proyectos:', projErr.message);
      process.exit(1);
    }
    projects = data;
  } catch (err) {
    console.error(formatFetchError(err, 'Error leyendo proyectos'));
    process.exit(1);
  }
  if (!projects?.length) {
    console.log('No se encontraron proyectos.');
    return;
  }

  let totalProcessed = 0;
  for (const project of projects) {
    const { data: images } = await service
      .from('project_reference_images')
      .select('*')
      .eq('project_id', project.id);

    const refs = (images || []) as import('../src/types').ProjectReferenceImage[];
    const pending = countReferenceImagesNeedingReanalysis(refs);
    if (refs.length === 0) {
      console.log(`[${project.name}] Sin referencias, omitido.`);
      continue;
    }
    if (pending === 0) {
      console.log(`[${project.name}] ${refs.length} referencias ya clasificadas.`);
      continue;
    }

    console.log(`[${project.name}] Reanalizando ${pending}/${refs.length} referencias…`);
    try {
      const { processed } = await reanalyzeProjectReferenceImages({
        service,
        projectId: project.id,
        userId: project.user_id as string,
        project: {
          id: project.id,
          physical_constraints: project.physical_constraints as string | null,
        },
      });
      totalProcessed += processed;
      console.log(`[${project.name}] ✓ ${processed} procesadas.`);
    } catch (err) {
      console.error(`[${project.name}] ✗`, (err as Error).message);
    }
  }

  console.log(`\nTotal imágenes reanalizadas: ${totalProcessed}`);
}

main().catch(err => {
  console.error(formatFetchError(err, 'Error inesperado'));
  process.exit(1);
});
