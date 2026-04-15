-- ============================================================
-- 019 - Espejo horizontal persistente por visual
-- ============================================================
-- Si el usuario voltea la imagen en la UI, el estado se guarda
-- y se aplica al refrescar y al descargar.

ALTER TABLE content_item_visuals
  ADD COLUMN IF NOT EXISTS image_flip_horizontal BOOLEAN NOT NULL DEFAULT false;
