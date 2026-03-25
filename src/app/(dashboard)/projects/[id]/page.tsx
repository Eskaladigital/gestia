import { createServerSupabase } from '@/lib/supabase/server';
import { fetchProjectForDashboard } from '@/lib/supabase/project-queries';
import { isAdmin } from '@/lib/auth/roles';
import { projectDashboardBasePath } from '@/lib/utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ProjectActions } from '@/components/projects/ProjectActions';
import { ProjectSettingsPanel, type ProjectSettingsInitial } from '@/components/projects/ProjectSettingsPanel';
import { BrandCard, FaviconImg } from '@/components/projects/BrandCard';
import { GenerateClientPdfButton } from '@/components/projects/GenerateClientPdfButton';
import type { BusinessAnalysis, WeeklyFormatDistribution } from '@/types';
import {
  computeProjectPipelineFlags,
  isPipelineComplete,
  listBadgeStatus,
  projectListBadgePresentation,
  type StrategyForPipeline,
} from '@/lib/projects/pipeline';

/** Datos del paso «Analizar web»: JSON guardado y/o columnas de estrategia (analyze-site escribe ambos). */
function mergeWebSiteAnalysis(
  strategy: {
    web_site_analysis?: unknown;
    value_proposition: string | null;
    target_audience: string | null;
    positioning: string | null;
  } | null
): Partial<BusinessAnalysis> | null {
  if (!strategy) return null;

  let raw: unknown = strategy.web_site_analysis;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.analysis && typeof o.analysis === 'object' && !Array.isArray(o.analysis)) {
      raw = o.analysis;
    } else if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      raw = o.data;
    }
  }

  let merged: Partial<BusinessAnalysis> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    merged = { ...(raw as Partial<BusinessAnalysis>) };
  }

  const r = merged as Record<string, unknown>;
  const fillFromAliases = (key: keyof BusinessAnalysis, camel: string) => {
    const cur = merged[key];
    if (typeof cur === 'string' && cur.trim()) return;
    const a = r[key as string];
    const b = r[camel];
    const s =
      typeof a === 'string' && a.trim()
        ? a.trim()
        : typeof b === 'string' && b.trim()
          ? b.trim()
          : undefined;
    if (s) (merged as Record<string, unknown>)[key as string] = s;
  };
  fillFromAliases('value_proposition', 'valueProposition');
  fillFromAliases('target_audience', 'targetAudience');
  fillFromAliases('positioning', 'positioning');
  fillFromAliases('detailed_business_description', 'detailedBusinessDescription');
  fillFromAliases('brand_personality', 'brandPersonality');
  fillFromAliases('confidence_level', 'confidenceLevel');

  /** Si el JSON viene vacío o incompleto, analyze-site igual rellena estas columnas en la fila. */
  const overlayCol = (col: string | null | undefined, key: keyof BusinessAnalysis) => {
    const cur = merged[key];
    if (typeof cur === 'string' && cur.trim()) return;
    if (col && typeof col === 'string' && col.trim()) {
      (merged as Record<string, unknown>)[key as string] = col.trim();
    }
  };
  overlayCol(strategy.value_proposition, 'value_proposition');
  overlayCol(strategy.target_audience, 'target_audience');
  overlayCol(strategy.positioning, 'positioning');

  const strOk = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const has =
    strOk(merged.detailed_business_description) ||
    strOk(merged.value_proposition) ||
    strOk(merged.target_audience) ||
    strOk(merged.positioning) ||
    (Array.isArray(merged.key_services) && merged.key_services.length > 0) ||
    (Array.isArray(merged.unique_selling_points) && merged.unique_selling_points.length > 0) ||
    strOk(merged.brand_personality) ||
    (Array.isArray(merged.content_opportunities) && merged.content_opportunities.length > 0) ||
    strOk(merged.confidence_level);

  return has ? merged : null;
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const userIsAdmin = await isAdmin(supabase, user.id);
  const { data: project } = await fetchProjectForDashboard(supabase, user.id, id, userIsAdmin);

  if (!project) redirect(userIsAdmin ? '/administrator/projects' : '/projects');

  const projectBase = projectDashboardBasePath(id, userIsAdmin);

  const { data: strategy } = await supabase
    .from('strategies')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: contentItems } = await supabase
    .from('content_items')
    .select('*')
    .eq('project_id', id)
    .order('scheduled_date', { ascending: true });

  const { data: competitors } = await supabase
    .from('competitors')
    .select('*')
    .eq('project_id', id);

  const { data: scrapedContent } = await supabase
    .from('scraped_content')
    .select('url, type, source, created_at, metadata')
    .eq('project_id', id);

  const scrapedCount = scrapedContent?.length ?? 0;
  const competitorCount = competitors?.length ?? 0;
  const contentCount = contentItems?.length ?? 0;

  const pipelineFlags = computeProjectPipelineFlags({
    scrapedCount,
    competitorCount,
    contentCount,
    strategy: strategy as StrategyForPipeline,
  });

  const pipelineComplete = isPipelineComplete(pipelineFlags);

  const badgeKey = listBadgeStatus(project.status, pipelineComplete);
  const st = projectListBadgePresentation(badgeKey);

  const dist = (project.weekly_format_distribution || {
    story: 0,
    carrusel: 0,
    publicacion: 0,
    reel: 0,
  }) as WeeklyFormatDistribution;

  const settingsInitial: ProjectSettingsInitial = {
    client_type: project.client_type,
    primary_goal: project.primary_goal,
    secondary_goals: project.secondary_goals || [],
    commercial_level: project.commercial_level,
    complexity: project.complexity,
    tone_formality: project.tone_formality ?? 50,
    tone_proximity: project.tone_proximity ?? 50,
    tone_emotion: project.tone_emotion ?? 50,
    tone_humor: project.tone_humor ?? 50,
    tone_disruption: project.tone_disruption ?? 50,
    weekly_format_distribution: dist,
    description: project.description,
    monthly_fee:
      project.monthly_fee != null && project.monthly_fee !== undefined
        ? Number(project.monthly_fee)
        : null,
    ai_rules: project.ai_rules ?? null,
    updated_at: project.updated_at,
  };

  const competitorAnalysis = strategy?.competitor_analysis as Record<string, unknown> | null | undefined;
  const serpDiscoveryUrls: string[] = Array.isArray(competitorAnalysis?.discovered_serp_urls)
    ? (competitorAnalysis.discovered_serp_urls as unknown[]).filter(
        (u): u is string => typeof u === 'string' && u.trim().length > 0
      )
    : [];
  const aiCompetitorRows: Record<string, unknown>[] = Array.isArray(competitorAnalysis?.competitors)
    ? (competitorAnalysis.competitors as Record<string, unknown>[])
    : [];
  const declaredCompetitorList = competitors ?? [];
  function aiNameMatchesDeclaredComp(aiName: string): boolean {
    const n = aiName.trim().toLowerCase();
    if (!n) return true;
    return declaredCompetitorList.some((comp: { name?: string }) => {
      const dbn = (comp.name || '').trim().toLowerCase();
      if (!dbn) return false;
      return n.includes(dbn) || dbn.includes(n);
    });
  }
  const extraAiCompetitors = aiCompetitorRows.filter(
    c => typeof c.name === 'string' && (c.name as string).trim() && !aiNameMatchesDeclaredComp(c.name as string)
  );
  const contentPillars = strategy?.content_pillars as any[];
  const webAi = mergeWebSiteAnalysis(strategy);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-2 flex-wrap">
            <Link href="/dashboard" className="hover:text-surface-900 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {project.brand_favicon_url && (
              <FaviconImg src={project.brand_favicon_url} className="w-8 h-8 rounded-lg shrink-0" />
            )}
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight truncate">{project.name}</h1>
          </div>
          <p className="text-surface-500 mt-1 text-sm font-medium break-words">
            {project.sector || 'Sin sector'} · {project.location || 'Sin ubicación'}
            {project.url && <> · <a href={project.url.startsWith('http') ? project.url : `https://${project.url}`} target="_blank" rel="noopener" className="text-surface-900 font-bold hover:underline font-mono text-xs break-all">{project.url}</a></>}
            {project.monthly_fee != null && Number(project.monthly_fee) > 0 && (
              <>
                {' '}
                ·{' '}
                <span className="text-surface-600">
                  Honorarios:{' '}
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                    Number(project.monthly_fee)
                  )}
                  /mes
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <GenerateClientPdfButton projectId={id} projectName={project.name} />
          <span className={`inline-flex items-center px-2.5 py-1 border-2 border-surface-900 text-[10px] font-bold uppercase tracking-widest font-mono ${st.className}`}>
            {st.label}
          </span>
        </div>
      </div>

      {/* CTA cuando no hay estrategia */}
      {!strategy && (!contentItems || contentItems.length === 0) && project.status !== 'analyzing' && (
        <div className="bg-white border-2 border-surface-900 shadow-brutal p-8 mb-8">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4">
              <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-10 w-auto" />
            </div>
            <h2 className="font-display text-xl font-bold text-surface-900 mb-3">Tu proyecto est&aacute; listo para empezar</h2>
            <p className="text-sm text-surface-600 mb-3 text-left sm:text-center">
              <strong>Fase 1:</strong> pulsa <strong>&laquo;Todo en uno&raquo;</strong> o los 4 pasos individuales
              (identidad visual → web → competidores → estrategia) en el panel de <strong>Procesamiento con IA</strong> de abajo.
            </p>
            <p className="text-sm text-surface-600 mb-4 text-left sm:text-center">
              <strong>Fase 2:</strong> cuando la base est&eacute; lista, pulsa <strong>Generar calendario</strong>. Las publicaciones se editan en{' '}
              <Link href={`${projectBase}/calendar`} className="text-surface-900 font-bold hover:underline">
                Calendario
              </Link>.
            </p>
            <p className="text-[10px] text-surface-900 uppercase tracking-widest font-bold">Nada se ejecuta al crear el proyecto &middot; todo es manual</p>
          </div>
        </div>
      )}

      {/* Action buttons — incluye identidad visual como paso 1 */}
      <ProjectActions
        projectId={id}
        projectBasePath={projectBase}
        projectUrl={project.url}
        hasCalendar={pipelineFlags.calendarReady}
        pipelineFlags={pipelineFlags}
        hasBrandData={!!project.brand_analyzed_at}
      />

      {/* Brand identity — solo visualización, el botón está en ProjectActions */}
      <BrandCard
        projectId={id}
        projectUrl={project.url}
        brandColors={project.brand_colors || []}
        brandFonts={project.brand_fonts || []}
        brandLogoUrl={project.brand_logo_url || null}
        brandFaviconUrl={project.brand_favicon_url || null}
        brandSummary={project.brand_summary || null}
        brandAnalyzedAt={project.brand_analyzed_at || null}
        brandIdentityDetail={project.brand_identity_detail ?? null}
        manualAnalyzeDisabled
      />

      <ProjectSettingsPanel projectId={id} initial={settingsInitial} />

      {/* Ficha del negocio: análisis desde la web */}
      <div className="bg-white border-2 border-surface-900 shadow-brutal p-6 mb-6">
        <h2 className="font-display text-lg font-bold text-surface-900 mb-1">Ficha del negocio</h2>
        <p className="text-sm text-surface-500 mb-4">
          Resultado del análisis de la web. Los ajustes operativos (cliente, objetivos, tono, publicaciones semanales, honorarios)
          están en <strong>Ajustes del proyecto</strong>.
        </p>

        {webAi && (
          <div className="mb-6 border-2 border-surface-900 bg-brand-50/30 p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-mono font-bold bg-brand-600 text-white px-2 py-0.5 border-2 border-surface-900 uppercase tracking-widest">Análisis IA</span>
              {webAi.confidence_level && (
                <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 rounded uppercase tracking-widest">
                  Confianza: {webAi.confidence_level}
                </span>
              )}
            </div>
            <p className="text-xs text-surface-500 mb-3">
              Resultado de «Analizar web»: síntesis según las URLs scrapeadas de {project.name}.
            </p>
            {webAi.detailed_business_description ? (
              <p className="text-sm text-surface-800 leading-relaxed whitespace-pre-wrap">{webAi.detailed_business_description}</p>
            ) : (
              <p className="text-xs text-surface-500 mb-3">
                Vuelve a ejecutar <strong>Análisis base completo</strong> si quieres refrescar la <strong>descripción detallada en prosa</strong> del negocio.
              </p>
            )}
            {(webAi.value_proposition || webAi.target_audience || webAi.positioning) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-brand-100/80">
                {webAi.value_proposition && (
                  <div>
                    <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Propuesta de valor</p>
                    <p className="text-sm text-surface-800 leading-snug">{webAi.value_proposition}</p>
                  </div>
                )}
                {webAi.target_audience && (
                  <div>
                    <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Público objetivo</p>
                    <p className="text-sm text-surface-800 leading-snug">{webAi.target_audience}</p>
                  </div>
                )}
                {webAi.positioning && (
                  <div>
                    <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Posicionamiento</p>
                    <p className="text-sm text-surface-800 leading-snug">{webAi.positioning}</p>
                  </div>
                )}
              </div>
            )}
            {webAi.brand_personality && (
              <div className="mt-4 pt-3 border-t border-brand-100/80">
                <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Personalidad de marca</p>
                <p className="text-sm text-surface-800">{webAi.brand_personality}</p>
              </div>
            )}
            {(webAi.key_services?.length || webAi.unique_selling_points?.length) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-100/80">
                {webAi.key_services && webAi.key_services.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-surface-500 uppercase mb-2">Servicios / oferta detectada</p>
                    <ul className="text-sm text-surface-800 space-y-1 list-disc list-inside">
                      {webAi.key_services.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {webAi.unique_selling_points && webAi.unique_selling_points.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-surface-500 uppercase mb-2">Diferenciales</p>
                    <ul className="text-sm text-surface-800 space-y-1 list-disc list-inside">
                      {webAi.unique_selling_points.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
            {webAi.content_opportunities && webAi.content_opportunities.length > 0 && (
              <div className="mt-4 pt-3 border-t border-brand-100/80">
                <p className="text-[10px] font-medium text-surface-500 uppercase mb-2">Oportunidades de contenido</p>
                <ul className="text-sm text-surface-800 space-y-1">
                  {webAi.content_opportunities.map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand-500 shrink-0">·</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!webAi && (
          <div className="border-2 border-dashed border-surface-900 bg-surface-50/50 p-8 text-center text-sm text-surface-500">
            Aún no hay análisis de web en la estrategia. Usa <strong>Analizar web</strong> o <strong>Análisis base completo</strong> en
            Procesamiento con IA.
          </div>
        )}
      </div>

      {/* Competidores */}
      {competitors && competitors.length > 0 && (
        <div className="bg-white border-2 border-surface-900 shadow-brutal p-6 mb-6">
          <h2 className="font-display text-lg font-bold text-surface-900 mb-1">
            Competidores <span className="text-surface-400">({competitors.length} declarados)</span>
          </h2>
          {serpDiscoveryUrls.length > 0 && (
            <p className="text-xs text-surface-500 mb-3">
              El análisis incluyó además <strong>{serpDiscoveryUrls.length}</strong> sitio(s) hallados en Google (no sustituyen a los declarados; ver bloque siguiente).
            </p>
          )}
          {serpDiscoveryUrls.length === 0 && extraAiCompetitors.length > 0 && (
            <p className="text-xs text-surface-500 mb-3">
              La IA devolvió perfiles de <strong>{extraAiCompetitors.length}</strong> actor(es) adicional(es) respecto a los declarados.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map((comp: any) => {
              const aiComp = aiCompetitorRows.find(
                c =>
                  typeof c.name === 'string' &&
                  comp.name &&
                  c.name.toLowerCase().includes(String(comp.name).toLowerCase())
              ) as Record<string, unknown> | undefined;
              return (
                <div key={comp.id} className="bg-surface-50 p-4 border-2 border-surface-900 shadow-brutal-sm hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-surface-900">{comp.name}</p>
                      {comp.url && (
                        <a href={comp.url.startsWith('http') ? comp.url : `https://${comp.url}`} target="_blank" rel="noopener" className="text-xs text-brand-600 hover:underline">
                          {comp.url}
                        </a>
                      )}
                    </div>
                  </div>
                  {comp.reason && <p className="text-xs text-surface-600 mb-2">Motivo: {comp.reason}</p>}

                  {aiComp && (
                    <div className="mt-2 pt-2 border-t border-surface-200 space-y-1.5">
                      {!!aiComp.tone_detected && (
                        <p className="text-xs text-surface-600"><span className="font-medium">Tono:</span> {String(aiComp.tone_detected)}</p>
                      )}
                      {!!aiComp.estimated_frequency && (
                        <p className="text-xs text-surface-600"><span className="font-medium">Frecuencia:</span> {String(aiComp.estimated_frequency)}</p>
                      )}
                      {Array.isArray(aiComp.strengths) && aiComp.strengths.length > 0 && (
                        <div>
                          <p className="text-[10px] font-medium text-emerald-600 uppercase">Fortalezas</p>
                          <ul className="text-xs text-surface-600 list-disc list-inside">
                            {(aiComp.strengths as string[]).map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(aiComp.weaknesses) && aiComp.weaknesses.length > 0 && (
                        <div>
                          <p className="text-[10px] font-medium text-red-500 uppercase">Debilidades</p>
                          <ul className="text-xs text-surface-600 list-disc list-inside">
                            {(aiComp.weaknesses as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(aiComp.detected_content_types) && aiComp.detected_content_types.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(aiComp.detected_content_types as string[]).map((t: string) => (
                            <span key={t} className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {serpDiscoveryUrls.length > 0 && (
            <div className="mt-4 border-2 border-surface-900 bg-amber-50/40 p-4">
              <p className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">Sitios detectados en Google (usados en el análisis)</p>
              <p className="text-xs text-surface-600 mb-3">
                No están en la tabla de competidores del proyecto; se obtuvieron por búsqueda orgánica (sector + ubicación). Vuelve a ejecutar <strong>Analizar competidores</strong> para refrescar esta lista.
              </p>
              <ul className="space-y-2">
                {serpDiscoveryUrls.map((url, i) => (
                  <li key={`${url}-${i}`}>
                    <a
                      href={url.startsWith('http') ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-brand-600 hover:underline break-all font-mono"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extraAiCompetitors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-surface-600 uppercase tracking-wider mb-2">Otros actores en el informe IA</p>
              <p className="text-xs text-surface-500 mb-3">
                Entradas del JSON de análisis que no coinciden con tus competidores declarados (p. ej. marcas vistas en el scrape de Google).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extraAiCompetitors.map((aiComp, idx) => (
                  <div key={`extra-${idx}`} className="bg-violet-50/50 p-4 border-2 border-surface-900 shadow-brutal-sm">
                    <p className="font-bold text-surface-900">{String(aiComp.name)}</p>
                    <div className="mt-2 pt-2 border-t border-violet-200 space-y-1.5">
                      {!!aiComp.tone_detected && (
                        <p className="text-xs text-surface-600"><span className="font-medium">Tono:</span> {String(aiComp.tone_detected)}</p>
                      )}
                      {!!aiComp.estimated_frequency && (
                        <p className="text-xs text-surface-600"><span className="font-medium">Frecuencia:</span> {String(aiComp.estimated_frequency)}</p>
                      )}
                      {Array.isArray(aiComp.strengths) && aiComp.strengths.length > 0 && (
                        <div>
                          <p className="text-[10px] font-medium text-emerald-600 uppercase">Fortalezas</p>
                          <ul className="text-xs text-surface-600 list-disc list-inside">
                            {(aiComp.strengths as string[]).map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(aiComp.weaknesses) && aiComp.weaknesses.length > 0 && (
                        <div>
                          <p className="text-[10px] font-medium text-red-500 uppercase">Debilidades</p>
                          <ul className="text-xs text-surface-600 list-disc list-inside">
                            {(aiComp.weaknesses as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(aiComp.detected_content_types) && aiComp.detected_content_types.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(aiComp.detected_content_types as string[]).map((t: string) => (
                            <span key={t} className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(competitorAnalysis?.market_opportunities) && competitorAnalysis.market_opportunities.length > 0 && (
            <div className="mt-4 bg-emerald-50/50 p-4 border-2 border-surface-900">
              <p className="text-xs font-medium text-emerald-700 mb-2">Oportunidades de mercado detectadas</p>
              <ul className="text-sm text-surface-800 space-y-1">
                {(competitorAnalysis.market_opportunities as string[]).map((o: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">+</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(competitorAnalysis?.differentiation_ideas) && competitorAnalysis.differentiation_ideas.length > 0 && (
            <div className="mt-3 bg-blue-50/50 p-4 border-2 border-surface-900">
              <p className="text-xs font-medium text-blue-700 mb-2">Ideas de diferenciación</p>
              <ul className="text-sm text-surface-800 space-y-1">
                {(competitorAnalysis.differentiation_ideas as string[]).map((d: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">→</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Web scrapeada */}
      {scrapedContent && scrapedContent.length > 0 && (() => {
        const scrapePreviewSrc = (p: any): string | null => {
          const m = p?.metadata;
          if (!m || typeof m !== 'object') return null;
          if (typeof m.screenshot_url === 'string' && m.screenshot_url) return m.screenshot_url;
          if (typeof m.portfolio_hero === 'string' && m.portfolio_hero) return m.portfolio_hero;
          if (typeof m.portfolio_folder === 'string' && m.portfolio_folder)
            return `/portfolio/${m.portfolio_folder}/hero.jpg`;
          return null;
        };
        const pagesWithScreenshots = scrapedContent
          .filter((p: any) => scrapePreviewSrc(p))
          .slice(0, 4);
        return (
          <div className="bg-white border-2 border-surface-900 shadow-brutal p-6 mb-6">
            <h2 className="font-display text-lg font-bold text-surface-900 mb-4">Páginas analizadas <span className="text-surface-400">({scrapedContent.length})</span></h2>

            {pagesWithScreenshots.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {pagesWithScreenshots.map((page: any, i: number) => (
                  <a key={i} href={page.url} target="_blank" rel="noopener"
                    className="group border-2 border-surface-900 shadow-brutal-sm hover:shadow-brutal hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-150 overflow-hidden bg-white block">
                    <div className="aspect-[16/10] overflow-hidden bg-surface-100 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={scrapePreviewSrc(page)!}
                        alt={`Captura de ${page.url}`}
                        className="w-full h-full object-cover object-top"
                        loading="lazy"
                      />
                    </div>
                    <div className="px-3 py-2.5 flex items-center gap-2 border-t-2 border-surface-900 bg-surface-50">
                      <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-1.5 py-0.5 uppercase tracking-widest shrink-0">{page.type}</span>
                      <span className="text-xs text-surface-600 truncate font-mono group-hover:text-brand-600 transition-colors">{page.url.replace(/^https?:\/\//, '')}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {scrapedContent.map((page: any, i: number) => (
                <a key={i} href={page.url} target="_blank" rel="noopener"
                  className="flex items-center gap-2 bg-surface-50 border-2 border-surface-900 px-3 py-2 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150">
                  <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-1.5 py-0.5 uppercase tracking-widest">{page.type}</span>
                  <span className="text-xs text-surface-500 truncate max-w-[200px]">{page.url}</span>
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Strategy detailed */}
      {strategy && (
        <div className="bg-white border-2 border-surface-900 shadow-brutal p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-lg font-bold text-surface-900">Estrategia de contenido</h2>
            <Link href={`${projectBase}/strategy`} className="text-xs font-bold text-surface-900 uppercase tracking-wider hover:underline shrink-0">
              Ver completa →
            </Link>
          </div>

          {/* Propuesta, audiencia, posicionamiento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {strategy.value_proposition && (
              <div className="bg-surface-50 border-2 border-surface-900 p-4">
                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Propuesta de valor</p>
                <p className="text-sm text-surface-800">{strategy.value_proposition}</p>
              </div>
            )}
            {strategy.target_audience && (
              <div className="bg-surface-50 border-2 border-surface-900 p-4">
                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Público objetivo</p>
                <p className="text-sm text-surface-800">{strategy.target_audience}</p>
              </div>
            )}
            {strategy.positioning && (
              <div className="bg-surface-50 border-2 border-surface-900 p-4">
                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Posicionamiento</p>
                <p className="text-sm text-surface-800">{strategy.positioning}</p>
              </div>
            )}
          </div>

          {/* Pilares de contenido */}
          {contentPillars && contentPillars.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-surface-500 mb-3">Pilares de contenido</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {contentPillars.map((pillar: any, i: number) => (
                  <div key={i} className="bg-surface-50 p-4 border-2 border-surface-900 shadow-brutal-sm hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-surface-900">{pillar.name}</p>
                      {pillar.percentage && (
                        <span className="text-[10px] bg-surface-900 text-white px-2 py-0.5 rounded font-mono font-bold">{pillar.percentage}%</span>
                      )}
                    </div>
                    <p className="text-xs text-surface-600 leading-relaxed">{pillar.description}</p>
                    {pillar.example_topics?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {pillar.example_topics.slice(0, 3).map((topic: string, j: number) => (
                          <span key={j} className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{topic}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tono y recomendaciones */}
          {strategy.tone_guidelines && (
            <div className="bg-surface-50 border-2 border-surface-900 p-4 mb-4">
              <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Guías de tono y voz</p>
              <p className="text-sm text-surface-800 leading-relaxed">{strategy.tone_guidelines}</p>
            </div>
          )}
          {strategy.recommendations && (
            <div className="bg-amber-50/50 p-4 border-2 border-surface-900">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Recomendaciones</p>
              <p className="text-sm text-surface-800 leading-relaxed">{strategy.recommendations}</p>
            </div>
          )}

          {/* Tokens usados */}
          {(strategy.prompt_tokens || strategy.completion_tokens) && (
            <div className="mt-4 flex items-center gap-4 text-xs text-surface-400">
              <span>Tokens: {(strategy.prompt_tokens || 0).toLocaleString()} prompt + {(strategy.completion_tokens || 0).toLocaleString()} respuesta</span>
              <span>Modelo: {strategy.ai_model || 'gpt-4o'}</span>
            </div>
          )}
        </div>
      )}

      {/* Calendar preview */}
      {contentItems && contentItems.length > 0 && (
        <div className="bg-white border-2 border-surface-900 shadow-brutal p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-lg font-bold text-surface-900">Calendario <span className="text-surface-400">({contentItems.length} posts)</span></h2>
            <Link
              href={`${projectBase}/calendar`}
              className="text-xs font-bold text-surface-900 uppercase tracking-wider hover:underline shrink-0"
            >
              Abrir calendario →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            {['story', 'carrusel', 'publicacion', 'reel'].map(fmt => {
              const count = contentItems.filter((i: any) => i.format === fmt).length;
              const tags: Record<string, string> = { story: 'Stories', carrusel: 'Carruseles', publicacion: 'Posts', reel: 'Reels' };
              return (
                <div key={fmt} className="bg-surface-50 border-2 border-surface-900 p-3 text-center">
                  <p className="font-display text-xl sm:text-2xl font-bold text-surface-900">{count}</p>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider font-bold">{tags[fmt] || fmt}</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {contentItems.slice(0, 10).map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 sm:gap-4 p-3 hover:bg-surface-50 transition-colors border-b-2 border-surface-200 last:border-b-0">
                <div className="w-12 sm:w-16 text-center shrink-0">
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider font-bold">{new Date(item.scheduled_date).toLocaleDateString('es-ES', { weekday: 'short' })}</p>
                  <p className="font-display text-lg sm:text-xl font-bold text-surface-900">{new Date(item.scheduled_date).getDate()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-surface-900 truncate">{item.idea}</p>
                  <p className="text-xs text-surface-500 font-medium">{item.content_type} · {item.format}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 border-2 border-surface-900 font-mono font-bold uppercase tracking-widest shrink-0 ${
                  item.status === 'approved' ? 'bg-emerald-500 text-white' : 'bg-surface-900 text-white'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
            {contentItems.length > 10 && (
              <Link href={`${projectBase}/calendar`} className="block text-center text-xs font-bold text-surface-900 uppercase tracking-wider hover:underline py-3">
                Ver los {contentItems.length - 10} posts restantes →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
