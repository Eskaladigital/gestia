-- ============================================================
-- 026 - Edición post-generación de imágenes estáticas
-- ============================================================
-- Guarda el estado del editor (textos, filtros) y la imagen final
-- compuesta lista para descargar / publicar.

ALTER TABLE content_item_visuals
  ADD COLUMN IF NOT EXISTS image_edit_json JSONB,
  ADD COLUMN IF NOT EXISTS edited_image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_edited_at TIMESTAMPTZ;

COMMENT ON COLUMN content_item_visuals.image_edit_json IS
  'Estado del mini editor (capas de texto, filtros). Permite reabrir y ajustar.';
COMMENT ON COLUMN content_item_visuals.edited_image_url IS
  'PNG final con overlays aplicados; prioridad en vista y descarga sobre image_url.';
COMMENT ON COLUMN content_item_visuals.image_edited_at IS
  'Última vez que se guardó la edición compuesta.';
