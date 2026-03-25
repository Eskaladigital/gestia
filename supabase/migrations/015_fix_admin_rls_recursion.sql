-- ============================================================
-- 015 - Corrige recursión RLS en profiles para policies de admin
-- ============================================================
-- Las policies de 012 consultan profiles dentro de una policy sobre profiles,
-- lo que puede causar recursión infinita. Se reemplaza por una función
-- SECURITY DEFINER que salta RLS para la comprobación del rol.

-- 1) Función auxiliar que comprueba si el usuario actual es admin (sin RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2) Reemplazar policies de profiles que usaban subconsulta recursiva
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- 3) Reemplazar policies de user_subscriptions
DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON public.user_subscriptions;

CREATE POLICY "Admins can manage all subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (public.is_admin());

-- 4) Reemplazar policies de subscription_plans
DROP POLICY IF EXISTS "Admins can manage plans" ON public.subscription_plans;

CREATE POLICY "Admins can manage plans"
  ON public.subscription_plans FOR ALL
  USING (public.is_admin());

-- 5) Reemplazar policies de 013 (proyectos y tablas hijas)
DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can update all projects" ON public.projects;

CREATE POLICY "Admins can view all projects"
  ON public.projects FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all projects"
  ON public.projects FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage all competitors" ON public.competitors;
CREATE POLICY "Admins can manage all competitors"
  ON public.competitors FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage all scraped content" ON public.scraped_content;
CREATE POLICY "Admins can manage all scraped content"
  ON public.scraped_content FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage all strategies" ON public.strategies;
CREATE POLICY "Admins can manage all strategies"
  ON public.strategies FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage all content items" ON public.content_items;
CREATE POLICY "Admins can manage all content items"
  ON public.content_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
