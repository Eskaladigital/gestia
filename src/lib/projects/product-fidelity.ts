import type { Project, ProjectReferenceImage, ProjectReferenceRole } from '@/types';
import { countProductReferenceImages } from './reference-images-shared';

/** Modo fidelidad de producto activo al generar imágenes (ancla + edit con refs producto). */
export function projectUsesProductImageFidelity(
  project: Pick<Project, 'sells_physical_product'>,
  images: ProjectReferenceImage[]
): boolean {
  if (project.sells_physical_product === false) return false;
  return countProductReferenceImages(images) > 0;
}

/** El negocio vende producto físico (estrategia + reglas físicas cuando hay fotos producto). */
export function projectExpectsPhysicalProduct(
  project: Pick<Project, 'sells_physical_product'>
): boolean {
  return project.sells_physical_product === true;
}

/** Reglas físicas automáticas y solo lectura en Ajustes. */
export function projectHasManagedProductFidelity(
  project: Pick<Project, 'sells_physical_product'>,
  images: ProjectReferenceImage[]
): boolean {
  if (project.sells_physical_product === false) return false;
  return countProductReferenceImages(images) > 0;
}

/** Si no hay producto físico, refs mal clasificadas como product → estilo en generación. */
export function effectiveReferenceRoleForPipeline(
  role: ProjectReferenceRole | null | undefined,
  sellsPhysicalProduct: boolean | null | undefined
): ProjectReferenceRole {
  if (sellsPhysicalProduct === false && role === 'product') return 'style';
  if (!role || role === 'pending') return 'other';
  return role;
}
