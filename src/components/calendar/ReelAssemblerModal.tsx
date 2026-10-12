'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ContentItem, ContentItemVisual } from '@/types';
import { getVisualDisplayUrl } from '@/lib/visual-image';
import { createClient } from '@/lib/supabase/client';
import { suggestSceneTexts, type ReelAssembly } from '@/lib/reel-assembler';

type Phase = 'form' | 'rendering' | 'uploading' | 'done' | 'error';

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
export function ReelAssemblerModal({ item, visuals, projectName, onClose, onSaved }: ReelAssemblerModalProps) {
  const [mounted, setMounted] = useState(false);
  const scenes = useMemo(
    () => [...visuals].sort((a, b) => a.visual_index - b.visual_index).filter(v => v.video_url || getVisualDisplayUrl(v)),
    [visuals],
  );
  const initial = useMemo<Overlay>(() => {
    const saved = (item as any).reel_overlay_json as Overlay | null | undefined;
    if (saved && Array.isArray(saved.texts)) {
      return { ...saved, texts: scenes.map((_, i) => saved.texts[i] ?? '') };
    }
    const s = suggestSceneTexts(item.copy || '', scenes.length);
    return {
      texts: s.scenes,
      location: '',
      closingA: s.closingA,
      closingB: s.closingB,
      brand: projectName,
      brandSub: '',
      cta: s.cta,
      accent: '#f26b3a',
    };
  }, [item, scenes, projectName]);

  const [ov, setOv] = useState<Overlay>(initial);
  const [phase, setPhase] = useState<Phase>('form');
  const [pct, setPct] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>((item as any).reel_video_url || null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const clipCount = scenes.filter(v => v.video_url).length;
  const busy = phase === 'rendering' || phase === 'uploading';

  useEffect(() => setMounted(true), []);
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
      setOv(prev => ({
        ...prev,
        texts: scenes.map((_, i) => json.scenes?.[i] || prev.texts[i] || ''),
        closingA: json.closing_a || prev.closingA,
        closingB: json.closing_b || prev.closingB,
        cta: json.cta || prev.cta,
        location: json.location || prev.location,
        brandSub: json.brand_sub || prev.brandSub,
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error sugiriendo textos');
    } finally {
      setSuggesting(false);
    }
  }, [item.id, scenes]);

  const render = useCallback(async () => {
    setPhase('rendering');
    setPct(0);
    setErrorMsg('');
    try {
      const { assembleReel } = await import('@/lib/reel-assembler');
      const data: ReelAssembly = {
        scenes: scenes.map((v, i) => ({
          videoUrl: v.video_url || null,
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
              {clipCount < scenes.length && ' · el resto con movimiento suave'}
            </p>
          </div>
          {!busy && (
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
                <div className="h-3 border-2 border-surface-900 bg-white">
                  <div className="h-full bg-brand-600 transition-all" style={{ width: `${phase === 'uploading' ? 100 : pct}%` }} />
                </div>
                <p className="text-[11px] text-surface-500">
                  {phase === 'uploading' ? 'Subiendo el vídeo…' : `${pct}% · no cierres esta ventana (1–2 min)`}
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
                        v.video_url ? 'bg-fuchsia-600 text-white' : 'bg-white text-surface-600'
                      }`}
                      title={v.video_url ? 'Clip animado' : 'Sin clip: imagen con movimiento suave'}
                    >
                      {v.video_url ? '▶' : 'IMG'}
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

            {clipCount === 0 && (
              <div className="bg-amber-50 border-2 border-surface-900 px-3 py-2 text-xs text-surface-800">
                Ninguna escena tiene clip animado todavía. Anima primero cada escena con «Animar» (Runway) para que el reel tenga movimiento real; si no, se montará con las imágenes y un movimiento de cámara suave.
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
          {busy ? (
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
              <button
                type="button"
                onClick={() => void render()}
                disabled={scenes.length === 0}
                className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-5 py-2.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all hover:bg-brand-700 disabled:opacity-50"
              >
                {resultUrl ? 'Volver a montar' : '🎬 Montar reel'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
