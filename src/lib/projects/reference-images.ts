import type { SupabaseClient } from '@supabase/supabase-js';
import { toFile } from 'openai';
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

export async function downloadReferenceImagesAsFiles(
  referenceImages: ProjectReferenceImage[]
): Promise<Awaited<ReturnType<typeof toFile>>[]> {
  const files = [];

  for (const image of referenceImages) {
    const response = await fetch(image.image_url);
    if (!response.ok) {
      throw new Error(`No se pudo descargar la referencia ${image.original_filename}: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = image.mime_type || response.headers.get('content-type') || 'image/jpeg';
    const file = await toFile(buffer, image.original_filename || 'referencia.jpg', {
      type: mimeType,
    });
    files.push(file);
  }

  return files;
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
