-- ============================================================
-- 024 - Captions automáticos para imágenes de referencia
-- ============================================================
-- Cada imagen de referencia que un proyecto sube (camper por fuera, camper por
-- dentro, logo, plato, sala de yoga, packshot…) recibe ahora una descripción
-- corta generada por IA (gpt-4o-mini con visión) que dice qué se ve.
--
-- Ese caption se usa en `/api/generate-image` para que un mini-paso de IA decida
-- QUÉ referencias son relevantes para el slide concreto antes de pasarlas al
-- modelo de imagen. Así el slide "interior con cocina" no recibe la foto
-- exterior de la camper, y el slide "logo blanco sobre fondo negro" no recibe
-- la foto de la maestra de yoga: la IA solo ve lo que tiene que ver.
--
-- Es genérico: vale para cualquier proyecto, no es específico de Furgocasa
-- (interior/exterior). Lo que clasifica es la propia descripción libre.
--
-- Si la generación del caption falla, queda `caption_status = 'error'` y la
-- referencia se sigue usando como comodín (comportamiento legacy).

ALTER TABLE public.project_reference_images
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS caption_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS caption_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caption_is_manual BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_reference_images_caption_status_check'
  ) THEN
    ALTER TABLE public.project_reference_images
      ADD CONSTRAINT project_reference_images_caption_status_check
      CHECK (caption_status IN ('pending', 'generating', 'ready', 'error'));
  END IF;
END
$$;

COMMENT ON COLUMN public.project_reference_images.caption IS
  'Descripción libre de qué se ve en la referencia (1-2 frases). Generada por IA con visión, editable por el usuario. Se usa para decidir qué referencias enviar al modelo de imagen según el slide.';
COMMENT ON COLUMN public.project_reference_images.caption_status IS
  'Estado del caption: pending / generating / ready / error.';
COMMENT ON COLUMN public.project_reference_images.caption_at IS
  'Fecha en la que se generó o se editó manualmente el caption.';
COMMENT ON COLUMN public.project_reference_images.caption_is_manual IS
  'Si es true, el caption lo editó el usuario y NO debe sobrescribirse al regenerar automáticamente.';
