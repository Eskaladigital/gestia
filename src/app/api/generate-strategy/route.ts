import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, markProjectPipelineError } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { callAI, buildStrategyPrompt } from '@/lib/ai';
import { canRunGenerateStrategyStep, type StrategyForPipeline } from '@/lib/projects/pipeline';
import {
  countProductReferenceImages,
  countStyleReferenceImages,
} from '@/lib/projects/reference-images-shared';
import { DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI, listProjectReferenceImages } from '@/lib/projects/reference-images';
import { isSellsPhysicalProductColumnError } from '@/lib/supabase/project-queries';
import type { StrategyGeneration } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';

function clipText(value: unknown, max = 2000): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function cleanStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => clipText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizePercentages(values: number[]): number[] {
  if (values.length === 0) return [];
  const safe = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    const base = Math.floor(100 / safe.length);
    const remainder = 100 - base * safe.length;
    return safe.map((_, index) => base + (index < remainder ? 1 : 0));
  }

  const normalized = safe.map(value => (value / total) * 100);
  const floored = normalized.map(value => Math.floor(value));
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0);
  const order = normalized
    .map((value, index) => ({ index, decimal: value - Math.floor(value) }))
    .sort((a, b) => b.decimal - a.decimal);

  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    floored[order[i].index] += 1;
  }

  return floored;
}

function normalizeStrategyGeneration(raw: StrategyGeneration): StrategyGeneration {
  const draftPillars = Array.isArray(raw?.content_pillars)
    ? raw.content_pillars
        .map(pillar => ({
          name: clipText(pillar?.name, 160),
          description: clipText(pillar?.description, 1200),
          percentage: Number(pillar?.percentage) || 0,
          content_types: cleanStringArray(pillar?.content_types, 8, 80),
          example_topics: cleanStringArray(pillar?.example_topics, 10, 140),
        }))
        .filter(pillar => pillar.name && pillar.description)
        .slice(0, 5)
    : [];

  const normalizedPercentages = normalizePercentages(draftPillars.map(pillar => pillar.percentage));
  const content_pillars = draftPillars.map((pillar, index) => ({
    ...pillar,
    percentage: normalizedPercentages[index] ?? 0,
  }));

  const thematic_lines = Array.isArray(raw?.thematic_lines)
    ? raw.thematic_lines
        .map(line => ({
          theme: clipText(line?.theme, 160),
          description: clipText(line?.description, 1000),
          frequency: clipText(line?.frequency, 80),
          example_topics: cleanStringArray(line?.example_topics, 8, 140),
        }))
        .filter(line => line.theme && line.description)
        .slice(0, 8)
    : [];

  const sells_physical_product =
    typeof raw?.sells_physical_product === 'boolean' ? raw.sells_physical_product : undefined;

  return {
    content_pillars,
    tone_guidelines: clipText(raw?.tone_guidelines, 5000),
    thematic_lines,
    recommendations: clipText(raw?.recommendations, 5000),
    sells_physical_product,
    product_fidelity_reason: clipText(raw?.product_fidelity_reason, 500),
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  let projectId: string | undefined;
  let markErrorOnFailure = false;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { project_id } = await request.json();
    projectId = project_id;
    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { data: project } = await fetchActiveProjectForUser(supabase, user.id, project_id);

    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // Obtener la estrategia existente (con análisis previos)
    const { data: existingStrategy } = await supabase
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

    if (
      !canRunGenerateStrategyStep({
        scrapedCount: scrapedCount ?? 0,
        competitorCount: competitorCount ?? 0,
        strategy: existingStrategy as StrategyForPipeline,
      })
    ) {
      return NextResponse.json(
        {
          error:
            'Completa antes «Analizar web» y «Analizar competidores» (si hay competidores en el proyecto). Ningún paso se sustituye por otro.',
        },
        { status: 409 }
      );
    }

    markErrorOnFailure = true;

    const businessAnalysis = existingStrategy
      ? JSON.stringify({
          detailed_business_description: existingStrategy.detailed_business_description || null,
          value_proposition: existingStrategy.value_proposition,
          target_audience: existingStrategy.target_audience,
          positioning: existingStrategy.positioning,
          brand_personality: existingStrategy.brand_personality || null,
          key_services: existingStrategy.key_services || null,
          unique_selling_points: existingStrategy.unique_selling_points || null,
          content_opportunities: existingStrategy.content_opportunities || null,
          web_site_analysis: existingStrategy.web_site_analysis || null,
        })
      : 'No hay análisis de negocio disponible. Genera uno basándote en los datos del proyecto.';

    const competitorAnalysis = existingStrategy?.competitor_analysis
      ? JSON.stringify(existingStrategy.competitor_analysis)
      : 'No hay análisis competitivo disponible.';

    // Generar estrategia
    const referenceImages = await listProjectReferenceImages(
      supabase,
      project_id,
      DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI
    );

    const { system, user: userPrompt } = buildStrategyPrompt(project, businessAnalysis, competitorAnalysis, {
      sellsPhysicalProduct: project.sells_physical_product ?? null,
      productReferenceCount: countProductReferenceImages(referenceImages),
      styleReferenceCount: countStyleReferenceImages(referenceImages),
    });
    const aiResponse = await callAI<StrategyGeneration>(system, userPrompt, {
      agentKey: 'generate_strategy',
      userId: user.id,
      inputImages: referenceImages.map(image => image.image_url),
    });
    const normalized = normalizeStrategyGeneration(aiResponse.data);

    if (normalized.content_pillars.length === 0) {
      throw new Error('La IA no devolvió pilares de contenido válidos');
    }

    if (!normalized.tone_guidelines) {
      throw new Error('La IA no devolvió una guía de tono válida');
    }

    // Guardar/actualizar estrategia
    const strategyData = {
      content_pillars: normalized.content_pillars,
      tone_guidelines: normalized.tone_guidelines,
      thematic_lines: normalized.thematic_lines,
      recommendations: normalized.recommendations,
      prompt_tokens: (existingStrategy?.prompt_tokens || 0) + aiResponse.usage.prompt_tokens,
      completion_tokens: (existingStrategy?.completion_tokens || 0) + aiResponse.usage.completion_tokens,
    };

    if (existingStrategy) {
      await supabase
        .from('strategies')
        .update(strategyData)
        .eq('id', existingStrategy.id);
    } else {
      await supabase.from('strategies').insert({
        project_id,
        ...strategyData,
      });
    }

    const projectUpdate: Record<string, unknown> = { status: 'ready' };
    if (typeof normalized.sells_physical_product === 'boolean') {
      projectUpdate.sells_physical_product = normalized.sells_physical_product;
    }
    let { error: projectUpErr } = await supabase
      .from('projects')
      .update(projectUpdate)
      .eq('id', project_id);
    if (projectUpErr && 'sells_physical_product' in projectUpdate && isSellsPhysicalProductColumnError(projectUpErr)) {
      const { sells_physical_product: _drop, ...rest } = projectUpdate;
      await supabase.from('projects').update(rest).eq('id', project_id);
    }

    return NextResponse.json({
      success: true,
      strategy: normalized,
      usage: aiResponse.usage,
    });
  } catch (error: any) {
    if (markErrorOnFailure) await markProjectPipelineError(supabase, projectId);
    console.error('[generate-strategy] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
