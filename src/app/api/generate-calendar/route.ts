import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, markProjectPipelineError } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { buildCalendarPrompt, callAI, redistributeCalendarPostsBySegments } from '@/lib/ai';
import { getMonthName } from '@/lib/utils';
import {
  computeProjectPipelineFlags,
  isPhase1BaseComplete,
  type StrategyForPipeline,
} from '@/lib/projects/pipeline';
import type { CalendarGeneration } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';

const ALLOWED_DURATION = new Set([1, 3, 6, 9]);
const ALLOWED_FORMATS = new Set(['story', 'carrusel', 'publicacion', 'reel']);
const ALLOWED_CONTENT_TYPES = new Set([
  'educativo',
  'inspiracional',
  'comercial',
  'entretenimiento',
  'personal',
  'corporativo',
]);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Mapea variantes típicas del LLM al valor canónico que exige la BD. */
function coerceFormat(raw: string): string | null {
  const k = stripAccents(raw.trim()).replace(/\s+/g, '_');
  const map: Record<string, string> = {
    story: 'story',
    stories: 'story',
    historia: 'story',
    carrusel: 'carrusel',
    carousel: 'carrusel',
    publicacion: 'publicacion',
    post: 'publicacion',
    feed: 'publicacion',
    imagen: 'publicacion',
    reel: 'reel',
    reels: 'reel',
    'video_corto': 'reel',
    videocorto: 'reel',
  };
  const v = map[k] ?? null;
  return v && ALLOWED_FORMATS.has(v) ? v : null;
}

function coerceContentType(raw: string): string | null {
  const k = stripAccents(raw.trim()).replace(/\s+/g, '_');
  const map: Record<string, string> = {
    educativo: 'educativo',
    educacion: 'educativo',
    educational: 'educativo',
    inspiracional: 'inspiracional',
    inspirational: 'inspiracional',
    comercial: 'comercial',
    commercial: 'comercial',
    ventas: 'comercial',
    entretenimiento: 'entretenimiento',
    entertainment: 'entretenimiento',
    personal: 'personal',
    corporativo: 'corporativo',
    corporate: 'corporativo',
    empresa: 'corporativo',
  };
  const v = map[k] ?? null;
  return v && ALLOWED_CONTENT_TYPES.has(v) ? v : null;
}

function clipText(value: unknown, max = 2000): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function cleanStringArray(value: unknown, maxItems: number, maxLen: number, prefix = ''): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => clipText(item, maxLen))
    .filter(Boolean)
    .map(item => (prefix && !item.startsWith(prefix) ? `${prefix}${item.replace(/^#+/, '')}` : item))
    .slice(0, maxItems);
}

function normalizeProductionSpecs(raw: any, format: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const specs: Record<string, unknown> = {};

  if (typeof raw.num_slides === 'number' && raw.num_slides >= 2 && raw.num_slides <= 15) {
    specs.num_slides = raw.num_slides;
  } else if (format === 'carrusel') {
    specs.num_slides = 5;
  }

  if (typeof raw.duration_seconds === 'number' && raw.duration_seconds > 0 && raw.duration_seconds <= 120) {
    specs.duration_seconds = raw.duration_seconds;
  } else if (format === 'reel') {
    specs.duration_seconds = 30;
  }

  if (raw.media_type === 'imagen' || raw.media_type === 'video') {
    specs.media_type = raw.media_type;
  } else {
    specs.media_type = format === 'reel' ? 'video' : 'imagen';
  }

  if (typeof raw.scene_summary === 'string' && raw.scene_summary.trim()) {
    specs.scene_summary = raw.scene_summary.trim().slice(0, 2000);
  }

  return Object.keys(specs).length > 0 ? specs : null;
}

function normalizeCalendarPosts(raw: CalendarGeneration['posts'] | undefined, expectedCount: number) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((post: any) => {
      const rawType = clipText(post?.content_type, 80);
      const rawFormat = clipText(post?.format, 80);
      const content_type = coerceContentType(rawType) ?? '';
      const format = coerceFormat(rawFormat) ?? '';
      let cta = clipText(post?.cta, 280);
      let post_goal = clipText(post?.post_goal, 280);
      if (!cta && clipText(post?.idea, 280) && clipText(post?.copy, 6000)) {
        cta = 'Más info en nuestro perfil o web.';
      }
      if (!post_goal && clipText(post?.idea, 280)) {
        post_goal = 'Refuerzo de marca y engagement.';
      }
      return {
        scheduled_date: clipText(post?.scheduled_date, 32),
        content_type,
        format,
        idea: clipText(post?.idea, 280),
        copy: clipText(post?.copy, 6000),
        cta,
        post_goal,
        hashtags: cleanStringArray(post?.hashtags, 12, 80, '#'),
        platforms: ['instagram'],
        production_specs: normalizeProductionSpecs(post?.production_specs, format),
      };
    })
    .filter(
      post =>
        !!post.idea &&
        !!post.copy &&
        !!post.cta &&
        !!post.post_goal &&
        ALLOWED_CONTENT_TYPES.has(post.content_type) &&
        ALLOWED_FORMATS.has(post.format)
    )
    .slice(0, expectedCount);
}

function addCalendarMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const m = month0 + delta;
  return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 };
}

function lastDayInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function toYmd(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  let projectId: string | undefined;
  let markErrorOnFailure = false;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { project_id, month, year, calendar_mode, duration_months: rawDuration } = body;
    projectId = project_id;
    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const mode = calendar_mode === 'append' ? 'append' : 'replace';
    const duration = ALLOWED_DURATION.has(Number(rawDuration)) ? Number(rawDuration) : 1;

    const targetMonth = typeof month === 'number' && month >= 0 && month <= 11 ? month : new Date().getMonth();
    const targetYear = typeof year === 'number' && year >= 2000 && year <= 2100 ? year : new Date().getFullYear();

    const { data: project } = await fetchActiveProjectForUser(supabase, user.id, project_id);

    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    markErrorOnFailure = true;

    const { data: strategy } = await supabase
      .from('strategies')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [{ count: scrapedCount }, { count: competitorCount }] = await Promise.all([
      supabase
        .from('scraped_content')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project_id),
      supabase
        .from('competitors')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project_id),
    ]);

    const pipelineFlags = computeProjectPipelineFlags({
      scrapedCount: scrapedCount ?? 0,
      competitorCount: competitorCount ?? 0,
      contentCount: 0,
      strategy: strategy as StrategyForPipeline,
    });

    if (!isPhase1BaseComplete(pipelineFlags)) {
      return NextResponse.json(
        {
          error:
            'Completa la fase base en orden: Analizar web, Analizar competidores y Generar estrategia. Después podrás generar el calendario.',
        },
        { status: 409 }
      );
    }

    const strategyText = strategy
      ? JSON.stringify({
          value_proposition: strategy.value_proposition,
          target_audience: strategy.target_audience,
          positioning: strategy.positioning,
          content_pillars: strategy.content_pillars,
          tone_guidelines: strategy.tone_guidelines,
          thematic_lines: strategy.thematic_lines,
          recommendations: strategy.recommendations,
          competitor_analysis: strategy.competitor_analysis,
          ...(strategy.web_site_analysis != null ? { web_site_analysis: strategy.web_site_analysis } : {}),
        })
      : 'No hay estrategia definida. Genera contenido basándote en los datos del proyecto.';

    const lastPeriod = addCalendarMonths(targetYear, targetMonth, duration - 1);
    const rangeStart = toYmd(targetYear, targetMonth, 1);
    const rangeEnd = toYmd(lastPeriod.year, lastPeriod.month0, lastDayInMonth(lastPeriod.year, lastPeriod.month0));

    if (mode === 'replace') {
      const { error: delErr } = await supabase
        .from('content_items')
        .delete()
        .eq('project_id', project_id)
        .gte('scheduled_date', rangeStart)
        .lte('scheduled_date', rangeEnd);

      if (delErr) {
        console.error('[generate-calendar] Delete error:', delErr);
        throw new Error('No se pudo vaciar el calendario del rango seleccionado');
      }
    }

    const allInserted: unknown[] = [];

    let totalUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    for (let i = 0; i < duration; i++) {
      const { year: y, month0: m0 } = addCalendarMonths(targetYear, targetMonth, i);
      const { system, user: userPrompt, segments } = buildCalendarPrompt(project, strategyText, m0, y);
      const expectedPosts = segments.reduce((sum, segment) => sum + segment.postsQuota, 0);

      let normalizedPosts: ReturnType<typeof normalizeCalendarPosts> = [];

      for (let attempt = 0; attempt < 2; attempt++) {
        const retryHint =
          attempt > 0
            ? `\n\n---\nREINTENTO OBLIGATORIO: La respuesta anterior no tenía exactamente ${expectedPosts} publicaciones válidas (formato y content_type deben ser exactamente uno de los valores permitidos, sin variantes en inglés ni acentos distintos a los canónicos: format story|carrusel|publicacion|reel; content_type educativo|inspiracional|comercial|entretenimiento|personal|corporativo). Devuelve de nuevo el JSON completo con EXACTAMENTE ${expectedPosts} posts en el array "posts" y total_posts=${expectedPosts}.`
            : '';

        const aiResponse = await callAI<CalendarGeneration>(system, userPrompt + retryHint, {
          agentKey: 'generate_calendar',
          userId: user.id,
        });

        if (aiResponse.usage) {
          totalUsage = totalUsage
            ? {
                prompt_tokens: (totalUsage.prompt_tokens ?? 0) + (aiResponse.usage.prompt_tokens ?? 0),
                completion_tokens:
                  (totalUsage.completion_tokens ?? 0) + (aiResponse.usage.completion_tokens ?? 0),
                total_tokens: (totalUsage.total_tokens ?? 0) + (aiResponse.usage.total_tokens ?? 0),
              }
            : aiResponse.usage;
        }

        if (!aiResponse.data?.posts || !Array.isArray(aiResponse.data.posts)) {
          throw new Error('La IA no devolvió un calendario válido (falta el array de publicaciones)');
        }

        normalizedPosts = normalizeCalendarPosts(aiResponse.data.posts, expectedPosts);
        if (normalizedPosts.length === expectedPosts) break;
      }

      const minAcceptable = Math.max(1, expectedPosts - Math.ceil(expectedPosts * 0.1));
      if (normalizedPosts.length < minAcceptable) {
        throw new Error(
          `La IA devolvió ${normalizedPosts.length} publicaciones válidas tras reintento, pero se esperaban al menos ${minAcceptable} (cupo: ${expectedPosts}). Vuelve a generar.`
        );
      }

      redistributeCalendarPostsBySegments(normalizedPosts, segments);

      const monthStart = toYmd(y, m0, 1);
      const monthEnd = toYmd(y, m0, lastDayInMonth(y, m0));

      const postsToInsert = normalizedPosts.map(post => ({
        project_id,
        strategy_id: strategy?.id || null,
        scheduled_date: post.scheduled_date,
        content_type: post.content_type,
        format: post.format,
        idea: post.idea,
        copy: post.copy,
        cta: post.cta,
        post_goal: post.post_goal,
        hashtags: post.hashtags || [],
        platforms: post.platforms || ['instagram'],
        production_specs: post.production_specs,
        status: 'draft' as const,
      }));

      const filtered = postsToInsert.filter(p => p.scheduled_date >= monthStart && p.scheduled_date <= monthEnd);
      if (filtered.length < postsToInsert.length) {
        console.warn(`[generate-calendar] ${postsToInsert.length - filtered.length} post(s) fuera de rango mensual; se omitieron.`);
      }

      const { data: inserted, error: insertError } = await supabase
        .from('content_items')
        .insert(filtered)
        .select();

      if (insertError) {
        console.error('[generate-calendar] Insert error:', insertError);
        throw new Error('Error al guardar el calendario');
      }

      if (inserted?.length) {
        (allInserted as unknown[]).push(...inserted);
      }
    }

    await supabase.from('projects').update({ status: 'ready' }).eq('id', project_id);

    const firstLabel = `${getMonthName(targetMonth)} ${targetYear}`;
    const rangeLabel =
      duration === 1 ? firstLabel : `${firstLabel} – ${getMonthName(lastPeriod.month0)} ${lastPeriod.year}`;

    return NextResponse.json({
      success: true,
      calendar: {
        month: rangeLabel,
        total_posts: allInserted.length,
        posts: allInserted,
        mode,
        duration_months: duration,
      },
      usage: totalUsage,
    });
  } catch (error: unknown) {
    if (markErrorOnFailure) await markProjectPipelineError(supabase, projectId);
    console.error('[generate-calendar] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
