'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { CalendarProgressModal } from './CalendarProgressModal';

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string };
    if (typeof data.error === 'string' && data.error) return data.error;
  } catch {
    /* no JSON */
  }
  return text.trim() || `Error HTTP ${res.status}`;
}

export interface ProjectPipelineFlags {
  webAnalyzed: boolean;
  competitorsAnalyzed: boolean;
  strategyReady: boolean;
  calendarReady: boolean;
}

const BASE_PIPELINE_LABEL: Record<string, string> = {
  'base:marca': 'Identidad visual (marca)…',
  'base:web': 'Web y negocio…',
  'base:competidores': 'Competidores…',
  'base:estrategia': 'Estrategia de contenido…',
};

interface ProjectActionsProps {
  projectId: string;
  /** Base de rutas de la ficha (p. ej. /projects/id o /administrator/projects/id) */
  projectBasePath?: string;
  projectUrl: string | null;
  hasCalendar: boolean;
  pipelineFlags: ProjectPipelineFlags;
  hasBrandData?: boolean;
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function ProjectActions({
  projectId,
  projectBasePath,
  projectUrl,
  hasCalendar,
  pipelineFlags,
  hasBrandData = false,
}: ProjectActionsProps) {
  const base = projectBasePath ?? `/projects/${projectId}`;
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [screenshotWarning, setScreenshotWarning] = useState('');
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarModeChoice, setCalendarModeChoice] = useState<'append' | 'replace'>('append');
  const [durationMonths, setDurationMonths] = useState<1 | 3 | 6 | 9>(1);
  const [progressModalOpen, setProgressModalOpen] = useState(false);

  const now = new Date();
  const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  async function postPipelineStep(endpoint: string) {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) throw new Error(await readApiError(res));
    const data = await res.json().catch(() => ({}));

    if (endpoint === 'analyze-site' && data?.screenshots) {
      const ss = data.screenshots as { attempted: number; succeeded: number; skipped_reason: string | null; errors: string[] };
      if (ss.skipped_reason) {
        setScreenshotWarning(`Capturas omitidas: ${ss.skipped_reason}`);
      } else if (ss.attempted > 0 && ss.succeeded === 0) {
        setScreenshotWarning(`Capturas fallidas (${ss.attempted} intentos). ${ss.errors?.[0] || ''}`);
      } else if (ss.succeeded > 0 && ss.succeeded < ss.attempted) {
        setScreenshotWarning(`Capturas parciales: ${ss.succeeded}/${ss.attempted} OK`);
      } else if (ss.succeeded > 0) {
        setScreenshotWarning('');
      }
    }

    return data;
  }

  /** Un solo paso del pipeline (web / competidores / estrategia). La marca va en la tarjeta «Identidad visual». */
  async function runStep(endpoint: string, stepName: string) {
    setLoading(stepName);
    setError('');
    setScreenshotWarning('');
    try {
      await postPipelineStep(endpoint);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error en ${stepName}: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  /** Marca (si hay URL) → web → competidores → estrategia. Todo en secuencia, solo tras pulsar. */
  async function runFullBasePipeline() {
    setError('');
    setScreenshotWarning('');
    try {
      if (projectUrl?.trim()) {
        setLoading('base:marca');
        await postPipelineStep('analyze-brand');
        router.refresh();
      }
      setLoading('base:web');
      await postPipelineStep('analyze-site');
      router.refresh();
      setLoading('base:competidores');
      await postPipelineStep('analyze-competitors');
      router.refresh();
      setLoading('base:estrategia');
      await postPipelineStep('generate-strategy');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error en análisis base: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  const phase1Complete =
    pipelineFlags.webAnalyzed && pipelineFlags.competitorsAnalyzed && pipelineFlags.strategyReady;
  const basePipelineBusy = loading === 'base:marca' || loading === 'base:web' || loading === 'base:competidores' || loading === 'base:estrategia';
  const canRunStrategy = pipelineFlags.webAnalyzed && pipelineFlags.competitorsAnalyzed;
  const anyBusy = !!loading;

  function openCalendarFlow() {
    if (!phase1Complete || loading) return;
    setCalendarModeChoice('append');
    setDurationMonths(1);
    setCalendarModalOpen(true);
  }

  function launchCalendarGeneration(chosenMode: 'append' | 'replace') {
    setCalendarModalOpen(false);
    if (!phase1Complete) {
      setError('Completa primero el análisis base completo (marca, web, competidores y estrategia).');
      return;
    }
    const effectiveMode = hasCalendar ? chosenMode : 'replace';
    setCalendarModeChoice(effectiveMode);
    setError('');
    setProgressModalOpen(true);
  }

  function handleProgressModalClose() {
    setProgressModalOpen(false);
    router.refresh();
  }

  const calendarDisabled = !phase1Complete || !!loading || progressModalOpen;
  const calendarTitle = !phase1Complete
    ? 'Completa la fase base (todo en uno o los tres pasos sueltos: web → competidores → estrategia)'
    : undefined;

  return (
    <div className="mb-8">
      <div className="bg-white rounded-none border-2 border-surface-900 shadow-brutal p-6 relative">
        <h3 className="font-display font-bold text-surface-900 text-lg mb-1">Procesamiento con IA</h3>
        <p className="text-xs text-surface-600 mb-2 font-medium">
          <strong>Todo en uno</strong> ejecuta identidad visual + web + competidores + estrategia en secuencia.
          Tambi&eacute;n puedes lanzar <strong>cada paso por separado</strong>. Con la fase base lista podr&aacute;s usar <strong>Generar calendario</strong>.
          Las publicaciones se editan en{' '}
          <Link href={`${base}/calendar`} className="text-surface-900 font-bold hover:underline">
            Calendario
          </Link>.
        </p>
        <p className="text-[10px] text-surface-500 mb-6 font-bold uppercase tracking-[0.15em]">
          Nada se ejecuta al crear el proyecto &middot; Gris = pendiente &middot; Verde = completado
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border-2 border-surface-900 text-red-700 px-4 py-3 text-xs font-bold">
            {error}
          </div>
        )}
        {screenshotWarning && !error && (
          <div className="mb-4 bg-amber-50 border-2 border-surface-900 text-amber-800 px-4 py-3 text-xs font-bold">
            {screenshotWarning}
          </div>
        )}

        <div className="space-y-6">
          {/* ── FASE 1: BASE ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-900 mb-3 border-b-2 border-surface-900 pb-1">
              Fase 1 — An&aacute;lisis base
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button
                variant={phase1Complete && hasBrandData ? 'success' : 'primary'}
                size="lg"
                title={
                  phase1Complete
                    ? 'Vuelve a ejecutar todo el análisis base desde cero'
                    : 'Ejecuta identidad visual (si hay URL), web, competidores y estrategia en secuencia'
                }
                onClick={runFullBasePipeline}
                loading={basePipelineBusy}
                disabled={anyBusy}
              >
                {basePipelineBusy && loading
                  ? BASE_PIPELINE_LABEL[loading] || 'Procesando…'
                  : phase1Complete && hasBrandData
                    ? 'Repetir todo'
                    : 'Todo en uno'}
              </Button>
              {!projectUrl?.trim() && (
                <p className="text-xs text-surface-500 max-w-md font-medium">
                  Sin URL: se omite identidad visual. Usa los botones individuales.
                </p>
              )}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500 mt-5 mb-2">
              Paso a paso
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant={hasBrandData ? 'success' : 'secondary'}
                title={
                  !projectUrl?.trim()
                    ? 'Hace falta una URL para analizar la identidad visual'
                    : hasBrandData
                      ? 'Identidad visual analizada (puedes repetirlo)'
                      : 'Extrae colores, fuentes, logo y estilo visual de la web'
                }
                onClick={() => runStep('analyze-brand', 'identidad visual')}
                loading={loading === 'identidad visual'}
                disabled={anyBusy || !projectUrl?.trim()}
              >
                1. Identidad visual
              </Button>
              <Button
                variant={pipelineFlags.webAnalyzed ? 'success' : 'secondary'}
                title={
                  pipelineFlags.webAnalyzed
                    ? 'Análisis de web ya realizado (puedes repetirlo)'
                    : 'Scrape + análisis de negocio: servicios, audiencia, posicionamiento'
                }
                onClick={() => runStep('analyze-site', 'análisis web')}
                loading={loading === 'análisis web'}
                disabled={anyBusy}
              >
                2. Analizar web
              </Button>
              <Button
                variant={pipelineFlags.competitorsAnalyzed ? 'success' : 'secondary'}
                title={
                  !pipelineFlags.webAnalyzed
                    ? 'Primero ejecuta Analizar web'
                    : pipelineFlags.competitorsAnalyzed
                      ? 'Competencia lista'
                      : 'Análisis de competidores declarados'
                }
                onClick={() => runStep('analyze-competitors', 'análisis competidores')}
                loading={loading === 'análisis competidores'}
                disabled={anyBusy || !pipelineFlags.webAnalyzed}
              >
                3. Competidores
              </Button>
              <Button
                variant={pipelineFlags.strategyReady ? 'success' : 'secondary'}
                title={
                  !canRunStrategy
                    ? 'Hace falta web y competidores'
                    : pipelineFlags.strategyReady
                      ? 'Estrategia ya generada (pilares, tono…)'
                      : 'Pilares, líneas temáticas y recomendaciones'
                }
                onClick={() => runStep('generate-strategy', 'estrategia')}
                loading={loading === 'estrategia'}
                disabled={anyBusy || !canRunStrategy}
              >
                4. Estrategia
              </Button>
            </div>
          </div>

          {/* ── FASE 2: CALENDARIO ── */}
          <div className="border-t-2 border-surface-900 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-900 mb-3 border-b-2 border-surface-900 pb-1">
              Fase 2 — Calendario
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span
                title={
                  calendarTitle ??
                  (pipelineFlags.calendarReady
                    ? 'Calendario ya generado (puedes añadir o reemplazar mes)'
                    : 'Aún no hay publicaciones en el calendario')
                }
              >
                <Button
                  variant={pipelineFlags.calendarReady ? 'success' : 'secondary'}
                  onClick={openCalendarFlow}
                  disabled={calendarDisabled}
                >
                  Generar calendario
                </Button>
              </span>
              {hasCalendar && (
                <Link
                  href={`${base}/calendar`}
                  className="inline-flex items-center text-xs font-bold text-surface-900 uppercase tracking-wider px-4 py-2.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
                >
                  Abrir calendario →
                </Link>
              )}
            </div>
            {!phase1Complete && (
              <p className="text-xs text-surface-900 bg-amber-100 border-2 border-surface-900 px-3 py-2 mt-3 max-w-2xl font-bold">
                Completa los 4 pasos de la fase base (o usa &laquo;Todo en uno&raquo;) para desbloquear el calendario.
              </p>
            )}
            {phase1Complete && !hasCalendar && !loading && (
              <p className="text-xs text-surface-600 mt-3 max-w-2xl font-medium">
                Elige cu&aacute;ntos meses generar (desde {currentMonthLabel}) en el cuadro de di&aacute;logo.
              </p>
            )}
            {phase1Complete && hasCalendar && !loading && (
              <p className="text-xs text-surface-600 mt-3 max-w-2xl font-medium">
                Puedes generar varios meses seguidos y decidir si <strong>a&ntilde;ades</strong> o <strong>reemplazas</strong> el rango.
              </p>
            )}
          </div>
        </div>

        {progressModalOpen && (
          <CalendarProgressModal
            projectId={projectId}
            calendarBasePath={`${base}/calendar`}
            mode={calendarModeChoice}
            durationMonths={durationMonths}
            month={now.getMonth()}
            year={now.getFullYear()}
            onClose={handleProgressModalClose}
          />
        )}

        {calendarModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-modal-title"
            onClick={() => setCalendarModalOpen(false)}
          >
            <div
              className="bg-white border-2 border-surface-900 shadow-brutal-lg max-w-lg w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <h4 id="calendar-modal-title" className="font-display font-bold text-surface-900 text-lg mb-1">
                Generar calendario
              </h4>
              <p className="text-sm text-surface-500 mb-4 font-medium">
                Inicio del rango: <strong className="text-surface-900">{currentMonthLabel}</strong> (mes actual del sistema)
              </p>

              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mb-2">
                Duración
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                {([1, 3, 6, 9] as const).map(m => (
                  <label
                    key={m}
                    className="flex flex-col items-center justify-center cursor-pointer rounded-lg border-2 border-surface-200 p-3 has-[:checked]:border-surface-900 has-[:checked]:bg-surface-50 transition-colors text-center"
                  >
                    <input
                      type="radio"
                      name="cal-duration"
                      checked={durationMonths === m}
                      onChange={() => setDurationMonths(m)}
                      className="sr-only"
                    />
                    <span className="font-display font-bold text-surface-900 text-lg">{m}</span>
                    <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">
                      {m === 1 ? 'mes' : 'meses'}
                    </span>
                  </label>
                ))}
              </div>

              {hasCalendar ? (
                <div className="space-y-3 mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mb-1">
                    Modo (solo si ya tienes calendario)
                  </p>
                  <label className="flex gap-3 cursor-pointer rounded-lg border-2 border-surface-200 p-3 has-[:checked]:border-surface-900 has-[:checked]:bg-surface-50 transition-colors">
                    <input
                      type="radio"
                      name="cal-mode"
                      checked={calendarModeChoice === 'append'}
                      onChange={() => setCalendarModeChoice('append')}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-bold text-surface-900 text-sm">Añadir al existente</span>
                      <span className="block text-xs text-surface-500 mt-0.5">
                        No se borra nada. Se añaden posts en los meses del rango elegido.
                      </span>
                    </span>
                  </label>
                  <label className="flex gap-3 cursor-pointer rounded-lg border-2 border-surface-200 p-3 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50/50 transition-colors">
                    <input
                      type="radio"
                      name="cal-mode"
                      checked={calendarModeChoice === 'replace'}
                      onChange={() => setCalendarModeChoice('replace')}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-bold text-surface-900 text-sm">Reemplazar el rango</span>
                      <span className="block text-xs text-surface-500 mt-0.5">
                        Se eliminan <strong>todas</strong> las publicaciones desde {currentMonthLabel} durante los meses seleccionados y se insertan solo las nuevas.
                      </span>
                    </span>
                  </label>
                </div>
              ) : (
                <p className="text-xs text-surface-500 mb-6 font-medium">
                  Se generará el calendario completo para el periodo elegido. La IA se invoca una vez por mes (puede tardar varios minutos si eliges 6 u 9 meses).
                </p>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setCalendarModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => launchCalendarGeneration(calendarModeChoice)}>
                  Generar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
