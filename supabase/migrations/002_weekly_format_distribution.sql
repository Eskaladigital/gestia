-- ============================================================
-- 002: Distribución semanal de formatos
-- Reemplaza main_format + posts_per_week por weekly_format_distribution
-- ============================================================

-- 1. Nuevo campo JSONB con distribución semanal
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS weekly_format_distribution JSONB
  DEFAULT '{"story":1,"carrusel":2,"publicacion":1,"reel":1}';

-- 2. Actualizar CHECK de format en content_items para incluir 'publicacion'
ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_format_check;
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_format_check
  CHECK (format IN ('video_corto', 'carrusel', 'imagen', 'texto', 'reel', 'story', 'publicacion'));

-- 3. Migrar datos existentes: convertir main_format + posts_per_week a weekly_format_distribution
UPDATE public.projects
SET weekly_format_distribution = jsonb_build_object(
  'story', 0,
  'carrusel', CASE WHEN main_format = 'carrusel' THEN GREATEST(posts_per_week - 1, 1) ELSE 1 END,
  'publicacion', CASE WHEN main_format = 'imagen' THEN GREATEST(posts_per_week - 1, 1) ELSE 1 END,
  'reel', CASE WHEN main_format = 'video_corto' THEN GREATEST(posts_per_week - 1, 1) ELSE 1 END
)
WHERE weekly_format_distribution IS NULL OR weekly_format_distribution = '{"story":1,"carrusel":2,"publicacion":1,"reel":1}'::jsonb;

-- 4. Migrar content_items con format='imagen' a 'publicacion'
UPDATE public.content_items SET format = 'publicacion' WHERE format = 'imagen';

-- 5. Mantener posts_per_week y main_format como legacy (no se eliminan para no romper nada)
