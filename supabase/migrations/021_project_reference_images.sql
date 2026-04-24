-- ============================================================
-- 021 - Referencias visuales de producto por proyecto
-- ============================================================
-- Permite subir imágenes reales del producto para que la IA
-- mantenga fidelidad visual del producto sin perder variedad
-- de planos ni composiciones.

CREATE TABLE IF NOT EXISTS public.project_reference_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_reference_images_project
  ON public.project_reference_images(project_id, is_primary DESC, sort_order ASC, created_at ASC);

ALTER TABLE public.project_reference_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_reference_images_owner_select" ON public.project_reference_images;
CREATE POLICY "project_reference_images_owner_select"
  ON public.project_reference_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_reference_images.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "project_reference_images_owner_all" ON public.project_reference_images;
CREATE POLICY "project_reference_images_owner_all"
  ON public.project_reference_images FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_reference_images.project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_reference_images.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "project_reference_images_admin_all" ON public.project_reference_images;
CREATE POLICY "project_reference_images_admin_all"
  ON public.project_reference_images FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_project_reference_images_updated_at ON public.project_reference_images;
CREATE TRIGGER update_project_reference_images_updated_at
  BEFORE UPDATE ON public.project_reference_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
