-- ============================================================
-- 016 - Auto-trial de 30 dias al registrarse
-- ============================================================
-- Modifica handle_new_user() para que ademas de crear el perfil,
-- inserte una suscripcion trial de 30 dias en user_subscriptions.
-- El plan se lee de raw_user_meta_data->>'selected_plan' (viene del
-- formulario de registro con ?plan=xxx), fallback a 'user_basic'.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _plan_id TEXT;
BEGIN
  -- Crear perfil
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');

  -- Determinar plan seleccionado (fallback user_basic)
  _plan_id := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'selected_plan'), ''),
    'user_basic'
  );

  -- Verificar que el plan exista; si no, usar user_basic
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = _plan_id AND is_active = true) THEN
    _plan_id := 'user_basic';
  END IF;

  -- Crear suscripcion trial de 30 dias
  INSERT INTO public.user_subscriptions (user_id, plan_id, status, started_at, expires_at)
  VALUES (NEW.id, _plan_id, 'trial', now(), now() + interval '30 days');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
