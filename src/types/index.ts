// ============================================================
// GESTIA RRSS - Tipos TypeScript principales
// Producto de Eskala Marketing Digital · https://www.eskaladigital.com/
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---- Enums ----

export type ClientType = 'premium' | 'medio' | 'low_cost' | 'b2b' | 'b2c';
export type PrimaryGoal = 'ventas' | 'leads' | 'branding' | 'viralidad' | 'comunidad';
export type CommercialLevel = 'bajo' | 'medio' | 'alto';
export type Complexity = 'basico' | 'medio' | 'experto';
export type MainFormat = 'video_corto' | 'carrusel' | 'imagen' | 'texto'; // legacy
export type PublicationFormat = 'story' | 'carrusel' | 'publicacion' | 'reel';
export type HumanPresence = 'baja' | 'media' | 'alta';
export type Experimentation = 'conservador' | 'equilibrado' | 'experimental';
export type ProjectStatus = 'draft' | 'onboarding' | 'analyzing' | 'ready' | 'error';
export type ContentType = 'educativo' | 'inspiracional' | 'comercial' | 'entretenimiento' | 'personal' | 'corporativo';
export type ContentFormat = 'video_corto' | 'carrusel' | 'imagen' | 'texto' | 'reel' | 'story' | 'publicacion';
export type ContentItemStatus = 'draft' | 'approved' | 'published' | 'archived';
export type ScrapedContentType = 'home' | 'services' | 'about' | 'blog' | 'contact' | 'pricing' | 'other';
export type ScrapingSource = 'mock' | 'firecrawl' | 'apify' | 'custom';
export type UserPlan = 'free' | 'pro' | 'agency';
export type UserRole = 'admin' | 'agency' | 'user';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'trial';
/** Orientación global de imágenes IA del proyecto (migración 022). */
export type ImageOrientation = 'vertical' | 'cuadrado' | 'horizontal';
/**
 * Dirección creativa de las imágenes IA (migración 031):
 * - literal     → escenas reales del negocio (comportamiento clásico).
 * - equilibrado → mezcla de escenas reales y metáforas visuales.
 * - disruptivo  → mayoría de imágenes conceptuales/surrealistas fotorrealistas.
 */
export type VisualCreativeDirection = 'literal' | 'equilibrado' | 'disruptivo';
/**
 * Estética fotográfica de las imágenes IA (migración 032), independiente
 * de si la escena es literal o metafórica:
 * - profesional → reportaje fotográfico cuidado (default).
 * - lifestyle   → vida real bella y cálida (ni móvil ni catálogo).
 * - ugc         → foto de smartphone, como la haría un cliente.
 */
export type ImageAesthetic = 'profesional' | 'lifestyle' | 'ugc';

export type AIProvider = 'openai' | 'anthropic' | 'google';
export type AgentKey = 'analyze_site' | 'analyze_competitors' | 'generate_strategy' | 'generate_calendar' | 'brand_recognition' | 'generate_visual_briefs' | 'visual_briefs_story' | 'visual_briefs_video' | 'visual_briefs_carousel' | 'visual_briefs_feed';

// ---- AI Agent Config ----

export interface AIAgentConfig {
  id: string;
  user_id: string;
  agent_key: AgentKey;
  provider: AIProvider;
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt_override: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Detalle profundo generado por el agente de reconocimiento de marca */
export interface BrandIdentityDetail {
  palette_analysis?: string;
  typography_analysis?: string;
  layout_components?: string;
  imagery_iconography?: string;
  brand_feel_keywords?: string[];
  accessibility_notes?: string;
  rrss_practical_tips?: string[];
  dos?: string[];
  donts?: string[];
  /** Variables o tokens CSS citados (nombre + papel) */
  css_tokens_cited?: Array<{ token: string; role: string }>;
}

export interface BrandColorEntry {
  hex: string;
  name: string;
  usage: string;
  /** Dónde se ve (botones, hero, enlaces…) */
  notes?: string;
  /** Fragmento de CSS o selector si aplica */
  found_in?: string;
}

export interface BrandFontEntry {
  name: string;
  usage: string;
  notes?: string;
  weights?: string;
  fallbacks?: string;
}

export interface BrandAssets {
  brand_colors: BrandColorEntry[];
  brand_fonts: BrandFontEntry[];
  brand_logo_url: string | null;
  brand_favicon_url: string | null;
  brand_summary: string | null;
  brand_analyzed_at: string | null;
  brand_identity_detail?: BrandIdentityDetail | null;
}

// ---- Content Style (pesos de 0-100) ----

export interface ContentStyleWeights {
  educativo: number;
  inspiracional: number;
  comercial: number;
  entretenimiento: number;
  personal: number;
  corporativo: number;
}

export interface WeeklyFormatDistribution {
  story: number;
  carrusel: number;
  publicacion: number;
  reel: number;
}

// ---- Modelos de BD ----

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
  plan: UserPlan;
  role: UserRole;
  is_freemium: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  role_required: 'user' | 'agency';
  max_projects: number;
  price_monthly: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
}

export interface ProfileWithSubscription extends Profile {
  user_subscriptions?: UserSubscription[];
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  url: string | null;
  sector: string | null;
  location: string | null;
  description: string | null;
  client_type: ClientType | null;
  primary_goal: PrimaryGoal | null;
  secondary_goals: string[];
  tone_formality: number;
  tone_proximity: number;
  tone_emotion: number;
  tone_humor: number;
  tone_disruption: number;
  content_style: ContentStyleWeights;
  commercial_level: CommercialLevel;
  complexity: Complexity;
  main_format: MainFormat; // legacy
  human_presence: HumanPresence;
  experimentation: Experimentation;
  posts_per_week: number; // legacy
  weekly_format_distribution: WeeklyFormatDistribution;
  /** Honorarios mensuales en EUR (gestión comercial); migración 009 */
  monthly_fee?: number | null;
  /** Reglas IA personalizadas por proyecto; migración 010 */
  ai_rules?: string | null;
  /** Orientación global de imágenes IA generadas; migración 022 (default 'vertical'). */
  image_orientation?: ImageOrientation;
  /**
   * Reglas físicas e identitarias inviolables del producto (planta de un
   * espacio, identidad de marca, sujetos prohibidos…). Migración 025.
   * Texto libre. Si está vacío, no se inyecta nada en el pipeline.
   */
  physical_constraints?: string | null;
  /** Última edición (manual o IA) de las reglas inviolables. Migración 025. */
  physical_constraints_at?: string | null;
  /**
   * true = negocio con producto físico a replicar (camper, sauna, tornillos…).
   * false = servicio/agencia/moodboard sin clonar un objeto. Migración 029.
   * null = aún no clasificado (p. ej. antes de generar estrategia).
   */
  sells_physical_product?: boolean | null;
  /**
   * Dirección creativa de las imágenes IA (migración 031).
   * null = 'literal' (comportamiento clásico, sin metáforas visuales).
   */
  visual_creative_direction?: VisualCreativeDirection | null;
  /**
   * Estética fotográfica (migración 032).
   * null = 'profesional' (comportamiento clásico).
   */
  image_aesthetic?: ImageAesthetic | null;
  status: ProjectStatus;
  onboarding_step: number;
  brand_colors: BrandColorEntry[];
  brand_fonts: BrandFontEntry[];
  brand_logo_url: string | null;
  brand_favicon_url: string | null;
  brand_summary: string | null;
  brand_analyzed_at: string | null;
  brand_identity_detail?: BrandIdentityDetail | null;
  created_at: string;
  updated_at: string;
  /** Si no es null, el proyecto está en la papelera */
  deleted_at?: string | null;
}

export type ProjectReferenceCaptionStatus = 'pending' | 'generating' | 'ready' | 'error';

/**
 * Rol de una imagen de referencia (migración 028). Determina cómo la usa el
 * pipeline de generación:
 * - product : ES el producto → fidelidad 100% (ancla dura del `images.edit`).
 * - style   : inspiración de estética → copiar ambiente, NO formas.
 * - place   : lugar/entorno → copiar contexto, NO formas.
 * - logo    : identidad gráfica → respetar exacto en slides de marca.
 * - person  : persona/retrato.
 * - scene   : escena de uso genérica.
 * - other   : no encaja en lo anterior.
 * - pending : aún no se ha analizado.
 */
export type ProjectReferenceRole =
  | 'pending'
  | 'product'
  | 'style'
  | 'place'
  | 'logo'
  | 'person'
  | 'scene'
  | 'other';

/** Punto de vista de una foto de producto (migración 028). */
export type ProjectReferenceView = 'exterior' | 'interior' | 'detalle';

export interface ProjectReferenceImage {
  id: string;
  project_id: string;
  storage_path: string;
  image_url: string;
  original_filename: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  is_primary: boolean;
  sort_order: number;
  /**
   * Descripción corta de qué se ve en la imagen (1-2 frases).
   * Generada por IA con visión al subir. Editable por el usuario.
   * Se usa para que `/api/generate-image` decida qué referencias enviar
   * al modelo de imagen según el slide concreto.
   */
  caption?: string | null;
  caption_status?: ProjectReferenceCaptionStatus;
  caption_at?: string | null;
  caption_is_manual?: boolean;
  /** Rol clasificado por IA al subir (migración 028). Editable por el usuario. */
  reference_role?: ProjectReferenceRole;
  /** Confianza 0..1 de la clasificación de rol. */
  role_confidence?: number | null;
  /** Si es true, el rol lo fijó el usuario y no se sobrescribe al reanalizar. */
  role_is_manual?: boolean;
  /** Cuando reference_role = product: qué producto es. */
  product_identity?: string | null;
  /** Cuando reference_role = product: rasgos inviolables separados por " · ". */
  product_traits?: string | null;
  /** Vista de la foto de producto: exterior / interior / detalle. */
  reference_view?: ProjectReferenceView | null;
  created_at: string;
  updated_at: string;
}

export interface Competitor {
  id: string;
  project_id: string;
  name: string;
  url: string | null;
  social_url: string | null;
  reason: string | null;
  created_at: string;
}

export interface ScrapedContent {
  id: string;
  project_id: string;
  url: string;
  content: string | null;
  type: ScrapedContentType;
  source: ScrapingSource;
  metadata: Json;
  created_at: string;
}

export interface Strategy {
  id: string;
  project_id: string;
  value_proposition: string | null;
  target_audience: string | null;
  positioning: string | null;
  /** Respuesta completa del análisis de web (analyze-site); requiere migración 007 */
  web_site_analysis?: Json | null;
  competitor_analysis: Json;
  content_pillars: Json;
  tone_guidelines: string | null;
  thematic_lines: Json;
  recommendations: string | null;
  ai_model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  updated_at: string;
}

/** Especificaciones de producción generadas por el calendario */
export interface ProductionSpecs {
  /** Número de slides (solo carrusel) */
  num_slides?: number;
  /** Duración estimada en segundos (reel/story vídeo) */
  duration_seconds?: number;
  /** Tipo de medio: "imagen" o "video" (relevante en stories) */
  media_type?: 'imagen' | 'video';
  /** Resumen de escenas o slides para guiar el brief visual */
  scene_summary?: string;
}

export interface ContentItem {
  id: string;
  project_id: string;
  strategy_id: string | null;
  scheduled_date: string;
  content_type: ContentType;
  format: ContentFormat | null;
  idea: string;
  copy: string | null;
  cta: string | null;
  post_goal: string | null;
  hashtags: string[];
  status: ContentItemStatus;
  is_edited: boolean;
  platforms: string[];
  visual_brief: string | null;
  visual_prompt: string | null;
  production_specs: ProductionSpecs | null;
  created_at: string;
  updated_at: string;
}

// ---- Onboarding Form Data ----

export interface OnboardingFormData {
  // Step 1: Datos del negocio
  name: string;
  url: string;
  sector: string;
  location: string;
  description: string;

  // Step 2: Objetivos
  primary_goal: PrimaryGoal | '';
  secondary_goals: PrimaryGoal[];

  // Step 3: Tipo de cliente
  client_type: ClientType | '';

  // Step 4: Competidores
  competitors: Array<{
    name: string;
    url: string;
    reason: string;
  }>;

  // Step 5: Variables estratégicas
  tone_formality: number;
  tone_proximity: number;
  tone_emotion: number;
  tone_humor: number;
  tone_disruption: number;
  content_style: ContentStyleWeights;
  commercial_level: CommercialLevel;
  complexity: Complexity;
  human_presence: HumanPresence;
  experimentation: Experimentation;
  weekly_format_distribution: WeeklyFormatDistribution;
}

// ---- AI Response Types ----

export interface BusinessAnalysis {
  value_proposition: string;
  target_audience: string;
  positioning: string;
  /** Síntesis en prosa de lo detectado en todas las URLs analizadas */
  detailed_business_description?: string;
  key_services: string[];
  unique_selling_points: string[];
  brand_personality?: string;
  content_opportunities?: string[];
  confidence_level?: string;
}

export interface CompetitorAnalysis {
  competitors: Array<{
    name: string;
    detected_content_types?: string[];
    strengths?: string[];
    weaknesses?: string[];
    estimated_frequency?: string;
    tone_detected?: string;
  }>;
  market_opportunities?: string[];
  differentiation_ideas?: string[];
  content_gaps?: string[];
  recommendations?: string;
  discovered_serp_urls?: string[];
}

export interface StrategyGeneration {
  content_pillars: Array<{
    name: string;
    description: string;
    percentage: number;
    content_types?: string[];
    example_topics?: string[];
  }>;
  tone_guidelines: string;
  thematic_lines: Array<{
    theme: string;
    description: string;
    frequency?: string;
    example_topics: string[];
  }>;
  recommendations: string;
  /**
   * La IA decide si el cliente vende un producto físico reproducible en imagen.
   * true: camper, alquiler de barco, tornillos… false: agencia, masajes, consultoría…
   */
  sells_physical_product?: boolean;
  /** Una frase que justifica sells_physical_product (opcional, para logs/UI). */
  product_fidelity_reason?: string;
}

export interface CalendarPost {
  scheduled_date: string;
  content_type: ContentType;
  format: ContentFormat;
  idea: string;
  copy: string;
  cta: string;
  post_goal: string;
  hashtags: string[];
  platforms: string[];
}

export interface CalendarGeneration {
  month: string;
  posts: CalendarPost[];
}

export interface VisualBriefPost {
  content_item_id: string;
  visual_brief?: string | null;
  visual_prompt: string;
}

export interface VisualBriefGeneration {
  briefs: VisualBriefPost[];
}

export type ImageGenerationStatus = 'pending' | 'generating' | 'ready' | 'error';
export type VideoGenerationStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface ContentItemVisual {
  id: string;
  content_item_id: string;
  visual_index: number;
  label: string | null;
  visual_prompt: string;
  visual_brief: string | null;
  image_url: string | null;
  image_status: ImageGenerationStatus;
  image_error: string | null;
  /** Espejo horizontal guardado en BD (vista y descargas). */
  image_flip_horizontal?: boolean;
  /** Estado del mini editor (textos, filtros) para reabrir la edición. */
  image_edit_json?: Json | null;
  /** PNG final editado; prioridad en vista y descarga. */
  edited_image_url?: string | null;
  image_edited_at?: string | null;
  /** Prompt que describe cómo debe moverse / animarse la imagen existente. */
  video_motion_prompt?: string | null;
  video_url?: string | null;
  video_status?: VideoGenerationStatus | null;
  video_error?: string | null;
  video_model?: string | null;
  video_source_image_url?: string | null;
  video_generated_at?: string | null;
  /**
   * Texto del último error reportado por el usuario sobre la imagen generada.
   * Se inyecta en el prompt al regenerar para que la IA corrija puntos concretos
   * (objetos deformes, elementos fuera de sitio, piel plástica, etc.).
   * Se limpia automáticamente al regenerar con éxito.
   */
  user_feedback?: string | null;
  /** Fecha en la que se reportó el último error. */
  user_feedback_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SingleVisualAIResponse {
  visual_prompt: string;
}
