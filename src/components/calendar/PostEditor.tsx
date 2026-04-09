'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContentItem, ContentItemStatus, ProductionSpecs, ContentItemVisual, ImageGenerationStatus } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

function buildProductionSpecs(
  numSlides: string,
  durationSeconds: string,
  mediaType: string,
  sceneSummary: string
): ProductionSpecs | null {
  const o: ProductionSpecs = {};
  const n = numSlides.trim() ? parseInt(numSlides, 10) : NaN;
  const d = durationSeconds.trim() ? parseInt(durationSeconds, 10) : NaN;
  if (Number.isFinite(n) && n > 0) o.num_slides = n;
  if (Number.isFinite(d) && d > 0) o.duration_seconds = d;
  if (mediaType === 'imagen' || mediaType === 'video') o.media_type = mediaType;
  if (sceneSummary.trim()) o.scene_summary = sceneSummary.trim();
  return Object.keys(o).length ? o : null;
}

interface PostEditorProps {
  item: ContentItem;
  onSave: (updates: Partial<ContentItem>) => void;
  /** Guarda solo el estado (borrador / aprobado / …) sin marcar is_edited ni cerrar el modal */
  onStatusChange?: (status: ContentItemStatus) => void | Promise<void>;
  onClose: () => void;
  onDelete?: () => void | Promise<void>;
  onGenerateBrief?: () => void | Promise<void>;
  generatingBrief?: boolean;
}

const STATUS_OPTIONS: { value: ContentItemStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'published', label: 'Publicado' },
  { value: 'archived', label: 'Archivado' },
];

export function PostEditor({ item, onSave, onStatusChange, onClose, onDelete, onGenerateBrief, generatingBrief }: PostEditorProps) {
  const [deleting, setDeleting] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const [idea, setIdea] = useState(item.idea);
  const [copy, setCopy] = useState(item.copy || '');
  const [cta, setCta] = useState(item.cta || '');
  const [postGoal, setPostGoal] = useState(item.post_goal || '');
  const [hashtags, setHashtags] = useState(item.hashtags?.join(', ') || '');
  const [status, setStatus] = useState<ContentItemStatus>(item.status);

  const [numSlides, setNumSlides] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [mediaType, setMediaType] = useState<string>('');
  const [sceneSummary, setSceneSummary] = useState('');
  const [visualBrief, setVisualBrief] = useState('');
  const [visualPrompt, setVisualPrompt] = useState('');

  const [visuals, setVisuals] = useState<ContentItemVisual[]>([]);
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    setIdea(item.idea);
    setCopy(item.copy || '');
    setCta(item.cta || '');
    setPostGoal(item.post_goal || '');
    setHashtags(item.hashtags?.join(', ') || '');
    const ps = item.production_specs;
    setNumSlides(ps?.num_slides != null ? String(ps.num_slides) : '');
    setDurationSeconds(ps?.duration_seconds != null ? String(ps.duration_seconds) : '');
    setMediaType(ps?.media_type ?? '');
    setSceneSummary(ps?.scene_summary || '');
    setVisualBrief(item.visual_brief || '');
    setVisualPrompt(item.visual_prompt || '');
  }, [item.id]);

  useEffect(() => {
    setVisualBrief(item.visual_brief || '');
    setVisualPrompt(item.visual_prompt || '');
  }, [item.visual_brief, item.visual_prompt]);

  useEffect(() => {
    setStatus(item.status);
  }, [item.id, item.status]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('content_item_visuals')
      .select('*')
      .eq('content_item_id', item.id)
      .order('visual_index', { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setVisuals(data as ContentItemVisual[]);
      });
    return () => { cancelled = true; };
  }, [item.id, supabase]);

  const handleGenerateImage = useCallback(async (visualId: string) => {
    setGeneratingImageId(visualId);
    setImageError(null);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visual_id: visualId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error generando imagen');
      setVisuals(prev => prev.map(v =>
        v.id === visualId ? { ...v, image_url: json.image_url, image_status: 'ready' as ImageGenerationStatus, image_error: null } : v
      ));
    } catch (err: any) {
      const msg = err?.message || 'Error desconocido';
      setImageError(msg);
      setVisuals(prev => prev.map(v =>
        v.id === visualId ? { ...v, image_status: 'error' as ImageGenerationStatus, image_error: msg } : v
      ));
    } finally {
      setGeneratingImageId(null);
    }
  }, []);

  async function handleDeleteClick() {
    if (!onDelete) return;
    if (!confirm('¿Eliminar esta publicación del calendario? No se puede deshacer.')) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  function handleSave() {
    onSave({
      idea,
      copy,
      cta,
      post_goal: postGoal,
      hashtags: hashtags.split(',').map(h => h.trim()).filter(Boolean),
      production_specs: buildProductionSpecs(numSlides, durationSeconds, mediaType, sceneSummary),
      visual_brief: visualBrief.trim() || null,
      visual_prompt: visualPrompt.trim() || null,
    });
  }

  async function handleStatusSelect(next: ContentItemStatus) {
    setStatus(next);
    if (!onStatusChange) return;
    setStatusSaving(true);
    try {
      await onStatusChange(next);
    } finally {
      setStatusSaving(false);
    }
  }

  const dateLabel = new Date(item.scheduled_date).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-2xl border border-surface-200 shadow-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-slide-up rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-surface-100 sticky top-0 bg-white z-10 rounded-t-2xl sm:rounded-t-2xl">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold text-surface-900">Revisar publicación</h3>
            <p className="text-xs text-surface-500 mt-0.5">{dateLabel}</p>
            <p className="text-xs text-surface-400 mt-1">
              <span className="font-mono uppercase">{item.format || '—'}</span>
              {' · '}
              <span className="capitalize">{item.content_type}</span>
              {item.is_edited && <span className="text-amber-600 ml-2">· editado</span>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="post-editor-status" className="text-xs font-bold text-surface-600 uppercase tracking-wider">
                Estado
              </label>
              <select
                id="post-editor-status"
                value={status}
                disabled={statusSaving || !onStatusChange}
                onChange={e => handleStatusSelect(e.target.value as ContentItemStatus)}
                className="text-sm bg-white border-2 border-surface-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:opacity-60"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {statusSaving && <span className="text-xs text-surface-400">Guardando…</span>}
              {!onStatusChange && (
                <span className="text-xs text-surface-400">El estado se edita en la fila del post en la lista.</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-400 hover:text-surface-600 transition-colors text-xl leading-none shrink-0 p-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-4">
          <p className="text-xs text-surface-500 -mt-1">
            Aquí ves y editas el <strong>texto completo</strong> del post (igual que en la vista lista). Aprobar un borrador: cambia{' '}
            <strong>Estado</strong> arriba a «Aprobado» (se guarda al instante).
          </p>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Idea del post</label>
            <input
              value={idea}
              onChange={e => setIdea(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Copy completo</label>
            <textarea
              value={copy}
              onChange={e => setCopy(e.target.value)}
              rows={12}
              className="w-full min-h-[200px] px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-sm leading-relaxed whitespace-pre-wrap"
            />
            <p className="text-xs text-surface-400 mt-1">{copy.length} caracteres</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">CTA</label>
              <input
                value={cta}
                onChange={e => setCta(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Objetivo del post</label>
              <input
                value={postGoal}
                onChange={e => setPostGoal(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Hashtags (separados por coma)</label>
            <input
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#marketing, #rrss, #contenido"
              className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
            />
          </div>

          <div className="border-t border-surface-100 pt-4 mt-2 space-y-4">
            <h4 className="text-sm font-bold text-surface-800 uppercase tracking-wider">Guía de producción (calendario)</h4>
            <p className="text-xs text-surface-500 -mt-2">
              Lo que generó la IA del calendario y recibe el generador de briefs. Puedes corregirlo aquí y guardar.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Nº slides / fotos</label>
                <input
                  type="number"
                  min={1}
                  value={numSlides}
                  onChange={e => setNumSlides(e.target.value)}
                  placeholder="—"
                  className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Duración (segundos)</label>
                <input
                  type="number"
                  min={1}
                  value={durationSeconds}
                  onChange={e => setDurationSeconds(e.target.value)}
                  placeholder="—"
                  className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Tipo de medio</label>
                <select
                  value={mediaType}
                  onChange={e => setMediaType(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                >
                  <option value="">—</option>
                  <option value="imagen">Imagen</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Guión / escenas (scene_summary)</label>
              <textarea
                value={sceneSummary}
                onChange={e => setSceneSummary(e.target.value)}
                rows={6}
                placeholder="Descripción de escenas o plan de tomas que usa el brief visual…"
                className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-sm leading-relaxed whitespace-pre-wrap"
              />
            </div>
          </div>

          {/* Prompt IA generativa + Notas de producción */}
          <div className="border-t border-surface-100 pt-4 mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-surface-800 uppercase tracking-wider">Prompt visual</h4>
              {onGenerateBrief && (
                <button
                  type="button"
                  onClick={onGenerateBrief}
                  disabled={generatingBrief}
                  className="text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition-colors uppercase tracking-wider"
                >
                  {generatingBrief ? 'Generando...' : visualPrompt.trim() ? 'Regenerar prompt' : 'Generar prompt'}
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-surface-700">Prompt para IA generativa (Midjourney, DALL-E, Sora…)</label>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(visualPrompt);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  disabled={!visualPrompt.trim()}
                  className="text-xs font-bold text-brand-600 hover:text-brand-800 transition-colors uppercase tracking-wider disabled:opacity-40"
                >
                  {copiedPrompt ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <textarea
                value={visualPrompt}
                onChange={e => setVisualPrompt(e.target.value)}
                rows={10}
                placeholder="Se genera automáticamente o puedes escribirlo a mano…"
                className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-xs font-mono leading-relaxed whitespace-pre-wrap min-h-[160px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-400 mb-1.5">Notas de producción (opcional, manual)</label>
              <textarea
                value={visualBrief}
                onChange={e => setVisualBrief(e.target.value)}
                rows={3}
                placeholder="Notas internas para el diseñador o equipo de producción…"
                className="w-full px-3 sm:px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-sm leading-relaxed whitespace-pre-wrap"
              />
            </div>

            {visuals.length > 0 && (
              <div className="border-t border-surface-100 pt-4 mt-2 space-y-3">
                <h4 className="text-sm font-bold text-surface-800 uppercase tracking-wider">Imágenes generadas</h4>
                <p className="text-xs text-surface-500 -mt-2">
                  Genera la imagen de cada visual usando gpt-image-1.5. Puedes descargarla o regenerarla.
                </p>
                {visuals.map(visual => {
                  const isGen = generatingImageId === visual.id;
                  const hasImage = visual.image_status === 'ready' && visual.image_url;
                  const hasError = visual.image_status === 'error';
                  return (
                    <div key={visual.id} className="border border-surface-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between bg-surface-50 px-3 py-2 border-b border-surface-200">
                        <span className="text-xs font-bold text-surface-700 uppercase tracking-wider">
                          {visual.label || `Visual ${visual.visual_index + 1}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGenerateImage(visual.id)}
                          disabled={isGen}
                          className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait ${
                            hasImage
                              ? 'bg-violet-600 text-white hover:bg-violet-700'
                              : 'bg-brand-600 text-white hover:bg-brand-700'
                          }`}
                        >
                          {isGen ? 'Generando…' : hasImage ? 'Regenerar imagen' : 'Generar imagen'}
                        </button>
                      </div>

                      {isGen && (
                        <div className="bg-brand-50 px-3 py-3 flex items-center gap-2 border-b border-surface-200">
                          <div className="w-3 h-3 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-brand-700 font-mono">Generando con gpt-image-1.5… puede tardar 30-60s</span>
                        </div>
                      )}

                      {hasError && !isGen && (
                        <div className="bg-red-50 px-3 py-2 border-b border-surface-200">
                          <span className="text-xs text-red-700 font-mono">Error: {visual.image_error || 'Error desconocido'}</span>
                        </div>
                      )}

                      {hasImage && (
                        <div className="p-3 bg-white">
                          <div className="relative group">
                            <img
                              src={visual.image_url!}
                              alt={visual.label || `Visual ${visual.visual_index + 1}`}
                              className="w-full max-h-[280px] object-cover rounded-lg border border-surface-200"
                              loading="lazy"
                            />
                            <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a
                                href={visual.image_url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur text-surface-900 border border-surface-300 px-2 py-1 rounded-lg hover:bg-white transition-colors"
                              >
                                Abrir
                              </a>
                              <a
                                href={visual.image_url!}
                                download
                                className="text-[10px] font-bold uppercase tracking-wider bg-surface-900/90 backdrop-blur text-white border border-surface-900 px-2 py-1 rounded-lg hover:bg-surface-900 transition-colors"
                              >
                                Descargar
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-surface-900 text-emerald-300 px-3 py-2 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                        {visual.visual_prompt.slice(0, 300)}{visual.visual_prompt.length > 300 ? '…' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-surface-100 bg-white rounded-b-2xl sticky bottom-0 z-10">
          <div>
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteClick}
                disabled={deleting}
                className="normal-case w-full sm:w-auto"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
              Cerrar
            </Button>
            <Button onClick={handleSave} className="flex-1 sm:flex-none">
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
