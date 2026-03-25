-- ============================================================
-- 006: Análisis extendido de identidad visual (textos largos + listas)
-- Requiere public.projects (001) y columnas de marca de 004.
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS brand_identity_detail JSONB DEFAULT NULL;

COMMENT ON COLUMN public.projects.brand_identity_detail IS 'Análisis profundo de marca: paleta, tipografía, UI, RRSS, do/dont (JSON)';
