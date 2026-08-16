-- ============================================================
-- 031 - Dirección creativa visual del proyecto
-- ============================================================
-- Controla cuánto concepto/metáfora visual usa el pipeline de imágenes:
--   literal     → escenas reales del negocio (comportamiento clásico).
--   equilibrado → mezcla: escenas reales + algunas metáforas visuales.
--   disruptivo  → mayoría de imágenes conceptuales/surrealistas fotorrealistas
--                 (gorila en la ciudad, unicornio…) y prohibición de clichés
--                 de stock corporativo (portátiles, dashboards, reuniones).
-- NULL = comportamiento anterior (equivalente a 'literal').

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS visual_creative_direction TEXT
  CHECK (visual_creative_direction IN ('literal', 'equilibrado', 'disruptivo'));

COMMENT ON COLUMN public.projects.visual_creative_direction IS
  'Dirección creativa de las imágenes IA: literal | equilibrado | disruptivo. NULL = literal (comportamiento clásico).';
