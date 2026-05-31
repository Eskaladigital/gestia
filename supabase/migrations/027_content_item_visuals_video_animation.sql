-- ============================================================
-- 027 - Animación de visuals estáticos con IA de vídeo
-- ============================================================
-- Guarda el prompt de movimiento y el MP4 generado desde la imagen ya
-- existente (image_url / edited_image_url). No sustituye a la imagen base.

ALTER TABLE content_item_visuals
  ADD COLUMN IF NOT EXISTS video_motion_prompt TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_status TEXT DEFAULT 'pending'
    CHECK (video_status IN ('pending', 'generating', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS video_error TEXT,
  ADD COLUMN IF NOT EXISTS video_model TEXT,
  ADD COLUMN IF NOT EXISTS video_source_image_url TEXT,
  ADD COLUMN IF NOT EXISTS video_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN content_item_visuals.video_motion_prompt IS
  'Instrucción de movimiento para animar la imagen existente (ej. sonríe a cámara y el plano se aleja).';
COMMENT ON COLUMN content_item_visuals.video_url IS
  'MP4 generado desde la imagen del visual mediante IA de vídeo.';
COMMENT ON COLUMN content_item_visuals.video_status IS
  'Estado de generación del vídeo asociado al visual.';
COMMENT ON COLUMN content_item_visuals.video_source_image_url IS
  'URL de la imagen concreta usada como primer frame/referencia del vídeo.';
