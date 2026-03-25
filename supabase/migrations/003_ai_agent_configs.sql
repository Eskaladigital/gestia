-- ============================================================
-- 003: Configuración de agentes de IA por usuario
-- ============================================================

CREATE TABLE public.ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('analyze_site', 'analyze_competitors', 'generate_strategy', 'generate_calendar', 'brand_recognition')),
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'google')),
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  temperature REAL DEFAULT 0.7 CHECK (temperature BETWEEN 0.0 AND 2.0),
  max_tokens INT DEFAULT 4096 CHECK (max_tokens BETWEEN 256 AND 32768),
  system_prompt_override TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_key)
);

CREATE INDEX idx_ai_agent_configs_user ON public.ai_agent_configs(user_id);

ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai configs" ON public.ai_agent_configs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai configs" ON public.ai_agent_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai configs" ON public.ai_agent_configs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ai configs" ON public.ai_agent_configs
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_agent_configs_updated_at
  BEFORE UPDATE ON public.ai_agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at(); -- requiere 001
