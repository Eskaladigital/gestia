-- ============================================================
-- 004: Assets de marca detectados por el agente de reconocimiento
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS brand_colors JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS brand_fonts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_favicon_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_summary TEXT,
  ADD COLUMN IF NOT EXISTS brand_analyzed_at TIMESTAMPTZ;
