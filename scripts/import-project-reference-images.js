/**
 * Importa imágenes locales como referencias de producto de un proyecto.
 *
 * Uso:
 *   node scripts/import-project-reference-images.js
 *   node scripts/import-project-reference-images.js --project-name=Furgocasa --source-dir=IA_blog
 *   node scripts/import-project-reference-images.js --project-id=<uuid> --source-dir=IA_blog
 *
 * Requiere en .env.local o entorno:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PROJECT_NAME = 'Furgocasa';
const DEFAULT_SOURCE_DIR = 'IA_blog';
const BUCKET = 'project-reference-images';
const MAX_REFERENCE_IMAGES = 10;
const DEFAULT_PRIMARY_IMAGES = 4;

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printUsage() {
  console.log(`Uso:
  node scripts/import-project-reference-images.js
  node scripts/import-project-reference-images.js --project-name=${DEFAULT_PROJECT_NAME} --source-dir=${DEFAULT_SOURCE_DIR}
  node scripts/import-project-reference-images.js --project-id=<uuid> --source-dir=${DEFAULT_SOURCE_DIR}

Opciones:
  --project-name=<nombre>  Proyecto por nombre (default: ${DEFAULT_PROJECT_NAME})
  --project-id=<uuid>      Proyecto por id
  --source-dir=<ruta>      Carpeta con imágenes locales (default: ${DEFAULT_SOURCE_DIR})
  --help                   Muestra esta ayuda
`);
}

function sanitizeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildStoragePath(projectId, filename) {
  const safeName = sanitizeSegment(filename || 'referencia.png') || 'referencia.png';
  return `${projectId}/${safeName}`;
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function listLocalImages(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`No existe la carpeta ${sourceDir}`);
  }

  const files = fs.readdirSync(sourceDir)
    .map(name => path.join(sourceDir, name))
    .filter(filePath => fs.statSync(filePath).isFile())
    .filter(filePath => /\.(png|jpe?g|webp)$/i.test(filePath))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'es', { sensitivity: 'base' }));

  if (files.length === 0) {
    throw new Error(`No se encontraron imágenes en ${sourceDir}`);
  }
  if (files.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`La carpeta contiene ${files.length} imágenes y el máximo permitido es ${MAX_REFERENCE_IMAGES}`);
  }

  return files;
}

async function ensureBucket(supabase) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error && !String(error.message || '').includes('already exists')) {
    throw new Error(`No se pudo crear bucket ${BUCKET}: ${error.message}`);
  }
}

async function resolveProject(supabase, projectId, projectName) {
  if (projectId) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, user_id')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new Error(`Error buscando proyecto por id: ${error.message}`);
    if (!data) throw new Error(`No existe proyecto con id ${projectId}`);
    return data;
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, user_id')
    .ilike('name', `%${projectName}%`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error buscando proyecto por nombre: ${error.message}`);
  if (!data?.length) throw new Error(`No se encontró ningún proyecto llamado "${projectName}"`);
  if (data.length > 1) {
    const ids = data.map(row => `${row.name} (${row.id})`).join(', ');
    throw new Error(`Hay varios proyectos que coinciden con "${projectName}": ${ids}. Usa --project-id.`);
  }
  return data[0];
}

async function fetchExistingReferences(supabase, projectId) {
  const { data, error } = await supabase
    .from('project_reference_images')
    .select('id, storage_path, is_primary, sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('project_reference_images') || message.includes('schema cache')) {
      throw new Error('Falta la tabla project_reference_images. Ejecuta la migración 021 antes de importar referencias.');
    }
    throw new Error(`Error leyendo referencias actuales: ${error.message}`);
  }

  return data || [];
}

async function main() {
  loadEnvLocal();

  if (hasFlag('help')) {
    printUsage();
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en entorno/.env.local');
  }

  const projectIdArg = getArg('project-id');
  const projectName = getArg('project-name') || DEFAULT_PROJECT_NAME;
  const sourceDir = path.isAbsolute(getArg('source-dir') || '')
    ? getArg('source-dir')
    : path.join(ROOT, getArg('source-dir') || DEFAULT_SOURCE_DIR);

  const files = listLocalImages(sourceDir);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const project = await resolveProject(supabase, projectIdArg, projectName);
  const existing = await fetchExistingReferences(supabase, project.id);
  const existingByPath = new Map(existing.map(row => [row.storage_path, row]));
  const maxSortOrder = existing.reduce((max, row) => Math.max(max, row.sort_order || 0), -1);
  const currentPrimaryCount = existing.filter(row => row.is_primary).length;

  await ensureBucket(supabase);

  let nextSortOrder = maxSortOrder + 1;
  let autoPrimaryAssigned = 0;
  const rows = [];

  console.log(`Proyecto: ${project.name} (${project.id})`);
  console.log(`Carpeta origen: ${sourceDir}`);
  console.log(`Imágenes detectadas: ${files.length}`);
  console.log('');

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const storagePath = buildStoragePath(project.id, filename);
    const existingRow = existingByPath.get(storagePath);
    const mimeType = guessMimeType(filePath);
    const buffer = fs.readFileSync(filePath);

    console.log(`Subiendo: ${filename}`);

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (uploadErr) throw new Error(`Error subiendo ${filename}: ${uploadErr.message}`);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    if (!pub?.publicUrl) throw new Error(`No se pudo obtener la URL pública de ${filename}`);

    const shouldAutoPrimary =
      !existingRow &&
      currentPrimaryCount + autoPrimaryAssigned < DEFAULT_PRIMARY_IMAGES;
    if (shouldAutoPrimary) autoPrimaryAssigned += 1;

    rows.push({
      project_id: project.id,
      storage_path: storagePath,
      image_url: pub.publicUrl,
      original_filename: filename,
      mime_type: mimeType,
      file_size_bytes: buffer.length,
      is_primary: existingRow?.is_primary ?? shouldAutoPrimary,
      sort_order: existingRow?.sort_order ?? nextSortOrder++,
    });
  }

  const { error: upsertErr } = await supabase
    .from('project_reference_images')
    .upsert(rows, { onConflict: 'storage_path' });

  if (upsertErr) throw new Error(`Error guardando referencias en BD: ${upsertErr.message}`);

  console.log('');
  console.log(`Importación terminada. ${rows.length} imágenes procesadas.`);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
