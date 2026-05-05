/**
 * ⚠️ SERVER-ONLY.
 *
 * Este módulo carga `sharp` (binario nativo), `openai` y `@supabase/supabase-js`.
 * NO lo importes desde Client Components ni desde código que acabe en el
 * bundle del navegador: Turbopack intentaría bundlear sharp, detectaría
 * `fs` / `child_process` y haría fallar el build de Vercel.
 *
 * Para constantes, tipos y helpers puros apto para cliente usa
 * `./reference-images-shared.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import type { ProjectReferenceImage } from '@/types';

import {
  MAX_REFERENCE_IMAGE_DIMENSION,
  NORMALIZED_REFERENCE_EXTENSION,
  NORMALIZED_REFERENCE_MIME,
  PROJECT_REFERENCE_IMAGES_BUCKET,
  isProjectReferenceImagesTableError,
} from './reference-images-shared';

export {
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  MAX_PROJECT_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGE_DIMENSION,
  NORMALIZED_REFERENCE_EXTENSION,
  NORMALIZED_REFERENCE_MIME,
  PROJECT_REFERENCE_IMAGES_BUCKET,
  buildProductReferenceGuidance,
  buildProjectReferenceImageStoragePath,
  extractImageBase64FromResponse,
  isOpenAIReferenceImageRejection,
  isProjectReferenceImagesTableError,
} from './reference-images-shared';

export async function ensureProjectReferenceImagesBucket(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.storage.getBucket(PROJECT_REFERENCE_IMAGES_BUCKET);
  if (data) return;

  const { error } = await supabase.storage.createBucket(PROJECT_REFERENCE_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });

  if (error && !String(error.message || '').includes('already exists')) {
    throw new Error(`No se pudo crear el bucket ${PROJECT_REFERENCE_IMAGES_BUCKET}: ${error.message}`);
  }
}

export async function listProjectReferenceImages(
  supabase: SupabaseClient,
  projectId: string,
  limit?: number
): Promise<ProjectReferenceImage[]> {
  let query = supabase
    .from('project_reference_images')
    .select('*')
    .eq('project_id', projectId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (limit && Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    if (isProjectReferenceImagesTableError(error)) return [];
    throw new Error(`Error leyendo imágenes de referencia: ${error.message}`);
  }

  return (data || []) as ProjectReferenceImage[];
}

/**
 * Normaliza cualquier buffer de imagen (JPEG, PNG, WebP, CMYK, RGBA, con EXIF
 * de orientación, perfil ICC raro, etc.) a un PNG 8-bit en sRGB aplanado sobre
 * fondo blanco, sin metadatos, y como máximo de 2048 px de lado.
 *
 * Esto es lo que espera comer cualquier modelo de OpenAI sin quejarse con
 * "Invalid image file or mode for image N".
 */
export async function normalizeReferenceImageBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'none', sequentialRead: true })
    .rotate()
    .resize({
      width: MAX_REFERENCE_IMAGE_DIMENSION,
      height: MAX_REFERENCE_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColorspace('srgb')
    .png({ compressionLevel: 8 })
    .toBuffer();
}

/**
 * Descarga las referencias y las devuelve como archivos aptos para `images.edit`.
 *
 * Cada imagen pasa por el normalizador (sharp) para garantizar que OpenAI nunca
 * la rechace por modo de color, orientación EXIF, metadatos o MIME ambiguo.
 */
export async function downloadReferenceImagesAsFiles(
  referenceImages: ProjectReferenceImage[]
): Promise<Awaited<ReturnType<typeof toFile>>[]> {
  const files = [];

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

    const normalized = await normalizeReferenceImageBuffer(rawBuffer);
    const filename = `reference-${i + 1}.${NORMALIZED_REFERENCE_EXTENSION}`;
    const file = await toFile(normalized, filename, { type: NORMALIZED_REFERENCE_MIME });
    files.push(file);
  }

  return files;
}

/**
 * Resuelve la API key de OpenAI del usuario propietario del proyecto. Cae
 * a la variable de entorno si el usuario no tiene una guardada en
 * `provider_api_keys`. Usar siempre el supabase con service role: las RLS
 * de provider_api_keys solo dejan SELECT al propio usuario.
 */
export async function resolveOpenAIKeyForUser(
  serviceSupabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data } = await serviceSupabase
      .from('provider_api_keys')
      .select('api_key')
      .eq('user_id', userId)
      .eq('provider', 'openai')
      .maybeSingle();
    if (data?.api_key) return data.api_key as string;
  } catch {
    /* ignore */
  }
  return process.env.OPENAI_API_KEY || '';
}

// ============================================================
// Captioning: descripción libre de qué se ve en la referencia
// ============================================================
//
// Genera con IA una descripción de 1-2 frases por cada imagen de referencia,
// pensada para que más adelante un selector LLM decida qué referencias son
// relevantes para un slide concreto.
//
// Modelo: gpt-4o-mini con visión (rápido y barato, suficiente para describir
// en lenguaje natural). Si falla devuelve null y el caller marca status=error.

export const REFERENCE_CAPTION_MODEL = 'gpt-4o-mini';
export const REFERENCE_CAPTION_MAX_LENGTH = 320;

const REFERENCE_CAPTION_SYSTEM = `Eres un editor de stock fotográfico. Describes en una o dos frases en español qué se ve en una imagen, de forma neutra, concreta y útil para un buscador. Tu único objetivo es que un compañero pueda saber, leyendo tu descripción, qué imagen es y para qué slide podría servir.

REGLAS:
- 1 o 2 frases, máximo 320 caracteres totales.
- Empieza identificando si la imagen es un EXTERIOR, un INTERIOR, un DETALLE, un PACKSHOT/PRODUCTO, un LOGO, un PAISAJE, una PERSONA, una ESCENA, un CARTEL, un MAPA, etc. Si no encaja en una categoría obvia, descríbelo igualmente con palabras claras.
- Después da los 3-5 detalles más reconocibles: protagonista, color dominante, ángulo, distribución espacial si es relevante, elementos clave visibles.
- Si es interior con distribución (cocina, cama, mesa, asientos…), dilo y enumera los muebles/zonas en el orden en que se ven.
- Si es un logotipo o tipografía, describe forma, palabra o iniciales y colores.
- NO inventes marcas, modelos ni datos técnicos que no se vean.
- NO uses adjetivos vacíos ("bonito", "elegante", "maravilloso").
- NO uses listas, viñetas ni saltos de línea.
- Devuelve SOLO la descripción en texto plano, sin comillas, sin markdown.`;

const REFERENCE_CAPTION_USER = `Describe esta imagen en una o dos frases siguiendo las reglas del sistema. Si es un interior, indica claramente que es un interior y describe la distribución espacial y los muebles/zonas visibles. Si es un exterior, dilo. Si es un logo, dilo. Sé concreto y breve.`;

/**
 * Llama a OpenAI con visión para generar un caption de la referencia.
 * Devuelve el texto trim+truncado o null si la IA no devolvió nada útil.
 */
export async function generateReferenceImageCaption(params: {
  apiKey: string;
  imageUrl: string;
}): Promise<string | null> {
  const { apiKey, imageUrl } = params;
  if (!apiKey) throw new Error('Falta API key de OpenAI para generar el caption.');
  if (!imageUrl) throw new Error('Falta URL de la imagen para generar el caption.');

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: REFERENCE_CAPTION_MODEL,
    temperature: 0.2,
    max_completion_tokens: 220,
    messages: [
      { role: 'system', content: REFERENCE_CAPTION_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: REFERENCE_CAPTION_USER },
          { type: 'image_url' as const, image_url: { url: imageUrl, detail: 'high' as const } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || '';
  const cleaned = raw
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, REFERENCE_CAPTION_MAX_LENGTH);
}

// ============================================================
// Selección de referencias por slide
// ============================================================
//
// Dado el prompt visual de un slide y la lista de referencias del proyecto
// con sus captions, pide a un LLM ligero qué referencias son las más
// relevantes para este slide. Devuelve un array de IDs ordenados por
// relevancia (1º = más relevante). Si la IA falla o no hay captions, el
// caller decide el fallback (todas las refs).
//
// Es agnóstico al sector: vale para "interior con cocina y cama" como para
// "logotipo blanco sobre fondo negro".

export const REFERENCE_SELECTOR_MODEL = 'gpt-4o-mini';
const REFERENCE_SELECTOR_SYSTEM = `Eres un asistente de dirección de arte. Te paso (a) el prompt visual de UN slide concreto que se va a generar y (b) un catálogo de imágenes de referencia del proyecto, cada una con un identificador y una descripción libre. Tu tarea es decidir qué referencias son verdaderamente útiles para que el modelo de imagen genere ese slide concreto.

CRITERIOS:
- Si el slide es de interior, prioriza referencias de interior (distribución, muebles, ventanas, techo). Las de exterior están PROHIBIDAS salvo que no haya ninguna interior y aporten algo concreto.
- Si el slide es de exterior, prioriza referencias de exterior (carrocería, silueta, color, lugar). Las de interior están PROHIBIDAS salvo que no haya ninguna exterior.
- Si el slide es un detalle (rueda, faro, mano, taza, mapa…), prioriza referencias de detalle del mismo objeto. Si no las hay, escoge la imagen general que mejor describa ese objeto y nada más.
- Si el slide es un logo, una tipografía o una marca gráfica, prioriza referencias de logo. Las foto-realistas están PROHIBIDAS para este caso.
- Si el slide es una escena humana, una persona, un paisaje o algo no relacionado con el producto principal, NO incluyas referencias del producto si solo van a contaminar la generación. En esos casos puedes devolver lista vacía.
- Devuelve como mucho 4 referencias y como mínimo 0.
- Ordena la lista de más relevante a menos.

FORMATO DE SALIDA: SOLO un JSON válido sin texto adicional con esta forma:
{ "selected_ids": ["id1", "id2"], "reasoning": "una frase corta en español explicando el criterio" }
Si no hay ninguna referencia útil para este slide, devuelve { "selected_ids": [], "reasoning": "..." }.`;

export interface ReferenceCatalogEntry {
  id: string;
  caption: string;
}

export interface ReferenceSelectionResult {
  selectedIds: string[];
  reasoning: string;
}

export async function selectRelevantReferenceImages(params: {
  apiKey: string;
  visualPrompt: string;
  catalog: ReferenceCatalogEntry[];
  maxResults?: number;
}): Promise<ReferenceSelectionResult | null> {
  const { apiKey, visualPrompt, catalog } = params;
  const maxResults = params.maxResults ?? 4;
  if (!apiKey || !visualPrompt.trim() || catalog.length === 0) return null;

  const openai = new OpenAI({ apiKey });

  const catalogText = catalog
    .map((entry, idx) => `${idx + 1}. id=${entry.id} | descripción: ${entry.caption}`)
    .join('\n');

  const userPrompt = `## PROMPT DEL SLIDE A GENERAR
${visualPrompt.slice(0, 4000)}

## CATÁLOGO DE REFERENCIAS DISPONIBLES (${catalog.length})
${catalogText}

Devuelve hasta ${maxResults} ids ordenados de más a menos relevantes para ese slide concreto, en JSON válido como indica el sistema.`;

  try {
    const response = await openai.chat.completions.create({
      model: REFERENCE_SELECTOR_MODEL,
      temperature: 0.1,
      max_completion_tokens: 400,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: REFERENCE_SELECTOR_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });
    const content = response.choices[0]?.message?.content || '';
    if (!content) return null;
    const parsed = JSON.parse(content) as { selected_ids?: unknown; reasoning?: unknown };
    const ids = Array.isArray(parsed.selected_ids)
      ? parsed.selected_ids
          .map(value => (typeof value === 'string' ? value : ''))
          .filter(Boolean)
          .slice(0, maxResults)
      : [];
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
    const validIds = new Set(catalog.map(entry => entry.id));
    return {
      selectedIds: ids.filter(id => validIds.has(id)),
      reasoning: reasoning.slice(0, 280),
    };
  } catch (err) {
    console.warn('[reference-images] selectRelevantReferenceImages falló:', (err as Error)?.message);
    return null;
  }
}
