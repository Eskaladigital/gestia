import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, markProjectPipelineError } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { getScrapingProvider, normalizeUrl, type ScrapedPage } from '@/lib/scraping/provider';
import { discoverCompetitorUrlsFromGoogle, hasGoogleSerpRestKey } from '@/lib/scraping/serp';
import { callAI, buildCompetitorAnalysisPrompt } from '@/lib/ai';
import type { CompetitorAnalysis } from '@/types';

/** Máximo de URLs finales a scrapear (manual + Google + subpáginas descubiertas). */
const GLOBAL_MAX_SCRAPE_URLS = 48;
/** Por competidor manual: home + hasta N URLs internas priorizadas (mismo criterio que analyze-site). */
const MANUAL_MAX_EXTRA_PAGES = 6;
/** Por cada dominio salido de Google: menos páginas para no disparar coste. */
const SERP_MAX_EXTRA_PAGES = 4;
/** Cuántos dominios distintos tomar de resultados orgánicos. */
const SERP_MAX_SEEDS = 12;

function hostKey(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
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

    const { project_id } = await request.json();
    projectId = project_id;
    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { data: project } = await fetchActiveProjectForUser(supabase, user.id, project_id);

    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    markErrorOnFailure = true;

    const { data: competitors } = await supabase
      .from('competitors')
      .select('*')
      .eq('project_id', project_id);

    if (!competitors || competitors.length === 0) {
      markErrorOnFailure = false;
      return NextResponse.json({
        success: true,
        analysis: { competitors: [], market_opportunities: [], differentiation_ideas: [], content_gaps: [] },
        message: 'No hay competidores definidos',
      });
    }

    const scraper = getScrapingProvider();
    const seenUrls = new Set<string>();
    const urlsToScrape: string[] = [];

    function pushUnique(url: string): void {
      const nu = normalizeUrl(url);
      if (seenUrls.has(nu)) return;
      if (urlsToScrape.length >= GLOBAL_MAX_SCRAPE_URLS) return;
      seenUrls.add(nu);
      urlsToScrape.push(nu);
    }

    const excludeHostsForSerp = new Set<string>();
    if (project.url) {
      const h = hostKey(project.url);
      if (h) excludeHostsForSerp.add(h);
    }

    const manualBases = [
      ...new Set(
        competitors
          .map(c => c.url?.trim())
          .filter((u): u is string => !!u)
          .map(u => normalizeUrl(u))
      ),
    ];

    for (const base of manualBases) {
      const hk = hostKey(base);
      if (hk) excludeHostsForSerp.add(hk);
    }

    // 1) Mismo enfoque que analyze-site: discoverPages + luego scrape de cada URL
    for (const base of manualBases) {
      if (urlsToScrape.length >= GLOBAL_MAX_SCRAPE_URLS) break;
      const discovered = await scraper.discoverPages(base, { maxExtraPages: MANUAL_MAX_EXTRA_PAGES });
      for (const u of discovered) {
        if (urlsToScrape.length >= GLOBAL_MAX_SCRAPE_URLS) break;
        pushUnique(u);
      }
      await new Promise(r => setTimeout(r, 400));
    }

    // 2) Google orgánico vía Apify (mismo APIFY_API_TOKEN que Website Content Crawler)
    const searchQueries: string[] = [];
    if (project.sector?.trim() && project.location?.trim()) {
      searchQueries.push(`${project.sector.trim()} ${project.location.trim()}`);
    }
    if (project.sector?.trim() && project.name?.trim()) {
      searchQueries.push(`${project.name.trim()} ${project.sector.trim()}`);
    }
    const uniqQueries = [...new Set(searchQueries.map(q => q.trim()).filter(q => q.length > 3))];

    let serpSeedUrls: string[] = [];
    if (uniqQueries.length > 0 && (process.env.APIFY_API_TOKEN?.trim() || hasGoogleSerpRestKey())) {
      serpSeedUrls = await discoverCompetitorUrlsFromGoogle({
        queries: uniqQueries,
        excludeHosts: excludeHostsForSerp,
        maxUrls: SERP_MAX_SEEDS,
      });
    }

    for (const seed of serpSeedUrls) {
      if (urlsToScrape.length >= GLOBAL_MAX_SCRAPE_URLS) break;
      const discovered = await scraper.discoverPages(seed, { maxExtraPages: SERP_MAX_EXTRA_PAGES });
      for (const u of discovered) {
        if (urlsToScrape.length >= GLOBAL_MAX_SCRAPE_URLS) break;
        pushUnique(u);
      }
      await new Promise(r => setTimeout(r, 400));
    }

    let competitorContent = '';
    let scrapedPages: ScrapedPage[] = [];
    if (urlsToScrape.length > 0) {
      if (serpSeedUrls.length > 0) {
        competitorContent +=
          '## Dominios detectados en búsqueda (Google vía Apify), además de competidores declarados\n';
        competitorContent += serpSeedUrls.map((u, i) => `${i + 1}. ${u}`).join('\n');
        competitorContent += '\n\n';
      }

      scrapedPages = await scraper.scrapeMultiple(urlsToScrape, {
        maxPages: GLOBAL_MAX_SCRAPE_URLS,
      });
      competitorContent += scrapedPages
        .map(p => `[${p.type?.toUpperCase()}] ${p.url}\n${p.content}`)
        .join('\n\n---\n\n');
    }

    const { system, user: userPrompt } = buildCompetitorAnalysisPrompt(
      project,
      competitors,
      competitorContent
    );
    const aiResponse = await callAI<CompetitorAnalysis>(system, userPrompt, {
      agentKey: 'analyze_competitors',
      userId: user.id,
    });

    const analysisPayload = {
      ...(aiResponse.data as unknown as Record<string, unknown>),
      discovered_serp_urls: serpSeedUrls,
    };

    const { data: strategy } = await supabase
      .from('strategies')
      .select('id')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (strategy) {
      await supabase
        .from('strategies')
        .update({ competitor_analysis: analysisPayload as any })
        .eq('id', strategy.id);
    } else {
      await supabase.from('strategies').insert({
        project_id,
        competitor_analysis: analysisPayload as any,
      });
    }

    const pagesOk = scrapedPages.filter(p => !p.content.startsWith('[No se pudo')).length;

    return NextResponse.json({
      success: true,
      analysis: analysisPayload,
      usage: aiResponse.usage,
      urls_scraped: urlsToScrape.length,
      serp_seeds: serpSeedUrls.length,
      pages_scraped_ok: pagesOk,
    });
  } catch (error: any) {
    if (markErrorOnFailure) await markProjectPipelineError(supabase, projectId);
    console.error('[analyze-competitors] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
