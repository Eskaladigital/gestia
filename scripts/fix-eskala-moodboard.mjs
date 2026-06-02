/**
 * Eskala Marketing: moodboard de estilo (agencia), no producto físico.
 * - Las 3 referencias pasan a rol "style"
 * - Limpia identidad de producto y regenera reglas físicas (deben quedar vacías)
 *
 * Uso: node -r ./scripts/preload-tls-local.cjs scripts/fix-eskala-moodboard.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROJECT_ID = '41f64809-7c6a-4d24-830b-bd397f1b9578';

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

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan variables Supabase en .env.local');
    process.exit(1);
  }

  const service = createClient(url, key);

  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, name, user_id, physical_constraints')
    .eq('id', PROJECT_ID)
    .single();
  if (projErr || !project) {
    console.error('Proyecto no encontrado:', projErr?.message);
    process.exit(1);
  }
  console.log(`Proyecto: ${project.name}`);

  const { data: refs, error: refErr } = await service
    .from('project_reference_images')
    .select('id, original_filename, reference_role')
    .eq('project_id', PROJECT_ID);
  if (refErr) {
    console.error(refErr.message);
    process.exit(1);
  }

  for (const ref of refs || []) {
    const { error } = await service
      .from('project_reference_images')
      .update({
        reference_role: 'style',
        role_is_manual: true,
        product_identity: null,
        product_traits: null,
        reference_view: null,
      })
      .eq('id', ref.id);
    if (error) {
      console.error(`Error en ${ref.original_filename}:`, error.message);
      process.exit(1);
    }
    console.log(`✓ ${ref.original_filename}: ${ref.reference_role} → style`);
  }

  const { error: clearErr } = await service
    .from('projects')
    .update({ physical_constraints: null, physical_constraints_at: null })
    .eq('id', PROJECT_ID);
  if (clearErr) {
    console.error('Error limpiando reglas físicas:', clearErr.message);
    process.exit(1);
  }
  console.log('✓ Reglas físicas borradas (sin fotos de producto).');

  console.log('\nListo. Regenera las imágenes del calendario desde la app.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
