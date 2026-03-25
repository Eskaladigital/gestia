-- ============================================================
-- 012 - Roles de usuario, planes de suscripción y freemium
-- ============================================================

-- 1) Añadir columna de rol al perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
    CHECK (role IN ('admin', 'agency', 'user'));

-- 2) Añadir flag freemium (el admin puede marcar usuarios para que no paguen)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_freemium BOOLEAN DEFAULT false;

-- 3) Tabla de planes de suscripción
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role_required TEXT NOT NULL CHECK (role_required IN ('user', 'agency')),
  max_projects INT NOT NULL,
  price_monthly NUMERIC(8,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar planes por defecto
INSERT INTO public.subscription_plans (id, name, role_required, max_projects, price_monthly, description, sort_order) VALUES
  ('user_basic',    'Básico',        'user',   1,   9.99, 'Un proyecto, ideal para autónomos y negocios individuales',            10),
  ('agency_starter','Agencia Start', 'agency', 3,  24.99, 'Hasta 3 proyectos, perfecto para pequeñas agencias',                  20),
  ('agency_pro',   'Agencia Pro',   'agency', 10,  59.99, 'Hasta 10 proyectos, para agencias en crecimiento',                    30),
  ('agency_elite', 'Agencia Elite', 'agency', 50, 149.99, 'Hasta 50 proyectos, para grandes agencias y consultoras',             40)
ON CONFLICT (id) DO NOTHING;

-- 4) Tabla de suscripciones de usuario
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);

-- RLS para user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- RLS para subscription_plans (lectura pública)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON public.subscription_plans FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage plans"
  ON public.subscription_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 5) Políticas adicionales para que admins puedan ver/gestionar todos los perfiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 6) Trigger updated_at para user_subscriptions
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 7) Asignar rol admin al usuario de Eskala (contacto@eskaladigital.com)
--    Se ejecuta de forma segura: solo actualiza si existe.
UPDATE public.profiles
  SET role = 'admin', is_freemium = true
  WHERE id = (
    SELECT id FROM auth.users WHERE email = 'contacto@eskaladigital.com' LIMIT 1
  );
