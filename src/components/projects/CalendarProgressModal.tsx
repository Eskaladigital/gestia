'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthPlan {
  label: string;
  expectedPosts: number;
  totalDays: number;
}

interface MonthResult {
  postsInserted: number;
  dates: string[];
  formatCounts: Record<string, number>;
  typeCounts: Record<string, number>;
}

type Phase = 'connecting' | 'running' | 'complete' | 'cancelled' | 'error';

export interface CalendarProgressModalProps {
  projectId: string;
  calendarBasePath: string;
  mode: 'append' | 'replace';
  durationMonths: number;
  month: number;
  year: number;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const MONTH_FULL = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const FORMAT_LABELS: Record<string, string> = {
  story: 'Stories',
  carrusel: 'Carruseles',
  publicacion: 'Posts',
  reel: 'Reels',
};

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function addMonths(year: number, month0: number, delta: number) {
  const m = month0 + delta;
  return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 };
}

function firstDayOfWeek(year: number, month0: number): number {
  const d = new Date(year, month0, 1).getDay();
  return d === 0 ? 6 : d - 1; // monday = 0
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CalendarProgressModal({
  projectId,
  calendarBasePath,
  mode,
  durationMonths,
  month,
  year,
  onClose,
}: CalendarProgressModalProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [months, setMonths] = useState<MonthPlan[]>([]);
  const [currentMonthIdx, setCurrentMonthIdx] = useState(-1);
  const [results, setResults] = useState<Map<number, MonthResult>>(new Map());
  const [totalInserted, setTotalInserted] = useState(0);
  const [totalExpected, setTotalExpected] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => setMounted(true), []);

  // Elapsed timer
  useEffect(() => {
    if (phase !== 'running' && phase !== 'connecting') return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'complete' || phase === 'cancelled' || phase === 'error')) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, onClose]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // SSE connection
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    startTimeRef.current = Date.now();

    (async () => {
      try {
        const res = await fetch('/api/generate-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            calendar_mode: mode,
            duration_months: durationMonths,
            month,
            year,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = `Error HTTP ${res.status}`;
          try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch { /* */ }
          setErrorMsg(msg);
          setPhase('error');
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { setErrorMsg('Sin stream de respuesta'); setPhase('error'); return; }

        const decoder = new TextDecoder();
        let buffer = '';
        setPhase('running');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let eventName = '';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim();
              if (line.startsWith('data: ')) dataStr = line.slice(6);
            }
            if (!eventName || !dataStr) continue;

            let data: any;
            try { data = JSON.parse(dataStr); } catch { continue; }

            switch (eventName) {
              case 'init':
                setMonths(data.months || []);
                setTotalExpected(data.totalExpectedPosts || 0);
                break;

              case 'progress':
                if (data.phase === 'month_start') {
                  setCurrentMonthIdx(data.monthIndex);
                } else if (data.phase === 'month_done') {
                  setCurrentMonthIdx(data.monthIndex);
                  setTotalInserted(data.grandTotalInserted || 0);
                  setResults(prev => {
                    const next = new Map(prev);
                    next.set(data.monthIndex, {
                      postsInserted: data.postsInserted,
                      dates: data.dates || [],
                      formatCounts: data.formatCounts || {},
                      typeCounts: data.typeCounts || {},
                    });
                    return next;
                  });
                }
                break;

              case 'complete':
                setTotalInserted(data.totalPosts || 0);
                setPhase('complete');
                break;

              case 'cancelled':
                setTotalInserted(data.totalPosts || 0);
                setPhase('cancelled');
                break;

              case 'error':
                setErrorMsg(data.error || 'Error desconocido');
                setTotalInserted(data.totalInsertedBeforeError || 0);
                setPhase('error');
                break;
            }
          }
        }

        // If we exit the read loop without a terminal event, mark complete
        setPhase(prev => (prev === 'running' ? 'complete' : prev));
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setPhase('cancelled');
        } else {
          setErrorMsg(err.message || 'Error de conexión');
          setPhase('error');
        }
      }
    })();

    return () => { controller.abort(); };
  }, [projectId, mode, durationMonths, month, year]);

  const isTerminal = phase === 'complete' || phase === 'cancelled' || phase === 'error';
  const progressPct = totalExpected > 0 ? Math.round((totalInserted / totalExpected) * 100) : 0;

  // Aggregate format counts across all completed months
  const aggFormats: Record<string, number> = {};
  results.forEach(r => {
    for (const [k, v] of Object.entries(r.formatCounts)) {
      aggFormats[k] = (aggFormats[k] || 0) + v;
    }
  });

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cal-progress-title"
    >
      <div
        className="bg-white border-2 border-surface-900 shadow-brutal-lg w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b-2 border-surface-900 px-5 py-4">
          <div>
            <h4 id="cal-progress-title" className="font-display font-bold text-surface-900 text-lg leading-tight">
              {phase === 'complete' ? 'Calendario generado' : phase === 'cancelled' ? 'Generación cancelada' : phase === 'error' ? 'Error' : 'Generando calendario'}
            </h4>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mt-0.5">
              {durationMonths} {durationMonths === 1 ? 'mes' : 'meses'} &middot; {MONTH_FULL[month]} {year} &middot; {formatTime(elapsed)}
            </p>
          </div>
          {isTerminal && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-surface-600 hover:bg-surface-100 hover:text-surface-900"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Progress bar */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">Progreso</span>
              <span className="font-display font-bold text-surface-900 text-sm">{progressPct}%</span>
            </div>
            <div className="h-5 bg-surface-100 border-2 border-surface-900 relative overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out border-r-2 border-surface-900 ${
                  isTerminal ? 'bg-accent-emerald' : 'bg-brand-500 animate-progress-stripe'
                }`}
                style={{ 
                  width: `${progressPct}%`,
                  backgroundImage: !isTerminal ? 'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)' : 'none',
                  backgroundSize: '2rem 2rem'
                }}
              />
            </div>
            <p className="text-xs text-surface-500 mt-1 font-medium">
              {totalInserted} / {totalExpected} publicaciones
              {!isTerminal && months.length > 0 && (
                <> &middot; Generando <strong className="text-surface-900">{months.length} {months.length === 1 ? 'mes' : 'meses'} en paralelo</strong></>
              )}
            </p>
          </div>

          {/* Mini-calendar grid */}
          {months.length > 0 && (
            <div className={`grid gap-3 ${months.length <= 1 ? 'grid-cols-1' : months.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {months.map((mp, mIdx) => {
                const { year: my, month0: mm } = addMonths(year, month, mIdx);
                const days = daysInMonth(my, mm);
                const offset = firstDayOfWeek(my, mm);
                const result = results.get(mIdx);
                const postDatesSet = new Set(result?.dates || []);
                const isDone = result != null;
                const isActive = !isTerminal && !isDone;

                return (
                  <div key={mIdx} className={`border-2 p-2 ${isDone ? 'border-surface-900 bg-surface-50' : isActive ? 'border-surface-400' : 'border-surface-200'}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isActive && !isDone && (
                        <span className="inline-block w-2 h-2 rounded-full bg-accent-amber animate-pulse-dot" />
                      )}
                      {isDone && (
                        <span className="inline-block w-2 h-2 rounded-full bg-accent-emerald" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-700">
                        {MONTH_NAMES[mm]} {my}
                      </span>
                      {isDone && (
                        <span className="ml-auto text-[10px] font-bold text-accent-emerald">
                          {result.postsInserted}p
                        </span>
                      )}
                    </div>
                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-px mb-px">
                      {['L','M','X','J','V','S','D'].map(d => (
                        <span key={d} className="text-[8px] text-center text-surface-400 font-bold">{d}</span>
                      ))}
                    </div>
                    {/* Day cells */}
                    <div className="grid grid-cols-7 gap-px">
                      {Array.from({ length: offset }).map((_, i) => (
                        <div key={`e${i}`} className="aspect-square" />
                      ))}
                      {Array.from({ length: days }).map((_, d) => {
                        const day = d + 1;
                        const ymd = `${my}-${String(mm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const hasPost = postDatesSet.has(ymd);
                        const monthDone = isDone;
                        const monthProcessing = isActive && !isDone;

                        let cellClass = 'relative aspect-square rounded-none border border-surface-200 flex items-center justify-center text-[8px] font-bold overflow-hidden ';
                        if (hasPost) {
                          cellClass = 'relative aspect-square rounded-none border-2 border-surface-900 bg-brand-600 text-white flex items-center justify-center text-[8px] font-bold shadow-brutal-sm animate-brutal-pop z-10';
                        } else if (monthDone) {
                          cellClass += 'bg-surface-200 text-surface-400';
                        } else if (monthProcessing) {
                          cellClass += 'bg-surface-50 text-surface-400';
                        } else {
                          cellClass += 'bg-white text-surface-300';
                        }

                        return (
                          <div key={day} className={cellClass}>
                            {day}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Format stats */}
          {Object.keys(aggFormats).length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500 mb-2">Desglose por formato</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(aggFormats).map(([fmt, count]) => (
                  <span
                    key={fmt}
                    className="inline-flex items-center gap-1 border-2 border-surface-900 px-2.5 py-1 text-xs font-bold text-surface-900"
                  >
                    <span className="text-surface-500 font-medium">{FORMAT_LABELS[fmt] || fmt}</span>
                    <span className="font-display text-sm">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {phase === 'error' && errorMsg && (
            <div className="bg-red-50 border-2 border-surface-900 text-red-700 px-4 py-3 text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {/* Cancelled message */}
          {phase === 'cancelled' && (
            <div className="bg-amber-50 border-2 border-surface-900 text-amber-800 px-4 py-3 text-xs font-bold">
              Generación cancelada. {totalInserted > 0 ? `Se conservan ${totalInserted} publicaciones ya creadas.` : 'No se crearon publicaciones.'}
            </div>
          )}

          {/* Complete message */}
          {phase === 'complete' && (
            <div className="bg-emerald-50 border-2 border-surface-900 text-emerald-800 px-4 py-3 text-xs font-bold">
              Calendario listo: {totalInserted} publicaciones generadas en {formatTime(elapsed)}.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 border-t-2 border-surface-900 px-5 py-4">
          {!isTerminal && (
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-5 py-2.5 border-2 border-red-600 text-red-600 bg-red-50 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
            >
              Cancelar
            </button>
          )}
          {isTerminal && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-5 py-2.5 border-2 border-surface-900 text-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
              >
                Cerrar
              </button>
              {totalInserted > 0 && (
                <Link
                  href={calendarBasePath}
                  className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-5 py-2.5 border-2 border-surface-900 text-white bg-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
                  onClick={onClose}
                >
                  Abrir calendario &rarr;
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
