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
import type { ProjectReferenceImage, ProjectReferenceRole, ProjectReferenceView } from '@/types';

import {
  countReferenceImagesNeedingReanalysis,
  MAX_REFERENCE_IMAGE_DIMENSION,
  NORMALIZED_REFERENCE_EXTENSION,
  NORMALIZED_REFERENCE_MIME,
  PROJECT_REFERENCE_IMAGES_BUCKET,
  referenceImageNeedsReanalysis,
  isProjectReferenceImagesTableError,
  isProjectReferenceRole,
} from './reference-images-shared';

export {
  countReferenceImagesNeedingReanalysis,
  referenceImageNeedsReanalysis,
} from './reference-images-shared';

export {
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  MAX_PROJECT_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGE_DIMENSION,
  NORMALIZED_REFERENCE_EXTENSION,
  NORMALIZED_REFERENCE_MIME,
  PROJECT_REFERENCE_IMAGES_BUCKET,
  PROJECT_REFERENCE_ROLES,
  PROJECT_REFERENCE_ROLE_CHOICES,
  PROJECT_REFERENCE_ROLE_LABELS,
  buildProductReferenceGuidance,
  buildProjectReferenceImageStoragePath,
  extractImageBase64FromResponse,
  isOpenAIReferenceImageRejection,
  isProductRole,
  isProjectReferenceRole,
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
export const REFERENCE_PRODUCT_IDENTITY_MAX_LENGTH = 160;
export const REFERENCE_PRODUCT_TRAITS_MAX_LENGTH = 600;

const REFERENCE_ANALYSIS_SYSTEM = `Eres un director de arte que cataloga imágenes de referencia de un proyecto de marketing. En la MISMA lectura tienes que (a) describir la imagen y (b) clasificar su ROL, porque cada rol se usa de forma distinta al generar contenido.

ROLES POSIBLES (elige UNO, el dominante):
- "product": la imagen ES el producto/servicio que vende el cliente (una camper, una sauna, un mueble, un plato concreto, un packaging). Es lo que hay que reproducir con fidelidad.
- "style": la imagen es inspiración de estética/mood (una foto bonita, una paleta, un ambiente) que NO contiene el producto del cliente.
- "place": un lugar o entorno (paisaje, sala, calle) que sirve de contexto, sin ser el producto.
- "logo": un logotipo, isotipo, tipografía o identidad gráfica.
- "person": una persona o retrato como protagonista, sin producto claro.
- "scene": una escena de uso genérica donde no destaca un producto concreto.
- "other": no encaja en nada de lo anterior.

REGLAS PARA DECIDIR "product":
- Marca "product" SOLO si en la imagen aparece, como protagonista, el bien físico que el cliente vende. Una foto de un bosque "que da buen rollo" NO es product (es style/place aunque haya una sauna diminuta al fondo, salvo que la sauna sea la protagonista).
- Si dudas entre product y style/place, mira quién es el protagonista del encuadre.

CUANDO EL ROL ES "product", además rellena:
- "product_identity": qué es, en pocas palabras y concreto (p. ej. "sauna de barril de madera exterior", "camper Volkswagen camperizada").
- "product_traits": lista corta (3-6) de rasgos INVIOLABLES separados por " · " (forma/geometría, proporciones, materiales, colores estructurales, detalles distintivos). Solo lo que se ve; no inventes.
- "view": "exterior" | "interior" | "detalle" según el punto de vista. Si no aplica, usa null.
Cuando el rol NO es product, deja product_identity y product_traits como cadena vacía y view como null.

SIEMPRE rellena:
- "caption": 1-2 frases en español, máx 320 caracteres, neutra y concreta (qué se ve, protagonista, color dominante, distribución si es interior). Sin adjetivos vacíos, sin listas.
- "confidence": número 0..1 con tu seguridad sobre el rol elegido.

FORMATO DE SALIDA: SOLO un JSON válido, sin texto adicional, con esta forma exacta:
{ "role": "...", "confidence": 0.0, "caption": "...", "product_identity": "...", "product_traits": "...", "view": null }`;

const REFERENCE_ANALYSIS_USER = `Analiza esta imagen y devuelve el JSON que indica el sistema. Decide el rol mirando quién es el protagonista real del encuadre. Si el protagonista es el producto que vende el cliente, marca "product" y rellena identidad, rasgos y vista. Sé concreto y no inventes nada que no se vea.`;

export interface ReferenceAnalysis {
  caption: string | null;
  role: ProjectReferenceRole;
  confidence: number | null;
  productIdentity: string | null;
  productTraits: string | null;
  view: ProjectReferenceView | null;
}

function coerceRole(value: unknown): ProjectReferenceRole {
  if (isProjectReferenceRole(value) && value !== 'pending') return value;
  return 'other';
}

function coerceView(value: unknown): ProjectReferenceView | null {
  if (value === 'exterior' || value === 'interior' || value === 'detalle') return value;
  return null;
}

function coerceConfidence(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

/**
 * Lectura estructurada de una referencia con visión: en una sola llamada
 * devuelve el caption, el rol (product/style/place/logo/…), la confianza y,
 * si es producto, su identidad, rasgos inviolables y vista.
 *
 * Si la IA no devuelve JSON parseable, cae a un análisis mínimo con el texto
 * crudo como caption y rol "other" para no bloquear la subida.
 */
export async function analyzeReferenceImage(params: {
  apiKey: string;
  imageUrl: string;
}): Promise<ReferenceAnalysis> {
  const { apiKey, imageUrl } = params;
  if (!apiKey) throw new Error('Falta API key de OpenAI para analizar la referencia.');
  if (!imageUrl) throw new Error('Falta URL de la imagen para analizar la referencia.');

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: REFERENCE_CAPTION_MODEL,
    temperature: 0.1,
    max_completion_tokens: 400,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: REFERENCE_ANALYSIS_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: REFERENCE_ANALYSIS_USER },
          { type: 'image_url' as const, image_url: { url: imageUrl, detail: 'high' as const } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || '';
  if (!raw.trim()) {
    return { caption: null, role: 'other', confidence: null, productIdentity: null, productTraits: null, view: null };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const role = coerceRole(parsed.role);
    const isProduct = role === 'product';
    return {
      caption: cleanText(parsed.caption, REFERENCE_CAPTION_MAX_LENGTH),
      role,
      confidence: coerceConfidence(parsed.confidence),
      productIdentity: isProduct ? cleanText(parsed.product_identity, REFERENCE_PRODUCT_IDENTITY_MAX_LENGTH) : null,
      productTraits: isProduct ? cleanText(parsed.product_traits, REFERENCE_PRODUCT_TRAITS_MAX_LENGTH) : null,
      view: isProduct ? coerceView(parsed.view) : null,
    };
  } catch {
    // Modelo devolvió algo no-JSON: usamos el texto crudo como caption.
    return {
      caption: cleanText(raw, REFERENCE_CAPTION_MAX_LENGTH),
      role: 'other',
      confidence: null,
      productIdentity: null,
      productTraits: null,
      view: null,
    };
  }
}

/**
 * Compatibilidad: devuelve solo el caption de una referencia. Internamente
 * usa el análisis estructurado completo.
 */
export async function generateReferenceImageCaption(params: {
  apiKey: string;
  imageUrl: string;
}): Promise<string | null> {
  const analysis = await analyzeReferenceImage(params);
  return analysis.caption;
}

/** PostgREST cuando la migración 028 (rol/identidad) no está aplicada. */
function isReferenceRoleColumnError(error: { message?: string } | null | undefined): boolean {
  const m = (error?.message || '').toLowerCase();
  return (
    m.includes('reference_role') ||
    m.includes('role_confidence') ||
    m.includes('role_is_manual') ||
    m.includes('product_identity') ||
    m.includes('product_traits') ||
    m.includes('reference_view')
  );
}

/**
 * Analiza una referencia con visión y persiste caption + rol + identidad.
 * No lanza: si falla, marca caption_status = 'error'.
 */
export async function persistReferenceImageAnalysis(
  service: SupabaseClient,
  apiKey: string,
  image: Pick<
    ProjectReferenceImage,
    'id' | 'image_url' | 'caption_is_manual' | 'role_is_manual'
  >
): Promise<void> {
  try {
    await service
      .from('project_reference_images')
      .update({ caption_status: 'generating' })
      .eq('id', image.id);

    const analysis = await analyzeReferenceImage({ apiKey, imageUrl: image.image_url });
    if (!analysis.caption && analysis.role === 'other') {
      await service
        .from('project_reference_images')
        .update({ caption_status: 'error', caption_at: new Date().toISOString() })
        .eq('id', image.id);
      return;
    }

    const now = new Date().toISOString();
    const base: Record<string, unknown> = {};
    if (!image.caption_is_manual && analysis.caption) {
      base.caption = analysis.caption;
      base.caption_status = 'ready';
      base.caption_at = now;
      base.caption_is_manual = false;
    } else if (analysis.caption) {
      base.caption_status = 'ready';
    }

    const roleFields: Record<string, unknown> = image.role_is_manual
      ? {}
      : {
          reference_role: analysis.role,
          role_confidence: analysis.confidence,
          role_is_manual: false,
          product_identity: analysis.productIdentity,
          product_traits: analysis.productTraits,
          reference_view: analysis.view,
        };

    const { error } = await service
      .from('project_reference_images')
      .update({ ...base, ...roleFields })
      .eq('id', image.id);

    if (error && isReferenceRoleColumnError(error)) {
      await service.from('project_reference_images').update(base).eq('id', image.id);
    }
  } catch (err) {
    console.warn('[reference-images] persistReferenceImageAnalysis failed:', (err as Error)?.message);
    try {
      await service
        .from('project_reference_images')
        .update({ caption_status: 'error', caption_at: new Date().toISOString() })
        .eq('id', image.id);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Reanaliza todas las referencias del proyecto que aún no tienen rol/caption
 * completo (p. ej. fotos subidas antes de la migración 028). Sincroniza
 * reglas físicas si procede. Devuelve cuántas se procesaron.
 */
export async function reanalyzeProjectReferenceImages(params: {
  service: SupabaseClient;
  projectId: string;
  userId: string;
  project: { id: string; physical_constraints?: string | null };
}): Promise<{ processed: number; images: ProjectReferenceImage[] }> {
  const { service, projectId, userId, project } = params;
  const all = await listProjectReferenceImages(service, projectId);
  const targets = all.filter(referenceImageNeedsReanalysis);
  if (targets.length === 0) {
    return { processed: 0, images: all };
  }

  const apiKey = await resolveOpenAIKeyForUser(service, userId);
  if (!apiKey) {
    throw new Error('No hay API key de OpenAI configurada para analizar las referencias.');
  }

  await Promise.all(targets.map(image => persistReferenceImageAnalysis(service, apiKey, image)));

  const refreshed = await listProjectReferenceImages(service, projectId);
  try {
    await syncProjectPhysicalConstraintsFromReferences({
      service,
      project,
      referenceImages: refreshed,
      apiKey,
    });
  } catch (syncErr) {
    console.warn('[reference-images] auto physical_constraints falló:', (syncErr as Error)?.message);
  }

  return { processed: targets.length, images: refreshed };
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
const REFERENCE_SELECTOR_SYSTEM = `Eres un asistente de dirección de arte. Te paso (a) el prompt visual de UN slide concreto que se va a generar y (b) un catálogo de imágenes de referencia del proyecto, cada una con un identificador, un ROL y una descripción libre. Tu tarea es decidir qué referencias son verdaderamente útiles para que el modelo de imagen genere ese slide concreto.

ROLES DEL CATÁLOGO:
- "product": ES el producto real del cliente. Son la VERDAD del proyecto y casi siempre deben incluirse cuando el slide muestra el producto. Elige la que mejor case con la vista del slide (exterior/interior/detalle) y, si ayuda, alguna más del mismo producto.
- "style": inspiración de estética. Inclúyela solo si el slide busca un mood concreto; nunca como fuente de la forma del producto.
- "place": entorno/lugar. Inclúyela si el slide necesita contexto de ese lugar.
- "logo": identidad gráfica. Inclúyela solo en slides de marca/logo.
- "person"/"scene"/"other": inclúyelas solo si encajan con la escena del slide.

CRITERIOS:
- Si el slide muestra el producto (aunque sea en una escena con personas o en un paisaje), incluye SIEMPRE al menos una referencia "product"; prioriza la vista que coincida (interior/exterior/detalle). NO la descartes por el hecho de que haya personas o paisaje.
- Si el slide es exclusivamente un logo o tipografía, prioriza "logo" y descarta las fotográficas.
- Si el slide no tiene NADA que ver con el producto (p. ej. una cita sobre fondo de color), puedes devolver lista vacía.
- Devuelve como mucho 4 referencias y como mínimo 0. Ordena de más a menos relevante.

FORMATO DE SALIDA: SOLO un JSON válido sin texto adicional con esta forma:
{ "selected_ids": ["id1", "id2"], "reasoning": "una frase corta en español explicando el criterio" }
Si no hay ninguna referencia útil para este slide, devuelve { "selected_ids": [], "reasoning": "..." }.`;

export interface ReferenceCatalogEntry {
  id: string;
  caption: string;
  role?: ProjectReferenceRole;
  view?: ProjectReferenceView | null;
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
    .map((entry, idx) => {
      const roleTag = entry.role ? ` | rol: ${entry.role}` : '';
      const viewTag = entry.view ? ` | vista: ${entry.view}` : '';
      return `${idx + 1}. id=${entry.id}${roleTag}${viewTag} | descripción: ${entry.caption}`;
    })
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

// ============================================================
// Reglas físicas automáticas a partir de las fotos de producto
// ============================================================
//
// Cuando un proyecto tiene fotos clasificadas como `product`, consolidamos su
// identidad y rasgos inviolables en el bloque "REGLAS FÍSICAS E IDENTITARIAS
// INVIOLABLES DEL PRODUCTO" y lo guardamos en projects.physical_constraints.
// Eso es lo que /api/generate-image inyecta como verdad ineludible.
//
// Es automático e invisible para el usuario: si el proyecto ya tiene reglas
// escritas (a mano o generadas antes), NO las pisamos.

export const PRODUCT_IDENTITY_CONSOLIDATION_MODEL = 'gpt-4o-mini';
const PRODUCT_IDENTITY_MAX_CHARS = 4000;

const PRODUCT_IDENTITY_SYSTEM = `Eres un director de arte que redacta las "REGLAS FÍSICAS E IDENTITARIAS INVIOLABLES DEL PRODUCTO" de un proyecto, a partir de fichas de las fotos reales del producto (identidad, rasgos y vista). Sirven para que un modelo de imagen NUNCA invente un producto distinto al real.

REGLAS:
- Agrupa las fotos por producto (si hay varios productos claramente distintos, haz un bloque por producto; si son el mismo producto desde varias vistas, un solo bloque).
- Por cada producto distingue:
  · RASGOS FIJOS (inviolables): forma, geometría, proporciones, materiales y elementos estructurales que SIEMPRE deben aparecer.
  · RASGOS VARIABLES (de catálogo, NO imponer): acabados o colores que el producto ofrece en distintas versiones y por tanto pueden variar.
- Solo hechos que se deduzcan de las fichas. No inventes marcas, medidas ni materiales que no aparezcan.
- Sin adjetivos vacíos ("bonito", "elegante"). Sin reglas de tono o copy.
- Español, texto plano, sin markdown ni viñetas con asteriscos. Puedes usar guiones simples. 60–220 palabras.
- Devuelve SOLO el texto del bloque, sin saludos ni comillas. Si las fichas son insuficientes, devuelve exactamente "INSUFICIENTE".`;

interface ProductReferenceForConsolidation {
  identity: string | null;
  traits: string | null;
  view: ProjectReferenceView | null;
  caption: string | null;
}

async function consolidateProductIdentityRules(params: {
  apiKey: string;
  products: ProductReferenceForConsolidation[];
}): Promise<string | null> {
  const { apiKey, products } = params;
  if (products.length === 0) return null;

  const fichas = products
    .map((p, idx) => {
      const parts = [`Foto ${idx + 1}`];
      if (p.identity) parts.push(`identidad: ${p.identity}`);
      if (p.view) parts.push(`vista: ${p.view}`);
      if (p.traits) parts.push(`rasgos: ${p.traits}`);
      if (p.caption) parts.push(`descripción: ${p.caption}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.chat.completions.create({
      model: PRODUCT_IDENTITY_CONSOLIDATION_MODEL,
      temperature: 0.2,
      max_completion_tokens: 700,
      messages: [
        { role: 'system', content: PRODUCT_IDENTITY_SYSTEM },
        {
          role: 'user',
          content: `## FICHAS DE LAS FOTOS DE PRODUCTO (${products.length})\n${fichas}\n\nRedacta el bloque de reglas físicas e identitarias inviolables siguiendo el sistema.`,
        },
      ],
    });
    const raw = (response.choices[0]?.message?.content || '').trim();
    if (!raw || raw.toUpperCase() === 'INSUFICIENTE') return null;
    return raw.slice(0, PRODUCT_IDENTITY_MAX_CHARS);
  } catch (err) {
    console.warn('[reference-images] consolidateProductIdentityRules falló:', (err as Error)?.message);
    return null;
  }
}

function isPhysicalConstraintsColumnError(error: { message?: string } | null | undefined): boolean {
  const m = (error?.message || '').toLowerCase();
  return m.includes('physical_constraints');
}

// ============================================================
// QA visual de fidelidad al producto
// ============================================================
//
// Tras generar una imagen, comparamos contra la foto real del producto y
// puntuamos SOLO la identidad (forma, proporciones, materiales, rasgos),
// ignorando el ángulo, la luz, el encuadre y el contexto (esos deben variar).
// Sirve para detectar que el modelo se ha inventado un producto distinto.

export const FIDELITY_QA_MODEL = 'gpt-4o-mini';
export const FIDELITY_PASS_THRESHOLD = 80;
export const FIDELITY_FAIL_THRESHOLD = 60;

const FIDELITY_QA_SYSTEM = `Eres un inspector de control de calidad de fidelidad de producto. Te paso la FOTO REAL del producto del cliente y una IMAGEN GENERADA por IA. Debes decidir si la imagen generada muestra EL MISMO producto.

EVALÚA SOLO LA IDENTIDAD DEL PRODUCTO:
- Forma y geometría general (tipología: p. ej. cilíndrica de barril vs cabaña rectangular).
- Proporciones, materiales, colores estructurales y rasgos distintivos visibles.

IGNORA POR COMPLETO (NO penalices):
- El ángulo, la altura de cámara, la distancia y el encuadre.
- La luz, la hora del día, el color de la luz y el contexto/fondo.
- Que haya o no personas, o que la escena sea distinta.

Devuelve un JSON válido, SOLO el JSON, con esta forma:
{ "score": 0-100, "violations": ["..."], "worst_trait": "..." }
- score 100 = es exactamente el mismo producto; 0 = es un producto totalmente distinto.
- "violations": lista corta (0-4) de diferencias de IDENTIDAD concretas que habría que corregir. Vacía si es fiel.`;

export interface ProductFidelityResult {
  score: number;
  verdict: 'pass' | 'warn' | 'fail';
  violations: string[];
}

function verdictForScore(score: number): ProductFidelityResult['verdict'] {
  if (score >= FIDELITY_PASS_THRESHOLD) return 'pass';
  if (score < FIDELITY_FAIL_THRESHOLD) return 'fail';
  return 'warn';
}

/**
 * Puntúa la fidelidad de identidad de una imagen generada respecto a la foto
 * real del producto. Devuelve null si no se pudo evaluar (no bloquea nunca el
 * pipeline: ante la duda, la imagen se da por buena).
 */
export async function assessProductFidelity(params: {
  apiKey: string;
  generatedImageUrl: string;
  product: { identity?: string | null; traits?: string | null; imageUrl: string };
}): Promise<ProductFidelityResult | null> {
  const { apiKey, generatedImageUrl, product } = params;
  if (!apiKey || !generatedImageUrl || !product.imageUrl) return null;

  const openai = new OpenAI({ apiKey });
  const fichaParts: string[] = [];
  if (product.identity) fichaParts.push(`Producto: ${product.identity}.`);
  if (product.traits) fichaParts.push(`Rasgos inviolables: ${product.traits}.`);
  const ficha = fichaParts.join(' ');

  try {
    const response = await openai.chat.completions.create({
      model: FIDELITY_QA_MODEL,
      temperature: 0,
      max_completion_tokens: 300,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: FIDELITY_QA_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: `${ficha ? `${ficha}\n` : ''}Primera imagen = FOTO REAL del producto. Segunda imagen = IMAGEN GENERADA a evaluar. Puntúa la fidelidad de identidad.`,
            },
            { type: 'image_url' as const, image_url: { url: product.imageUrl, detail: 'high' as const } },
            { type: 'image_url' as const, image_url: { url: generatedImageUrl, detail: 'high' as const } },
          ],
        },
      ],
    });
    const raw = response.choices[0]?.message?.content || '';
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as { score?: unknown; violations?: unknown };
    const scoreNum = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score);
    if (!Number.isFinite(scoreNum)) return null;
    const score = Math.min(100, Math.max(0, Math.round(scoreNum)));
    const violations = Array.isArray(parsed.violations)
      ? parsed.violations.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean).slice(0, 4)
      : [];
    return { score, verdict: verdictForScore(score), violations };
  } catch (err) {
    console.warn('[reference-images] assessProductFidelity falló:', (err as Error)?.message);
    return null;
  }
}

/**
 * Si el proyecto tiene fotos de producto y AÚN no tiene reglas físicas escritas,
 * las redacta a partir de esas fotos y las guarda. Automático e idempotente:
 * - No hace nada si no hay fotos `product` con caption listo.
 * - No pisa reglas ya existentes (manuales o generadas antes).
 *
 * Devuelve true si ha escrito reglas nuevas.
 */
export async function syncProjectPhysicalConstraintsFromReferences(params: {
  service: SupabaseClient;
  project: { id: string; physical_constraints?: string | null };
  referenceImages: ProjectReferenceImage[];
  apiKey: string;
}): Promise<boolean> {
  const { service, project, referenceImages, apiKey } = params;

  // Respeta lo que ya hay: si hay reglas, no tocamos nada.
  if ((project.physical_constraints || '').trim().length > 0) return false;

  const productRefs = referenceImages.filter(
    image => image.reference_role === 'product' && image.caption_status === 'ready'
  );
  if (productRefs.length === 0) return false;

  const rules = await consolidateProductIdentityRules({
    apiKey,
    products: productRefs.map(image => ({
      identity: image.product_identity ?? null,
      traits: image.product_traits ?? null,
      view: image.reference_view ?? null,
      caption: image.caption ?? null,
    })),
  });
  if (!rules) return false;

  const { error } = await service
    .from('projects')
    .update({ physical_constraints: rules, physical_constraints_at: new Date().toISOString() })
    .eq('id', project.id);

  if (error) {
    if (isPhysicalConstraintsColumnError(error)) {
      console.warn('[reference-images] physical_constraints no existe (migración 025 pendiente).');
      return false;
    }
    throw new Error(error.message);
  }
  return true;
}
