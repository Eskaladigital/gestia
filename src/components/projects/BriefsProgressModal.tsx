'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Phase = 'connecting' | 'running' | 'complete' | 'cancelled' | 'error';

export interface BriefsProgressModalProps {
  projectId: string;
  contentItemIds?: string[];
  onClose: () => void;
  onComplete: () => void;
}

export function BriefsProgressModal({
  projectId,
  contentItemIds,
  onClose,
  onComplete,
}: BriefsProgressModalProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [currentBatchIdx, setCurrentBatchIdx] = useState(-1);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'connecting') return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'complete' || phase === 'cancelled' || phase === 'error')) {
        if (phase === 'complete') onComplete();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, onClose, onComplete]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    startTimeRef.current = Date.now();

    (async () => {
      try {
        const res = await fetch('/api/generate-visual-briefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            content_item_ids: contentItemIds,
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
                setTotalPosts(data.totalPosts || 0);
                setTotalBatches(data.totalBatches || 0);
                break;

              case 'progress':
                if (data.phase === 'batch_start') {
                  setCurrentBatchIdx(data.batchIndex);
                } else if (data.phase === 'batch_done') {
                  setCurrentBatchIdx(data.batchIndex);
                  setTotalUpdated(data.totalUpdated || 0);
                }
                break;

              case 'complete':
                setTotalUpdated(data.totalUpdated || 0);
                if (data.message && data.totalUpdated === 0) {
                  // Caso sin posts pendientes
                  setTotalPosts(0);
                  setTotalBatches(0);
                }
                setPhase('complete');
                break;

              case 'cancelled':
                setTotalUpdated(data.totalUpdated || 0);
                setPhase('cancelled');
                break;

              case 'error':
                setErrorMsg(data.error || 'Error desconocido');
                setTotalUpdated(data.totalUpdated || 0);
                setPhase('error');
                break;
            }
          }
        }

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
  }, [projectId, contentItemIds]);

  const isTerminal = phase === 'complete' || phase === 'cancelled' || phase === 'error';
  // Si no hay posts (0), 100%. Si no, usar posts / total o batches / total.
  const progressPct = totalPosts > 0 ? Math.round((totalUpdated / totalPosts) * 100) : phase === 'complete' ? 100 : 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const handleClose = () => {
    if (phase === 'complete') onComplete();
    onClose();
  };

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefs-progress-title"
    >
      <div
        className="bg-white border-2 border-surface-900 shadow-brutal-lg w-full max-w-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b-2 border-surface-900 px-5 py-4">
          <div>
            <h4 id="briefs-progress-title" className="font-display font-bold text-surface-900 text-lg leading-tight">
              {phase === 'complete' ? 'Briefs generados' : phase === 'cancelled' ? 'Generación cancelada' : phase === 'error' ? 'Error' : 'Generando briefs visuales'}
            </h4>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mt-0.5">
              {totalPosts} {totalPosts === 1 ? 'publicación' : 'publicaciones'} &middot; {formatTime(elapsed)}
            </p>
          </div>
          {isTerminal && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 text-surface-600 hover:bg-surface-100 hover:text-surface-900"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-6 space-y-6">
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
            <p className="text-xs text-surface-500 mt-2 font-medium">
              {totalUpdated} / {totalPosts} briefs procesados
              {!isTerminal && currentBatchIdx >= 0 && totalBatches > 1 && (
                <> &middot; Lote <strong className="text-surface-900">{currentBatchIdx + 1}</strong> de {totalBatches}</>
              )}
            </p>
          </div>

          {/* Animación "pensando" estilo brutalista si está corriendo */}
          {phase === 'running' && (
            <div className="flex justify-center py-4">
               <div className="flex gap-2">
                 <div className="w-3 h-3 bg-surface-900 animate-brutal-pop" style={{ animationDelay: '0s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                 <div className="w-3 h-3 bg-brand-500 animate-brutal-pop" style={{ animationDelay: '0.2s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                 <div className="w-3 h-3 bg-accent-amber animate-brutal-pop" style={{ animationDelay: '0.4s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
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
              Proceso cancelado. {totalUpdated > 0 ? `Se conservan ${totalUpdated} briefs ya generados.` : 'No se guardó ningún brief.'}
            </div>
          )}

          {/* Complete message */}
          {phase === 'complete' && totalPosts > 0 && (
            <div className="bg-emerald-50 border-2 border-surface-900 text-emerald-800 px-4 py-3 text-xs font-bold">
              ¡Listo! Se han generado los briefs visuales y prompts para {totalUpdated} publicaciones en {formatTime(elapsed)}.
            </div>
          )}
          {phase === 'complete' && totalPosts === 0 && (
            <div className="bg-surface-50 border-2 border-surface-900 text-surface-600 px-4 py-3 text-xs font-bold">
              No hay publicaciones pendientes de brief visual.
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
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-5 py-2.5 border-2 border-surface-900 text-white bg-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
            >
              Cerrar y actualizar
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
