-- Añade specs de producción a content_items (nº slides carrusel, duración vídeo, subtipo story, etc.)
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS production_specs JSONB DEFAULT NULL;

COMMENT ON COLUMN public.content_items.production_specs IS 'Especificaciones de producción generadas por el calendario: num_slides, duration_seconds, media_type (imagen/video), scene_summary, etc.';
