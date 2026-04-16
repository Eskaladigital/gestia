// ============================================================
// GESTIA RRSS - Prompts para IA
// Cada prompt recibe variables del onboarding para personalización
// Producto de Eskala Marketing Digital · https://www.eskaladigital.com/
// ============================================================

import type { Project, Competitor, ContentStyleWeights, WeeklyFormatDistribution } from '@/types';
import { getMonthName } from '@/lib/utils';

// ---- Helpers para construir contexto ----

function toneDescription(value: number, low: string, high: string): string {
  if (value <= 20) return `muy ${low}`;
  if (value <= 40) return low;
  if (value <= 60) return `entre ${low} y ${high}`;
  if (value <= 80) return high;
  return `muy ${high}`;
}

function buildToneContext(project: Project): string {
  return [
    `- Formalidad: ${toneDescription(project.tone_formality, 'informal', 'profesional')} (${project.tone_formality}/100)`,
    `- Proximidad: ${toneDescription(project.tone_proximity, 'cercano', 'corporativo')} (${project.tone_proximity}/100)`,
    `- Emoción: ${toneDescription(project.tone_emotion, 'emocional', 'racional')} (${project.tone_emotion}/100)`,
    `- Humor: ${toneDescription(project.tone_humor, 'divertido', 'serio')} (${project.tone_humor}/100)`,
    `- Disrupción: ${toneDescription(project.tone_disruption, 'disruptivo', 'conservador')} (${project.tone_disruption}/100)`,
  ].join('\n');
}

function buildStyleContext(style: ContentStyleWeights): string {
  return Object.entries(style)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => `- ${key}: ${value}/100`)
    .join('\n');
}

const FORMAT_LABELS: Record<keyof WeeklyFormatDistribution, string> = {
  story: 'Story (contenido efímero)',
  carrusel: 'Carrusel (varias slides)',
  publicacion: 'Publicación cualificada (imagen diseñada para feed)',
  reel: 'Reel (vídeo corto vertical)',
};

function getWeeklyDistribution(project: Project): WeeklyFormatDistribution {
  return project.weekly_format_distribution || { story: 1, carrusel: 2, publicacion: 1, reel: 1 };
}

function getWeeklyTotal(dist: WeeklyFormatDistribution): number {
  return dist.story + dist.carrusel + dist.publicacion + dist.reel;
}

function buildFormatDistributionContext(project: Project): string {
  const dist = getWeeklyDistribution(project);
  const total = getWeeklyTotal(dist);
  const lines: string[] = [];
  for (const [key, count] of Object.entries(dist)) {
    if (count > 0) lines.push(`- ${count}x ${FORMAT_LABELS[key as keyof WeeklyFormatDistribution]}`);
  }
  lines.push(`- Total: ${total} publicaciones/semana`);
  return lines.join('\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Lunes de la semana ISO que contiene `d` (Europa: lunes = inicio de semana). */
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

export type CalendarMonthWeekSegment = {
  weekNum: number;
  start: string;
  end: string;
  dates: string[];
  postsQuota: number;
};

export type MonthWeekSegmentsOptions = {
  /**
   * Fecha YYYY-MM-DD mínima: cualquier día estrictamente anterior se descarta del tramo
   * (útil para "empezar desde hoy" y no generar posts en el pasado).
   */
  minDate?: string;
  /**
   * Lista de fechas YYYY-MM-DD ya ocupadas por posts existentes: se excluyen del tramo
   * (útil para modo "append inteligente": evita colisiones).
   */
  excludeDates?: string[];
};

/**
 * Semanas naturales (lun–dom) que intersectan el mes, con cupo proporcional.
 * Evita pedir «5 posts» en una semana que solo tiene 1–2 días en el mes (apelotonamiento al final).
 *
 * Si se pasa `minDate`, se recortan los días anteriores y las cuotas se ajustan
 * proporcionalmente a los días útiles restantes de cada tramo.
 * Si se pasa `excludeDates`, esas fechas se eliminan del tramo y la cuota no puede
 * exceder el número de días libres.
 */
export function getMonthWeekSegmentsWithQuotas(
  monthIndex: number,
  year: number,
  weeklyTotal: number,
  opts?: MonthWeekSegmentsOptions
): CalendarMonthWeekSegment[] {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const segments: CalendarMonthWeekSegment[] = [];
  const excludeSet = new Set(opts?.excludeDates ?? []);
  const minDate = opts?.minDate ?? '';

  let weekMonday = startOfWeekMonday(first);
  let weekNum = 1;

  while (weekMonday <= last) {
    const weekSunday = addDays(weekMonday, 6);
    const segStart = weekMonday < first ? first : weekMonday;
    const segEnd = weekSunday > last ? last : weekSunday;

    if (segStart <= segEnd) {
      const allDates: string[] = [];
      for (let cur = new Date(segStart); cur <= segEnd; cur.setDate(cur.getDate() + 1)) {
        allDates.push(ymdFromDate(cur));
      }
      const totalDaysInSegment = allDates.length;

      const dates = allDates.filter(d => {
        if (minDate && d < minDate) return false;
        if (excludeSet.has(d)) return false;
        return true;
      });

      const usableDays = dates.length;
      let quota = 0;
      if (weeklyTotal > 0 && usableDays > 0) {
        quota = Math.round((weeklyTotal * usableDays) / 7);
        quota = Math.max(1, quota);
        quota = Math.min(quota, usableDays);
      }

      if (usableDays > 0) {
        segments.push({
          weekNum,
          start: dates[0],
          end: dates[dates.length - 1],
          dates,
          postsQuota: quota,
        });
      }
      // Si el tramo entero queda fuera por minDate/excludeDates, no lo añadimos
      // pero igualmente avanzamos weekNum para no romper la numeración visible.
      if (totalDaysInSegment > 0) weekNum++;
    }

    weekMonday = addDays(weekMonday, 7);
  }

  return segments;
}

/**
 * Índices de día únicos, repartidos en el tramo (evita dos posts el mismo día por redondeo).
 * Garantiza n ≤ d → exactamente n índices distintos.
 */
function assignUniqueSpreadDayIndices(n: number, d: number): number[] {
  if (n <= 0 || d <= 0) return [];
  if (n === 1) return [Math.floor((d - 1) / 2)];
  if (n >= d) return Array.from({ length: d }, (_, i) => i);

  const raw = Array.from({ length: n }, (_, i) =>
    Math.round((i * (d - 1)) / (n - 1))
  );
  const used = new Set<number>();
  const out: number[] = [];

  for (let r of raw) {
    r = Math.max(0, Math.min(d - 1, r));
    let x = r;
    let guard = 0;
    while (used.has(x) && guard < d + 2) {
      x = x < d - 1 ? x + 1 : x - 1;
      guard++;
    }
    if (!used.has(x)) {
      used.add(x);
      out.push(x);
      continue;
    }
    for (let j = 0; j < d; j++) {
      if (!used.has(j)) {
        used.add(j);
        out.push(j);
        break;
      }
    }
  }

  return out.slice(0, n);
}

/** Reasigna fechas dentro de cada semana: como máximo 1 publicación por día en ese tramo (sin apelotonar). */
export function redistributeCalendarPostsBySegments<
  T extends { scheduled_date: string; week_number?: number },
>(posts: T[], segments: CalendarMonthWeekSegment[]): void {
  const sorted = [...posts].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  let p = 0;
  for (const seg of segments) {
    const take = Math.min(seg.postsQuota, Math.max(0, sorted.length - p));
    const chunk = sorted.slice(p, p + take);
    p += take;
    const n = chunk.length;
    const { dates } = seg;
    if (n === 0 || dates.length === 0) continue;

    const indices = assignUniqueSpreadDayIndices(n, dates.length);
    for (let i = 0; i < n; i++) {
      const idx = indices[i] ?? 0;
      chunk[i].scheduled_date = dates[idx];
      chunk[i].week_number = seg.weekNum;
    }
  }
}

function buildProjectContext(project: Project, options?: { includeAiRules?: boolean }): string {
  const includeAiRules = options?.includeAiRules === true;
  return `
## DATOS DEL NEGOCIO
- Empresa: ${project.name}
- Web: ${project.url || 'No proporcionada'}
- Sector: ${project.sector || 'No especificado'}
- Ubicación: ${project.location || 'No especificada'}
- Descripción: ${project.description || 'No proporcionada'}
- Tipo de cliente: ${project.client_type || 'No definido'}

## OBJETIVOS
- Objetivo principal: ${project.primary_goal || 'No definido'}
- Objetivos secundarios: ${project.secondary_goals?.join(', ') || 'Ninguno'}

## CONFIGURACIÓN DE TONO
${buildToneContext(project)}

## PESO DE ESTILOS DE CONTENIDO
${buildStyleContext(project.content_style)}

## DISTRIBUCIÓN SEMANAL DE FORMATOS
${buildFormatDistributionContext(project)}

## OTRAS VARIABLES
- Nivel comercial: ${project.commercial_level}
- Complejidad del contenido: ${project.complexity}
- Presencia humana: ${project.human_presence}
- Nivel de experimentación: ${project.experimentation}
${includeAiRules && project.ai_rules?.trim() ? `\n## REGLAS IA DEL PROYECTO (obligatorias — el cliente las definió expresamente)\n${project.ai_rules.trim()}` : ''}
`.trim();
}

// ============================================================
// 1. PROMPT: Análisis de negocio
// ============================================================

export function buildBusinessAnalysisPrompt(
  project: Project,
  scrapedContent: string,
  options?: { serpContext?: string }
): { system: string; user: string } {
  const serpBlock =
    options?.serpContext?.trim() &&
    `${options.serpContext.trim()}

---

`;

  return {
    system: `Eres un estratega senior de marketing digital y comunicación especializado en convertir webs reales en fichas estratégicas útiles para redes sociales.

Tu tarea es sintetizar la evidencia disponible sobre un negocio sin inventar nada y sin rellenar huecos con suposiciones.

REGLAS:
- Usa como fuente principal el contenido scrapeado del sitio del cliente.
- Si existe contexto SERP, úsalo solo como apoyo para matizar visibilidad o encaje de mercado; no lo conviertas en hechos no confirmados sobre servicios, precios o propuesta de valor.
- Si un dato no se puede sostener con la evidencia, indícalo explícitamente con fórmulas como "No se puede determinar con la evidencia disponible".
- NO inventes servicios, públicos, claims, ventajas competitivas ni rasgos de marca que no aparezcan o no se deduzcan de forma prudente.
- "detailed_business_description" debe ser una ficha coherente en prosa de 4 a 8 frases, no una lista.
- "key_services" y "unique_selling_points" deben contener solo elementos razonablemente observables en la evidencia.
- "content_opportunities" debe salir de lo detectado en la web, no de consejos genéricos aplicables a cualquier negocio.
- "confidence_level" debe reflejar la calidad y amplitud de la evidencia: "alto", "medio" o "bajo".
- Responde SIEMPRE en español.
- Devuelve SOLO JSON válido, sin texto adicional.

FORMATO DE RESPUESTA JSON:
{
  "value_proposition": "Síntesis breve y fiel de la propuesta de valor detectada",
  "target_audience": "Descripción del público objetivo detectado o la frase 'No se puede determinar con la evidencia disponible'",
  "positioning": "Posicionamiento percibido o la frase 'No se puede determinar con la evidencia disponible'",
  "detailed_business_description": "Ficha descriptiva en prosa, basada en toda la evidencia disponible",
  "key_services": ["servicio1", "servicio2"],
  "unique_selling_points": ["diferencial1", "diferencial2"],
  "brand_personality": "Personalidad de marca percibida o la frase 'No se puede determinar con la evidencia disponible'",
  "content_opportunities": ["oportunidad1", "oportunidad2"],
  "confidence_level": "alto|medio|bajo"
}`,
    user: `Analiza el siguiente negocio para construir una ficha estratégica fiable para redes sociales.

${buildProjectContext(project)}

## PRIORIDAD DE FUENTES
1. Sitio web del cliente
2. Contexto SERP complementario, si existe

${serpBlock || ''}## CONTENIDO WEB SCRAPEADO DEL CLIENTE
${scrapedContent || 'No se ha podido obtener contenido útil del sitio web.'}

Devuelve un análisis fiel, accionable y prudente. Si falta evidencia, dilo de forma explícita en lugar de completarla con supuestos.`,
  };
}

// ============================================================
// 2. PROMPT: Análisis de competidores
// ============================================================

export function buildCompetitorAnalysisPrompt(
  project: Project,
  competitors: Competitor[],
  competitorContent: string
): { system: string; user: string } {
  return {
    system: `Eres un analista competitivo senior especializado en marketing digital y contenido para redes sociales.

Tu tarea es transformar evidencia parcial y desigual sobre competidores en un análisis útil para diferenciar la marca del cliente sin inventar datos.

REGLAS:
- Devuelve una entrada por cada competidor declarado cuando sea posible, usando su mismo nombre.
- Si NO hay competidores declarados manualmente pero hay resultados de búsqueda Google, identifica los negocios más relevantes del sector como competidores potenciales. Asegúrate de incluir "name" y "source": "discovered" para indicar que fueron descubiertos automáticamente.
- Si de un competidor apenas hay evidencia, mantén sus arrays vacíos y usa "No determinable con la evidencia disponible" en campos como tono o frecuencia.
- Cuando haya tanto competidores declarados como resultados de búsqueda, añade actores adicionales al array "competitors" si están claramente identificados en la evidencia.
- Las fortalezas y debilidades deben derivarse del contenido observado, no de estereotipos del sector.
- "detected_content_types" debe recoger formatos o enfoques realmente observables.
- "estimated_frequency" y "tone_detected" deben ser prudentes; si no hay base suficiente, dilo explícitamente.
- "market_opportunities", "differentiation_ideas" y "content_gaps" deben centrarse en huecos de comunicación, enfoque, claridad, autoridad, formato o propuesta, no en vaguedades.
- NO inventes competidores, datos de rendimiento ni hábitos de publicación no sustentados.
- Responde en español.
- Devuelve SOLO JSON válido, sin texto adicional.

FORMATO DE RESPUESTA JSON:
{
  "competitors": [
    {
      "name": "nombre del competidor",
      "detected_content_types": ["tipo1", "tipo2"],
      "strengths": ["fortaleza1"],
      "weaknesses": ["debilidad1"],
      "estimated_frequency": "frecuencia estimada o 'No determinable con la evidencia disponible'",
      "tone_detected": "tono detectado o 'No determinable con la evidencia disponible'"
    }
  ],
  "market_opportunities": ["oportunidad1", "oportunidad2"],
  "differentiation_ideas": ["idea1", "idea2"],
  "content_gaps": ["gap1", "gap2"],
  "recommendations": "Recomendaciones generales basadas en el análisis competitivo"
}`,
    user: `Analiza la competencia digital de este negocio y detecta oportunidades reales de diferenciación:

${buildProjectContext(project)}

## COMPETIDORES DEFINIDOS
${competitors.length > 0
  ? competitors.map(c => `- ${c.name}: ${c.url || c.social_url || 'Sin URL'} (Razón: ${c.reason || 'No especificada'})`).join('\n')
  : 'El usuario NO ha declarado competidores manualmente. Identifica los competidores más relevantes a partir de los resultados de búsqueda de Google incluidos abajo. Busca negocios del mismo sector y zona geográfica que ofrezcan servicios o productos similares.'}

## CONTENIDO SCRAPEADO DE COMPETIDORES
${competitorContent || 'No se ha podido obtener contenido de los competidores. Analiza basándote en la información disponible.'}

Objetivo:
- describir a cada competidor con prudencia,
- detectar huecos del mercado,
- y proponer diferenciación accionable para el cliente.
${competitors.length === 0 ? '\nIMPORTANTE: Como no hay competidores declarados, usa los resultados de búsqueda Google para identificar 3-5 competidores potenciales del sector. Indica claramente que fueron descubiertos automáticamente.' : ''}
Si la evidencia es débil, dilo con claridad en vez de completar huecos.`,
  };
}

// ============================================================
// 3. PROMPT: Generación de estrategia
// ============================================================

function buildBrandDnaForStrategy(project: Project): string {
  const parts: string[] = [];

  if (project.brand_summary?.trim()) {
    parts.push(`RESUMEN DE MARCA: ${project.brand_summary.trim()}`);
  }

  const detail = project.brand_identity_detail;
  if (detail) {
    if (detail.brand_feel_keywords?.length) {
      parts.push(`SENSACIÓN DE MARCA (keywords): ${detail.brand_feel_keywords.join(', ')}`);
    }
    if (detail.imagery_iconography?.trim()) {
      parts.push(`ESTILO VISUAL/FOTOGRÁFICO: ${detail.imagery_iconography.trim()}`);
    }
    if (detail.dos?.length) {
      parts.push(`HACER (identidad visual): ${detail.dos.join(' | ')}`);
    }
    if (detail.donts?.length) {
      parts.push(`NO HACER (identidad visual): ${detail.donts.join(' | ')}`);
    }
  }

  if (project.brand_colors?.length) {
    const heroColors = project.brand_colors
      .filter(c => ['primary', 'secondary', 'accent'].includes(c.usage))
      .map(c => `${c.name} (${c.hex}, ${c.usage})`);
    if (heroColors.length) {
      parts.push(`COLORES CLAVE: ${heroColors.join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

export function buildStrategyPrompt(
  project: Project,
  businessAnalysis: string,
  competitorAnalysis: string
): { system: string; user: string } {
  const brandDna = buildBrandDnaForStrategy(project);

  return {
    system: `Eres un director de estrategia de contenido para redes sociales de alto nivel. Combinas visión de marca, enfoque editorial, criterio comercial y sensibilidad estética.

Tu tarea es crear una estrategia ÚNICA Y DIFERENCIADA para este proyecto concreto. Si la estrategia podría servir para cualquier otra marca del mismo sector, has fracasado.

═══════════════════════════════════════════
REGLAS DE PRIORIDAD (orden descendente)
═══════════════════════════════════════════
1. REGLAS IA DEL PROYECTO — si el usuario las definió, son ley absoluta.
2. TONO DEL PROYECTO (sliders) — el usuario los ajustó manualmente; tus "tone_guidelines" DEBEN ser coherentes con ellos, no contradecirlos. Si el slider dice "muy informal (20/100)", tu guía de tono NO puede recomendar un estilo corporativo.
3. IDENTIDAD VISUAL / ADN DE MARCA — la estrategia debe sentirse como una extensión natural de la personalidad visual detectada. Los pilares y líneas temáticas deben encajar con las keywords de sensación de marca.
4. ANÁLISIS DEL NEGOCIO — los pilares deben explotar las fortalezas reales (key_services, unique_selling_points) y atacar las oportunidades de contenido identificadas.
5. ANÁLISIS COMPETITIVO — al menos 1 pilar debe abordar directamente un hueco o debilidad detectada en la competencia. Las "thematic_lines" deben evitar lo que la competencia ya hace bien y explotar lo que hace mal.

═══════════════════════════════════════════
REGLAS TÉCNICAS
═══════════════════════════════════════════
- Respeta ESTRICTAMENTE tono, estilo, complejidad, frecuencia y distribución de formatos configurados.
- Los pilares deben reflejar los pesos de estilo de contenido y explicar qué rol juega cada pilar.
- Devuelve entre 3 y 5 pilares de contenido.
- La suma de "percentage" en "content_pillars" debe ser exactamente 100.
- "content_types" y "example_topics" deben ser concretos, variados y útiles para generar calendario después. PROHIBIDO: temas genéricos aplicables a cualquier marca.
- "tone_guidelines" debe ser una EXTENSIÓN FIEL de los sliders de tono del usuario. Incluye qué hacer, qué evitar, cómo suena la marca, y referencia explícita al ADN visual (ej. "usar lenguaje tan directo como los colores primarios de la marca").
- "thematic_lines" debe aportar líneas de trabajo sostenibles y diferenciadas. Cada línea debe justificarse por una fortaleza del negocio o un gap de la competencia.
- "recommendations" debe recoger prioridades, riesgos, experimentos razonables y enfoque de ejecución. Incluye al menos 1 recomendación sobre cómo explotar una debilidad concreta de un competidor.
- No incluyas campos fuera del esquema.
- Responde en español.
- Devuelve SOLO JSON válido, sin texto adicional.

FORMATO DE RESPUESTA JSON:
{
  "content_pillars": [
    {
      "name": "Nombre del pilar",
      "description": "Descripción del pilar (incluye POR QUÉ existe: qué fortaleza explota o qué gap cubre)",
      "percentage": 30,
      "content_types": ["tipo1", "tipo2"],
      "example_topics": ["tema1", "tema2", "tema3"]
    }
  ],
  "tone_guidelines": "Guías detalladas de tono y voz COHERENTES con los sliders del usuario y el ADN de marca",
  "thematic_lines": [
    {
      "theme": "Línea temática",
      "description": "Descripción (incluye qué oportunidad o gap del mercado justifica esta línea)",
      "frequency": "semanal|quincenal|mensual",
      "example_topics": ["tema1", "tema2"]
    }
  ],
  "recommendations": "Recomendaciones con acciones concretas vinculadas a debilidades de la competencia y fortalezas del negocio"
}`,
    user: `Crea una estrategia de contenido para redes sociales:

${buildProjectContext(project, { includeAiRules: true })}
${brandDna ? `\n## ADN VISUAL / IDENTIDAD DE MARCA\n${brandDna}\n` : ''}
## ANÁLISIS DEL NEGOCIO
${businessAnalysis}

## ANÁLISIS COMPETITIVO
${competitorAnalysis}

INSTRUCCIONES FINALES:
- Cada pilar de contenido debe justificarse por una fortaleza del negocio, una oportunidad de contenido detectada, o un gap/debilidad de la competencia. Si no puedes justificarlo, no lo incluyas.
- Las "tone_guidelines" DEBEN ser coherentes con los sliders de tono que el usuario configuró arriba. NO los contradigas.
- Al menos 1 pilar debe atacar directamente algo que la competencia hace mal o no cubre.
- Los "example_topics" deben ser tan específicos que solo sirvan para ESTA marca, no para otra del mismo sector.`,
  };
}

// ============================================================
// 4. PROMPT: Generación de calendario
// ============================================================

export type BuildCalendarPromptOptions = {
  /** Resumen de posts ya generados en meses anteriores del mismo periodo multi-mes (anti-duplicados). */
  priorMonthsDigest?: string;
  /** Fecha YYYY-MM-DD mínima permitida (útil para "generar desde hoy"). */
  minDate?: string;
  /** Fechas YYYY-MM-DD ya ocupadas por posts existentes (append inteligente). */
  excludeDates?: string[];
};

export function buildCalendarPrompt(
  project: Project,
  strategy: string,
  monthIndex: number,
  year: number,
  opts?: BuildCalendarPromptOptions
): { system: string; user: string; segments: CalendarMonthWeekSegment[] } {
  const dist = getWeeklyDistribution(project);
  const weeklyTotal = getWeeklyTotal(dist);
  const segments = getMonthWeekSegmentsWithQuotas(monthIndex, year, weeklyTotal, {
    minDate: opts?.minDate,
    excludeDates: opts?.excludeDates,
  });
  const totalPosts = segments.reduce((s, g) => s + g.postsQuota, 0);
  const month = getMonthName(monthIndex);

  const formatLines: string[] = [];
  if (dist.story > 0) formatLines.push(`- ${dist.story} Story`);
  if (dist.carrusel > 0) formatLines.push(`- ${dist.carrusel} Carrusel`);
  if (dist.publicacion > 0) formatLines.push(`- ${dist.publicacion} Publicación cualificada (imagen diseñada para feed)`);
  if (dist.reel > 0) formatLines.push(`- ${dist.reel} Reel`);

  const formatSummary = formatLines.map(l => l.slice(2)).join(', ');
  const weekSchedule = segments
    .map(w => {
      const short =
        w.dates.length <= 3
          ? ` Tramo partido (${w.dates.length} día(s) de esa semana caen en este mes): ${w.postsQuota} publicación(es) como máximo, cada una en un día distinto de la lista; no apiles varias el mismo día.`
          : '';
      return `Semana ${w.weekNum} (${w.start} → ${w.end}): EXACTAMENTE ${w.postsQuota} posts en este tramo. Fechas permitidas: ${w.dates.join(', ')}.${short} En semanas completas (7 días en el mes) la mezcla de formatos debe ser: ${formatSummary}. En tramos más cortos, respeta proporciones aproximadas de esa mezcla.`;
    })
    .join('\n');

  return {
    system: `Eres un editor senior y copywriter de redes sociales especializado en convertir una estrategia aprobada en un calendario mensual publicable y coherente.

Tu tarea es generar un calendario mensual completo, con ideas y copies de alta calidad, respetando todas las restricciones operativas indicadas.

REFERENCIA DE FORMATOS POR SEMANA COMPLETA (7 días dentro del mes):
${formatLines.join('\n')}
Total referencia en una semana completa: ${weeklyTotal} publicaciones

SEMANAS DEL MES (obedece el número EXACTO de posts por semana indicado; no lo aumentes):
${weekSchedule}

Total del mes: ${totalPosts} posts (suma de los tramos anteriores)

REGLAS CRÍTICAS:
- Cada tramo semanal tiene un cupo FIJO de posts; no añadas posts extra al final del mes
- Una sola publicación por día y por red social en el calendario: nunca dos piezas el mismo día.
- Cada "scheduled_date" debe ser una de las fechas listadas para el tramo de esa semana.
- El campo "format" SOLO puede ser: "story", "carrusel", "publicacion" o "reel"
- El campo "content_type" SOLO puede ser: "educativo", "inspiracional", "comercial", "entretenimiento", "personal" o "corporativo"
- Cada post debe tener un copy COMPLETO y listo para publicar (no solo ideas)
- Respeta los pilares de contenido y sus porcentajes
- El tono de cada copy debe coincidir con la configuración
- Incluye CTAs relevantes
- Los hashtags deben ser reales y relevantes para el sector
- Mantén variedad temática: evita repetir el mismo ángulo, la misma promesa o el mismo CTA varias veces
${opts?.priorMonthsDigest?.trim() ? '- Si hay sección "CONTINUIDAD CON EL PERIODO YA GENERADO", trátala como memoria obligatoria: nuevos ángulos y CTAs, sin reescribir ni parafrasear de forma estrecha lo ya cubierto' : ''}
${opts?.minDate ? `- PROHIBIDO programar posts anteriores a ${opts.minDate}. Usa SOLO fechas listadas en "Fechas permitidas" de cada semana.` : ''}
${opts?.excludeDates?.length ? `- PROHIBIDO usar estas fechas (ya hay un post programado ese día): ${opts.excludeDates.join(', ')}. Si por error apareciera alguna, descarta ese post.` : ''}
- Cada idea debe sentirse publicable para Instagram sin depender de contexto externo no proporcionado
- "platforms" debe incluir "instagram"
- Las fechas deben ser del mes de ${month} ${year}
- Reparte los posts del tramo en días distintos (prioriza lun–vie cuando haya cupo)
- Las Stories suelen ir en días de alta actividad (martes-jueves)
- Los Reels en días de máximo alcance (miércoles, viernes)
- Responde en español.
- Devuelve SOLO JSON válido, sin texto adicional.

ESPECIFICACIONES DE PRODUCCIÓN (campo "production_specs"):
Cada post DEBE incluir un campo "production_specs" con detalles técnicos de producción según el formato:

- CARRUSEL: { "num_slides": N, "media_type": "imagen", "scene_summary": "Slide 1: ..., Slide 2: ..., Slide N: ..." }
  - num_slides entre 3 y 10 (decide el número según la complejidad del tema)
  - scene_summary: describe brevemente QUÉ va en cada slide (1 línea por slide)

- REEL: { "duration_seconds": N, "media_type": "video", "scene_summary": "Escena 1 (0:00-0:08): ..., Escena 2 (0:08-0:20): ..." }
  - duration_seconds entre 15 y 60
  - scene_summary: guión breve con escenas y timing

- STORY: { "media_type": "imagen" | "video", "duration_seconds": N (solo si video, 8-15), "scene_summary": "..." }
  - Decide si la story es imagen o vídeo corto según el contenido
  - scene_summary: qué se ve en la imagen o qué pasa en el vídeo

- PUBLICACIÓN: { "media_type": "imagen", "scene_summary": "..." }
  - scene_summary: qué muestra la imagen del feed

FORMATO DE RESPUESTA JSON:
{
  "month": "${month} ${year}",
  "total_posts": ${totalPosts},
  "posts": [
    {
      "scheduled_date": "YYYY-MM-DD",
      "content_type": "educativo|inspiracional|comercial|entretenimiento|personal|corporativo",
      "format": "story|carrusel|publicacion|reel",
      "idea": "Idea principal del post en una línea",
      "copy": "Copy COMPLETO del post, listo para publicar. Incluye emojis si procede. Mínimo 3 líneas.",
      "cta": "Llamada a la acción específica",
      "post_goal": "Objetivo específico de este post",
      "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
      "platforms": ["instagram"],
      "production_specs": {
        "num_slides": 5,
        "duration_seconds": null,
        "media_type": "imagen",
        "scene_summary": "Slide 1: Gancho — pregunta impactante sobre fondo de marca. Slide 2: Dato clave. ..."
      }
    }
  ]
}`,
    user: `Genera el calendario de contenido para ${month} ${year}:

${buildProjectContext(project, { includeAiRules: true })}

## ESTRATEGIA APROBADA
${strategy}${opts?.priorMonthsDigest?.trim() ? `

## CONTINUIDAD CON EL PERIODO YA GENERADO
Este mes forma parte de un calendario multi-mes. Ya hay publicaciones planificadas en meses anteriores **del mismo rango** (misma generación / mismo proyecto).

Tu trabajo para **${month} ${year}**:
- Mantén coherencia de voz y estrategia con lo anterior, pero **sin repetir** el mismo tema, gancho, estructura narrativa, promesa central ni CTA equivalente.
- Explora **otras** líneas de los pilares y de las líneas temáticas; busca huecos editoriales que aún no se hayan tocado.

Resumen compacto de lo ya cubierto (referencia anti-duplicados; **no** copies estos textos literalmente):
${opts.priorMonthsDigest.trim()}` : ''}

Genera EXACTAMENTE ${totalPosts} posts repartidos en las semanas indicadas (no más, no menos).
Copies completos y listos para publicar. Cada copy debe ser único, relevante y coherente con la estrategia.`,
    segments,
  };
}

// ============================================================
// 5. PROMPT: Reconocimiento de marca (brand recognition)
// ============================================================

export function buildBrandRecognitionPrompt(
  projectName: string,
  url: string,
  htmlContent: string,
  hexLiteralsFromCode: string[] = []
): { system: string; user: string } {
  const hexBlock =
    hexLiteralsFromCode.length > 0
      ? `

LISTA DE COLORES HEX ENCONTRADOS LITERALMENTE EN EL CÓDIGO (debes usar estos valores exactos en brand_colors cuando correspondan por contexto; no inventes hex):
${hexLiteralsFromCode.slice(0, 100).join(', ')}`
      : '';

  return {
    system: `Eres un especialista en identidad visual, sistemas de marca y auditoría UI. Tu trabajo es extraer una identidad de marca útil para redes sociales a partir de evidencia técnica parcial.

Tu tarea es analizar HTML, CSS y metadatos de una web para reconstruir la identidad visual de la marca con la máxima precisión posible y el mínimo nivel de invención.

DEBES EXTRAER:
1. COLORES: extrae TODOS los colores significativos de la marca (mínimo 4-6, idealmente 6-10 si hay evidencia). Incluye: primario, secundario, acento, fondos, textos, gradientes, bordes y cualquier color recurrente. Clasifica cada uno con "usage": "primary", "secondary", "accent", "background", "text", "border", "gradient", "neutral", etc. Usa "notes" para explicar dónde aparece cada color y "found_in" para citar la evidencia CSS concreta. Busca colores en variables CSS (--color-xxx), clases, estilos inline, backgrounds, gradientes y SVGs.
2. TIPOGRAFÍAS: familias reales con uso editorial o funcional. Indica jerarquía, pesos, fallbacks y notas cuando haya evidencia.
3. LOGO y FAVICON: URL absoluta o relativa si hay evidencia; null si no la hay.
4. "brand_summary": resumen ejecutivo de 4 a 8 frases sobre personalidad visual, nivel de sofisticación, tono percibido y adecuación para RRSS.
5. "brand_identity_detail": análisis profundo y práctico para adaptar la identidad a Instagram y formatos sociales.

REGLAS ESTRICTAS:
- Basa el análisis SOLO en el HTML/CSS/metadatos proporcionados.
- Prioriza precisión sobre exhaustividad. Si un elemento no está claro, dilo explícitamente dentro del análisis en lugar de inventarlo.
- Cada "brand_colors[].hex" debe ser un #RRGGBB válido.
- PROHIBIDO en "brand_fonts[].name": tokens genéricos como font-heading, font-medium, font-sans, var(--...), etc.
- Logo/favicon: null si no hay evidencia suficiente.
- En los textos largos, cita patrones reales del código cuando sea posible.
- Responde en español.
- Devuelve SOLO JSON válido, sin texto adicional.
${hexBlock}

FORMATO JSON (obligatorio incluir brand_identity_detail completo):
{
  "brand_colors": [
    { "hex": "#0074C5", "name": "Azul corporativo", "usage": "primary", "notes": "Botones principales y barra superior", "found_in": "--color-primary en :root" },
    { "hex": "#2E3A59", "name": "Azul oscuro", "usage": "secondary", "notes": "Títulos y navegación", "found_in": "--color-secondary" },
    { "hex": "#F5A623", "name": "Naranja acento", "usage": "accent", "notes": "CTAs y enlaces destacados", "found_in": "--color-accent" },
    { "hex": "#F8F9FA", "name": "Gris claro fondo", "usage": "background", "notes": "Fondo de secciones alternas", "found_in": "body background, .section-alt" },
    { "hex": "#1A1A2E", "name": "Negro textos", "usage": "text", "notes": "Color base de párrafos y encabezados", "found_in": "body color" },
    { "hex": "#E8E8E8", "name": "Gris bordes", "usage": "border", "notes": "Separadores y bordes de tarjetas", "found_in": "border-color en .card" },
    { "hex": "#FFFFFF", "name": "Blanco", "usage": "neutral", "notes": "Fondo principal y tarjetas" }
  ],
  "brand_fonts": [
    { "name": "Montserrat", "usage": "Títulos y encabezados", "weights": "600, 700", "fallbacks": "system-ui, sans-serif", "notes": "H1 del hero y títulos de sección" }
  ],
  "brand_logo_url": "https://...",
  "brand_favicon_url": "https://...",
  "brand_summary": "Texto ejecutivo denso de varias frases.",
  "brand_identity_detail": {
    "palette_analysis": "Párrafos largos: armonía cromática, contraste entre primario/acento/neutros, sensación transmitida, uso en jerarquía visual y posibles riesgos al aplicar en RRSS.",
    "typography_analysis": "Párrafos largos: personalidad de las fuentes, legibilidad, pairing, escalado tipográfico inferido, recomendaciones para stories vs feed.",
    "layout_components": "Párrafos largos: estructura (grid/flex), espaciados, bordes/redondeos, sombras, patrones de botones y tarjetas observados.",
    "imagery_iconography": "Párrafos largos: estilo fotográfico o ilustración, iconos, proporciones, tratamiento de imágenes hero.",
    "brand_feel_keywords": ["moderno", "confianza", "..."],
    "accessibility_notes": "Contraste aproximado, tamaños de texto, foco visible, mezcla texto sobre imágenes.",
    "rrss_practical_tips": ["Tip 1 concreto para Instagram", "Tip 2 para mantener marca en reels", "..."],
    "dos": ["Mantener X", "Usar Y en CTAs", "..."],
    "donts": ["Evitar Z", "No mezclar...", "..."],
    "css_tokens_cited": [{ "token": "--brand-orange", "role": "Acento en enlaces" }]
  }
}`,
    user: `Analiza la identidad visual de la web de "${projectName}" (${url}):

## HTML Y CSS DE LA WEB
${htmlContent.substring(0, 36000)}

Extrae identidad visual con el MÁXIMO detalle posible según el esquema JSON del system prompt.`,
  };
}

// ============================================================
// 6. PROMPT: Briefs visuales / prompts creativos
// ============================================================

export interface VisualBriefInput {
  id: string;
  scheduled_date: string;
  format: string | null;
  content_type: string;
  idea: string;
  copy: string | null;
  cta: string | null;
  post_goal: string | null;
  production_specs?: {
    num_slides?: number;
    duration_seconds?: number;
    media_type?: string;
    scene_summary?: string;
  } | null;
}

function buildBrandContext(project: Project): string {
  const lines: string[] = [];

  if (project.brand_colors?.length) {
    lines.push('COLORES DE MARCA:');
    for (const c of project.brand_colors) {
      lines.push(`- ${c.hex} (${c.name}) — ${c.usage}${c.notes ? `: ${c.notes}` : ''}`);
    }
  }

  if (project.brand_fonts?.length) {
    lines.push('\nTIPOGRAFÍAS:');
    for (const f of project.brand_fonts) {
      lines.push(`- ${f.name} — ${f.usage}${f.weights ? ` [${f.weights}]` : ''}`);
    }
  }

  if (project.brand_summary) {
    lines.push(`\nRESUMEN DE MARCA:\n${project.brand_summary}`);
  }

  if (project.brand_identity_detail) {
    const d = project.brand_identity_detail;
    if (d.imagery_iconography) lines.push(`\nESTILO VISUAL/FOTOGRÁFICO:\n${d.imagery_iconography}`);
    if (d.rrss_practical_tips?.length) lines.push(`\nTIPS RRSS:\n${d.rrss_practical_tips.join('\n')}`);
    if (d.dos?.length) lines.push(`\nHACER:\n${d.dos.join('\n')}`);
    if (d.donts?.length) lines.push(`\nNO HACER:\n${d.donts.join('\n')}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No hay identidad de marca disponible.';
}

export function buildVisualBriefsPrompt(
  project: Project,
  posts: VisualBriefInput[]
): { system: string; user: string } {
  const postsBlock = posts
    .map((p, i) => {
      const specs = p.production_specs;
      const specsLines: string[] = [];
      if (specs) {
        if (specs.num_slides) specsLines.push(`- Nº de slides: ${specs.num_slides}`);
        if (specs.duration_seconds) specsLines.push(`- Duración: ${specs.duration_seconds} segundos`);
        if (specs.media_type) specsLines.push(`- Tipo de medio: ${specs.media_type}`);
        if (specs.scene_summary) specsLines.push(`- Guión previo del calendario:\n  ${specs.scene_summary}`);
      }
      const specsBlock = specsLines.length > 0
        ? `\n**ESPECIFICACIONES DE PRODUCCIÓN (OBLIGATORIAS — respeta estos datos):**\n${specsLines.join('\n')}`
        : '';
      return `### Post ${i + 1} (id: ${p.id})
- Fecha: ${p.scheduled_date}
- Formato: ${p.format || 'No especificado'}
- Tipo de contenido: ${p.content_type}
- Idea: ${p.idea}
- Copy: ${(p.copy || '').slice(0, 500)}
- CTA: ${p.cta || 'N/A'}
- Objetivo: ${p.post_goal || 'N/A'}${specsBlock}`;
    })
    .join('\n\n');

  return {
    system: `Eres un director creativo senior, director de arte y especialista en producción audiovisual para redes sociales. Tu trabajo es convertir ideas de contenido en instrucciones de producción CONCRETAS y EJECUTABLES.

PRINCIPIO FUNDAMENTAL: Cada brief debe describir EXACTAMENTE qué se ve en cada imagen o escena. NO describas "el concepto" ni "la estética" en abstracto. Describe OBJETOS, PERSONAS, ACCIONES, COMPOSICIÓN y TEXTO LITERAL que aparece en pantalla.

═══════════════════════════════════════════
ENTREGABLE POR CADA PUBLICACIÓN
═══════════════════════════════════════════

"visual_prompt" — PROMPT ULTRA-DETALLADO para IA generativa (Midjourney / DALL-E / Ideogram / Sora).
Debe ser copiable directamente. Si el formato requiere múltiples imágenes, genera UN prompt por cada imagen/slide.
Concentra TODA tu capacidad creativa y descriptiva en este único campo.

═══════════════════════════════════════════
REGLAS ESTRICTAS POR FORMATO
═══════════════════════════════════════════

### CARRUSEL (3-10 slides)
El brief DEBE detallar CADA slide individualmente:
- "SLIDE 1 (GANCHO): [descripción exacta de lo que se ve: objetos, personas, fondo, composición]. Texto overlay: '[texto literal]'. Tipografía: [familia, peso, tamaño relativo]. Color de fondo: [hex]. Disposición: [dónde va cada elemento]."
- "SLIDE 2: [ídem, descripción específica]"
- ...hasta el último slide
- "SLIDE FINAL (CTA): [descripción visual]. Texto: '[CTA literal]'. Botón/enlace visual: [estilo]."
El visual_prompt DEBE contener un prompt SEPARADO para cada slide, etiquetado "Slide 1:", "Slide 2:", etc.
PROHIBIDO: "Carrusel con 3 slides sobre consejos" — eso NO es un brief. Describe QUÉ HAY en cada slide.

### REEL (15-60 segundos)
El brief DEBE incluir un guión técnico:
- "Duración total: X segundos"
- "ESCENA 1 (0:00-0:05): [qué se ve, qué hace la persona/objeto, encuadre (plano general/medio/detalle), movimiento de cámara (estático/travelling/zoom)]. Audio: [música/voz en off/sonido ambiente]. Texto en pantalla: '[texto literal]'."
- "ESCENA 2 (0:05-0:12): [ídem]"
- "TRANSICIÓN entre escenas: [corte seco / disolvencia / deslizamiento]"
- "Música sugerida: [género, tempo, mood, ejemplo de referencia si es posible]"
- "Necesita: [persona real / animación / footage de stock / mixto]"
El visual_prompt debe describir el FOTOGRAMA MÁS REPRESENTATIVO del reel.

### STORY (imagen)
- Composición vertical 9:16
- Brief: describir la escena completa: qué elementos hay, dónde están colocados, qué ocupa el primer plano vs fondo, overlay de texto (texto literal, posición, estilo), colores exactos.
El visual_prompt: un prompt completo para generar esa imagen.

### STORY (vídeo corto, 8-15 seg)
- Igual que reel pero en formato condensado de 2-3 escenas máximo.
- Brief con guión escena a escena con timing.

### PUBLICACIÓN (imagen feed, 1:1 o 4:5)
- Brief: composición exacta. Qué se ve en primer plano, qué hay en el fondo. Si hay texto: texto literal, tipografía, posición. Si hay personas: qué hacen, cómo están. Si es diseño gráfico: layout, elementos, iconos.
El visual_prompt: un prompt completo para esa imagen.

═══════════════════════════════════════════
REGLAS DE CALIDAD
═══════════════════════════════════════════

OBLIGATORIO en TODO brief:
- Describir OBJETOS CONCRETOS (no "un paisaje bonito" sino "playa de arena dorada con olas rompiendo, una camper VW blanca aparcada junto a dunas, toalla roja en primer plano")
- Si hay personas: describir qué hacen (no "una persona disfrutando" sino "mujer de ~30 años sentada en la puerta trasera de la camper, piernas colgando, sosteniendo una taza de café, mirando al mar")
- Si hay texto overlay: incluir el TEXTO LITERAL, la POSICIÓN en la imagen (arriba, centro, tercio inferior), la TIPOGRAFÍA y el COLOR
- Respetar la identidad de marca: colores, fuentes, estilo visual
- Cada brief debe ser DIFERENTE al anterior — variar escenas, encuadres, momentos del día, localizaciones, composiciones

PROHIBIDO:
- Descripciones vagas tipo "imagen evocadora" o "visual atractivo"
- Decir "usar colores de marca" sin especificar CUÁLES y DÓNDE
- Briefs genéricos que podrían servir para cualquier marca
- Prompts de IA genéricos tipo "foto de alta calidad de una autocaravana"
- Repetir el mismo estilo visual en posts consecutivos

REGLAS PARA EL VISUAL_PROMPT (IA generativa):
- Debe ser extremadamente rico, detallado y estructurado en las siguientes secciones:
  1. "Escena:": Descripción general de la situación, entorno y contexto principal.
  2. "Composición:": Tipo de plano, encuadre, ángulo de cámara, disposición de elementos para crear profundidad, e incluir el aspect ratio al final (--ar 9:16 para story/reel, --ar 1:1 o --ar 4:5 para publicación).
  3. "Sujetos:": Descripción física minuciosa de protagonistas u objetos principales (texturas, colores específicos, ropas, acciones, gestos, detalles táctiles).
  4. "Luz y Atmósfera:": Tipo de iluminación (ej. luz natural del día, luz cálida de invernadero, golden hour, contraluz), cómo incide en los sujetos, las sombras y la sensación o mood que transmite.
  5. "Fondo:": Qué hay detrás, nivel de nitidez (ej. desenfoque suave, bokeh orgánico), colores predominantes y su relación con el primer plano.
  6. "Estilo:": Estética visual (ej. Fotografía de stock con estética editorial, ilustración flat vector), texturas (ej. grano de película, barro, madera), características de lente simuladas (ej. apertura amplia, profundidad de campo reducida).
- Para carruseles: un prompt estructurado completo POR CADA slide, etiquetado ("Slide 1:", "Slide 2:", etc.).
- Para reels/video: describir el fotograma clave (key frame) más representativo usando esta misma estructura detallada.
- NO incluir texto literal en el prompt de IA (el texto se añade en postproducción).

Responde en español.
Devuelve SOLO JSON válido.

FORMATO DE RESPUESTA:
{
  "briefs": [
    {
      "content_item_id": "uuid-del-post",
      "visual_prompt": "Prompt(s) ultra-detallado(s) para IA generativa..."
    }
  ]
}`,
    user: `Genera los prompts visuales para las siguientes publicaciones.

## IDENTIDAD DE MARCA
${buildBrandContext(project)}

## CONTEXTO DEL NEGOCIO
${buildProjectContext(project, { includeAiRules: true })}

## PUBLICACIONES (${posts.length} en total)
${postsBlock}

INSTRUCCIONES FINALES:
- Genera un visual_prompt ultra-detallado para CADA una de las ${posts.length} publicaciones. NO generes visual_brief.
- RESPETA las ESPECIFICACIONES DE PRODUCCIÓN de cada post: si dice 5 slides, el prompt tiene exactamente 5 slides. Si dice 30 segundos, describe la escena clave de 30 segundos. Si dice media_type "video", describe el fotograma clave.
- RECUERDA: para CARRUSELES, detalla CADA SLIDE por separado con las 6 secciones (Escena, Composición, Sujetos, Luz y Atmósfera, Fondo, Estilo). El visual_prompt DEBE tener un prompt separado por cada slide.
- RECUERDA: para REELS/VÍDEOS, describe el fotograma clave más representativo con las 6 secciones.
- RECUERDA: los visual_prompt deben ser MUY LARGOS y DETALLADOS (mínimo 150 palabras por imagen), con estilo, sujeto, composición, iluminación, texturas y aspect ratio.
- Cada prompt debe ser ÚNICO y no repetir escenas ni composiciones del anterior.
- Usa los colores de marca CONCRETOS (con hex) y las fuentes reales de la marca.`,
  };
}

export { buildProjectContext, buildToneContext, buildStyleContext };

// ============================================================
// 7. PROMPT: Visual individual (1 llamada IA = 1 imagen)
// ============================================================

export interface SingleVisualInput {
  post: VisualBriefInput;
  visualIndex: number;
  totalVisuals: number;
  label: string;
  slideContext?: string;
}

const ASPECT_RATIOS: Record<string, string> = {
  story: '9:16',
  reel: '9:16',
  publicacion: '4:5',
  carrusel: '4:5',
};

export type VisualAgentKey = 'visual_briefs_story' | 'visual_briefs_video' | 'visual_briefs_carousel' | 'visual_briefs_feed';

function resolveVisualAgent(format: string | null, mediaType?: string): VisualAgentKey {
  const f = format || 'publicacion';
  if (f === 'story') return mediaType === 'video' ? 'visual_briefs_video' : 'visual_briefs_story';
  if (f === 'reel') return 'visual_briefs_video';
  if (f === 'carrusel') return 'visual_briefs_carousel';
  return 'visual_briefs_feed';
}

const JSON_FOOTER = `Responde en español.
Devuelve SOLO JSON válido con exactamente este campo:
{
  "visual_prompt": "..."
}`;

function buildStorySystem(ar: string): string {
  return `Eres un director creativo de renombre internacional especializado en Stories para Instagram, TikTok y redes sociales. Tu experiencia abarca diseño de contenido efímero vertical, narrativa de micro-impacto y comunicación visual instantánea para marcas premium.

Tu ÚNICA tarea ahora es describir UNA SOLA IMAGEN de Story con la precisión de un director creativo que diseña contenido fullscreen 9:16 pensado para captar la atención en los primeros 2 segundos.

CONCENTRA TODA TU CAPACIDAD EN UN ÚNICO ENTREGABLE:

═══════════════════════════════════════════
"visual_prompt" — PROMPT ULTRA-DETALLADO PARA IA GENERATIVA DE STORIES
═══════════════════════════════════════════

Este prompt será copiado DIRECTAMENTE en Midjourney, DALL-E o Ideogram. Debe ser autosuficiente y generar una imagen perfecta para Story.

CONTEXTO CLAVE DE STORIES:
- Formato VERTICAL fullscreen 9:16 — la imagen ocupa TODA la pantalla del móvil
- El usuario la ve máximo 5 segundos — el impacto visual debe ser INMEDIATO
- Suele llevar texto overlay, stickers o CTAs en postproducción — deja ESPACIO VISUAL para ello (zona superior y/o inferior más limpia)
- Debe sentirse nativa de Instagram/TikTok, no como una foto de catálogo

ESTRUCTURA OBLIGATORIA (usa exactamente estas secciones como encabezados):

**Escena:** Descripción inmersiva pensada para formato Story vertical. Mínimo 4 frases. Incluye el contexto, la hora del día, el lugar concreto y la sensación inmediata que transmite. La escena debe tener un PUNTO FOCAL claro y centrado que capte la atención instantáneamente. Debe sentirse como contenido nativo de Stories: cercano, dinámico, actual.

**Composición:** Relación de aspecto ${ar} (vertical fullscreen). Tipo de plano óptimo para Story (primer plano, selfie-style, cenital flat lay, plano medio cercano, POV en primera persona, etc.). Disposición vertical de los elementos: qué hay arriba, en el centro y abajo del encuadre. IMPORTANTE: reservar zona limpia (superior o inferior, ~20% del encuadre) para texto overlay en postproducción. Cómo se aprovecha la verticalidad para crear impacto. Mínimo 4 frases. --ar ${ar}

**Sujetos:** Descripción física MINUCIOSA del protagonista/objeto principal. Texturas específicas, colores precisos. Si hay personas: cercanía al espectador (como un selfie o una vista en primera persona), expresión natural y espontánea, ropa casual/real. Si hay objetos: cómo se presentan para máximo impacto vertical (de arriba abajo, sostenidos en mano, flat lay). Todo debe sentirse AUTÉNTICO y cercano, no posado artificialmente. Mínimo 4 frases.

**Luz y Atmósfera:** Iluminación típica de contenido Stories (luz natural de móvil, ring light, luz de ventana, golden hour con flare de smartphone). Temperatura de color. Mood: debe transmitir inmediatez, autenticidad y cercanía. Contraste optimizado para pantalla de móvil (colores vibrantes, contraste alto). Mínimo 4 frases.

**Fondo:** Qué hay detrás del sujeto, pensado para formato vertical. Fondos simples y limpios que no compitan con el sujeto ni con el texto overlay futuro. Nivel de desenfoque. Colores que contrasten con el sujeto y con los posibles textos. Mínimo 3 frases.

**Estilo:** Estética de Stories nativa (no editorial de revista). Aspecto de contenido real y aspiracional a la vez: como lo haría una marca premium en su cuenta de Instagram, no como una sesión de estudio. Puede ser estilo flat lay, behind-the-scenes, lifestyle cercano, producto en contexto real. Texturas de imagen (aspecto digital limpio de smartphone premium o look editorial mobile-first). Tratamiento de color vibrante optimizado para pantalla OLED. Mínimo 3 frases.

REGLAS ESTRICTAS:
- NO incluir texto literal en la descripción (el texto se añade en postproducción)
- El prompt COMPLETO debe tener AL MENOS 250 palabras
- CADA sección debe tener al menos 3-4 frases completas
- Pensar SIEMPRE en vertical fullscreen 9:16 — cada elemento debe funcionar en este formato
- Dejar ESPACIO VISUAL para texto overlay (zona superior o inferior del encuadre más limpia)
- Ser HIPER-ESPECÍFICO con texturas, colores y composición
- Incluir --ar ${ar} al final de la sección Composición

${JSON_FOOTER}`;
}

function buildVideoSystem(ar: string): string {
  return `Eres un director de cine y director de fotografía de renombre internacional, especializado en producción audiovisual para marcas premium en redes sociales (Reels, TikTok, Stories en vídeo). Tu ÚNICA tarea ahora es describir UN FOTOGRAMA CLAVE (key frame) de UNA ESCENA CONCRETA de un vídeo, con la precisión de un director que prepara un storyboard profesional para producción real.

IMPORTANTE: Estás describiendo un FOTOGRAMA de VÍDEO, NO una fotografía estática. El fotograma debe transmitir movimiento, narrativa y ritmo cinematográfico. Debe quedar claro que es un instante congelado de una secuencia en movimiento.

CONCENTRA TODA TU CAPACIDAD EN UN ÚNICO ENTREGABLE:

═══════════════════════════════════════════
"visual_prompt" — PROMPT ULTRA-DETALLADO PARA IA GENERATIVA DE VÍDEO
═══════════════════════════════════════════

Este prompt será usado en Sora, Runway, Kling, Pika o herramientas de IA generativa de vídeo. Debe ser autosuficiente y tan preciso que el fotograma generado sea EXACTAMENTE lo que describes.

ESTRUCTURA OBLIGATORIA (usa exactamente estas secciones como encabezados):

**Escena:** Descripción cinematográfica inmersiva de lo que OCURRE en este momento del vídeo. Mínimo 4 frases. Incluye: qué acción está sucediendo, el entorno concreto, la hora del día, la energía y ritmo de la escena. NO describas una foto estática; describe un MOMENTO VIVO capturado en plena acción. Ejemplo: "Fotograma de vídeo promocional de marca. Una mano experta con guantes de jardinería negros está colocando con delicadeza un cactus Trichocereus en una maceta de cerámica artesanal. El gesto es fluido y seguro, capturado en el instante en que el cepellón toca el sustrato oscuro. Partículas de tierra flotan brevemente en el aire, iluminadas por un rayo de sol lateral."

**Composición:** Relación de aspecto (${ar}). Tipo de plano cinematográfico exacto (primerísimo primer plano, plano medio, plano general, plano secuencia, over-the-shoulder, plano cenital con movimiento, travelling lateral, etc.). Ángulo de cámara. Disposición precisa de los elementos en el encuadre. Describe el MOVIMIENTO DE CÁMARA implícito: ¿es un fotograma de un travelling, un paneo, un zoom-in, una cámara estática, un dolly, un plano dron? ¿Hacia dónde se mueve la cámara? Mínimo 4 frases. --ar ${ar}

**Sujetos:** Descripción física MINUCIOSA de lo que aparece en este fotograma. Si hay personas: qué están HACIENDO (acción en curso), postura dinámica, expresión, dirección de la mirada, posición de las manos en movimiento. Si hay objetos: estado (en movimiento, siendo manipulados, cayendo, girando). Texturas específicas, colores precisos. El sujeto debe transmitir MOVIMIENTO y VIDA, no una pose estática. Mínimo 4 frases.

**Luz y Atmósfera:** Tipo de iluminación cinematográfica (luz volumétrica con partículas, contraluz con flare, iluminación de tres puntos para entrevista, luz neón ambiental, golden hour con rayos visibles, etc.). Cómo la luz interactúa con el movimiento (reflejos que se desplazan, sombras dinámicas, destellos). Temperatura de color. Mood cinematográfico (épico, íntimo, enérgico, contemplativo, dinámico). Contraste y atmósfera. Mínimo 4 frases.

**Fondo:** Qué hay detrás del sujeto y cómo se comporta con el movimiento de cámara. Nivel de desenfoque (motion blur, desenfoque de profundidad, fondo estático vs en movimiento). Si la cámara se mueve, ¿el fondo se desplaza? Elementos de producción visibles (luces de set, reflectores, elementos de attrezzo). Transición entre planos. Mínimo 3 frases.

**Estilo:** Estética cinematográfica concreta (look de cine comercial, estilo documental con cámara en mano, estilo editorial cinematic, look de campaña de lujo tipo Dior/Apple, etc.). Características técnicas de vídeo: frame rate implícito (24fps cinemático, 60fps slow-motion), sensor (full-frame look, anamórfico), lente (prime 35mm, anamórfico 40mm con bokeh ovalado, macro con profundidad mínima). Tratamiento de color y LUT (teal & orange, film emulation, desaturado con negros levantados). Mínimo 3 frases.

**Movimiento:** Describe CON DETALLE qué está pasando en movimiento en este fotograma. ¿Qué se mueve? ¿Hacia dónde? ¿A qué velocidad (cámara lenta, velocidad real, time-lapse)? ¿Hay motion blur? ¿Es un momento de pausa dramática en medio de acción? ¿Qué pasó justo ANTES de este fotograma y qué pasará justo DESPUÉS? Este es el corazón del brief de vídeo: debe quedar claro que es un instante de una secuencia viva. Mínimo 4 frases.

REGLAS ESTRICTAS:
- NO incluir texto literal en la descripción (el texto se añade en postproducción)
- El prompt COMPLETO debe tener AL MENOS 300 palabras
- CADA sección debe tener al menos 3-4 frases completas, ricas y descriptivas
- Usar lenguaje CINEMATOGRÁFICO y DINÁMICO, no de fotografía estática
- NUNCA describir la escena como si fuera una foto fija. Siempre transmitir MOVIMIENTO, ACCIÓN y NARRATIVA
- Ser HIPER-ESPECÍFICO: no "un plano bonito del producto" sino "travelling lateral a velocidad lenta siguiendo la mano del ceramista mientras gira la pieza en el torno, con partículas de arcilla flotando en contraluz dorado"
- Incluir --ar ${ar} al final de la sección Composición

${JSON_FOOTER}`;
}

function buildCarouselSystem(ar: string): string {
  return `Eres un director de arte y diseñador editorial de renombre internacional, especializado en diseño de carruseles para Instagram y LinkedIn para marcas premium. Tu experiencia incluye narrativa visual secuencial, storytelling slide-a-slide y diseño de contenido educativo/comercial que mantiene el swipe.

Tu ÚNICA tarea ahora es describir UNA SOLA IMAGEN (un slide) de un carrusel, con la precisión de un director de arte que diseña una pieza editorial de alta conversión.

CONCENTRA TODA TU CAPACIDAD EN UN ÚNICO ENTREGABLE:

═══════════════════════════════════════════
"visual_prompt" — PROMPT ULTRA-DETALLADO PARA IA GENERATIVA DE CARRUSEL
═══════════════════════════════════════════

Este prompt será copiado DIRECTAMENTE en Midjourney, DALL-E o Ideogram. Debe generar un slide que funcione DENTRO de una secuencia narrativa.

CONTEXTO CLAVE DE CARRUSELES:
- Cada slide forma parte de una SECUENCIA NARRATIVA que el usuario recorre con swipe
- El primer slide es el GANCHO: debe generar curiosidad para que deslicen
- Los slides intermedios desarrollan la historia o el valor
- El último slide es el CTA: invita a la acción
- Los slides llevan texto overlay en postproducción — los fondos deben ser COMPATIBLES con texto legible
- La COHERENCIA VISUAL entre slides es fundamental: mismo estilo, paleta, iluminación

ESTRUCTURA OBLIGATORIA (usa exactamente estas secciones como encabezados):

**Escena:** Descripción del contexto visual de ESTE slide concreto dentro de la secuencia. Mínimo 4 frases. Incluye qué rol juega este slide en la narrativa (gancho, desarrollo, dato, CTA). El entorno, hora del día, lugar. La sensación que transmite y cómo conecta con el slide anterior y el siguiente.

**Composición:** Relación de aspecto ${ar} (cuadrado o 4:5, según plataforma). Tipo de plano. Disposición de los elementos pensada para COMPATIBILIDAD CON TEXTO: zonas amplias de color sólido o desenfocadas donde irá el texto overlay. Si es slide de gancho: composición que genera curiosidad e invita al swipe. Si es CTA: composición limpia y directa. Mínimo 4 frases. --ar ${ar}

**Sujetos:** Descripción física MINUCIOSA de lo que aparece en este slide. Texturas, colores precisos, materiales. El sujeto debe ser coherente con los demás slides del carrusel (mismo entorno, misma sesión, misma paleta). Si cambia el enfoque de un slide a otro (de general a detalle, de producto a persona), indicar la transición lógica. Mínimo 4 frases.

**Luz y Atmósfera:** Iluminación CONSISTENTE con el resto del carrusel. Tipo de luz, temperatura de color, mood. La iluminación debe ser la MISMA en todos los slides para mantener coherencia visual. Contraste que permita superponer texto legible. Mínimo 4 frases.

**Fondo:** Qué hay detrás del sujeto. FUNDAMENTAL: el fondo debe incluir zonas de color uniforme o desenfocado suave donde se pueda superponer texto con buena legibilidad. Colores del fondo compatibles con la paleta de marca. Transición visual coherente entre slides. Mínimo 3 frases.

**Estilo:** Estética editorial de carrusel profesional. Debe sentirse como una pieza de diseño premium, no como una foto random. Coherencia de estilo a lo largo de toda la secuencia. Tratamiento de color uniforme. Texturas y lentes. Si es un carrusel educativo: estética clean y moderna. Si es aspiracional: estética lifestyle premium. Mínimo 3 frases.

REGLAS ESTRICTAS:
- NO incluir texto literal en la descripción (el texto se añade en postproducción)
- El prompt COMPLETO debe tener AL MENOS 250 palabras
- CADA sección debe tener al menos 3-4 frases completas
- Pensar en COHERENCIA VISUAL con el resto de slides del carrusel
- Dejar ZONAS PARA TEXTO OVERLAY (fondos limpios, colores sólidos, áreas desenfocadas)
- Si es slide de GANCHO: máximo impacto visual e intriga
- Si es slide de CTA: composición limpia, directa, espacio para botón/texto
- Incluir --ar ${ar} al final de la sección Composición

${JSON_FOOTER}`;
}

function buildFeedSystem(ar: string): string {
  return `Eres un fotógrafo editorial de renombre internacional y director de arte especializado en fotografía de producto, lifestyle y naturaleza para marcas premium. Tu ÚNICA tarea ahora es describir UNA SOLA IMAGEN con la precisión de un director de fotografía profesional que prepara un shooting real.

CONCENTRA TODA TU CAPACIDAD EN UN ÚNICO ENTREGABLE:

═══════════════════════════════════════════
"visual_prompt" — PROMPT ULTRA-DETALLADO PARA IA GENERATIVA
═══════════════════════════════════════════

Este prompt será copiado DIRECTAMENTE en Midjourney, DALL-E, Ideogram o Sora. Debe ser autosuficiente y tan preciso que la imagen generada sea EXACTAMENTE lo que describes.

ESTRUCTURA OBLIGATORIA (usa exactamente estas secciones como encabezados):

**Escena:** Descripción general inmersiva de la situación, el entorno y el contexto. Mínimo 4 frases. Incluye la hora del día, la estación, el lugar concreto (no genérico), el propósito de la imagen y la sensación que debe transmitir.

**Composición:** Relación de aspecto (${ar}). Tipo de plano exacto (primer plano, plano medio, plano general, cenital, contrapicado, etc.). Ángulo de cámara. Disposición precisa de los elementos en el encuadre (qué hay en primer plano, medio plano, fondo). Cómo se crea profundidad y guía visual. Regla de tercios o simetría si aplica. Mínimo 4 frases. --ar ${ar}

**Sujetos:** Descripción física MINUCIOSA de los protagonistas u objetos principales. Texturas específicas (rugoso, brillante, mate, translúcido, poroso, satinado). Colores con precisión (no "verde" sino "verde azulado con matices grisáceos y venas más claras"). Si hay personas: edad aproximada, ropa detallada (material, color, estado), pose, expresión facial, dirección de la mirada, qué sostienen, posición de las manos. Si hay objetos: material exacto, estado (nuevo, desgastado, antiguo, patinado), tamaño relativo, detalles táctiles. Mínimo 4 frases.

**Luz y Atmósfera:** Tipo de iluminación con detalle técnico (luz natural cenital, contraluz suave, luz difusa de ventanal norte, golden hour lateral a 15° sobre el horizonte, etc.). Cómo incide la luz en los sujetos: qué zonas ilumina, dónde caen las sombras, si hay reflejos especulares o brillos difusos, si se forman rayos visibles o haces de luz. Temperatura de color percibida (cálida dorada, fría azulada, neutra). El mood o sensación emocional que transmite. Contraste general (alto contraste dramático, bajo contraste etéreo). Mínimo 4 frases.

**Fondo:** Qué hay exactamente detrás del sujeto principal. Nivel de nitidez (enfoque nítido, desenfoque suave, bokeh cremoso con formas circulares, bokeh hexagonal, etc.). Colores predominantes del fondo y su contraste con el primer plano. Elementos secundarios visibles. Transición entre planos (gradual, abrupta). Mínimo 3 frases.

**Estilo:** Estética visual concreta (fotografía editorial de producto, fotografía documental, ilustración flat vector, 3D render hiperrealista, etc.). Texturas de la imagen (grano de película ISO 400, aspecto digital limpio, halación vintage, etc.). Características de lente simuladas (apertura amplia f/1.4, profundidad de campo reducida, lente macro 100mm, teleobjetivo comprimido 200mm, gran angular 24mm con distorsión de barril, etc.). Referencia a estilo de fotógrafo o revista si aplica. Tratamiento de color (saturación, contraste, tono split-toning). Mínimo 3 frases.

REGLAS ESTRICTAS:
- NO incluir texto literal en la descripción (el texto se añade en postproducción)
- El prompt COMPLETO debe tener AL MENOS 250 palabras
- CADA sección debe tener al menos 3-4 frases completas, ricas y descriptivas
- Usar lenguaje sensorial y táctil (texturas, temperaturas, olores implícitos, sensaciones)
- Ser HIPER-ESPECÍFICO: no "un jardín bonito" sino "jardín de estilo mediterráneo con grava blanca de mármol triturado, lavanda en flor con abejas posadas, y un olivo centenario de tronco retorcido y corteza gris plateada"
- Incluir --ar ${ar} al final de la sección Composición
- Cada detalle debe contribuir a que un generador de imágenes produzca EXACTAMENTE esta escena

${JSON_FOOTER}`;
}

const SYSTEM_BUILDERS: Record<VisualAgentKey, (ar: string) => string> = {
  visual_briefs_story: buildStorySystem,
  visual_briefs_video: buildVideoSystem,
  visual_briefs_carousel: buildCarouselSystem,
  visual_briefs_feed: buildFeedSystem,
};

export function buildSingleVisualPrompt(
  project: Project,
  input: SingleVisualInput
): { system: string; user: string; agentKey: VisualAgentKey } {
  const { post, visualIndex, totalVisuals, label, slideContext } = input;
  const ar = ASPECT_RATIOS[post.format || ''] || '4:5';
  const agentKey = resolveVisualAgent(post.format, post.production_specs?.media_type);
  const isVideo = agentKey === 'visual_briefs_video';
  const isCarousel = agentKey === 'visual_briefs_carousel';
  const isStory = agentKey === 'visual_briefs_story';

  const system = SYSTEM_BUILDERS[agentKey](ar);

  const brandBlock = `## IDENTIDAD DE MARCA\n${buildBrandContext(project)}`;
  const contextBlock = `## CONTEXTO DEL NEGOCIO\n${buildProjectContext(project, { includeAiRules: true })}`;

  const postBlock = `## PUBLICACIÓN${isVideo ? ' (VÍDEO)' : ''}
- Formato: ${post.format || 'No especificado'}
- Tipo de contenido: ${post.content_type}
- Idea del post: ${post.idea}
- Copy: ${(post.copy || '').slice(0, 400)}
- CTA: ${post.cta || 'N/A'}
- Objetivo: ${post.post_goal || 'N/A'}
- Aspect ratio: ${ar}${isVideo && post.production_specs?.duration_seconds ? `\n- Duración total del vídeo: ${post.production_specs.duration_seconds}s` : ''}${isVideo && post.production_specs?.scene_summary ? `\n- Guión completo del vídeo: ${post.production_specs.scene_summary}` : ''}`;

  let visualBlock: string;
  let instructions: string;

  if (isVideo) {
    visualBlock = `## FOTOGRAMA A GENERAR
- ${label} (${visualIndex + 1} de ${totalVisuals} fotogramas del vídeo)${slideContext ? `\n- Contenido de ESTA ESCENA según el guión: ${slideContext}` : ''}
- Este fotograma representa UN MOMENTO CONCRETO de esta escena del vídeo`;

    instructions = `INSTRUCCIONES FINALES:
- Concéntrate EXCLUSIVAMENTE en este fotograma/escena. No pienses en los demás.
- Genera SOLO el campo "visual_prompt". No generes visual_brief.
- El visual_prompt DEBE tener al menos 300 palabras, con las 7 secciones obligatorias (Escena, Composición, Sujetos, Luz y Atmósfera, Fondo, Estilo, Movimiento).
- Cada sección debe tener AL MENOS 3-4 frases completas con detalles sensoriales, técnicos y cinematográficos.
- FUNDAMENTAL: Describe un FOTOGRAMA DE VÍDEO, no una fotografía. Debe transmitir movimiento, acción, narrativa y ritmo.
- Usa los colores de marca CONCRETOS (hex) de la identidad de marca proporcionada arriba.
- Describe movimientos de cámara, velocidades, transiciones, motion blur y dinámica de la escena.
- El resultado debe ser tan detallado que al copiarlo en Sora, Runway o Kling, el vídeo generado sea EXACTAMENTE lo que describes.`;

  } else if (isCarousel) {
    visualBlock = `## SLIDE A GENERAR
- ${label} (${visualIndex + 1} de ${totalVisuals} slides del carrusel)${slideContext ? `\n- Contenido de ESTE SLIDE según el calendario: ${slideContext}` : ''}
- Este slide forma parte de una secuencia narrativa de ${totalVisuals} slides`;

    instructions = `INSTRUCCIONES FINALES:
- Concéntrate EXCLUSIVAMENTE en este slide. No pienses en los demás.
- Genera SOLO el campo "visual_prompt". No generes visual_brief.
- El visual_prompt DEBE tener al menos 250 palabras, con las 6 secciones obligatorias (Escena, Composición, Sujetos, Luz y Atmósfera, Fondo, Estilo).
- Cada sección debe tener AL MENOS 3-4 frases completas.
- FUNDAMENTAL: Este slide debe ser COHERENTE visualmente con los demás slides del carrusel (misma paleta, iluminación, estilo).
- Deja ZONAS LIMPIAS para texto overlay en postproducción.${visualIndex === 0 ? '\n- Este es el slide de GANCHO: debe generar curiosidad e invitar al swipe. Máximo impacto visual.' : ''}${visualIndex === totalVisuals - 1 ? '\n- Este es el slide FINAL (CTA): composición limpia y directa, espacio para texto de llamada a la acción.' : ''}
- Usa los colores de marca CONCRETOS (hex) de la identidad de marca proporcionada arriba.
- El resultado debe ser tan detallado que al copiarlo en Midjourney o DALL-E, la imagen generada sea EXACTAMENTE lo que describes.`;

  } else if (isStory) {
    visualBlock = `## STORY A GENERAR
- ${label} (${visualIndex + 1} de ${totalVisuals} del post)${slideContext ? `\n- Contexto de esta Story según el calendario: ${slideContext}` : ''}`;

    instructions = `INSTRUCCIONES FINALES:
- Concéntrate EXCLUSIVAMENTE en esta Story. No pienses en las demás.
- Genera SOLO el campo "visual_prompt". No generes visual_brief.
- El visual_prompt DEBE tener al menos 250 palabras, con las 6 secciones obligatorias (Escena, Composición, Sujetos, Luz y Atmósfera, Fondo, Estilo).
- Cada sección debe tener AL MENOS 3-4 frases completas.
- FUNDAMENTAL: Piensa en VERTICAL FULLSCREEN 9:16. La imagen ocupa toda la pantalla del móvil.
- Deja ESPACIO VISUAL para texto overlay (zona superior o inferior más limpia, ~20% del encuadre).
- La Story debe sentirse NATIVA de Instagram: cercana, auténtica, con impacto inmediato.
- Usa los colores de marca CONCRETOS (hex) de la identidad de marca proporcionada arriba.
- El resultado debe ser tan detallado que al copiarlo en Midjourney o DALL-E, la imagen generada sea EXACTAMENTE lo que describes.`;

  } else {
    visualBlock = `## IMAGEN A GENERAR
- ${label} (${visualIndex + 1} de ${totalVisuals} del post)${slideContext ? `\n- Contexto de esta imagen según el calendario: ${slideContext}` : ''}`;

    instructions = `INSTRUCCIONES FINALES:
- Concéntrate EXCLUSIVAMENTE en esta imagen. No pienses en las demás.
- Genera SOLO el campo "visual_prompt". No generes visual_brief.
- El visual_prompt DEBE tener al menos 250 palabras, con las 6 secciones obligatorias (Escena, Composición, Sujetos, Luz y Atmósfera, Fondo, Estilo).
- Cada sección debe tener AL MENOS 3-4 frases completas con detalles sensoriales, técnicos y táctiles.
- NO uses descripciones vagas como "ambiente agradable", "escena bonita" o "plano general". Sé HIPER-CONCRETO y ESPECÍFICO.
- Usa los colores de marca CONCRETOS (hex) de la identidad de marca proporcionada arriba.
- Describe texturas, materiales, temperaturas de color, ángulos de luz y profundidad de campo con precisión técnica.
- El resultado debe ser tan detallado que al copiarlo en Midjourney, DALL-E o Sora, la imagen generada sea EXACTAMENTE lo que describes.`;
  }

  const header = isVideo
    ? 'Genera el prompt visual detallado para este FOTOGRAMA CLAVE de vídeo.'
    : isCarousel
      ? 'Genera el prompt visual detallado para este SLIDE de carrusel.'
      : isStory
        ? 'Genera el prompt visual detallado para esta STORY.'
        : 'Genera el prompt visual detallado para esta imagen.';

  return {
    system,
    user: `${header}\n\n${brandBlock}\n\n${contextBlock}\n\n${postBlock}\n\n${visualBlock}\n\n${instructions}`,
    agentKey,
  };
}

/**
 * Descompone un post en la lista de visuales individuales a generar.
 * - Carrusel → 1 visual por slide
 * - Publicación/Story imagen → 1 visual
 * - Reel/Story vídeo → 1 fotograma clave por escena del guión (o 1 si no hay escenas separadas)
 */
export function decomposePostIntoVisuals(post: VisualBriefInput): Array<{ label: string; slideContext?: string }> {
  const format = post.format || 'publicacion';
  const specs = post.production_specs;

  if (format === 'carrusel') {
    const numSlides = specs?.num_slides || 5;
    const sceneParts = (specs?.scene_summary || '').split(/Slide\s*\d+\s*:/i).filter(s => s.trim());
    const visuals: Array<{ label: string; slideContext?: string }> = [];

    for (let i = 0; i < numSlides; i++) {
      const isFirst = i === 0;
      const isLast = i === numSlides - 1;
      let slideLabel = `Slide ${i + 1}`;
      if (isFirst) slideLabel += ' (Gancho)';
      if (isLast) slideLabel += ' (CTA)';

      visuals.push({
        label: slideLabel,
        slideContext: sceneParts[i]?.trim() || undefined,
      });
    }
    return visuals;
  }

  if (format === 'reel' || (format === 'story' && specs?.media_type === 'video')) {
    const sceneSummary = specs?.scene_summary || '';
    const sceneParts = sceneSummary
      .split(/Escena\s*\d+\s*(?:\([^)]*\))?\s*:/i)
      .filter(s => s.trim());

    if (sceneParts.length > 1) {
      return sceneParts.map((part, i) => ({
        label: `Fotograma clave – Escena ${i + 1}`,
        slideContext: part.trim(),
      }));
    }

    return [{ label: 'Fotograma clave (key frame)', slideContext: sceneSummary || undefined }];
  }

  return [{ label: 'Imagen principal', slideContext: specs?.scene_summary || undefined }];
}
