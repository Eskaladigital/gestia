/**
 * Regenera todas las imágenes ya promptadas de un proyecto.
 *
 * Uso:
 *   node scripts/regenerate-project-images.js
 *   node scripts/regenerate-project-images.js --project-name=Furgocasa
 *   node scripts/regenerate-project-images.js --project-id=<uuid>
 *   node scripts/regenerate-project-images.js --project-name=Furgocasa --limit=10
 *   node scripts/regenerate-project-images.js --project-name=Furgocasa --skip=35
 *   node scripts/regenerate-project-images.js --project-name=Furgocasa --limit=3 --debug --dump-references=tmp/refs
 *   node scripts/regenerate-project-images.js --project-name=Furgocasa --limit=3 --no-references
 *
 * Flags de diagnóstico:
 *   --debug                 Imprime metadatos de cada referencia antes/después
 *                           de normalizar, tamaño del buffer enviado, etc.
 *   --dump-references=<dir> Vuelca los PNG normalizados a <dir> para inspección
 *                           manual (ver si sharp los está dejando bien).
 *   --no-references         Fuerza a generar sin referencias (contraste).
 *
 * Requiere en .env.local o entorno:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY (o una key OpenAI guardada para el owner del proyecto)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const openaiPkg = require('openai');
const OpenAI = openaiPkg.default || openaiPkg;
const { toFile } = openaiPkg;

const ROOT = path.join(__dirname, '..');
const BUCKET = 'visual-assets';

const DEFAULT_PROJECT_NAME = 'Furgocasa';
const REFINER_MODEL = 'gpt-5.4-mini';
const REFINER_TEMPERATURE = 0.18;
const REFINER_MAX_TOKENS = 1200;
const IMAGE_MODEL = 'gpt-image-2';
const IMAGE_SIZE = '1872x1248';
const IMAGE_QUALITY = 'high';
const MAX_REFERENCE_IMAGES = 4;

const MAX_PROMPT_LENGTH = 4000;
const MIN_PROMPT_LENGTH = 200;

const REALISM_REFINER_SYSTEM = `Eres un retocador de prompts para generacion de imagenes fotorrealistas. Recibes el prompt visible que el usuario ya ha aprobado. Tu trabajo es RETOCARLO para que el modelo de imagen lo interprete de la forma mas fotorrealista posible.

REGLAS ESTRICTAS:
- NO cambies la escena, los sujetos, los objetos, la accion ni la idea del prompt original. La escena que describe el usuario es sagrada.
- NO inventes elementos nuevos que no esten en el prompt original.
- NO elimines sujetos, objetos ni acciones que el prompt mencione.
- Si la escena es CONCEPTUAL o SURREALISTA (animales fuera de contexto, escalas imposibles, objetos donde no deberian estar, juxtaposiciones absurdas), CONSERVALA EXACTAMENTE: no la normalices, no la sustituyas por una escena corriente ni suavices el elemento imposible. Tu trabajo es que parezca una FOTOGRAFIA REAL de esa escena imposible, con luz y texturas creibles.
- SI puedes: mejorar la descripcion de la luz para que suene a luz natural real, sustituir adjetivos vagos por materiales o texturas concretas, añadir detalles de camara (tipo de plano, profundidad de campo) si no los tiene, y rebajar frases de ACABADO artificial (HDR, render, plastico, "poster de IA") sin tocar NUNCA el contenido conceptual de la escena.
- Si el prompt menciona personas, mantenlas pero asegurate de que la descripcion las presente naturales y no posadas.
- Si hay indicaciones de video (frame rate, travelling, motion blur), respetalas pero adaptalas para que funcionen como fotograma fijo: describe el instante congelado, no la secuencia.
- Si el prompt pide estetica UGC (contenido generado por usuarios, foto espontanea de movil), CONSERVA esa estetica y la mencion "estilo UGC": NO la profesionalices, no anadas lenguaje de camara profesional, shooting ni composicion editorial; manten el aspecto espontaneo, casero e imperfecto de una foto real de smartphone.
- Quita referencias a logotipos, marcas o texto visible que el modelo de imagen no puede renderizar bien.

FORMATO DE SALIDA:
- Un unico bloque de texto en espanol, sin saltos de linea, sin vinetas, sin comillas, sin markdown.
- Debe sonar a encargo fotografico profesional, no a instruccion artistica.
- No escribas nada antes ni despues del prompt retocado.`;

const IMAGE_REALISM_TAIL = [
  'Tomada como fotografia real con camara full frame profesional y optica de reportaje de alta calidad,',
  'luz existente fisicamente creible, color natural y balance de blancos realista, contraste moderado,',
  'grano minimo natural, detalle autentico en piel, telas, piedra, vegetacion o arquitectura segun la escena;',
  'sujeto u objeto principal ocupando entre un tercio y dos tercios del encuadre, con fondo real visible que contextualice;',
  'siempre de dia, luminosa y clara, nunca nocturna ni sombria;',
  'si aparecen personas, secundarias, naturales y no posadas;',
  'si la escena es conceptual o surrealista, manten el elemento imposible intacto y fotografialo con el mismo rigor documental que un encargo real;',
  'sin HDR agresivo, sin acabado plastico, sin render 3D, sin pintura digital, sin ilustracion, sin tipografia ni logotipos.',
].join(' ');

const UGC_STYLE_REGEX = /\bUGC\b|contenido generado por (el |los )?usuari/i;

const IMAGE_UGC_TAIL = [
  'Tomada como una foto real de smartphone hecha por un viajero normal, no por un fotografo:',
  'camara de movil actual, encuadre espontaneo y ligeramente imperfecto (horizonte no perfectamente recto, sujeto no perfectamente centrado),',
  'luz existente sin modificar (sol duro con sombras reales, interiores con luz mezclada, flash directo de movil si es de noche),',
  'colores naturales de camara de movil, ligero ruido digital en las sombras, profundidad de campo amplia tipica de movil,',
  'personas naturales capturadas en mitad de la accion, sin posar ni mirar a camara salvo en un selfie evidente;',
  'respeta el TIPO DE PLANO, la ESCALA, la HORA y la CALIDAD DE LUZ que describe la escena;',
  'nada de iluminacion de estudio, nada de composicion editorial perfecta, nada de aspecto de campana publicitaria o poster,',
  'sin HDR agresivo, sin acabado plastico, sin render 3D, sin ilustracion, sin tipografia ni logotipos.',
  'Debe parecer una foto autentica que un cliente real subiria a Instagram desde su movil.',
].join(' ');

const TOXIC_WORDS = [
  'magical', 'dreamy', 'ethereal', 'stunning', 'breathtaking',
  'luxurious', 'perfect', 'mágico', 'mágica', 'onírico', 'onírica',
  'etéreo', 'etérea', 'impresionante', 'perfecto', 'perfección',
  'lujoso', 'lujosa', 'soñador', 'soñadora', 'instagramable',
  'instagrammable', 'epico', 'epica', 'de ensueño', 'de ensueno',
];

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
  node scripts/regenerate-project-images.js
  node scripts/regenerate-project-images.js --project-name=${DEFAULT_PROJECT_NAME}
  node scripts/regenerate-project-images.js --project-id=<uuid>
  node scripts/regenerate-project-images.js --project-name=${DEFAULT_PROJECT_NAME} --limit=10
  node scripts/regenerate-project-images.js --project-name=${DEFAULT_PROJECT_NAME} --skip=35

Opciones:
  --project-name=<nombre>  Proyecto por nombre (default: ${DEFAULT_PROJECT_NAME})
  --project-id=<uuid>      Proyecto por id
  --limit=<n>              Limita cuántas imágenes regenera (después del skip)
  --skip=<n>               Omite las primeras n filas (mismo orden: content_item_id, visual_index). Para reanudar un lote.
  --help                   Muestra esta ayuda
`);
}

function cleanPrompt(raw) {
  let p = String(raw || '').trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  p = p.replace(/\s{2,}/g, ' ');
  for (const word of TOXIC_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    p = p.replace(re, '');
  }
  p = p.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
  p = p.replace(/--ar\s+\d+:\d+/gi, '').trim();
  return p;
}

function appendReferenceHandlingInstructions(prompt, referenceCount) {
  if (!referenceCount) return prompt;
  return `${prompt}

Si hay imágenes de referencia del producto, úsalas para respetar forma, proporciones, acabados, colores y rasgos distintivos del producto real, pero NO copies necesariamente el mismo ángulo, la misma altura de cámara, la misma distancia ni el mismo encuadre de esas referencias. La composición final debe obedecer a la escena descrita en este prompt y mantener variedad de planos entre piezas del proyecto.`;
}

async function buildFinalPrompt(openai, rawPrompt, referenceCount = 0) {
  const cleaned = cleanPrompt(rawPrompt);

  let prompt;
  try {
    const response = await openai.chat.completions.create({
      model: REFINER_MODEL,
      messages: [
        { role: 'system', content: REALISM_REFINER_SYSTEM },
        { role: 'user', content: appendReferenceHandlingInstructions(cleaned, referenceCount) },
      ],
      temperature: REFINER_TEMPERATURE,
      max_completion_tokens: REFINER_MAX_TOKENS,
    });
    prompt = cleanPrompt(response.choices?.[0]?.message?.content || cleaned);
  } catch (err) {
    console.warn(`[refiner] fallback al prompt original: ${err?.message || err}`);
    prompt = cleaned;
  }

  const isUgc = UGC_STYLE_REGEX.test(cleaned) || UGC_STYLE_REGEX.test(prompt);
  if (isUgc) {
    if (!/foto(graf[íi]a)?\s/i.test(prompt)) {
      prompt = `Foto espontanea de smartphone, estilo UGC, de ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;
    }
  } else if (!/fotograf[íi]a\s+hiperrealista/i.test(prompt)) {
    prompt = `Fotografia hiperrealista y cinematografica de ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;
  }

  prompt = `${appendReferenceHandlingInstructions(prompt, referenceCount)}\n\n${isUgc ? IMAGE_UGC_TAIL : IMAGE_REALISM_TAIL}`;

  if (prompt.length > MAX_PROMPT_LENGTH) prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
  if (prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error(`Prompt demasiado corto tras refinado (${prompt.length} chars)`);
  }

  return prompt;
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

async function resolveOpenAIKey(supabase, userId) {
  const { data, error } = await supabase
    .from('provider_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'openai')
    .maybeSingle();

  if (error) throw new Error(`Error leyendo provider_api_keys: ${error.message}`);
  return data?.api_key || process.env.OPENAI_API_KEY || '';
}

async function fetchProjectVisuals(supabase, projectId, limit) {
  let query = supabase
    .from('content_item_visuals')
    .select(`
      id,
      content_item_id,
      visual_index,
      label,
      visual_prompt,
      image_url,
      image_status,
      content_items!inner(
        id,
        scheduled_date,
        idea,
        project_id
      )
    `)
    .eq('content_items.project_id', projectId)
    .order('content_item_id', { ascending: true })
    .order('visual_index', { ascending: true });

  if (limit && Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Error leyendo visuals: ${error.message}`);
  return (data || []).filter(v => typeof v.visual_prompt === 'string' && v.visual_prompt.trim().length >= MIN_PROMPT_LENGTH);
}

async function fetchProjectReferenceImages(supabase, projectId, limit = MAX_REFERENCE_IMAGES) {
  const { data, error } = await supabase
    .from('project_reference_images')
    .select('id, image_url, original_filename, mime_type, is_primary, sort_order, created_at')
    .eq('project_id', projectId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('project_reference_images') || message.includes('schema cache')) {
      throw new Error('Falta la tabla project_reference_images. Ejecuta la migración 021 antes de regenerar con referencias.');
    }
    throw new Error(`Error leyendo imágenes de referencia: ${error.message}`);
  }

  return data || [];
}

const NORMALIZED_REFERENCE_MIME = 'image/png';
const NORMALIZED_REFERENCE_EXTENSION = 'png';
const MAX_REFERENCE_DIMENSION = 2048;

async function normalizeReferenceBuffer(input) {
  return sharp(input, { failOn: 'none', sequentialRead: true })
    .rotate()
    .resize({
      width: MAX_REFERENCE_DIMENSION,
      height: MAX_REFERENCE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColorspace('srgb')
    .png({ compressionLevel: 8 })
    .toBuffer();
}

async function downloadReferenceImages(referenceImages, opts = {}) {
  const { debug = false, dumpDir = null } = opts;
  const files = [];

  if (dumpDir && !fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  for (let i = 0; i < referenceImages.length; i++) {
    const image = referenceImages[i];
    const response = await fetch(image.image_url);
    if (!response.ok) {
      throw new Error(`No se pudo descargar la referencia ${image.original_filename}: HTTP ${response.status}`);
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    if (rawBuffer.length < 100) {
      throw new Error(`La referencia ${image.original_filename} llegó vacía (${rawBuffer.length} bytes)`);
    }

    if (debug) {
      try {
        const raw = await sharp(rawBuffer).metadata();
        console.log(
          `    · ref#${i + 1} IN  ${image.original_filename} → ` +
          `${raw.format} ${raw.width}x${raw.height} space=${raw.space} channels=${raw.channels} ` +
          `depth=${raw.depth} hasAlpha=${raw.hasAlpha} orientation=${raw.orientation ?? '-'} ` +
          `icc=${raw.icc ? 'yes' : 'no'} bytes=${rawBuffer.length}`
        );
      } catch (metaErr) {
        console.log(`    · ref#${i + 1} IN  (sharp no pudo leer metadatos: ${metaErr.message})`);
      }
    }

    const normalized = await normalizeReferenceBuffer(rawBuffer);

    if (debug) {
      try {
        const nrm = await sharp(normalized).metadata();
        console.log(
          `    · ref#${i + 1} OUT ${nrm.format} ${nrm.width}x${nrm.height} space=${nrm.space} ` +
          `channels=${nrm.channels} depth=${nrm.depth} hasAlpha=${nrm.hasAlpha} ` +
          `bytes=${normalized.length}`
        );
      } catch (metaErr) {
        console.log(`    · ref#${i + 1} OUT (sharp no pudo leer metadatos normalizados: ${metaErr.message})`);
      }
    }

    if (dumpDir) {
      const outPath = path.join(dumpDir, `reference-${i + 1}.png`);
      fs.writeFileSync(outPath, normalized);
      if (debug) console.log(`    · ref#${i + 1} volcado a ${outPath}`);
    }

    const filename = `reference-${i + 1}.${NORMALIZED_REFERENCE_EXTENSION}`;
    files.push(await toFile(normalized, filename, { type: NORMALIZED_REFERENCE_MIME }));
  }

  return files;
}

function dumpOpenAIError(err) {
  console.error('  ✗ OpenAI error:');
  console.error(`      name:    ${err?.name}`);
  console.error(`      status:  ${err?.status}`);
  console.error(`      code:    ${err?.code}`);
  console.error(`      type:    ${err?.type}`);
  console.error(`      message: ${err?.message}`);
  const reqId = err?.requestID || err?.request_id || err?.headers?.['x-request-id'];
  if (reqId) console.error(`      reqId:   ${reqId}`);
  if (err?.error) {
    try {
      console.error('      error:   ' + JSON.stringify(err.error, null, 2).replace(/\n/g, '\n      '));
    } catch {
      console.error('      error:   ' + String(err.error));
    }
  }
  if (err?.response) {
    const status = err.response.status;
    const headers = err.response.headers;
    console.error(`      response.status:  ${status}`);
    if (headers && typeof headers.get === 'function') {
      const reqIdHdr = headers.get('x-request-id') || headers.get('openai-request-id');
      if (reqIdHdr) console.error(`      response.reqId:   ${reqIdHdr}`);
    }
  }
}

function isOpenAIReferenceRejection(err) {
  if (!err) return false;
  const status = err.status;
  const message = String(err.message || '').toLowerCase();
  if (status && status !== 400) return false;
  return (
    message.includes('invalid image file') ||
    message.includes('invalid image') ||
    message.includes('invalid file') ||
    message.includes('mode for image') ||
    message.includes('unsupported image')
  );
}

async function markGenerating(supabase, visualId) {
  const { error } = await supabase
    .from('content_item_visuals')
    .update({ image_status: 'generating', image_error: null, updated_at: new Date().toISOString() })
    .eq('id', visualId);

  if (error) {
    console.warn(`[${visualId}] no se pudo marcar como generating: ${error.message}`);
  }
}

async function saveSuccess(supabase, visual, imageUrl) {
  const { error: saveErr } = await supabase
    .from('content_item_visuals')
    .update({
      image_url: imageUrl,
      image_status: 'ready',
      image_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', visual.id);

  if (saveErr) throw new Error(`Error guardando image_url en BD: ${saveErr.message}`);

  const { error: flipErr } = await supabase
    .from('content_item_visuals')
    .update({ image_flip_horizontal: false })
    .eq('id', visual.id);

  if (flipErr) {
    console.warn(`[${visual.id}] no se pudo resetear image_flip_horizontal: ${flipErr.message}`);
  }
}

async function saveError(supabase, visualId, message) {
  const { error } = await supabase
    .from('content_item_visuals')
    .update({
      image_status: 'error',
      image_error: String(message || 'Error desconocido').slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', visualId);

  if (error) {
    console.error(`[${visualId}] tampoco se pudo guardar el error: ${error.message}`);
  }
}

async function generateOneImage({ supabase, openai, projectId, visual, referenceImages, debug = false, dumpDir = null }) {
  await markGenerating(supabase, visual.id);

  const prompt = await buildFinalPrompt(openai, visual.visual_prompt, referenceImages.length);

  if (debug) {
    console.log(`  · prompt length: ${prompt.length} chars`);
    console.log(`  · referencias a enviar: ${referenceImages.length}`);
  }

  const generateWithoutReferences = () => openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
  });

  let response;
  if (referenceImages.length > 0) {
    try {
      const files = await downloadReferenceImages(referenceImages, { debug, dumpDir });
      if (debug) {
        console.log(`  · llamando images.edit con ${files.length} ficheros (${IMAGE_MODEL} ${IMAGE_SIZE} ${IMAGE_QUALITY})`);
      }
      response = await openai.images.edit({
        model: IMAGE_MODEL,
        image: files,
        prompt,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
      });
    } catch (editErr) {
      dumpOpenAIError(editErr);
      if (!isOpenAIReferenceRejection(editErr)) throw editErr;
      console.warn(`  ⚠ OpenAI rechazó las referencias. Regenerando sin referencias.`);
      response = await generateWithoutReferences();
    }
  } else {
    response = await generateWithoutReferences();
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('La API no devolvió b64_json');

  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length < 1000) throw new Error(`Imagen demasiado pequeña (${buffer.length} bytes)`);

  await ensureBucket(supabase);

  const contentItemId = visual.content_item_id;
  const ts = Date.now();
  const storagePath = `${projectId}/${contentItemId}/${visual.visual_index}-${ts}.png`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (uploadErr) throw new Error(`Error subiendo imagen: ${uploadErr.message}`);

  const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const imageUrl = pubData?.publicUrl;
  if (!imageUrl) throw new Error('No se pudo obtener la URL pública');

  await saveSuccess(supabase, visual, imageUrl);
  return { imageUrl, storagePath, promptLength: prompt.length };
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
  const limitArg = parseInt(getArg('limit') || '', 10);
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : null;
  const skipArg = parseInt(getArg('skip') || '', 10);
  const skip = Number.isFinite(skipArg) && skipArg > 0 ? skipArg : 0;
  const debug = hasFlag('debug');
  const noRefs = hasFlag('no-references');
  const dumpDirArg = getArg('dump-references');
  const dumpDir = dumpDirArg
    ? (path.isAbsolute(dumpDirArg) ? dumpDirArg : path.join(ROOT, dumpDirArg))
    : null;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const project = await resolveProject(supabase, projectIdArg, projectName);
  const openaiKey = await resolveOpenAIKey(supabase, project.user_id);
  if (!openaiKey) {
    throw new Error(`El proyecto "${project.name}" no tiene API key OpenAI disponible`);
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const rawReferenceImages = await fetchProjectReferenceImages(supabase, project.id);
  const referenceImages = noRefs ? [] : rawReferenceImages;
  const fetchLimit = skip > 0 ? null : limit;
  let visuals = await fetchProjectVisuals(supabase, project.id, fetchLimit);
  if (skip > 0) {
    visuals = visuals.slice(skip);
    if (limit) visuals = visuals.slice(0, limit);
  }

  if (!visuals.length) {
    console.log(`No hay visuals promptados para regenerar en "${project.name}".`);
    return;
  }

  console.log(`Proyecto: ${project.name} (${project.id})`);
  console.log(`Owner: ${project.user_id}`);
  if (skip > 0) console.log(`Skip: ${skip} (reanudación)`);
  console.log(`Total visuals a regenerar: ${visuals.length}`);
  console.log(`Modelo imagen: ${IMAGE_MODEL} · ${IMAGE_SIZE} · ${IMAGE_QUALITY}`);
  console.log(`Refiner: ${REFINER_MODEL}`);
  console.log(`Referencias de producto: ${referenceImages.length}${noRefs && rawReferenceImages.length ? ` (forzado --no-references, había ${rawReferenceImages.length})` : ''}`);
  if (debug) console.log('Modo debug activado.');
  if (dumpDir) console.log(`Volcado de referencias normalizadas: ${dumpDir}`);
  console.log('');

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < visuals.length; i++) {
    const visual = visuals[i];
    const item = visual.content_items || {};
    const tag = `${i + 1}/${visuals.length}`;
    const label = visual.label || `Visual ${visual.visual_index + 1}`;
    const meta = [item.scheduled_date, label, (item.idea || '').slice(0, 80)].filter(Boolean).join(' · ');

    console.log(`[${tag}] ${meta}`);

    try {
      const result = await generateOneImage({
        supabase,
        openai,
        projectId: project.id,
        visual,
        referenceImages,
        debug,
        dumpDir,
      });
      ok++;
      console.log(`  ✓ ${result.imageUrl}`);
    } catch (err) {
      failed++;
      const message = err?.message || String(err);
      await saveError(supabase, visual.id, message);
      if (debug) dumpOpenAIError(err);
      console.error(`  ✗ ${message}`);
    }
  }

  console.log('');
  console.log(`Terminado. OK: ${ok} · Error: ${failed}`);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
