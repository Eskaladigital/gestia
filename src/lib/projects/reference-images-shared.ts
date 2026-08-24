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

import type { ProjectReferenceImage, ProjectReferenceRole } from '@/types';

export const PROJECT_REFERENCE_IMAGES_BUCKET = 'project-reference-images';
export const MAX_PROJECT_REFERENCE_IMAGES = 10;
/** Tope de fotos que la IA ve: todas las subidas (el máximo del proyecto). */
export const DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI = MAX_PROJECT_REFERENCE_IMAGES;

/** Roles válidos de una imagen de referencia (migración 028). */
export const PROJECT_REFERENCE_ROLES: ProjectReferenceRole[] = [
  'pending',
  'product',
  'style',
  'place',
  'logo',
  'person',
  'scene',
  'other',
];

/** Etiquetas en español para mostrar el rol en la UI. */
export const PROJECT_REFERENCE_ROLE_LABELS: Record<ProjectReferenceRole, string> = {
  pending: 'Sin clasificar',
  product: 'Producto',
  style: 'Estilo',
  place: 'Lugar',
  logo: 'Logo',
  person: 'Persona',
  scene: 'Escena',
  other: 'Otro',
};

/** Roles que el usuario puede asignar a mano (sin "pending"). */
export const PROJECT_REFERENCE_ROLE_CHOICES: ProjectReferenceRole[] =
  PROJECT_REFERENCE_ROLES.filter(role => role !== 'pending');

export function isProductRole(role: ProjectReferenceRole | null | undefined): boolean {
  return role === 'product';
}

export function isProjectReferenceRole(value: unknown): value is ProjectReferenceRole {
  return typeof value === 'string' && (PROJECT_REFERENCE_ROLES as string[]).includes(value);
}

/** True si la imagen aún no pasó por el análisis estructurado (caption y/o rol). */
export function referenceImageNeedsReanalysis(image: ProjectReferenceImage): boolean {
  if (image.caption_is_manual && image.role_is_manual) return false;
  const status = image.caption_status ?? 'pending';
  const roleMissing = !image.reference_role || image.reference_role === 'pending';
  return status !== 'ready' || !image.caption || roleMissing;
}

export function countReferenceImagesNeedingReanalysis(images: ProjectReferenceImage[]): number {
  return images.filter(referenceImageNeedsReanalysis).length;
}

export function countProductReferenceImages(images: ProjectReferenceImage[]): number {
  return images.filter(image => image.reference_role === 'product').length;
}

export function projectHasProductReferences(images: ProjectReferenceImage[]): boolean {
  return countProductReferenceImages(images) > 0;
}

export function countStyleReferenceImages(images: ProjectReferenceImage[]): number {
  return images.filter(
    image => image.reference_role && image.reference_role !== 'pending' && image.reference_role !== 'product'
  ).length;
}

export type ReferenceGuidanceInput = {
  sellsPhysicalProduct?: boolean | null;
  productReferenceCount?: number;
  styleReferenceCount?: number;
};

export function buildExpectProductPhotosGuidance(): string {
  return [
    '## PRODUCTO FÍSICO DEL CLIENTE (sin fotos de producto aún)',
    'Este negocio SÍ vende un producto físico reproducible en imagen (vehículo, sauna, objeto, local…).',
    'Las imágenes de referencia de estilo/lugar NO sustituyen al producto: cuando el cliente suba fotos marcadas como Producto, la generación de imagen deberá replicar su forma con fidelidad.',
    'En calendario y briefs: varía escenas y planos; no inventes un producto genérico distinto al real cuando existan referencias de producto.',
  ].join('\n');
}

export function buildStyleReferenceGuidance(styleCount: number): string {
  if (styleCount <= 0) return '';
  return [
    '## REFERENCIAS VISUALES = LICENCIA CREATIVA (no hay producto que clonar)',
    `Hay ${styleCount} imagen(es) de ejemplo. No son el producto del cliente. Cada una demuestra un PUNTO: una forma de mostrar (metáfora, humor, escala, extrañeza fotografiada como real).`,
    '',
    'PARA QUÉ SIRVEN:',
    '- Autorizan DIVERSIÓN, ALTERNANCIA y LIBERTAD. El feed debe sentirse libre: otra broma, otro sujeto, otro territorio, otro gesto.',
    '- Extrae el REGISTRO (audacia, juego, surrealismo cotidiano, impacto en un segundo). Úsalo para INVENTAR escenas nuevas.',
    '- El éxito NO es repetir ni evitar un objeto de las fotos. El éxito es que cada tesela sea una idea visual distinta, con la misma libertad que esas fotos se permitieron.',
    '',
    'LO QUE NO HACEN:',
    '- No anclan forma, animal, máquina ni localización. Eso solo lo hacen las refs marcadas como Producto (otro tipo de proyecto).',
    '- No conviertas el moodboard en catálogo ni en veto: si una foto tiene un animal o un objeto raro, eso es un EJEMPLO de libertad, no un molde ni un tabú.',
  ].join('\n');
}

export function buildReferenceGuidanceBlock(input: ReferenceGuidanceInput): string {
  const productCount = input.productReferenceCount ?? 0;
  const styleCount = input.styleReferenceCount ?? 0;
  const sells = input.sellsPhysicalProduct;

  if (sells === false) {
    const moodboardCount = productCount + styleCount;
    return buildStyleReferenceGuidance(moodboardCount);
  }
  if (sells === true) {
    if (productCount > 0) return buildProductReferenceGuidance(productCount);
    return buildExpectProductPhotosGuidance();
  }
  // null / sin clasificar: inferir por roles subidos
  if (productCount > 0) return buildProductReferenceGuidance(productCount);
  if (styleCount > 0) return buildStyleReferenceGuidance(styleCount);
  return '';
}

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
    `Dispones de ${referenceCount} imagen(es) reales del producto. Hay dos ejes independientes y NO debes mezclarlos:`,
    '',
    'EJE 1 — IDENTIDAD DEL PRODUCTO (SAGRADA, se replica al 100%):',
    '- La forma, la geometría, las proporciones, los materiales, los colores estructurales y los rasgos distintivos del producto que ves en las referencias son LA VERDAD del proyecto y deben reproducirse con total fidelidad.',
    '- No inventes un producto genérico ni cambies su tipología: si la referencia es una sauna de barril cilíndrica, NUNCA debe salir una cabaña rectangular, y viceversa.',
    '',
    'EJE 2 — DIRECCIÓN DE ESCENA (LIBRE):',
    '- El ángulo, la altura de cámara, la distancia, el encuadre, el plano, la luz, la hora y el contexto los decide el prompt de cada pieza, no las referencias.',
    '- Busca variedad de planos entre piezas (general, medio, detalle, contrapicado, cenital, contexto de uso) manteniendo SIEMPRE intacta la identidad del producto.',
    '',
    'En resumen: las referencias fijan QUÉ es el producto (inviolable); el prompt decide CÓMO se fotografía (libre).',
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
