-- ============================================================
-- 025 - Reglas físicas e identitarias inviolables del proyecto
-- ============================================================
-- Texto libre por proyecto que recoge la "verdad ineludible" del producto:
-- planta y distribución de un espacio (camper, restaurante, gym), identidad
-- gráfica de una marca (logo, packaging), sujetos y objetos permitidos o
-- prohibidos en imágenes (collares de adiestramiento, jaulas, uniformes).
--
-- A diferencia de `ai_rules` (reglas blandas de tono/estilo/copy), estas son
-- reglas DURAS sobre la realidad física e identitaria del producto. Se inyectan
-- como bloque de máxima prioridad en:
--   1. buildCalendarPrompt (planificación de fichas técnicas de slide)
--   2. buildSingleVisualPrompt (redacción del visual_prompt)
--   3. /api/generate-image (prompt final al modelo de imagen)
--
-- Es opcional. Si está vacío, no se inyecta nada y el pipeline se comporta
-- como antes.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS physical_constraints TEXT,
  ADD COLUMN IF NOT EXISTS physical_constraints_at TIMESTAMPTZ;

COMMENT ON COLUMN public.projects.physical_constraints IS
  'Reglas físicas e identitarias inviolables del producto (planta, geometría, identidad de marca, sujetos prohibidos…). Texto libre. La IA lo trata como verdad ineludible y nunca lo contradice.';
COMMENT ON COLUMN public.projects.physical_constraints_at IS
  'Fecha de la última edición (manual o por IA) de las reglas inviolables.';
