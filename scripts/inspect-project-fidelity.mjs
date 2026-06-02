/**
 * Inspecciona reglas físicas y referencias de proyectos (comparación rápida).
 * Documentación: README.md § Fidelidad de producto / Scripts de mantenimiento.
 *
 * Uso (Windows / TLS local):
 *   node -r ./scripts/preload-tls-local.cjs ./node_modules/tsx/dist/cli.mjs scripts/inspect-project-fidelity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
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

const projectIdArg = process.argv.find(a => a.startsWith('--project-id='))?.slice('--project-id='.length)?.trim();

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan variables Supabase en .env.local');
    process.exit(1);
  }

  const service = createClient(url, key);

  let query = service
    .from('projects')
    .select('id, name, sector, description, physical_constraints, physical_constraints_at, ai_rules');
  if (projectIdArg) {
    query = query.eq('id', projectIdArg);
  } else {
    query = query.or('name.ilike.%Furgocasa%,name.ilike.%Nine Waves%');
  }
  const { data: projects, error } = await query.order('name');

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const project of projects || []) {
    console.log('\n' + '='.repeat(72));
    console.log(`PROYECTO: ${project.name}`);
    console.log(`ID: ${project.id}`);
    if (project.sector) console.log(`Sector: ${project.sector}`);
    console.log(`Reglas físicas (${(project.physical_constraints || '').length} chars, actualizado: ${project.physical_constraints_at || 'nunca'}):`);
    console.log('-'.repeat(72));
    console.log(project.physical_constraints?.trim() || '(vacío)');
    console.log('-'.repeat(72));

    const { data: refs } = await service
      .from('project_reference_images')
      .select(
        'original_filename, is_primary, reference_role, role_confidence, product_identity, product_traits, reference_view, caption, caption_status'
      )
      .eq('project_id', project.id)
      .order('is_primary', { ascending: false })
      .order('sort_order');

    console.log(`\nReferencias (${refs?.length || 0}):`);
    for (const r of refs || []) {
      console.log(`  • [${r.reference_role || 'pending'}${r.reference_view ? ` / ${r.reference_view}` : ''}] ${r.original_filename}`);
      if (r.product_identity) console.log(`    producto: ${r.product_identity}`);
      if (r.product_traits) console.log(`    rasgos: ${r.product_traits}`);
      if (r.caption) console.log(`    caption: ${r.caption.slice(0, 120)}${r.caption.length > 120 ? '…' : ''}`);
      if (r.role_confidence != null) console.log(`    confianza rol: ${r.role_confidence}`);
    }
  }
  console.log('\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
