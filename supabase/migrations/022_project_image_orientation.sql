-- ============================================================
-- 022 - Orientación de imágenes IA por proyecto
-- ============================================================
-- Permite elegir si las imágenes generadas por IA para todo el
-- proyecto serán verticales (9:16, redes tipo Instagram), cuadradas
-- (1:1, feed clásico) u horizontales (16:9, web/blog/LinkedIn).
--
-- Default 'vertical': asumimos Instagram-first.
-- Aplica a TODAS las imágenes generadas en /api/generate-image,
-- independientemente del formato del post (story, reel, carrusel,
-- publicación). Si en el futuro se quiere distinto por formato, se
-- puede ampliar el modelo sin romper este campo.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS image_orientation TEXT
  NOT NULL DEFAULT 'vertical';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_image_orientation_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_image_orientation_check
      CHECK (image_orientation IN ('vertical', 'cuadrado', 'horizontal'));
  END IF;
END $$;

COMMENT ON COLUMN public.projects.image_orientation IS
  'Orientación global de las imágenes IA del proyecto: vertical (9:16), cuadrado (1:1) o horizontal (16:9). Default vertical (Instagram-first).';
