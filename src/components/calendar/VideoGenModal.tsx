'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ContentFormat, ContentItemVisual } from '@/types';
import {
  RUNWAY_DEFAULT_DURATION,
  RUNWAY_DEFAULT_MODEL,
  RUNWAY_DURATIONS,
  RUNWAY_VIDEO_MODELS,
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_ESTIMATED_COST_USD,
  VIDEO_GENERATION_MODEL,
  estimateRunwayCostUsd,
  getRunwayModel,
  isReelFormat,
  type RunwayDuration,
  type RunwayVideoModel,
  type VideoEngine,
} from '@/lib/ai/constants';
import { getVisualDisplayUrl } from '@/lib/visual-image';

type Phase = 'form' | 'running' | 'done' | 'error';

export interface VideoGenModalProps {
  visual: ContentItemVisual;
  /** Formato de la pieza: en reels (`reel` / `video_corto`) el motor por defecto es Runway. */
  contentFormat?: ContentFormat | null;
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

/** Motor por defecto: el último usado en este visual; si no, Runway en reels y Veo en el resto. */
function defaultEngine(visual: ContentItemVisual, format?: ContentFormat | null): VideoEngine {
  if (visual.video_model?.startsWith('runway-')) return 'runway';
  if (visual.video_model) return 'veo';
  return isReelFormat(format) ? 'runway' : 'veo';
}

function defaultRunwayModel(visual: ContentItemVisual): RunwayVideoModel {
  const id = visual.video_model?.replace(/^runway-/, '');
  return RUNWAY_VIDEO_MODELS.some(m => m.id === id) ? (id as RunwayVideoModel) : RUNWAY_DEFAULT_MODEL;
}

export function VideoGenModal({ visual, contentFormat, onClose, onGenerated }: VideoGenModalProps) {
  const [mounted, setMounted] = useState(false);
  // Runway es asíncrono: si el visual ya tiene una animación en curso, el modal
  // se abre consultando su estado (aunque se cerrara antes).
  const runwayPending = visual.video_status === 'generating' && !!visual.video_model?.startsWith('runway-');
  const [phase, setPhase] = useState<Phase>(
    runwayPending ? 'running' : visual.video_status === 'ready' && visual.video_url ? 'done' : 'form',
  );
  const [runwayStatus, setRunwayStatus] = useState<string | null>(runwayPending ? 'PENDING' : null);
  const pollingRef = useRef(false);
  const aliveRef = useRef(true);
  const [motionPrompt, setMotionPrompt] = useState(visual.video_motion_prompt || '');
  const [errorMsg, setErrorMsg] = useState('');
  /** Aviso de coste antes de lanzar (igual que con las imágenes). */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(visual.video_url || null);
  const [engine, setEngine] = useState<VideoEngine>(() => defaultEngine(visual, contentFormat));
  const [runwayModel, setRunwayModel] = useState<RunwayVideoModel>(() => defaultRunwayModel(visual));
  const [runwayDuration, setRunwayDuration] = useState<RunwayDuration>(RUNWAY_DEFAULT_DURATION);
  const isReel = isReelFormat(contentFormat);
  const costUsd =
    engine === 'runway'
      ? estimateRunwayCostUsd(runwayModel, runwayDuration)
      : VIDEO_GENERATION_ESTIMATED_COST_USD;
  const startRef = useRef(
    runwayPending && visual.video_task_started_at ? Date.parse(visual.video_task_started_at) : 0,
  );
  /** Con Runway la generación sigue en el servidor: se puede cerrar el modal. */
  const backgroundJob = phase === 'running' && (runwayStatus !== null || engine === 'runway');

  const baseImageUrl = getVisualDisplayUrl(visual);

  useEffect(() => {
    setMounted(true);
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /** Consulta GET /api/generate-video cada 8 s hasta que el vídeo de Runway esté listo o falle. */
  const pollRunway = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      while (aliveRef.current) {
        await new Promise(r => setTimeout(r, 8000));
        if (!aliveRef.current) break;
        const res = await fetch(`/api/generate-video?visual_id=${encodeURIComponent(visual.id)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!aliveRef.current) break;
        if (!res.ok) throw new Error(json.error || 'Error consultando el vídeo');
        if (json.status === 'ready' && json.video_url) {
          setVideoUrl(json.video_url);
          setPhase('done');
          setRunwayStatus(null);
          onGenerated({
            video_url: json.video_url,
            video_status: 'ready',
            video_motion_prompt: json.video_motion_prompt ?? motionPrompt.trim(),
            video_generated_at: json.video_generated_at ?? new Date().toISOString(),
            video_model: json.video_model ?? `runway-${runwayModel}`,
          });
          return;
        }
        if (json.status === 'error' || json.status === 'pending') {
          throw new Error(json.error || 'Runway no pudo generar el vídeo');
        }
        setRunwayStatus(json.runway_status || 'RUNNING');
      }
    } catch (err: any) {
      if (aliveRef.current) {
        setErrorMsg(err?.message || 'Error desconocido');
        setPhase('error');
        setRunwayStatus(null);
      }
    } finally {
      pollingRef.current = false;
    }
  }, [visual.id, onGenerated, motionPrompt, runwayModel]);

  useEffect(() => {
    if (runwayPending) {
      if (!startRef.current) startRef.current = Date.now();
      void pollRunway();
    }
    // solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (phase === 'running' && !backgroundJob) return;
    if (confirmOpen) {
      setConfirmOpen(false);
      return;
    }
    onClose();
  }, [phase, onClose, confirmOpen, backgroundJob]);

  const requestGeneration = useCallback(() => {
    if (motionPrompt.trim().length < 3) {
      setErrorMsg('Describe cómo debe moverse la imagen.');
      return;
    }
    setErrorMsg('');
    setConfirmOpen(true);
  }, [motionPrompt]);

  const runGeneration = useCallback(async () => {
    const prompt = motionPrompt.trim();
    if (prompt.length < 3) {
      setErrorMsg('Describe cómo debe moverse la imagen.');
      return;
    }
    setConfirmOpen(false);
    setPhase('running');
    setErrorMsg('');
    setElapsed(0);
    startRef.current = Date.now();
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visual_id: visual.id,
          motion_prompt: prompt,
          engine,
          ...(engine === 'runway' && { runway_model: runwayModel, duration: runwayDuration }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error generando el vídeo');
      if (json.status === 'generating') {
        // Runway: la tarea quedó lanzada en el servidor; consultamos hasta que termine.
        setRunwayStatus('PENDING');
        onGenerated({
          video_url: visual.video_url ?? null,
          video_status: 'generating',
          video_motion_prompt: prompt,
          video_generated_at: visual.video_generated_at ?? null,
          video_model: json.video_model ?? `runway-${runwayModel}`,
        });
        void pollRunway();
        return;
      }
      setVideoUrl(json.video_url);
      setPhase('done');
      onGenerated({
        video_url: json.video_url,
        video_status: 'ready',
        video_motion_prompt: json.video_motion_prompt ?? prompt,
        video_generated_at: json.video_generated_at ?? new Date().toISOString(),
        video_model:
          json.video_model ?? (engine === 'runway' ? `runway-${runwayModel}` : VIDEO_GENERATION_MODEL),
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error desconocido');
      setPhase('error');
    }
  }, [motionPrompt, visual.id, visual.video_url, visual.video_generated_at, onGenerated, engine, runwayModel, runwayDuration, pollRunway]);

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
          {(phase !== 'running' || backgroundJob) && (
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
                      {runwayStatus === 'THROTTLED' || runwayStatus === 'PENDING'
                        ? 'En cola en Runway… empezará en cuanto haya hueco'
                        : runwayStatus === 'SAVING'
                          ? 'Guardando el vídeo…'
                          : 'Generando vídeo… puede tardar varios minutos'}
                    </p>
                    {backgroundJob && (
                      <p className="text-white/80 text-[10px] text-center px-6 max-w-xs">
                        Puedes cerrar esta ventana: el vídeo se sigue generando y aparecerá en la galería. Si vuelves a abrirla, verás cómo va.
                      </p>
                    )}
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

            <div className="space-y-2">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-surface-500">
                Motor de vídeo{isReel && <> &middot; <span className="text-rose-600">Reel</span></>}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'runway', label: 'Runway', hint: isReel ? 'Recomendado para reels' : 'Gen-4.5 · 5–10s' },
                    { id: 'veo', label: 'Google Veo', hint: `Veo 3.1 Fast · ${VIDEO_GENERATION_DURATION_SECONDS}s` },
                  ] as { id: VideoEngine; label: string; hint: string }[]
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={phase === 'running'}
                    onClick={() => setEngine(opt.id)}
                    aria-pressed={engine === opt.id}
                    className={`text-left border-2 border-surface-900 px-3 py-2 transition-all disabled:opacity-60 ${
                      engine === opt.id
                        ? 'bg-surface-900 text-white shadow-none'
                        : 'bg-white text-surface-900 shadow-brutal-sm hover:bg-surface-50'
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wider">{opt.label}</span>
                    <span className={`block text-[10px] mt-0.5 ${engine === opt.id ? 'text-white/70' : 'text-surface-500'}`}>
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>

              {engine === 'runway' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-1">
                      Modelo
                    </span>
                    <select
                      value={runwayModel}
                      disabled={phase === 'running'}
                      onChange={e => setRunwayModel(e.target.value as RunwayVideoModel)}
                      className="w-full text-xs border-2 border-surface-300 p-2 bg-white focus:border-brand-500 focus:outline-none"
                    >
                      {RUNWAY_VIDEO_MODELS.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-1">
                      Duración
                    </span>
                    <select
                      value={runwayDuration}
                      disabled={phase === 'running'}
                      onChange={e => setRunwayDuration(Number(e.target.value) as RunwayDuration)}
                      className="w-full text-xs border-2 border-surface-300 p-2 bg-white focus:border-brand-500 focus:outline-none"
                    >
                      {RUNWAY_DURATIONS.map(d => (
                        <option key={d} value={d}>
                          {d} segundos
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="bg-surface-50 border border-surface-200 p-3 text-xs text-surface-600 leading-relaxed space-y-1">
              {engine === 'runway' ? (
                <>
                  <p>
                    Modelo: <strong>Runway {getRunwayModel(runwayModel).label}</strong> · clip de {runwayDuration}s.{' '}
                    {getRunwayModel(runwayModel).description}
                  </p>
                  <p>
                    Coste estimado: <strong>~${costUsd.toFixed(2)}</strong> por clip (
                    {getRunwayModel(runwayModel).creditsPerSecond * runwayDuration} créditos Runway).
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Modelo: <strong>{VIDEO_GENERATION_MODEL}</strong> · clip de ~{VIDEO_GENERATION_DURATION_SECONDS}s.
                  </p>
                  <p>
                    Coste estimado: <strong>~${costUsd.toFixed(2)}</strong> por clip. El vídeo es bastante más caro que una imagen.
                  </p>
                </>
              )}
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
          {phase === 'running' && backgroundJob ? (
            <>
              <span className="text-xs font-bold uppercase tracking-wider text-surface-500 mr-auto">
                Generando en Runway…
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                Cerrar y seguir en segundo plano
              </button>
            </>
          ) : phase === 'running' ? (
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
                onClick={requestGeneration}
                className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all hover:bg-brand-700"
              >
                {phase === 'done' || visual.video_url ? 'Regenerar vídeo' : 'Generar vídeo'} · ~${costUsd.toFixed(2)}
              </button>
            </>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="video-cost-title"
            className="bg-white border-2 border-surface-900 shadow-brutal w-full max-w-md animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-amber-100 border-b-2 border-surface-900 px-5 py-3">
              <h3
                id="video-cost-title"
                className="font-display font-bold text-surface-900 uppercase tracking-wider text-sm"
              >
                Confirmar generación de vídeo
              </h3>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-surface-900">
                    {engine === 'runway' ? runwayDuration : VIDEO_GENERATION_DURATION_SECONDS}s
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Clip</div>
                </div>
                <div className="bg-amber-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-amber-700">~1-4</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Minutos</div>
                </div>
                <div className="bg-red-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-red-700">${costUsd.toFixed(2)}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Coste est.</div>
                </div>
              </div>

              <div className="bg-surface-50 border border-surface-200 p-3 text-xs text-surface-600 leading-relaxed space-y-1">
                {engine === 'runway' ? (
                  <p>
                    Se genera con <strong>Runway {getRunwayModel(runwayModel).label}</strong>:{' '}
                    {getRunwayModel(runwayModel).creditsPerSecond * runwayDuration} créditos (
                    {getRunwayModel(runwayModel).creditsPerSecond} créditos/s × {runwayDuration}s, 1 crédito = $0,01).
                    Se descuenta de tu saldo de Runway.
                  </p>
                ) : (
                  <p>
                    Se genera con <strong>{VIDEO_GENERATION_MODEL}</strong> (Google Veo). Se factura en tu cuenta de
                    Google AI.
                  </p>
                )}
                {visual.video_url && (
                  <p>
                    Este visual <strong>ya tiene vídeo</strong>: regenerarlo vuelve a cobrar el clip completo y
                    sustituye el actual.
                  </p>
                )}
                <p>Si falla la generación, normalmente no se cobra. No cierres la ventana mientras se genera.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t-2 border-surface-900 bg-surface-50">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-4 py-2 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => void runGeneration()}
                className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-4 py-2 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all hover:bg-brand-700"
              >
                {visual.video_url ? 'Regenerar' : 'Generar'} por ~${costUsd.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
