-- ============================================================
-- 032 - Estética fotográfica del proyecto (UGC vs lifestyle vs profesional)
-- ============================================================
-- Independiente de visual_creative_direction (literal / metáfora):
--   profesional → reportaje fotográfico cuidado (comportamiento clásico).
--   lifestyle   → vida real bella y cálida: inspira, no parece recorte de móvil
--                 ni catálogo de spa.
--   ugc         → foto de smartphone, como la haría un cliente.
-- NULL = profesional.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS image_aesthetic TEXT
  CHECK (image_aesthetic IN ('profesional', 'lifestyle', 'ugc'));

COMMENT ON COLUMN public.projects.image_aesthetic IS
  'Estética de las imágenes IA: profesional | lifestyle | ugc. NULL = profesional.';
