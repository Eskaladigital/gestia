import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, markProjectPipelineError } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { getScrapingProvider } from '@/lib/scraping';
import { fetchSerpContextForBusinessAnalysis, hasGoogleSerpRestKey } from '@/lib/scraping/serp';
import { captureWebScreenshotsToStorage, type ScreenshotResult } from '@/lib/scraping/screenshots-puppeteer';
import { callAI, buildBusinessAnalysisPrompt } from '@/lib/ai';
import type { BusinessAnalysis, Json } from '@/types';

/** Puppeteer + subida al Storage puede tardar varios minutos en las primeras páginas. */
export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  let projectId: string | undefined;
  let pipelineStarted = false;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { project_id } = body;
    projectId = project_id;

    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { data: project, error: projectError } = await fetchActiveProjectForUser(
      supabase,
      user.id,
      project_id
    );

    if (projectError || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // Actualizar estado
    await supabase.from('projects').update({ status: 'analyzing' }).eq('id', project_id);
    pipelineStarted = true;

    // 1. Scraping real: descubrir y scrapear páginas de la web del cliente
    const scraper = getScrapingProvider();
    let scrapedPages: any[] = [];
    let screenshotInfo: Pick<ScreenshotResult, 'attempted' | 'succeeded' | 'skipped_reason' | 'errors'> = {
      attempted: 0, succeeded: 0, skipped_reason: null, errors: [],
    };

    if (project.url) {
      await supabase
        .from('scraped_content')
        .delete()
        .eq('project_id', project_id);

      const urls = await scraper.discoverPages(project.url);
      const pages = await scraper.scrapeMultiple(urls);

      const validPages = pages.filter(page => !page.content.startsWith('[No se pudo'));

      console.log(`[analyze-site] Scraping completado: ${pages.length} páginas descubiertas, ${validPages.length} válidas`);
      console.log(`[analyze-site] URLs para screenshots:`, validPages.map(p => p.url));

      const ssResult = await captureWebScreenshotsToStorage(
        validPages.map(p => p.url),
        project_id,
        { maxPages: 3 }
      );
      screenshotInfo = {
        attempted: ssResult.attempted,
        succeeded: ssResult.succeeded,
        skipped_reason: ssResult.skipped_reason,
        errors: ssResult.errors,
      };
      console.log(`[analyze-site] Screenshots resultado: ${ssResult.succeeded}/${ssResult.attempted} OK`, ssResult.skipped_reason ? `(skip: ${ssResult.skipped_reason})` : '', ssResult.errors.length ? `errors: ${ssResult.errors.join('; ')}` : '');

      const insertData = validPages.map(page => {
        const shot = ssResult.screenshots.get(page.url);
        return {
          project_id,
          url: page.url,
          content: page.content,
          type: page.type,
          source: scraper.name,
          metadata: {
            ...(page.metadata || {}),
            ...(shot
              ? {
                  screenshot_url: shot.screenshot_url,
                  portfolio_hero: shot.portfolio_hero,
                  portfolio_full: shot.portfolio_full,
                  portfolio_folder: shot.portfolio_folder,
                }
              : {}),
          },
        };
      });

      if (insertData.length > 0) {
        const { data: inserted } = await supabase
          .from('scraped_content')
          .insert(insertData)
          .select();
        scrapedPages = inserted || [];
      }
    }

    // 2. Preparar contenido para el prompt
    const scrapedText = scrapedPages
      .map((p: any) => `[${p.type?.toUpperCase()}] ${p.url}\n${p.content}`)
      .join('\n\n---\n\n');

    const serpQueries: string[] = [];
    if (project.sector?.trim() && project.location?.trim()) {
      serpQueries.push(`${project.sector.trim()} ${project.location.trim()}`);
    }
    if (project.name?.trim() && project.sector?.trim()) {
      serpQueries.push(`${project.name.trim()} ${project.sector.trim()}`);
    }
    const uniqSerpQ = [...new Set(serpQueries.map(q => q.trim()).filter(q => q.length > 3))];

    let serpContext = '';
    if (uniqSerpQ.length > 0 && (process.env.APIFY_API_TOKEN?.trim() || hasGoogleSerpRestKey())) {
      serpContext = await fetchSerpContextForBusinessAnalysis({
        queries: uniqSerpQ,
        maxLinesPerQuery: 6,
        location: project.location,
      });
    }

    // 3. Llamar a OpenAI para análisis
    const { system, user: userPrompt } = buildBusinessAnalysisPrompt(project, scrapedText, {
      serpContext: serpContext || undefined,
    });
    const aiResponse = await callAI<BusinessAnalysis>(system, userPrompt, {
      agentKey: 'analyze_site',
      userId: user.id,
    });

    // 4. Guardar o actualizar estrategia parcial (fusionar con fila existente para no perder datos si el JSON de la IA viene incompleto)
    const { data: existingStrategy } = await supabase
      .from('strategies')
      .select('id, web_site_analysis, value_proposition, target_audience, positioning')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prev = existingStrategy?.web_site_analysis;
    const baseJson: Record<string, unknown> =
      prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {};
    const incoming = aiResponse.data as unknown as Record<string, unknown>;
    for (const key of Object.keys(incoming)) {
      const v = incoming[key];
      if (v !== undefined) baseJson[key] = v;
    }
    const analysisPayload = baseJson as unknown as Json;

    if (existingStrategy) {
      await supabase
        .from('strategies')
        .update({
          value_proposition: aiResponse.data.value_proposition ?? existingStrategy.value_proposition,
          target_audience: aiResponse.data.target_audience ?? existingStrategy.target_audience,
          positioning: aiResponse.data.positioning ?? existingStrategy.positioning,
          web_site_analysis: analysisPayload,
          prompt_tokens: aiResponse.usage.prompt_tokens,
          completion_tokens: aiResponse.usage.completion_tokens,
        })
        .eq('id', existingStrategy.id);
    } else {
      await supabase.from('strategies').insert({
        project_id,
        value_proposition: aiResponse.data.value_proposition,
        target_audience: aiResponse.data.target_audience,
        positioning: aiResponse.data.positioning,
        web_site_analysis: analysisPayload,
        prompt_tokens: aiResponse.usage.prompt_tokens,
        completion_tokens: aiResponse.usage.completion_tokens,
      });
    }

    await supabase.from('projects').update({ status: 'draft' }).eq('id', project_id);

    return NextResponse.json({
      success: true,
      analysis: aiResponse.data,
      usage: aiResponse.usage,
      pages_scraped: scrapedPages.length,
      screenshots: {
        attempted: screenshotInfo.attempted,
        succeeded: screenshotInfo.succeeded,
        skipped_reason: screenshotInfo.skipped_reason,
        errors: screenshotInfo.errors.slice(0, 5),
      },
    });
  } catch (error: any) {
    if (pipelineStarted) await markProjectPipelineError(supabase, projectId);
    console.error('[analyze-site] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
