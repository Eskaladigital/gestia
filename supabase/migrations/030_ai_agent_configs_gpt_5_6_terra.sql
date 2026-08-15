-- ============================================================
-- 030 - Migrar agentes principales de GPT-5.4 a GPT-5.6 Terra
-- ============================================================

ALTER TABLE public.ai_agent_configs
  ALTER COLUMN model SET DEFAULT 'gpt-5.6-terra';

UPDATE public.ai_agent_configs
SET
  model = 'gpt-5.6-terra',
  updated_at = now()
WHERE provider = 'openai'
  AND model = 'gpt-5.4'
  AND agent_key IN (
    'analyze_site',
    'analyze_competitors',
    'generate_strategy',
    'generate_calendar',
    'brand_recognition'
  );
