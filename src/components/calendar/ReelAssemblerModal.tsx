'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ContentItem, ContentItemVisual } from '@/types';
import { getVisualDisplayUrl } from '@/lib/visual-image';
import { createClient } from '@/lib/supabase/client';
import { captionLooksCut, suggestSceneTexts, type ReelAssembly } from '@/lib/reel-assembler';
import { RUNWAY_VIDEO_MODELS, estimateRunwayCostUsd, getRunwayModel, type RunwayVideoModel } from '@/lib/ai/constants';

type Phase = 'form' | 'animating' | 'rendering' | 'uploading' | 'done' | 'error';
type AnimState = 'queued' | 'generating' | 'ready' | 'error';

type Overlay = {
  texts: string[];
  location: string;
  closingA: string;
  closingB: string;
  brand: string;
  brandSub: string;
  cta: string;
  accent: string;
};

export interface ReelAssemblerModalProps {
  item: ContentItem;
  visuals: ContentItemVisual[];
  projectName: string;
  onClose: () => void;
  onSaved: (patch: { reel_video_url: string; reel_video_generated_at: string }) => void;
  /** Actualiza el visual en la galería cuando su clip queda listo. */
  onVisualPatched?: (visualId: string, patch: Partial<ContentItemVisual>) => void;
}

const BUCKET = 'visual-assets';

function fileName(projectName: string, date: string) {
  const base = `${projectName} ${date} REEL`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return `${base || 'reel'}.mp4`;
}

/**
 * «Montar reel»: une los clips animados de cada escena (o la imagen con movimiento
 * suave si aún no tiene clip) con un texto por escena, barras de progreso, marca y
 * tarjeta final. El MP4 se genera en el navegador (`lib/reel-assembler.ts`), se
 * sube a Storage con URL firmada y queda guardado en el post (`reel_video_url`).
 */
export function ReelAssemblerModal({ item, visuals, projectName, onClose, onSaved, onVisualPatched }: ReelAssemblerModalProps) {
  const [mounted, setMounted] = useState(false);
  const scenes = useMemo(
    () => [...visuals].sort((a, b) => a.visual_index - b.visual_index).filter(v => v.video_url || getVisualDisplayUrl(v)),
    [visuals],
  );
  // Clips de cada escena (los que ya había + los que se animan desde este modal)
  const [clipUrls, setClipUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(visuals.filter(v => v.video_url).map(v => [v.id, v.video_url as string])),
  );
  const [anim, setAnim] = useState<Record<string, AnimState>>(() =>
    Object.fromEntries(
      visuals
        .filter(v => v.video_status === 'generating' && v.video_model?.startsWith('runway-'))
        .map(v => [v.id, 'generating' as AnimState]),
    ),
  );
  const [runwayModel, setRunwayModel] = useState<RunwayVideoModel>('gen4.5');
  const [clipSeconds, setClipSeconds] = useState<5 | 10>(5);
  const [confirmAnim, setConfirmAnim] = useState(false);
  const aliveRef = useRef(true);
  const savedOverlay = (item as { reel_overlay_json?: Overlay | null }).reel_overlay_json;
  const rewriteTexts = useMemo(() => {
    const texts = savedOverlay && Array.isArray(savedOverlay.texts) ? savedOverlay.texts : [];
    if (texts.length === 0) return true;
    return texts.some(captionLooksCut);
  }, [savedOverlay]);
  const initial = useMemo<Overlay>(() => {
    if (!rewriteTexts && savedOverlay && Array.isArray(savedOverlay.texts)) {
      return { ...savedOverlay, texts: scenes.map((_, i) => savedOverlay.texts[i] ?? '') };
    }
    const s = suggestSceneTexts(item.copy || '', scenes.length, item.cta || '');
    return {
      texts: s.scenes,
      location: '',
      closingA: s.closingA,
      closingB: s.closingB,
      brand: projectName,
      brandSub: '',
      cta: s.cta,
      accent: savedOverlay?.accent || '#f26b3a',
    };
  }, [item, scenes, projectName, rewriteTexts, savedOverlay]);

  const [ov, setOv] = useState<Overlay>(initial);
  const [phase, setPhase] = useState<Phase>('form');
  const [pct, setPct] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>((item as any).reel_video_url || null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const textsCut = ov.texts.some(captionLooksCut) || captionLooksCut(ov.closingA) || captionLooksCut(ov.closingB);
  const clipCount = scenes.filter(v => clipUrls[v.id]).length;
  const missing = scenes.filter(v => !clipUrls[v.id] && anim[v.id] !== 'generating');
  const animCost = missing.length * estimateRunwayCostUsd(runwayModel, clipSeconds);
  const busy = phase === 'rendering' || phase === 'uploading' || phase === 'animating';

  useEffect(() => {
    setMounted(true);
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    fetch('/api/video-lab?view=recipe')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j) return;
        if (j.model === 'gen4.5' || j.model === 'gen4_turbo') setRunwayModel(j.model);
        if (j.duration === 5 || j.duration === 10) setClipSeconds(j.duration);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);
  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  const set = <K extends keyof Overlay>(k: K, v: Overlay[K]) => setOv(prev => ({ ...prev, [k]: v }));

  const suggest = useCallback(async () => {
    setSuggesting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/reel-assembly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', content_item_id: item.id, scene_count: scenes.length }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudieron sugerir los textos');
      const keep = (next: unknown, prev: string) => {
        const t = String(next || '').trim();
        return t && !captionLooksCut(t) ? t : prev;
      };
      setOv(prev => ({
        ...prev,
        texts: scenes.map((_, i) => keep(json.scenes?.[i], prev.texts[i] || '')),
        closingA: keep(json.closing_a, prev.closingA),
        closingB: keep(json.closing_b, prev.closingB),
        cta: keep(json.cta, prev.cta),
        location: json.location || prev.location,
        brandSub: json.brand_sub || prev.brandSub,
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error sugiriendo textos');
    } finally {
      setSuggesting(false);
    }
  }, [item.id, scenes]);

  const rewriteOnce = useRef(false);
  useEffect(() => {
    if (!rewriteTexts || rewriteOnce.current || scenes.length === 0) return;
    rewriteOnce.current = true;
    void suggest();
  }, [rewriteTexts, scenes.length, suggest]);

  const renderWith = useCallback(async (clips: Record<string, string>) => {
    if (ov.texts.some(captionLooksCut) || captionLooksCut(ov.closingA) || captionLooksCut(ov.closingB)) {
      setErrorMsg('Hay un rótulo a medias. Termina la frase antes de montar.');
      return;
    }
    setPhase('rendering');
    setPct(0);
    setErrorMsg('');
    try {
      const { assembleReel } = await import('@/lib/reel-assembler');
      const data: ReelAssembly = {
        scenes: scenes.map((v, i) => ({
          videoUrl: clips[v.id] || v.video_url || null,
          imageUrl: getVisualDisplayUrl(v),
          text: ov.texts[i] || '',
        })),
        brand: ov.brand || projectName,
        brandSub: ov.brandSub,
        location: ov.location,
        closingA: ov.closingA,
        closingB: ov.closingB,
        cta: ov.cta,
        accent: ov.accent,
      };
      const result = await assembleReel(data, {
        sceneSeconds: clipSeconds,
        onProgress: (r, label) => {
          setPct(Math.round(r * 100));
          if (label) setStepLabel(label);
        },
      });
      blobRef.current = result.blob;
      const url = URL.createObjectURL(result.blob);
      setLocalUrl(url);

      // Subida directa a Storage con URL firmada + guardado en el post
      setPhase('uploading');
      const signRes = await fetch('/api/reel-assembly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign', content_item_id: item.id, ext: result.ext }),
      });
      const sign = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(sign.error || 'No se pudo preparar la subida');
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(sign.path, sign.token, result.blob, { contentType: result.mime, upsert: true });
      if (upErr) throw new Error(`No se pudo subir el reel: ${upErr.message}`);
      const saveRes = await fetch('/api/reel-assembly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', content_item_id: item.id, path: sign.path, overlay: ov }),
      });
      const saved = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saved.error || 'No se pudo guardar el reel');
      setResultUrl(saved.reel_video_url);
      onSaved({ reel_video_url: saved.reel_video_url, reel_video_generated_at: saved.reel_video_generated_at });
      setPhase('done');
    } catch (err: any) {
      console.error('[reel-assembler]', err);
      setErrorMsg(err?.message || 'Error montando el reel');
      // Si el vídeo se generó pero falló la subida, aún se puede descargar.
      setPhase(blobRef.current ? 'done' : 'error');
    }
  }, [scenes, ov, projectName, item.id, onSaved]);
  const renderWithRef = useRef(renderWith);
  renderWithRef.current = renderWith;
  const render = useCallback(() => renderWith(clipUrls), [renderWith, clipUrls]);

  /** Consulta cada 8 s los clips en curso hasta que todos terminen. Devuelve los clips listos. */
  const waitForClips = useCallback(
    async (ids: string[], known: Record<string, string>) => {
      const urls = { ...known };
      let pending = ids.filter(id => !urls[id]);
      while (pending.length && aliveRef.current) {
        await new Promise(r => setTimeout(r, 8000));
        for (const id of pending) {
          try {
            const res = await fetch(`/api/generate-video?visual_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
            const json = await res.json().catch(() => ({}));
            if (json.status === 'ready' && json.video_url) {
              urls[id] = json.video_url;
              setClipUrls(prev => ({ ...prev, [id]: json.video_url }));
              setAnim(prev => ({ ...prev, [id]: 'ready' }));
              onVisualPatched?.(id, {
                video_url: json.video_url,
                video_status: 'ready',
                video_model: json.video_model ?? `runway-${runwayModel}`,
                video_generated_at: json.video_generated_at ?? new Date().toISOString(),
              });
            } else if (json.status === 'error' || (!res.ok && res.status !== 500)) {
              setAnim(prev => ({ ...prev, [id]: 'error' }));
              urls[id] = '';
            } else {
              setAnim(prev => ({ ...prev, [id]: json.runway_status === 'RUNNING' ? 'generating' : prev[id] === 'queued' ? 'queued' : 'generating' }));
            }
          } catch {
            /* reintenta en la siguiente vuelta */
          }
        }
        pending = pending.filter(id => urls[id] === undefined);
        const done = ids.length - pending.length;
        setStepLabel(`Animando escenas con Runway… ${done}/${ids.length} listas`);
        setPct(Math.round((done / ids.length) * 100));
      }
      return urls;
    },
    [onVisualPatched, runwayModel],
  );

  /** Anima con Runway las escenas sin clip (en bloque) y, al terminar, monta el reel. */
  const animateAndAssemble = useCallback(async () => {
    setConfirmAnim(false);
    setErrorMsg('');
    setPhase('animating');
    setPct(0);
    setStepLabel('Preparando el movimiento de cada escena…');
    try {
      const todo = scenes.filter(v => !clipUrls[v.id] && anim[v.id] !== 'generating');
      const already = scenes.filter(v => anim[v.id] === 'generating').map(v => v.id);
      let motions: Record<string, string> = {};
      if (todo.length) {
        const mRes = await fetch('/api/reel-assembly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'motions', content_item_id: item.id, visual_ids: todo.map(v => v.id) }),
        });
        const mJson = await mRes.json().catch(() => ({}));
        if (!mRes.ok) throw new Error(mJson.error || 'No se pudo preparar el movimiento de las escenas');
        motions = mJson.motions || {};
      }
      setStepLabel('Enviando escenas a Runway…');
      const launched: string[] = [];
      const rejected: string[] = [];
      for (const v of todo) {
        setAnim(prev => ({ ...prev, [v.id]: 'queued' }));
        const body = {
          visual_id: v.id,
          motion_prompt: motions[v.id] || v.video_motion_prompt || 'Natural realistic motion with a slow cinematic camera move.',
          engine: 'runway',
          runway_model: runwayModel,
          duration: clipSeconds,
        };
        let res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        let json = await res.json().catch(() => ({}));
        // Runway procesa pocas tareas a la vez: si hay cola, espera y reintenta una vez.
        if (res.status === 429) {
          setStepLabel('Runway tiene cola. Reintentando esta escena…');
          await new Promise(r => setTimeout(r, 20000));
          res = await fetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          json = await res.json().catch(() => ({}));
        }
        if (!res.ok) {
          setAnim(prev => ({ ...prev, [v.id]: 'error' }));
          rejected.push(json.error || `Escena ${v.visual_index + 1}`);
          continue;
        }
        launched.push(v.id);
        onVisualPatched?.(v.id, { video_status: 'generating', video_model: `runway-${runwayModel}` });
      }
      if (!launched.length && !already.length) {
        throw new Error(rejected[0] || 'Runway no aceptó ninguna escena');
      }
      setStepLabel(`Animando escenas con Runway… 0/${launched.length + already.length} listas`);
      const urls = await waitForClips([...launched, ...already], clipUrls);
      if (!aliveRef.current) return;
      const failed = [...launched, ...already].filter(id => !urls[id]);
      if (failed.length) {
        setErrorMsg(`${failed.length} escena(s) no se pudieron animar; esas irán con la imagen y movimiento suave.`);
      }
      const readyUrls = Object.fromEntries(Object.entries(urls).filter(([, u]) => u));
      setClipUrls(prev => ({ ...prev, ...readyUrls }));
      await renderWithRef.current({ ...clipUrls, ...readyUrls });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error animando las escenas');
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, clipUrls, anim, item.id, runwayModel, waitForClips, onVisualPatched]);

  // Si al abrir hay escenas generándose (se cerró el modal antes), sigue esperándolas y monta al terminar.
  useEffect(() => {
    const ids = Object.keys(anim).filter(id => anim[id] === 'generating');
    if (!ids.length) return;
    setPhase('animating');
    void (async () => {
      const urls = await waitForClips(ids, clipUrls);
      if (!aliveRef.current) return;
      const readyUrls = Object.fromEntries(Object.entries(urls).filter(([, u]) => u));
      await renderWithRef.current({ ...clipUrls, ...readyUrls });
    })();
    // solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = useCallback(async () => {
    const name = fileName(projectName, item.scheduled_date);
    let blob = blobRef.current;
    if (!blob && resultUrl) blob = await (await fetch(resultUrl)).blob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, [projectName, item.scheduled_date, resultUrl]);

  if (!mounted) return null;
  const preview = localUrl || resultUrl;
  const inputCls =
    'w-full text-sm border-2 border-surface-300 p-2 focus:border-brand-500 focus:outline-none disabled:opacity-60 bg-white';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-surface-500 mb-1';

  const content = (
    <div
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reel-asm-title"
    >
      <div className="bg-white border-2 border-surface-900 shadow-brutal-lg w-full sm:max-w-5xl max-h-[100dvh] sm:max-h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b-2 border-surface-900 px-5 py-4 shrink-0">
          <div>
            <h4 id="reel-asm-title" className="font-display font-bold text-surface-900 text-lg leading-tight">
              Montar reel
            </h4>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-400 mt-0.5">
              {scenes.length} escenas · {clipCount} con clip animado
              {Object.values(anim).some(a => a === 'generating' || a === 'queued') && ' · animando en Runway'}
            </p>
          </div>
          {(!busy || phase === 'animating') && (
            <button type="button" onClick={onClose} className="p-2 text-surface-600 hover:bg-surface-100" aria-label="Cerrar">
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto">
          {/* Vista previa */}
          <div className="md:w-[38%] bg-surface-900/5 p-4 flex flex-col items-center justify-center gap-3 min-h-[260px]">
            {preview && !busy ? (
              <video
                key={preview}
                src={preview}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="max-w-full max-h-[64vh] border-2 border-surface-900 bg-black"
              />
            ) : busy ? (
              <div className="w-full max-w-xs text-center space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-surface-700">
                  {phase === 'uploading' ? 'Guardando en GestIA…' : stepLabel || 'Montando el reel…'}
                </p>
                {phase === 'animating' && (
                  <p className="text-[11px] text-surface-500">
                    Runway hace las escenas de una en una: cuenta 1–2 min por escena. Si cierras, siguen generándose; vuelve a «Montar reel» para terminar.
                  </p>
                )}
                <div className="h-3 border-2 border-surface-900 bg-white">
                  <div className="h-full bg-brand-600 transition-all" style={{ width: `${phase === 'uploading' ? 100 : pct}%` }} />
                </div>
                <p className="text-[11px] text-surface-500">
                  {phase === 'uploading' ? 'Subiendo el vídeo…' : phase === 'animating' ? `${pct}%` : `${pct}% · no cierres esta ventana (1–2 min)`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
                {scenes.map(v => (
                  <img
                    key={v.id}
                    src={getVisualDisplayUrl(v) || ''}
                    alt={v.label || ''}
                    className="aspect-[9/16] object-cover w-full border-2 border-surface-900"
                  />
                ))}
              </div>
            )}
            {phase === 'done' && (
              <p className="text-[11px] text-center text-surface-600 max-w-xs">
                Vertical 1080×1920, sin audio: añade la música en Instagram al publicar.
              </p>
            )}
          </div>

          {/* Textos */}
          <div className="md:w-[62%] border-t-2 md:border-t-0 md:border-l-2 border-surface-900 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-surface-500">Texto de cada escena</span>
              <button
                type="button"
                onClick={() => void suggest()}
                disabled={busy || suggesting}
                className="text-[10px] font-bold uppercase tracking-wider text-surface-900 bg-amber-200 border-2 border-surface-900 px-3 py-1 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
              >
                {suggesting ? 'Sugiriendo…' : '✨ Sugerir textos con IA'}
              </button>
            </div>
            {suggesting && (
              <p className="text-[11px] text-surface-500">Reescribiendo los rótulos para que cada frase se entienda sola.</p>
            )}
            {textsCut && !suggesting && (
              <p className="text-[11px] text-red-700">Hay una frase cortada. Termínala antes de montar: en el vídeo no se lee lo que queda detrás de los puntos suspensivos.</p>
            )}

            <div className="space-y-2">
              {scenes.map((v, i) => (
                <div key={v.id} className="flex gap-3 items-start">
                  <div className="relative shrink-0">
                    <img
                      src={getVisualDisplayUrl(v) || ''}
                      alt=""
                      className="w-12 h-[86px] object-cover border-2 border-surface-900"
                    />
                    <span
                      className={`absolute -bottom-1 -right-1 text-[9px] font-bold px-1 border border-surface-900 ${
                        clipUrls[v.id]
                          ? 'bg-fuchsia-600 text-white'
                          : anim[v.id] === 'error'
                            ? 'bg-red-600 text-white'
                            : anim[v.id]
                              ? 'bg-amber-300 text-surface-900 animate-pulse'
                              : 'bg-white text-surface-600'
                      }`}
                      title={clipUrls[v.id] ? 'Clip animado' : anim[v.id] ? 'Animando en Runway' : 'Sin clip todavía'}
                    >
                      {clipUrls[v.id] ? '▶' : anim[v.id] === 'error' ? '!' : anim[v.id] ? '…' : 'IMG'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor={`reel-txt-${i}`} className={labelCls}>
                      Escena {i + 1}
                      {v.label ? ` · ${v.label.replace(/^Fotograma clave\s*[–-]\s*/i, '')}` : ''}
                    </label>
                    <textarea
                      id={`reel-txt-${i}`}
                      rows={2}
                      value={ov.texts[i] || ''}
                      disabled={busy}
                      onChange={e => set('texts', ov.texts.map((t, k) => (k === i ? e.target.value : t)))}
                      placeholder="Ej.: El Valle de Ricote no se visita con prisa."
                      className={`${inputCls} resize-y`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reel-loc" className={labelCls}>Ubicación (escena 1, opcional)</label>
                <input id="reel-loc" value={ov.location} disabled={busy} onChange={e => set('location', e.target.value)} placeholder="Valle de Ricote · Murcia" className={inputCls} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label htmlFor="reel-brand" className={labelCls}>Marca</label>
                  <input id="reel-brand" value={ov.brand} disabled={busy} onChange={e => set('brand', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="reel-accent" className={labelCls}>Color</label>
                  <input id="reel-accent" type="color" value={ov.accent} disabled={busy} onChange={e => set('accent', e.target.value)} className="h-[42px] w-14 border-2 border-surface-300 bg-white p-1" />
                </div>
              </div>
              <div>
                <label htmlFor="reel-ca" className={labelCls}>Cierre · frase 1</label>
                <input id="reel-ca" value={ov.closingA} disabled={busy} onChange={e => set('closingA', e.target.value)} placeholder="Hay rutas que no necesitan muchas paradas;" className={inputCls} />
              </div>
              <div>
                <label htmlFor="reel-cb" className={labelCls}>Cierre · frase 2 (en color)</label>
                <input id="reel-cb" value={ov.closingB} disabled={busy} onChange={e => set('closingB', e.target.value)} placeholder="necesitan más tiempo en cada una." className={inputCls} />
              </div>
              <div>
                <label htmlFor="reel-sub" className={labelCls}>Bajo la marca</label>
                <input id="reel-sub" value={ov.brandSub} disabled={busy} onChange={e => set('brandSub', e.target.value)} placeholder="Campervans" className={inputCls} />
              </div>
              <div>
                <label htmlFor="reel-cta" className={labelCls}>Línea final</label>
                <input id="reel-cta" value={ov.cta} disabled={busy} onChange={e => set('cta', e.target.value)} placeholder="Compártelo con quien quiere conocer el Valle." className={inputCls} />
              </div>
            </div>

            {missing.length > 0 && !busy && (
              <div className="bg-amber-50 border-2 border-surface-900 px-3 py-2 text-xs text-surface-800 space-y-2">
                <p>
                  <strong>{missing.length} de {scenes.length} escenas</strong> aún no tienen clip animado. Con «Animar y montar» se animan con
                  Runway (movimiento real: gente, vehículos, cámara) y después se monta el reel automáticamente.
                </p>
                <label className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-surface-500">Modelo</span>
                  <select
                    value={runwayModel}
                    onChange={e => setRunwayModel(e.target.value as RunwayVideoModel)}
                    className="text-xs border-2 border-surface-300 p-1 bg-white"
                  >
                    {RUNWAY_VIDEO_MODELS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.label} · ${estimateRunwayCostUsd(m.id, clipSeconds).toFixed(2)}/escena
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {errorMsg && (
              <div className="bg-red-50 border-2 border-surface-900 text-red-700 px-3 py-2 text-xs font-bold">{errorMsg}</div>
            )}
            {phase === 'done' && resultUrl && !errorMsg && (
              <div className="bg-emerald-50 border-2 border-surface-900 text-emerald-800 px-3 py-2 text-xs font-bold">
                Reel montado y guardado en la publicación.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t-2 border-surface-900 px-5 py-4 shrink-0">
          {phase === 'animating' ? (
            <>
              <span className="text-xs font-bold uppercase tracking-wider text-surface-500 mr-auto">Animando en Runway…</span>
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none"
              >
                Cerrar y seguir en segundo plano
              </button>
            </>
          ) : busy ? (
            <span className="text-xs font-bold uppercase tracking-wider text-surface-500">Montando… no cierres esta ventana</span>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                Cerrar
              </button>
              {(resultUrl || blobRef.current) && (
                <button
                  type="button"
                  onClick={() => void download()}
                  className="text-xs font-bold uppercase tracking-wider text-white bg-surface-900 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  Descargar MP4
                </button>
              )}
              {missing.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => void render()}
                    disabled={scenes.length === 0 || textsCut}
                    className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-4 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
                    title="Monta ya con las imágenes (sin animar con Runway)"
                  >
                    Montar sin animar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAnim(true)}
                    disabled={textsCut}
                    className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all hover:bg-brand-700 disabled:opacity-50"
                  >
                    🎬 Animar {missing.length} escenas y montar · ~${animCost.toFixed(2)}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void render()}
                  disabled={scenes.length === 0 || textsCut}
                  className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all hover:bg-brand-700 disabled:opacity-50"
                >
                  {resultUrl ? 'Volver a montar' : '🎬 Montar reel'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {confirmAnim && (
        <div className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmAnim(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reel-anim-cost"
            className="bg-white border-2 border-surface-900 shadow-brutal w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-amber-100 border-b-2 border-surface-900 px-5 py-3">
              <h3 id="reel-anim-cost" className="font-display font-bold text-surface-900 uppercase tracking-wider text-sm">
                Confirmar animación del reel
              </h3>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-surface-900">{missing.length}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Escenas</div>
                </div>
                <div className="bg-amber-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-amber-700">~{Math.max(2, missing.length * 2)}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Minutos</div>
                </div>
                <div className="bg-red-50 border-2 border-surface-900 p-3 text-center">
                  <div className="text-2xl font-bold font-mono text-red-700">${animCost.toFixed(2)}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Coste est.</div>
                </div>
              </div>
              <div className="bg-surface-50 border border-surface-200 p-3 text-xs text-surface-600 leading-relaxed space-y-1">
                <p>
                  Cada escena se anima con <strong>Runway {getRunwayModel(runwayModel).label}</strong> ({clipSeconds} s):{' '}
                  {getRunwayModel(runwayModel).creditsPerSecond * clipSeconds} créditos por escena,{' '}
                  {getRunwayModel(runwayModel).creditsPerSecond * clipSeconds * missing.length} en total (1 crédito = $0,01).
                </p>
                <p>La IA escribe el movimiento de cada escena a partir de su descripción. Al terminar, el reel se monta solo con los textos.</p>
                <p>Montar el reel no cuesta nada; solo se paga la animación.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t-2 border-surface-900 bg-surface-50">
              <button
                type="button"
                onClick={() => setConfirmAnim(false)}
                className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-4 py-2 shadow-brutal-sm hover:shadow-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => void animateAndAssemble()}
                className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-4 py-2 shadow-brutal-sm hover:shadow-none hover:bg-brand-700"
              >
                Animar y montar por ~${animCost.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
