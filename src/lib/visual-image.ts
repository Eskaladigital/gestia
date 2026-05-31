import type { ContentItemVisual } from '@/types';
import { parseVisualImageEditJson } from '@/lib/visual-image-edit';

/** URL que debe mostrarse en galería / lightbox (edición guardada tiene prioridad). */
export function getVisualDisplayUrl(visual: ContentItemVisual): string | null {
  if (visual.edited_image_url) return visual.edited_image_url;
  return visual.image_url;
}

/** Si la imagen en pantalla debe llevar espejo CSS (solo cuando no hay PNG editado). */
export function visualUsesCssFlip(visual: ContentItemVisual): boolean {
  return visual.image_flip_horizontal === true && !visual.edited_image_url;
}

export function visualHasSavedEdit(visual: ContentItemVisual): boolean {
  return !!visual.edited_image_url;
}

/** Parámetros para descargar el archivo final que verá el usuario. */
export function getVisualDownloadParams(visual: ContentItemVisual): {
  url: string;
  flipHorizontal: boolean;
} | null {
  const url = getVisualDisplayUrl(visual);
  if (!url) return null;
  return {
    url,
    flipHorizontal: visualUsesCssFlip(visual),
  };
}

export function getVisualImageEditState(visual: ContentItemVisual) {
  return parseVisualImageEditJson(visual.image_edit_json);
}

/** El visual tiene un vídeo animado listo. */
export function visualHasVideo(visual: ContentItemVisual): boolean {
  return visual.video_status === 'ready' && !!visual.video_url;
}
