'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ContentItemVisual } from '@/types';
import {
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_ESTIMATED_COST_USD,
  VIDEO_GENERATION_MODEL,
} from '@/lib/ai/constants';
import { getVisualDisplayUrl } from '@/lib/visual-image';

type Phase = 'form' | 'running' | 'done' | 'error';

export interface VideoGenModalProps {
  visual: ContentItemVisual;
  onClose: () => void;
  onGenerated: (
    patch: Pick<
      ContentItemVisual,
      'video_url' | 'video_status' | 'video_motion_prompt' | 'video_generated_at' | 'video_model'
    >,
  ) => void;
}

const MOTION_SUGGESTIONS = [
  'La cámara se aleja lentamente (dolly out) mientras el sujeto sonríe a cámara.',
  'Travelling lateral suave; ligero viento mueve el pelo y la ropa.',
  'Zoom in lento hacia el rostro; parpadeo natural y sonrisa sutil.',
  'Plano fijo; el vapor / humo sube y la luz parpadea con suavidad.',
];

export function VideoGenModal({ visual, onClose, onGenerated }: VideoGenModalProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    visual.video_status === 'ready' && visual.video_url ? 'done' : 'form',
  );
  const [motionPrompt, setMotionPrompt] = useState(visual.video_motion_prompt || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(visual.video_url || null);
  const startRef = useRef(0);

  const baseImageUrl = getVisualDisplayUrl(visual);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  const handleClose = useCallback(() => {
    if (phase === 'running') return;
    onClose();
  }, [phase, onClose]);

  const runGeneration = useCallback(async () => {
    const prompt = motionPrompt.trim();
    if (prompt.length < 3) {
      setErrorMsg('Describe cómo debe moverse la imagen.');
      return;
    }
    setPhase('running');
    setErrorMsg('');
    setElapsed(0);
    startRef.current = Date.now();
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visual_id: visual.id, motion_prompt: prompt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error generando el vídeo');
      setVideoUrl(json.video_url);
      setPhase('done');
      onGenerated({
        video_url: json.video_url,
        video_status: 'ready',
        video_motion_prompt: json.video_motion_prompt ?? prompt,
        video_generated_at: json.video_generated_at ?? new Date().toISOString(),
        video_model: VIDEO_GENERATION_MODEL,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error desconocido');
      setPhase('error');
    }
  }, [motionPrompt, visual.id, onGenerated]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-gen-title"
    >
      <div
        className="bg-white border-2 border-surface-900 shadow-brutal-lg w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-surface-900 px-5 py-4 shrink-0">
          <div>
            <h4 id="video-gen-title" className="font-display font-bold text-surface-900 text-lg leading-tight">
              Animar imagen → vídeo
            </h4>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mt-0.5">
              {visual.label || `Visual ${visual.visual_index + 1}`}
              {phase === 'running' && <> &middot; {formatTime(elapsed)}</>}
            </p>
          </div>
          {phase !== 'running' && (
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

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-y-auto">
          {/* Preview: imagen base o vídeo resultante */}
          <div className="sm:w-1/2 bg-surface-900/5 p-4 flex items-center justify-center min-h-[200px]">
            {phase === 'done' && videoUrl ? (
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                playsInline
                className="max-w-full max-h-[60vh] border-2 border-surface-900"
              />
            ) : baseImageUrl ? (
              <div className="relative">
                <img
                  src={baseImageUrl}
                  alt="Imagen base"
                  className="max-w-full max-h-[55vh] border-2 border-surface-900"
                />
                {phase === 'running' && (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 bg-white animate-brutal-pop" style={{ animationDelay: '0s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                      <div className="w-3 h-3 bg-brand-400 animate-brutal-pop" style={{ animationDelay: '0.2s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                      <div className="w-3 h-3 bg-accent-amber animate-brutal-pop" style={{ animationDelay: '0.4s', animationIterationCount: 'infinite', animationDuration: '1s' }} />
                    </div>
                    <p className="text-white text-[10px] font-bold uppercase tracking-widest text-center px-4">
                      Generando vídeo… puede tardar varios minutos
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-surface-500">Sin imagen base</p>
            )}
          </div>

          {/* Controles */}
          <div className="sm:w-1/2 border-t-2 sm:border-t-0 sm:border-l-2 border-surface-900 p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-surface-500 mb-1.5">
                ¿Qué hace esta imagen?
              </label>
              <textarea
                value={motionPrompt}
                onChange={e => setMotionPrompt(e.target.value)}
                disabled={phase === 'running'}
                rows={4}
                placeholder="Ej.: la chica sonríe a cámara y el plano se aleja lentamente"
                className="w-full text-sm border-2 border-surface-300 p-2.5 focus:border-brand-500 focus:outline-none resize-y disabled:opacity-60"
              />
              <p className="text-[10px] text-surface-500 mt-1">
                No se regenera la imagen: se anima la que ya existe. Describe el movimiento de cámara y del sujeto.
              </p>
            </div>

            {phase !== 'running' && (
              <div className="space-y-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-surface-400">
                  Sugerencias
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {MOTION_SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setMotionPrompt(s)}
                      className="text-[10px] text-left text-surface-700 bg-surface-50 border border-surface-300 px-2 py-1 hover:bg-surface-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface-50 border border-surface-200 p-3 text-xs text-surface-600 leading-relaxed space-y-1">
              <p>
                Modelo: <strong>{VIDEO_GENERATION_MODEL}</strong> · clip de ~{VIDEO_GENERATION_DURATION_SECONDS}s.
              </p>
              <p>
                Coste estimado: <strong>~${VIDEO_GENERATION_ESTIMATED_COST_USD.toFixed(2)}</strong> por clip. El vídeo es bastante más caro que una imagen.
              </p>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border-2 border-surface-900 text-red-700 px-3 py-2 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            {phase === 'done' && (
              <div className="bg-emerald-50 border-2 border-surface-900 text-emerald-800 px-3 py-2 text-xs font-bold">
                Vídeo generado y guardado. Disponible en la galería.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t-2 border-surface-900 px-5 py-4 shrink-0">
          {phase === 'running' ? (
            <span className="text-xs font-bold uppercase tracking-wider text-surface-500">
              Generando… no cierres esta ventana
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => void runGeneration()}
                className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all hover:bg-brand-700"
              >
                {phase === 'done' || visual.video_url ? 'Regenerar vídeo' : 'Generar vídeo'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
