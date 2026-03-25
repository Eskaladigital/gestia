-- 005: Tabla para almacenar API keys de proveedores IA por usuario
-- Las claves se guardan cifradas en la BD para que se puedan gestionar desde el dashboard

CREATE TABLE IF NOT EXISTS public.provider_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  api_key TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.provider_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys"
  ON public.provider_api_keys
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER handle_provider_api_keys_updated_at
  BEFORE UPDATE ON public.provider_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
