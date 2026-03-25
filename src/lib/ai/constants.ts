import type { AgentKey, AIProvider } from '@/types';

/** Orden oficial del pipeline, refleja los pasos de procesamiento en la app. */
export const AGENT_PIPELINE_ORDER: AgentKey[] = [
  'brand_recognition',
  'analyze_site',
  'analyze_competitors',
  'generate_strategy',
  'generate_calendar',
  'generate_visual_briefs',
];

export interface AgentDefault {
  label: string;
  description: string;
  icon: string;
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  defaultSystemPrompt: string;
}

export const AGENT_DEFAULTS: Record<AgentKey, AgentDefault> = {
  analyze_site: {
    label: 'Analizar negocio',
    description: 'Scrapea la web y extrae propuesta de valor, audiencia, posicionamiento',
    icon: '🔍',
    provider: 'openai',
    model: 'gpt-4o',
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
    model: 'gpt-4o',
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
    model: 'gpt-4o',
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
    model: 'gpt-4o',
    temperature: 0.9,
    maxTokens: 8192,
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
    label: 'Generar briefs visuales',
    description: 'Genera brief creativo y prompt para IA generativa por cada publicación del calendario',
    icon: '🎬',
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.85,
    maxTokens: 8192,
    defaultSystemPrompt: `Eres un director creativo senior y director de arte especializado en producción visual para redes sociales.

PRINCIPIO FUNDAMENTAL: Cada brief describe EXACTAMENTE qué se ve en cada imagen/escena. NO describas conceptos abstractos. Describe OBJETOS, PERSONAS, ACCIONES, COMPOSICIÓN y TEXTO LITERAL.

ENTREGABLES por publicación:
1. "visual_brief" — Guía de producción completa para diseñador/equipo. Tan detallada que NO requiera preguntas.
2. "visual_prompt" — Prompt técnico para IA generativa (Midjourney/DALL-E). Copiable directamente.

REGLAS POR FORMATO:

CARRUSEL: Detallar CADA slide individualmente: "SLIDE 1 (GANCHO): [descripción exacta de objetos, personas, fondo]. Texto overlay: '[literal]'." Hasta el último slide. El visual_prompt debe tener un prompt SEPARADO por slide.

REEL: Guión técnico con duración total, escenas con timing (ESCENA 1, 0:00-0:05: qué se ve, encuadre, movimiento cámara, audio, texto en pantalla). Transiciones entre escenas. Música sugerida. Si necesita persona real/animación/stock.

STORY (imagen): Composición 9:16. Escena completa con elementos concretos, overlay texto literal, posición, estilo.

PUBLICACIÓN: Composición 1:1 o 4:5. Qué hay en primer plano, fondo, texto literal, tipografía, posición.

OBLIGATORIO: Objetos concretos (no "paisaje bonito"), personas con acción (no "persona disfrutando"), texto overlay literal con posición y tipografía, colores de marca específicos con hex, variedad entre posts consecutivos.

PROHIBIDO: Descripciones vagas, briefs genéricos, prompts de IA cortos o genéricos, repetir estilo visual en posts seguidos, decir "usar colores de marca" sin especificar cuáles y dónde.

VISUAL_PROMPT: Estructurar siempre de forma rica y muy descriptiva en: "Escena:", "Composición:" (incluir --ar), "Sujetos:", "Luz y Atmósfera:", "Fondo:", y "Estilo:". Cada parte debe tener un nivel de detalle fotográfico/editorial. NO incluir texto (se añade en postproducción). Si es carrusel, generar un prompt con esta estructura por cada slide.

- Responde en español. Devuelve SOLO JSON válido.`,
  },
  brand_recognition: {
    label: 'Reconocimiento de marca',
    description: 'Visita la web para extraer colores, fuentes, logo e identidad visual',
    icon: '🎨',
    provider: 'openai',
    model: 'gpt-4o',
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
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', context: '128k' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', context: '128k' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai', context: '128k' },
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
  return getModelsForProvider(provider)[0]?.id || 'gpt-4o';
}

export function resolveSupportedModel(provider: AIProvider, model?: string | null): string {
  if (model && getModelsForProvider(provider).some(option => option.id === model)) {
    return model;
  }
  return getDefaultModelForProvider(provider);
}
