/**
 * Constantes y helpers puros para las imágenes de referencia de proyecto.
 *
 * IMPORTANTE: este módulo NO puede importar `sharp`, `openai`, `fs`,
 * `@supabase/supabase-js` ni nada que no sea apto para el bundle del
 * navegador. Todo lo que requiera Node nativo vive en
 * `./reference-images.ts`, que es server-only.
 *
 * Esto evita que Turbopack intente bundlear sharp en los chunks de
 * Client Component (sharp depende de child_process, fs, binarios
 * nativos, y revienta el build de Vercel).
 */

export const PROJECT_REFERENCE_IMAGES_BUCKET = 'project-reference-images';
export const MAX_PROJECT_REFERENCE_IMAGES = 10;
export const DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI = 4;

export const NORMALIZED_REFERENCE_MIME = 'image/png';
export const NORMALIZED_REFERENCE_EXTENSION = 'png';
export const MAX_REFERENCE_IMAGE_DIMENSION = 2048;

export function isProjectReferenceImagesTableError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42P01' ||
    message.includes('project_reference_images') ||
    message.includes('schema cache')
  );
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
