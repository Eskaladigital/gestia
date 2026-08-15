/**
 * Ejecuta el pipeline de Gestia para Rebel Classic Raid contra el servidor local,
 * autenticando como el admin owner vía magic-link OTP (service role).
 *
 * Requisitos:
 *   - npm run dev en marcha (por defecto http://localhost:3000)
 *   - Proyecto ya creado (bootstrap-rebel-classic-raid.mjs --confirm)
 *
 * Uso:
 *   node -r ./scripts/preload-tls-local.cjs scripts/run-rcr-pipeline.mjs --project-id=<uuid>
 *   node -r ./scripts/preload-tls-local.cjs scripts/run-rcr-pipeline.mjs --project-id=<uuid> --from=strategy
 *   node -r ./scripts/preload-tls-local.cjs scripts/run-rcr-pipeline.mjs --project-id=<uuid> --only=calendar,briefs
 *
 * Pasos: brand, site, competitors, strategy, calendar, briefs
 * Calendario por defecto: agosto 2026 completo (month=7, year=2026, replace).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const OWNER_EMAIL = 'contacto@eskaladigital.com';
const DEFAULT_BASE = 'http://localhost:3000';

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
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

function getArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(a => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length).trim() : '';
}

/** Auth para APIs: Bearer access_token (soportado por createServerSupabase + middleware). */
function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function readSse(res) {
  const text = await res.text();
  const events = [];
  const chunks = text.split('\n\n');
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const lines = chunk.split('\n');
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        events.push({ event, data });
      }
    }
  }
  return events;
}

async function main() {
  loadEnvLocal();
  const projectId = getArg('project-id');
  if (!projectId) {
    console.error('Falta --project-id=<uuid>');
    process.exit(1);
  }

  const base = (getArg('base') || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE).replace(/\/$/, '');
  const from = getArg('from');
  const only = getArg('only');
  const allSteps = ['brand', 'site', 'competitors', 'strategy', 'calendar', 'briefs'];
  let steps = allSteps;
  if (only) {
    steps = only.split(',').map(s => s.trim()).filter(Boolean);
  } else if (from) {
    const idx = allSteps.indexOf(from);
    if (idx < 0) {
      console.error(`--from inválido. Usa: ${allSteps.join(', ')}`);
      process.exit(1);
    }
    steps = allSteps.slice(idx);
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !serviceKey || !anonKey) {
    console.error('Faltan vars Supabase en .env.local');
    process.exit(1);
  }

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Auth magiclink → ${OWNER_EMAIL}`);
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: OWNER_EMAIL,
  });
  if (linkErr) {
    console.error('generateLink:', linkErr.message);
    process.exit(1);
  }
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) {
    console.error('No hashed_token en generateLink');
    process.exit(1);
  }

  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });
  if (otpErr || !otpData?.session) {
    console.error('verifyOtp:', otpErr?.message || 'sin sesión');
    process.exit(1);
  }

  const accessToken = otpData.session.access_token;
  console.log(`Base API: ${base}`);
  console.log(`Proyecto: ${projectId}`);
  console.log(`Pasos: ${steps.join(' → ')}`);

  // Smoke: listar proyectos
  {
    const res = await fetch(`${base}/api/projects`, {
      headers: authHeaders(accessToken),
    });
    const t = await res.text();
    if (!res.ok) {
      console.error(`Auth/API smoke falló (${res.status}): ${t.slice(0, 400)}`);
      console.error('¿Está `npm run dev` en marcha?');
      process.exit(1);
    }
    let n = '?';
    try {
      n = JSON.parse(t).projects?.length;
    } catch {
      /* ignore */
    }
    console.log(`✓ Sesión OK contra /api/projects (${n} proyectos)`);
  }

  async function postJson(endpoint, body, { sse = false } = {}) {
    const res = await fetch(`${base}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        ...(sse ? { Accept: 'text/event-stream' } : {}),
      },
      body: JSON.stringify(body),
    });
    return res;
  }

  for (const step of steps) {
    console.log(`\n▶ ${step}…`);
    const t0 = Date.now();

    if (step === 'brand' || step === 'site' || step === 'competitors' || step === 'strategy') {
      const endpoint =
        step === 'brand'
          ? 'analyze-brand'
          : step === 'site'
            ? 'analyze-site'
            : step === 'competitors'
              ? 'analyze-competitors'
              : 'generate-strategy';
      const res = await postJson(endpoint, { project_id: projectId });
      const text = await res.text();
      if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${text.slice(0, 800)}`);
      let preview = text.slice(0, 220).replace(/\s+/g, ' ');
      try {
        const data = JSON.parse(text);
        preview = JSON.stringify({
          ok: true,
          keys: Object.keys(data).slice(0, 12),
          screenshots: data.screenshots || undefined,
          error: data.error || undefined,
        });
      } catch {
        /* keep preview */
      }
      console.log(`  response: ${preview}`);
      console.log(`✓ ${step} (${Math.round((Date.now() - t0) / 1000)}s)`);
      continue;
    }

    if (step === 'calendar') {
      const res = await postJson(
        'generate-calendar',
        {
          project_id: projectId,
          month: 7, // agosto
          year: 2026,
          duration_months: 1,
          calendar_mode: 'replace',
          // mes completo desde el día 1 (sin start_date)
        },
        { sse: true }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`generate-calendar ${res.status}: ${text.slice(0, 800)}`);
      }
      const events = await readSse(res);
      const done = events.filter(e => e.event === 'done' || e.data?.phase === 'done' || e.event === 'complete');
      const errors = events.filter(e => e.event === 'error' || e.data?.error);
      if (errors.length) {
        console.error('SSE errors:', JSON.stringify(errors.slice(0, 3), null, 2));
        throw new Error('generate-calendar devolvió error SSE');
      }
      console.log(`  eventos SSE: ${events.length}; done: ${done.length}`);
      const last = events[events.length - 1];
      if (last) console.log('  último:', JSON.stringify(last.data).slice(0, 300));
      console.log(`✓ calendar agosto 2026 (${Math.round((Date.now() - t0) / 1000)}s)`);
      continue;
    }

    if (step === 'briefs') {
      // Misma estrategia que BriefsProgressModal: fijar content_item_ids y paginar offset.
      const listRes = await fetch(`${base}/api/projects`, { headers: authHeaders(accessToken) });
      // IDs desde Supabase vía un endpoint no disponible: pedimos al propio generate
      // con offset 0 sin ids la primera vez; mejor obtenerlos con service en el script.
      const { createClient } = await import('@supabase/supabase-js');
      const svc = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: itemRows } = await svc
        .from('content_items')
        .select('id')
        .eq('project_id', projectId)
        .order('scheduled_date', { ascending: true });
      const contentItemIds = (itemRows || []).map(r => r.id);
      if (!contentItemIds.length) throw new Error('No hay content_items para briefs');

      // Si ya hubo un batch previo (p. ej. offset 0–9), arrancar desde --briefs-offset=
      let offset = Number(getArg('briefs-offset') || '0') || 0;
      let batch = 0;
      for (;;) {
        batch += 1;
        const res = await postJson(
          'generate-visual-briefs',
          {
            project_id: projectId,
            content_item_ids: contentItemIds,
            batch_offset: offset,
            batch_size: 10,
          },
          { sse: true }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`generate-visual-briefs ${res.status}: ${text.slice(0, 800)}`);
        }
        const events = await readSse(res);
        const errors = events.filter(e => e.event === 'error' || e.data?.error);
        if (errors.length) {
          console.error('SSE errors:', JSON.stringify(errors.slice(0, 3), null, 2));
          throw new Error('generate-visual-briefs devolvió error SSE');
        }
        const complete = [...events]
          .reverse()
          .find(e => e.event === 'batch_complete' || e.event === 'complete');
        const data = complete?.data || {};
        console.log(
          `  batch ${batch}: offset=${offset} visualsDone=${data.visualsDone ?? '?'} / ${data.totalVisuals ?? '?'} hasMore=${data.hasMore} event=${complete?.event}`
        );
        if (!complete || complete.event === 'complete' || data.hasMore === false) break;
        offset = typeof data.nextOffset === 'number' ? data.nextOffset : offset + 10;
        if (batch > 40) throw new Error('Demasiados batches de briefs; abortando');
      }
      console.log(`✓ briefs (${Math.round((Date.now() - t0) / 1000)}s)`);
      continue;
    }

    throw new Error(`Paso desconocido: ${step}`);
  }

  console.log('\n✓ Pipeline completado.');
}

main().catch(err => {
  console.error('\n✗', err.message || err);
  process.exit(1);
});
