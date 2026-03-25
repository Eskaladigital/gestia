-- ============================================================
-- 007: JSON completo de analyze-site (además de value_proposition, etc.)
-- Requiere tabla public.strategies (001).
-- ============================================================

ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS web_site_analysis JSONB DEFAULT NULL;
