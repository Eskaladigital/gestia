-- ============================================================
-- GESTIA RRSS - Schema de Base de Datos para Supabase
-- Ejecutar en orden: 001 → 002 → 003 → 004 → 005 → 006_brand_identity_detail
--   → 007_strategies_web_site_analysis → 008_project_soft_delete
-- (Tras 001 deben existir public.update_updated_at y uuid_generate_v4.)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Perfiles de usuario (extiende auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  company_name TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'agency')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Proyectos (cada cliente es un proyecto)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  sector TEXT,
  location TEXT,
  description TEXT,
  client_type TEXT CHECK (client_type IN ('premium', 'medio', 'low_cost', 'b2b', 'b2c')),
  primary_goal TEXT CHECK (primary_goal IN ('ventas', 'leads', 'branding', 'viralidad', 'comunidad')),
  secondary_goals TEXT[] DEFAULT '{}',
  tone_formality INT DEFAULT 50 CHECK (tone_formality BETWEEN 0 AND 100),
  tone_proximity INT DEFAULT 50 CHECK (tone_proximity BETWEEN 0 AND 100),
  tone_emotion INT DEFAULT 50 CHECK (tone_emotion BETWEEN 0 AND 100),
  tone_humor INT DEFAULT 50 CHECK (tone_humor BETWEEN 0 AND 100),
  tone_disruption INT DEFAULT 50 CHECK (tone_disruption BETWEEN 0 AND 100),
  content_style JSONB DEFAULT '{"educativo":50,"inspiracional":50,"comercial":50,"entretenimiento":50,"personal":50,"corporativo":50}',
  commercial_level TEXT DEFAULT 'medio' CHECK (commercial_level IN ('bajo', 'medio', 'alto')),
  complexity TEXT DEFAULT 'medio' CHECK (complexity IN ('basico', 'medio', 'experto')),
  main_format TEXT DEFAULT 'carrusel' CHECK (main_format IN ('video_corto', 'carrusel', 'imagen', 'texto')),
  human_presence TEXT DEFAULT 'media' CHECK (human_presence IN ('baja', 'media', 'alta')),
  experimentation TEXT DEFAULT 'equilibrado' CHECK (experimentation IN ('conservador', 'equilibrado', 'experimental')),
  posts_per_week INT DEFAULT 5 CHECK (posts_per_week BETWEEN 1 AND 21),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'onboarding', 'analyzing', 'ready', 'error')),
  onboarding_step INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Competidores
CREATE TABLE public.competitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  social_url TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contenido scrapeado
CREATE TABLE public.scraped_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'home' CHECK (type IN ('home', 'services', 'about', 'blog', 'contact', 'pricing', 'other')),
  source TEXT DEFAULT 'mock' CHECK (source IN ('mock', 'firecrawl', 'apify', 'custom')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Estrategias generadas
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  value_proposition TEXT,
  target_audience TEXT,
  positioning TEXT,
  competitor_analysis JSONB DEFAULT '{}',
  content_pillars JSONB DEFAULT '[]',
  tone_guidelines TEXT,
  thematic_lines JSONB DEFAULT '[]',
  recommendations TEXT,
  ai_model TEXT DEFAULT 'gpt-4o',
  prompt_tokens INT,
  completion_tokens INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Items de contenido (calendario)
CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('educativo', 'inspiracional', 'comercial', 'entretenimiento', 'personal', 'corporativo')),
  format TEXT CHECK (format IN ('video_corto', 'carrusel', 'imagen', 'texto', 'reel', 'story')),
  idea TEXT NOT NULL,
  copy TEXT,
  cta TEXT,
  post_goal TEXT,
  hashtags TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  is_edited BOOLEAN DEFAULT false,
  platforms TEXT[] DEFAULT '{instagram}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_competitors_project_id ON public.competitors(project_id);
CREATE INDEX idx_scraped_content_project_id ON public.scraped_content(project_id);
CREATE INDEX idx_strategies_project_id ON public.strategies(project_id);
CREATE INDEX idx_content_items_project_id ON public.content_items(project_id);
CREATE INDEX idx_content_items_date ON public.content_items(scheduled_date);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can manage competitors" ON public.competitors FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = competitors.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can manage scraped content" ON public.scraped_content FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = scraped_content.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can manage strategies" ON public.strategies FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = strategies.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can manage content items" ON public.content_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = content_items.project_id AND projects.user_id = auth.uid()));

-- Trigger: auto-crear perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_content_items_updated_at BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
