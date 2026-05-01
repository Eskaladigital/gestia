-- ============================================================
-- 023 - Feedback de usuario sobre imágenes generadas
-- ============================================================
-- Permite al usuario reportar errores en una imagen generada (por ejemplo,
-- manchas extrañas, elementos fuera de sitio, deformaciones del producto) con
-- un texto en lenguaje natural. Ese texto se inyecta en el prompt la siguiente
-- vez que se regenere la imagen, para que la IA corrija específicamente lo
-- señalado por el usuario.
--
-- Una vez la regeneración se completa con éxito, el endpoint de generación
-- limpia `user_feedback` para no arrastrarlo a futuras regeneraciones.

ALTER TABLE content_item_visuals
  ADD COLUMN IF NOT EXISTS user_feedback TEXT,
  ADD COLUMN IF NOT EXISTS user_feedback_at TIMESTAMPTZ;

COMMENT ON COLUMN content_item_visuals.user_feedback IS
  'Descripción en texto libre del error reportado por el usuario sobre la imagen. Se inyecta en el prompt al regenerar.';
COMMENT ON COLUMN content_item_visuals.user_feedback_at IS
  'Fecha en la que el usuario reportó el último error sobre esta imagen.';
