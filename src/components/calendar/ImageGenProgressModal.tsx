'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ContentItemVisual, ImageGenerationStatus } from '@/types';

const COST_PER_IMAGE_USD = 0.19;

type Phase = 'confirm' | 'running' | 'complete' | 'cancelled' | 'error';

export interface ImageGenItem {
  visualId: string;
  contentItemId: string;
  label?: string;
}

export interface ImageGenProgressModalProps {
  queue: ImageGenItem[];
  onClose: () => void;
  onImageReady: (visualId: string, contentItemId: string, imageUrl: string) => void;
  onImageError: (visualId: string, contentItemId: string, errorMsg: string) => void;
  onComplete: () => void;
}

export function ImageGenProgressModal({
  queue,
  onClose,
  onImageReady,
  onImageError,
  onComplete,
}: ImageGenProgressModalProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [done, setDone] = useState(0);
  const [currentLabel, setCurrentLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const cancelledRef = useRef(false);
  const startTimeRef = useRef(0);
  /** Aborta el fetch en curso para que Cancelar responda al instante (sin esperar al servidor). */
  const fetchAbortRef = useRef<AbortController | null>(null);

  const total = queue.length;
  const estimatedCost = (total * COST_PER_IMAGE_USD).toFixed(2);
  const estimatedMinutes = Math.ceil((total * 45) / 60);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (phase !== 'running') return;
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
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  const runGeneration = useCallback(async () => {
    cancelledRef.current = false;
    startTimeRef.current = Date.now();
    setPhase('running');
    setDone(0);
    setElapsed(0);

    let errCount = 0;

    for (let i = 0; i < queue.length; i++) {
      if (cancelledRef.current) {
        setPhase('cancelled');
        return;
      }

      const { visualId, contentItemId, label } = queue[i];
      setCurrentLabel(label || `Imagen ${i + 1}`);

      fetchAbortRef.current = new AbortController();
      const { signal } = fetchAbortRef.current;

      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visual_id: visualId }),
          signal,
        });
        if (cancelledRef.current) {
          setPhase('cancelled');
          return;
        }
        const json = await res.json();
        if (cancelledRef.current) {
          setPhase('cancelled');
          return;
        }
        if (!res.ok) throw new Error(json.error || 'Error generando imagen');
        onImageReady(visualId, contentItemId, json.image_url);
      } catch (err: any) {
        if (cancelledRef.current || err?.name === 'AbortError') {
          setPhase('cancelled');
          return;
        }
        errCount++;
        const msg = err?.message || 'Error desconocido';
        onImageError(visualId, contentItemId, msg);
        if (errCount >= queue.length) {
          setErrorMsg(msg);
        }
      } finally {
        fetchAbortRef.current = null;
      }

      if (cancelledRef.current) {
        setPhase('cancelled');
        return;
      }

      setDone(i + 1);
    }

    if (cancelledRef.current) {
      setPhase('cancelled');
    } else if (errCount === queue.length) {
      setErrorMsg(errCount === 1 ? 'Error generando la imagen' : `Error en todas las ${queue.length} imágenes`);
      setPhase('error');
    } else {
      setPhase('complete');
    }
  }, [queue, onImageReady, onImageError]);

  const handleConfirm = useCallback(() => {
    runGeneration();
  }, [runGeneration]);

  const handleCancel = useCallback(() => {
    if (phase === 'confirm') {
      onClose();
      return;
    }
    if (phase === 'running') {
      cancelledRef.current = true;
      fetchAbortRef.current?.abort();
      setPhase('cancelled');
    }
  }, [phase, onClose]);

  const handleClose = useCallback(() => {
    if (phase === 'complete') onComplete();
    onClose();
  }, [phase, onClose, onComplete]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const isTerminal = phase === 'complete' || phase === 'cancelled' || phase === 'error';
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-gen-progress-title"
    >
      <div
        className="bg-white border-2 border-surface-900 shadow-brutal-lg w-full max-w-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-surface-900 px-5 py-4">
          <div>
            <h4 id="image-gen-progress-title" className="font-display font-bold text-surface-900 text-lg leading-tight">
              {phase === 'confirm' ? 'Confirmar generación de imágenes'
                : phase === 'complete' ? 'Imágenes generadas'
                : phase === 'cancelled' ? 'Generación cancelada'
                : phase === 'error' ? 'Error en la generación'
                : 'Generando imágenes'}
            </h4>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mt-0.5">
              {total} {total === 1 ? 'imagen' : 'imágenes'}
              {phase !== 'confirm' && <> &middot; {formatTime(elapsed)}</>}
            </p>
          </div>
          {isTerminal && (
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-surface-600 hover:bg-surface-100 hover:text-surface-900"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-6 space-y-5">
          {/* Confirm phase: cost info */}
          {phase === 'confirm' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-surface-900">{total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">
                    {total === 1 ? 'Imagen' : 'Imágenes'}
                  </div>
                </div>
                <div className="bg-amber-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-amber-700">~{estimatedMinutes}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Minutos</div>
                </div>
                <div className="bg-red-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-red-700">${estimatedCost}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Coste est.</div>
                </div>
              </div>
              <div className="bg-surface-50 border border-surface-200 p-3 text-xs text-surface-600 leading-relaxed space-y-1">
                <p>Cada imagen se genera con <strong>gpt-image-1.5</strong> a resolución 1536×1024 (calidad alta).</p>
                <p>Coste estimado: <strong>${COST_PER_IMAGE_USD}/imagen</strong>. Duración: ~30-60 segundos por imagen.</p>
              </div>
            </>
          )}

          {/* Running / terminal: progress bar */}
          {phase !== 'confirm' && (
            <>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">Progreso</span>
                  <span className="font-display font-bold text-surface-900 text-sm">{progressPct}%</span>
                </div>
                <div className="h-5 bg-surface-100 border-2 border-surface-900 relative overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out border-r-2 border-surface-900 ${
                      isTerminal ? (phase === 'error' ? 'bg-red-400' : 'bg-accent-emerald') : 'bg-brand-500'
                    }`}
                    style={{
                      width: `${progressPct}%`,
                      backgroundImage: !isTerminal ? 'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)' : 'none',
                      backgroundSize: '2rem 2rem',
                      animation: !isTerminal ? 'progress-stripe 1s linear infinite' : 'none',
                    }}
                  />
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-surface-500 font-medium">
                    {done} / {total} {total === 1 ? 'imagen generada' : 'imágenes generadas'}
                  </p>
                  {!isTerminal && currentLabel && (
                    <p className="text-xs text-surface-700 font-mono truncate">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400 mr-1">Generando:</span>
                      {currentLabel}
                    </p>
                  )}
                </div>
              </div>

              {phase === 'running' && (
                <div className="flex justify-center py-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 bg-surface-900 animate-brutal-pop" style={{ animationDelay: '0s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                    <div className="w-3 h-3 bg-brand-500 animate-brutal-pop" style={{ animationDelay: '0.2s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                    <div className="w-3 h-3 bg-accent-amber animate-brutal-pop" style={{ animationDelay: '0.4s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                  </div>
                </div>
              )}

              {phase === 'error' && errorMsg && (
                <div className="bg-red-50 border-2 border-surface-900 text-red-700 px-4 py-3 text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              {phase === 'cancelled' && (
                <div className="bg-amber-50 border-2 border-surface-900 text-amber-800 px-4 py-3 text-xs font-bold">
                  Proceso cancelado. {done > 0 ? `Se conservan ${done} ${done === 1 ? 'imagen ya generada' : 'imágenes ya generadas'}.` : 'No se generó ninguna imagen.'}
                </div>
              )}

              {phase === 'complete' && (
                <div className="bg-emerald-50 border-2 border-surface-900 text-emerald-800 px-4 py-3 text-xs font-bold">
                  {done} {done === 1 ? 'imagen generada' : 'imágenes generadas'} con éxito en {formatTime(elapsed)}.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t-2 border-surface-900 px-5 py-4">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 hover:bg-brand-700"
              >
                Generar {total} {total === 1 ? 'imagen' : 'imágenes'}
              </button>
            </>
          )}
          {phase === 'running' && (
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
