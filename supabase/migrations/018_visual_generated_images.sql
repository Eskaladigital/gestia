-- ============================================================
-- 018 - Campos para imágenes generadas en content_item_visuals
-- ============================================================
-- Almacena la URL de la imagen generada por gpt-image-1.5,
-- su estado de generación y posibles errores.

ALTER TABLE content_item_visuals
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_status TEXT DEFAULT 'pending'
    CHECK (image_status IN ('pending', 'generating', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS image_error TEXT;
