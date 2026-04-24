-- ============================================================
-- 020 - Ampliar catálogo de agentes IA y refrescar defaults OpenAI
-- ============================================================

ALTER TABLE public.ai_agent_configs
  DROP CONSTRAINT IF EXISTS ai_agent_configs_agent_key_check;

ALTER TABLE public.ai_agent_configs
  ADD CONSTRAINT ai_agent_configs_agent_key_check
  CHECK (
    agent_key IN (
      'analyze_site',
      'analyze_competitors',
      'generate_strategy',
      'generate_calendar',
      'brand_recognition',
      'generate_visual_briefs',
      'visual_briefs_story',
      'visual_briefs_video',
      'visual_briefs_carousel',
      'visual_briefs_feed'
    )
  );

ALTER TABLE public.ai_agent_configs
  ALTER COLUMN model SET DEFAULT 'gpt-5.4';

UPDATE public.ai_agent_configs
SET
  model = CASE
    WHEN agent_key IN (
      'analyze_site',
      'analyze_competitors',
      'generate_strategy',
      'generate_calendar',
      'brand_recognition'
    ) THEN 'gpt-5.4'
    WHEN agent_key IN (
      'generate_visual_briefs',
      'visual_briefs_story',
      'visual_briefs_video',
      'visual_briefs_carousel',
      'visual_briefs_feed'
    ) THEN 'gpt-5.4-mini'
    ELSE model
  END,
  updated_at = now()
WHERE provider = 'openai'
  AND model IN ('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo')
  AND agent_key IN (
    'analyze_site',
    'analyze_competitors',
    'generate_strategy',
    'generate_calendar',
    'brand_recognition',
    'generate_visual_briefs',
    'visual_briefs_story',
    'visual_briefs_video',
    'visual_briefs_carousel',
    'visual_briefs_feed'
  );
