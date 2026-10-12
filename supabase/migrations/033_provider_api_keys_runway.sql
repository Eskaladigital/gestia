-- 033: Runway como proveedor de API key (animación imagen → vídeo, sobre todo para reels)
-- Amplía el CHECK de provider_api_keys.provider para admitir 'runway'.

ALTER TABLE public.provider_api_keys
  DROP CONSTRAINT IF EXISTS provider_api_keys_provider_check;

ALTER TABLE public.provider_api_keys
  ADD CONSTRAINT provider_api_keys_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'google', 'runway'));

-- Animación Runway asíncrona: la tarea se lanza y se consulta después
-- (GET /api/generate-video?visual_id=…), sin depender del límite de 300 s.
ALTER TABLE public.content_item_visuals
  ADD COLUMN IF NOT EXISTS video_task_id TEXT,
  ADD COLUMN IF NOT EXISTS video_task_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.content_item_visuals.video_task_id IS
  'Id de la tarea de Runway en curso (null cuando no hay ninguna). «claimed:<id>» mientras se guarda el resultado.';
COMMENT ON COLUMN public.content_item_visuals.video_task_started_at IS
  'Cuándo se lanzó la tarea de vídeo en curso (para darla por perdida a los 30 min).';
