export type StrategyForPipeline = {
  content_pillars: unknown;
  value_proposition: string | null;
  tone_guidelines: string | null;
  thematic_lines?: unknown;
  recommendations?: string | null;
  web_site_analysis?: unknown;
  competitor_analysis: unknown;
} | null;

export type ProjectPipelineFlags = {
  webAnalyzed: boolean;
  competitorsAnalyzed: boolean;
  strategyReady: boolean;
  calendarReady: boolean;
};

export type ProjectPipelineAggregates = {
  latestStrategyByProject: Record<string, StrategyForPipeline>;
  scrapedCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  contentCountByProject: Record<string, number>;
};

export function isWebStepDone(scrapedCount: number, strategy: StrategyForPipeline): boolean {
  if (scrapedCount > 0) return true;
  const w = strategy?.web_site_analysis;
  return w != null && typeof w === 'object' && !Array.isArray(w) && Object.keys(w as object).length > 0;
}

export function hasCompetitorAnalysisContent(json: unknown): boolean {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.competitors) && o.competitors.length > 0) return true;
  for (const k of ['market_opportunities', 'differentiation_ideas', 'content_gaps']) {
    const v = o[k];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  if (typeof o.recommendations === 'string' && o.recommendations.trim()) return true;
  return false;
}

/** Sin competidores en BD = paso cubierto; si hay competidores, hace falta análisis guardado en estrategia. */
export function isCompetitorsStepDone(competitorCount: number, strategy: StrategyForPipeline): boolean {
  if (competitorCount === 0) return true;
  return hasCompetitorAnalysisContent(strategy?.competitor_analysis);
}

/**
 * Solo verdadero tras «Generar estrategia»: pilares / tono / líneas temáticas / recomendaciones.
 * No usar value_proposition (la rellena «Analizar web») para no marcar el paso en verde ni desbloquear el calendario por error.
 */
export function isStrategyStepDone(strategy: StrategyForPipeline): boolean {
  if (!strategy) return false;
  const pillars = strategy.content_pillars;
  if (Array.isArray(pillars) && pillars.length > 0) return true;
  if (strategy.tone_guidelines?.trim()) return true;
  const tl = strategy.thematic_lines;
  if (Array.isArray(tl) && tl.length > 0) return true;
  if (strategy.recommendations?.trim()) return true;
  return false;
}

/** Fase 1 completa: web + competencia + estrategia de contenido (orden lógico para pasar a calendario). */
export function isPhase1BaseComplete(flags: ProjectPipelineFlags): boolean {
  return flags.webAnalyzed && flags.competitorsAnalyzed && flags.strategyReady;
}

/** Puede lanzarse «Generar estrategia» (tras análisis web y paso competidores). */
export function canRunGenerateStrategyStep(input: {
  scrapedCount: number;
  competitorCount: number;
  strategy: StrategyForPipeline;
}): boolean {
  return (
    isWebStepDone(input.scrapedCount, input.strategy) &&
    isCompetitorsStepDone(input.competitorCount, input.strategy)
  );
}

export function computeProjectPipelineFlags(input: {
  scrapedCount: number;
  competitorCount: number;
  contentCount: number;
  strategy: StrategyForPipeline;
}): ProjectPipelineFlags {
  return {
    webAnalyzed: isWebStepDone(input.scrapedCount, input.strategy),
    competitorsAnalyzed: isCompetitorsStepDone(input.competitorCount, input.strategy),
    strategyReady: isStrategyStepDone(input.strategy),
    calendarReady: input.contentCount > 0,
  };
}

export function isPipelineComplete(flags: ProjectPipelineFlags): boolean {
  return (
    flags.webAnalyzed &&
    flags.competitorsAnalyzed &&
    flags.strategyReady &&
    flags.calendarReady
  );
}

/** Misma regla que la ficha del proyecto: «Listo» si el pipeline está completo aunque `status` siga en draft. */
export function listBadgeStatus(dbStatus: string, pipelineComplete: boolean): string {
  if (dbStatus === 'analyzing') return 'analyzing';
  if (dbStatus === 'error') return 'error';
  if (pipelineComplete) return 'ready';
  return dbStatus;
}

export function getListBadgeStatusFromAggregates(
  projectId: string,
  dbStatus: string,
  agg: ProjectPipelineAggregates
): string {
  const strategy = agg.latestStrategyByProject[projectId] ?? null;
  const flags = computeProjectPipelineFlags({
    scrapedCount: agg.scrapedCountByProject[projectId] ?? 0,
    competitorCount: agg.competitorCountByProject[projectId] ?? 0,
    contentCount: agg.contentCountByProject[projectId] ?? 0,
    strategy,
  });
  return listBadgeStatus(dbStatus, isPipelineComplete(flags));
}

/** Texto y clases del chip de estado (listas / dashboard); alineado con la ficha del proyecto. */
export function projectListBadgePresentation(key: string): { label: string; className: string } {
  if (key === 'ready') return { label: 'Listo', className: 'bg-emerald-600 text-white' };
  if (key === 'analyzing') return { label: 'Procesando', className: 'bg-amber-500 text-white' };
  if (key === 'error') return { label: 'Error', className: 'bg-red-600 text-white' };
  if (key === 'draft') return { label: 'Pendiente', className: 'bg-red-100 text-red-700 border-red-400' };
  if (key === 'onboarding') return { label: 'Config', className: 'bg-surface-900 text-white' };
  return { label: key, className: 'bg-surface-900 text-white' };
}
