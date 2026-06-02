-- ============================================================
-- 029 - ¿El cliente vende un producto físico reproducible en imagen?
-- ============================================================
-- Agencias, consultorías, masajes, abogados → false (moodboard de estilo).
-- Campers, saunas, tornillos, alquiler de barcos → true (fidelidad de producto).
-- Lo fija la IA al generar estrategia; el usuario puede corregirlo en Ajustes.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sells_physical_product BOOLEAN;

COMMENT ON COLUMN public.projects.sells_physical_product IS
  'true = negocio con producto físico que debe replicarse en imagen; false = servicio/agencia/moodboard; NULL = aún no clasificado por estrategia.';
