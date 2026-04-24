import type { SupabaseClient } from '@supabase/supabase-js';
import { toFile } from 'openai';
import sharp from 'sharp';
import type { ProjectReferenceImage } from '@/types';

export const PROJECT_REFERENCE_IMAGES_BUCKET = 'project-reference-images';
export const MAX_PROJECT_REFERENCE_IMAGES = 10;
export const DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI = 4;

export function isProjectReferenceImagesTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  const code = String(error.code || '');
  return code === '42P01' || message.includes('project_reference_images') || message.includes('schema cache');
}

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

function sanitizeSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function buildProjectReferenceImageStoragePath(projectId: string, filename: string): string {
  const safeName = sanitizeSegment(filename || 'referencia.png') || 'referencia.png';
  return `${projectId}/${safeName}`;
}

export function buildProductReferenceGuidance(referenceCount: number): string {
  if (referenceCount <= 0) return '';
  return [
    '## REFERENCIAS VISUALES DEL PRODUCTO',
    `Dispones de ${referenceCount} imagen(es) reales de referencia del producto. Debes usarlas como fuente prioritaria para respetar la identidad visual del producto real.`,
    '- Usa las referencias para mantener forma, proporciones, acabados, colores, materiales y rasgos distintivos del producto.',
    '- NO copies necesariamente el mismo ángulo, la misma altura de cámara, la misma distancia ni el mismo encuadre de las referencias.',
    '- Decide el tipo de plano, perspectiva y distancia en función del objetivo editorial de la pieza y del prompt concreto.',
    '- Debe haber variedad de enfoques entre imágenes del mismo proyecto: plano general, plano medio, detalle, contrapicado, cenital o contexto de uso cuando tenga sentido.',
    '- Las referencias fijan qué producto es; el prompt y la pieza deciden cómo se fotografía.',
  ].join('\n');
}

export const NORMALIZED_REFERENCE_MIME = 'image/png';
export const NORMALIZED_REFERENCE_EXTENSION = 'png';
export const MAX_REFERENCE_IMAGE_DIMENSION = 2048;

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

export function isOpenAIReferenceImageRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  const message = String((err as { message?: string }).message || '').toLowerCase();
  if (status && status !== 400) return false;
  return (
    message.includes('invalid image file') ||
    message.includes('invalid image') ||
    message.includes('invalid file') ||
    message.includes('mode for image') ||
    message.includes('unsupported image')
  );
}

export function extractImageBase64FromResponse(
  response: { output?: Array<{ type?: string; result?: unknown }> }
): string | null {
  for (const output of response.output || []) {
    if (output.type === 'image_generation_call' && typeof output.result === 'string' && output.result) {
      return output.result;
    }
  }
  return null;
}
