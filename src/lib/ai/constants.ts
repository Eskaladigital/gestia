import type { AgentKey, AIProvider, ImageOrientation } from '@/types';

/** Orden oficial del pipeline, refleja los pasos de procesamiento en la app. */
export const AGENT_PIPELINE_ORDER: AgentKey[] = [
  'brand_recognition',
  'analyze_site',
  'analyze_competitors',
  'generate_strategy',
  'generate_calendar',
  'generate_visual_briefs',
  'visual_briefs_story',
  'visual_briefs_video',
  'visual_briefs_carousel',
  'visual_briefs_feed',
];

export interface AgentDefault {
  label: string;
  description: string;
  icon: string;
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxTokens: number;
  defaultSystemPrompt: string;
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const AGENT_DEFAULTS: Record<AgentKey, AgentDefault> = {
  analyze_site: {
    label: 'Analizar negocio',
    description: 'Scrapea la web y extrae propuesta de valor, audiencia, posicionamiento',
    icon: '🔍',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    temperature: 0.7,
    maxTokens: 4096,
    defaultSystemPrompt: `Eres un estratega senior de marketing digital especializado en convertir evidencia web en una ficha estratégica útil para redes sociales.

Reglas:
- Usa como fuente principal el sitio del cliente.
- Si falta evidencia, dilo explícitamente.
- No inventes servicios, públicos, claims ni ventajas.
- "detailed_business_description" debe ser prosa coherente, no una lista.
- "key_services", "unique_selling_points" y "content_opportunities" deben salir de la evidencia.
- Devuelve solo JSON válido en español.

Campos:
value_proposition, target_audience, positioning, detailed_business_description, key_services, unique_selling_points, brand_personality, content_opportunities, confidence_level.`,
  },
  analyze_competitors: {
    label: 'Analizar competidores',
    description: 'Estudia webs de competidores y detecta oportunidades de diferenciación',
    icon: '🏆',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    temperature: 0.7,
    maxTokens: 4096,
    defaultSystemPrompt: `Eres un analista competitivo senior especializado en marketing digital y contenido para redes sociales.

Reglas:
- Sé prudente: si la evidencia es débil, dilo.
- Devuelve una entrada por competidor declarado cuando sea posible.
- No inventes competidores, frecuencias ni fortalezas.
- "detected_content_types" debe reflejar formatos observables.
- "market_opportunities", "differentiation_ideas" y "content_gaps" deben ser accionables.
- Devuelve solo JSON válido en español.

Campos:
competitors[{name, detected_content_types, strengths, weaknesses, estimated_frequency, tone_detected}], market_opportunities, differentiation_ideas, content_gaps, recommendations.`,
  },
  generate_strategy: {
    label: 'Generar estrategia',
    description: 'Crea pilares de contenido, tono, líneas temáticas y recomendaciones',
    icon: '🎯',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'medium',
    temperature: 0.8,
    maxTokens: 4096,
    defaultSystemPrompt: `Eres un director de estrategia de contenido para redes sociales.

Reglas:
- Respeta tono, estilo, complejidad y frecuencia configurados.
- Devuelve entre 3 y 5 pilares.
- La suma de "percentage" en "content_pillars" debe ser 100.
- "content_types" y "example_topics" deben ser útiles para generar calendario.
- "tone_guidelines" debe incluir do/don't editoriales.
- "thematic_lines" debe ser sostenible y concreta.
- Devuelve solo los campos que usa la app y solo JSON válido en español.

Campos:
content_pillars, tone_guidelines, thematic_lines, recommendations.`,
  },
  generate_calendar: {
    label: 'Generar calendario',
    description: 'Produce el calendario mensual con copies listos para publicar',
    icon: '📅',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    temperature: 0.9,
    // Un mes con 22+ posts y scene_summary detallado por slide (ficha técnica con
    // plano/sujeto/acción/hora/lugar) puede superar fácilmente 8k tokens de salida.
    // Subimos el techo para que el JSON no llegue truncado y falle el parseo.
    maxTokens: 20000,
    defaultSystemPrompt: `Eres un editor senior y copywriter de redes sociales.

Reglas:
- Respeta exactamente cupos, fechas permitidas y formatos del contexto.
- Un solo post por día.
- "format" solo puede ser story, carrusel, publicacion o reel.
- "content_type" solo puede ser educativo, inspiracional, comercial, entretenimiento, personal o corporativo.
- Cada post debe incluir idea, copy completo, CTA, objetivo, hashtags, platforms y production_specs.
- Mantén variedad temática y de CTA.
- "platforms" debe incluir "instagram".
- Devuelve solo JSON válido en español.

production_specs por formato:
- Carrusel: { num_slides: 3-10, media_type: "imagen", scene_summary: "Slide 1: ..., Slide 2: ..." }
- Reel: { duration_seconds: 15-60, media_type: "video", scene_summary: "Escena 1 (0:00-0:08): ..." }
- Story: { media_type: "imagen"|"video", duration_seconds: 8-15 si video, scene_summary: "..." }
- Publicación: { media_type: "imagen", scene_summary: "..." }

Campos:
month, total_posts, posts[{scheduled_date, content_type, format, idea, copy, cta, post_goal, hashtags, platforms, production_specs}].`,
  },
  generate_visual_briefs: {
    label: 'Prompts visuales (general)',
    description: 'Agente genérico de prompts visuales — usado como fallback si no hay config específica por formato',
    icon: '🎬',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'none',
    temperature: 0.85,
    maxTokens: 8192,
    defaultSystemPrompt: `Agente genérico de prompts visuales. El system prompt especializado se inyecta dinámicamente según el formato (story, vídeo, carrusel, feed).`,
  },
  visual_briefs_story: {
    label: 'Prompts — Stories',
    description: 'Especialista en composición vertical 9:16, impacto inmediato y contenido nativo de Stories',
    icon: '📱',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'none',
    temperature: 0.85,
    maxTokens: 8192,
    defaultSystemPrompt: `Especialista en Stories para Instagram/TikTok. Contenido vertical fullscreen 9:16 con impacto visual inmediato. Deja espacio para texto overlay. Estética nativa de Stories: cercana, auténtica, dinámica. Responde en español. Devuelve SOLO JSON con campo "visual_prompt".`,
  },
  visual_briefs_video: {
    label: 'Prompts — Vídeo / Reels',
    description: 'Director de cine especializado en fotogramas clave, movimiento de cámara y narrativa cinematográfica',
    icon: '🎥',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'none',
    temperature: 0.85,
    maxTokens: 8192,
    defaultSystemPrompt: `Director de cine y DF especializado en Reels/TikTok. Describe fotogramas clave de vídeo con lenguaje cinematográfico: movimiento de cámara, acción dinámica, ritmo, motion blur. NUNCA describir como foto estática. Secciones obligatorias incluyen Movimiento. Mínimo 300 palabras. Responde en español. Devuelve SOLO JSON con campo "visual_prompt".`,
  },
  visual_briefs_carousel: {
    label: 'Prompts — Carrusel',
    description: 'Director de arte editorial especializado en secuencias narrativas slide-a-slide con coherencia visual',
    icon: '🎠',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'none',
    temperature: 0.85,
    maxTokens: 8192,
    defaultSystemPrompt: `Director de arte editorial de carruseles para Instagram/LinkedIn. Cada slide forma parte de una secuencia narrativa coherente. Primer slide = gancho, último = CTA. Deja zonas para texto overlay. Coherencia visual entre slides (misma paleta, iluminación, estilo). Responde en español. Devuelve SOLO JSON con campo "visual_prompt".`,
  },
  visual_briefs_feed: {
    label: 'Prompts — Publicación Feed',
    description: 'Fotógrafo editorial especializado en fotografía de producto, lifestyle y naturaleza para feed de Instagram',
    icon: '📸',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'none',
    temperature: 0.85,
    maxTokens: 8192,
    defaultSystemPrompt: `Fotógrafo editorial de renombre especializado en fotografía de producto, lifestyle y naturaleza para marcas premium. Describe imágenes con precisión de director de fotografía profesional. Estructura: Escena, Composición, Sujetos, Luz y Atmósfera, Fondo, Estilo. Mínimo 250 palabras. Responde en español. Devuelve SOLO JSON con campo "visual_prompt".`,
  },
  brand_recognition: {
    label: 'Reconocimiento de marca',
    description: 'Visita la web para extraer colores, fuentes, logo e identidad visual',
    icon: '🎨',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'low',
    temperature: 0.35,
    maxTokens: 10000,
    defaultSystemPrompt: `Eres un especialista en identidad visual y auditoría UI.

Reglas:
- Basa el análisis solo en HTML, CSS y metadatos proporcionados.
- Prioriza precisión sobre exhaustividad.
- "brand_colors[].hex" debe ser #RRGGBB válido.
- "brand_fonts[].name" solo puede contener familias reales.
- Si no hay evidencia suficiente de logo o favicon, usa null.
- "brand_summary" y "brand_identity_detail" deben ser útiles para aplicar la marca en RRSS.
- Devuelve solo JSON válido en español.

Campos:
brand_colors, brand_fonts, brand_logo_url, brand_favicon_url, brand_summary, brand_identity_detail.`,
  },
};

export interface ModelOption {
  id: string;
  label: string;
  provider: AIProvider;
  context: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'openai', context: '1.05M' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', provider: 'openai', context: '1.05M' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'openai', context: '1.05M' },
  { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai', context: '1.05M' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai', context: '1.05M' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', provider: 'openai', context: '1.05M' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', context: '128k' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', context: '128k' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic', context: '200k' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'anthropic', context: '200k' },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', provider: 'anthropic', context: '200k' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google', context: '1M' },
  { id: 'gemini-2.5-pro-preview-06-05', label: 'Gemini 2.5 Pro', provider: 'google', context: '1M' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', provider: 'google', context: '1M' },
];

export function getModelsForProvider(provider: AIProvider): ModelOption[] {
  return AVAILABLE_MODELS.filter(m => m.provider === provider);
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  return getModelsForProvider(provider)[0]?.id || 'gpt-5.6-terra';
}

export function resolveSupportedModel(provider: AIProvider, model?: string | null): string {
  if (model && getModelsForProvider(provider).some(option => option.id === model)) {
    return model;
  }
  return getDefaultModelForProvider(provider);
}

export const IMAGE_PROMPT_REFINER_MODEL = 'gpt-5.4-mini';
export const IMAGE_GENERATION_MODEL = 'gpt-image-2';

/**
 * Modelo "orquestador" de la Responses API para generación de imágenes.
 * No genera la imagen él mismo: interpreta el prompt y las referencias con
 * todo su conocimiento del mundo, optimiza las instrucciones y llama al tool
 * `image_generation` (que ejecuta IMAGE_GENERATION_MODEL). Es la vía que
 * OpenAI recomienda para máxima calidad e instruction following.
 */
export const IMAGE_ORCHESTRATOR_MODEL = 'gpt-5.6-terra';
export const IMAGE_ORCHESTRATOR_REASONING_EFFORT: ReasoningEffort = 'medium';

// Nota: gpt-image-2 procesa SIEMPRE las referencias en alta fidelidad y
// rechaza el parámetro `input_fidelity` (era de gpt-image-1/1.5): no enviarlo.

export const VIDEO_GENERATION_MODEL = 'veo-3.1-fast-generate-preview';
export const VIDEO_GENERATION_DURATION_SECONDS = 8;
export const VIDEO_GENERATION_ESTIMATED_COST_USD = 1.2;

/**
 * Tamaños que usamos realmente en la app. gpt-image-2 acepta resoluciones
 * arbitrarias (múltiplos de 16, ratio ≤ 3:1, ≤ 2560x1440 px totales sin ser
 * "experimental"), tanto en `images.generate`/`images.edit` como en el tool
 * `image_generation` de la Responses API. Usamos ~1.5x la resolución clásica
 * (1024) manteniendo los ratios 2:3, 1:1 y 3:2: más nitidez tras el reescalado
 * de Instagram (que sirve a 1080px) sin disparar coste ni latencia.
 */
export type OpenAIImageSize =
  | '1248x1248'
  | '1248x1872'
  | '1872x1248';

/** Tamaño legacy / fallback. Usa `resolveImageSize(orientation)` para nuevas llamadas. */
export const IMAGE_GENERATION_SIZE: OpenAIImageSize = '1248x1872';
export const IMAGE_GENERATION_QUALITY = 'high';
export const IMAGE_GENERATION_ESTIMATED_COST_USD = 0.25;

/** Orientación por defecto de un proyecto cuando la columna aún no existe (pre-migración 022). */
export const DEFAULT_IMAGE_ORIENTATION: ImageOrientation = 'vertical';

/**
 * Tamaños según orientación (resolución premium de gpt-image-2).
 * - vertical   → 2:3 (móvil, Stories, Reels, TikTok)
 * - cuadrado   → 1:1 (feed clásico Instagram, LinkedIn)
 * - horizontal → 3:2 (web, blog, LinkedIn artículo)
 */
export const IMAGE_SIZE_BY_ORIENTATION: Record<ImageOrientation, OpenAIImageSize> = {
  vertical: '1248x1872',
  cuadrado: '1248x1248',
  horizontal: '1872x1248',
};

export function resolveImageSize(orientation: ImageOrientation | string | null | undefined): OpenAIImageSize {
  if (orientation === 'vertical' || orientation === 'cuadrado' || orientation === 'horizontal') {
    return IMAGE_SIZE_BY_ORIENTATION[orientation];
  }
  return IMAGE_SIZE_BY_ORIENTATION[DEFAULT_IMAGE_ORIENTATION];
}

/**
 * Clase de Tailwind con el aspect-ratio real de las imágenes generadas para
 * cada orientación. Coincide con los tamaños reales de OpenAI:
 * 1248×1872 → 2/3, 1248×1248 → 1/1, 1872×1248 → 3/2.
 *
 * Se usa en la galería de contenido y donde haya que reservar el hueco de la
 * imagen ANTES de que cargue (placeholder, error, miniaturas, etc.).
 */
export function aspectClassForOrientation(
  orientation: ImageOrientation | string | null | undefined
): string {
  if (orientation === 'cuadrado') return 'aspect-square';
  if (orientation === 'horizontal') return 'aspect-[3/2]';
  return 'aspect-[2/3]';
}

/** Valor CSS de aspect-ratio (no depende de que Tailwind genere la clase). */
export function aspectRatioForOrientation(
  orientation: ImageOrientation | string | null | undefined
): string {
  if (orientation === 'cuadrado') return '1 / 1';
  if (orientation === 'horizontal') return '3 / 2';
  return '2 / 3';
}

export const IMAGE_ORIENTATION_LABELS: Record<ImageOrientation, { label: string; ratio: string; hint: string; icon: string }> = {
  vertical: {
    label: 'Vertical',
    ratio: '9:16',
    hint: 'Instagram Stories, Reels, TikTok, móvil',
    icon: '📱',
  },
  cuadrado: {
    label: 'Cuadrado',
    ratio: '1:1',
    hint: 'Feed Instagram, LinkedIn',
    icon: '🟦',
  },
  horizontal: {
    label: 'Horizontal',
    ratio: '16:9',
    hint: 'Web, blog, LinkedIn artículo, YouTube',
    icon: '🖥️',
  },
};
