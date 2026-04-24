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
import { toFile } from 'openai';
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
