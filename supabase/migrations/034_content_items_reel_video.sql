-- 034: Reel completo montado en GestIA («Montar reel»)
-- Une los clips animados de las escenas (Runway / Veo) con textos, barras de
-- progreso y tarjeta final. El MP4 se genera en el navegador y se guarda en el
-- bucket visual-assets; aquí queda su URL y los textos usados (para rehacerlo).

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS reel_video_url TEXT,
  ADD COLUMN IF NOT EXISTS reel_video_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reel_overlay_json JSONB;

COMMENT ON COLUMN public.content_items.reel_video_url IS
  'MP4 vertical del reel completo (clips de escenas + textos + cierre).';
COMMENT ON COLUMN public.content_items.reel_overlay_json IS
  'Textos y ajustes del montaje (texto por escena, cierre, marca, color) para volver a montarlo.';
