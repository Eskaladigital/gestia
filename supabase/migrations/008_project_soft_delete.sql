-- ============================================================
-- 008: Papelera — proyectos archivados (deleted_at)
-- Ejecutar después de 007. Idempotente si la columna ya existe.
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_deleted
  ON public.projects (user_id)
  WHERE deleted_at IS NOT NULL;
