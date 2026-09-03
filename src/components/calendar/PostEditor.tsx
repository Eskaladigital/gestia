'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ContentItem, ContentItemStatus, ProductionSpecs, ContentItemVisual } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { downloadImageFromUrl } from '@/lib/utils';
import {
  getVisualDisplayUrl,
  getVisualDownloadParams,
  visualHasSavedEdit,
  visualHasVideo,
  visualUsesCssFlip,
} from '@/lib/visual-image';
import { IMAGE_GENERATION_MODEL } from '@/lib/ai/constants';
import { Button } from '@/components/ui/Button';
import { ImageEditorModal } from './ImageEditorModal';
import { VideoGenModal } from './VideoGenModal';
import { ImageGenProgressModal, type ImageGenItem } from './ImageGenProgressModal';
import { buildImageFilename } from './ContentGallery';

function buildProductionSpecs(
  numSlides: string,
  durationSeconds: string,
  mediaType: string,
  sceneSummary: string,
  lockedSpace?: string | null
): ProductionSpecs | null {
  const o: ProductionSpecs = {};
  const n = numSlides.trim() ? parseInt(numSlides, 10) : NaN;
  const d = durationSeconds.trim() ? parseInt(durationSeconds, 10) : NaN;
  if (Number.isFinite(n) && n > 0) o.num_slides = n;
  if (Number.isFinite(d) && d > 0) o.duration_seconds = d;
  if (mediaType === 'imagen' || mediaType === 'video') o.media_type = mediaType;
  if (sceneSummary.trim()) o.scene_summary = sceneSummary.trim();
  if (lockedSpace?.trim()) o.locked_space = lockedSpace.trim();
  return Object.keys(o).length ? o : null;
}

interface PostEditorProps {
  item: ContentItem;
  projectName: string;
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

export function PostEditor({ item, projectName, onSave, onStatusChange, onClose, onDelete, onGenerateBrief, generatingBrief }: PostEditorProps) {
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
  const [imageGenQueue, setImageGenQueue] = useState<ImageGenItem[] | null>(null);
  const [imageEditorVisual, setImageEditorVisual] = useState<ContentItemVisual | null>(null);
  const [videoModalVisual, setVideoModalVisual] = useState<ContentItemVisual | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptText, setEditingPromptText] = useState('');
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const supabase = createClient();

  const visualsRef = useRef(visuals);
  visualsRef.current = visuals;

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

  const handleDownloadImage = useCallback(async (url: string, filename: string, flipHorizontal?: boolean) => {
    await downloadImageFromUrl(url, filename, { flipHorizontal: !!flipHorizontal });
  }, []);

  const handleDownloadVisual = useCallback(
    async (visual: ContentItemVisual, filename: string) => {
      const params = getVisualDownloadParams(visual);
      if (!params) return;
      await handleDownloadImage(params.url, filename, params.flipHorizontal);
    },
    [handleDownloadImage],
  );

  const toggleImageFlipHorizontal = useCallback(
    async (visualId: string) => {
      const v = visualsRef.current.find(x => x.id === visualId);
      if (!v) return;
      const prevFlip = v.image_flip_horizontal === true;
      const nextFlip = !prevFlip;
      setVisuals(prev =>
        prev.map(x => (x.id === visualId ? { ...x, image_flip_horizontal: nextFlip } : x))
      );
      const { error } = await supabase
        .from('content_item_visuals')
        .update({ image_flip_horizontal: nextFlip, updated_at: new Date().toISOString() })
        .eq('id', visualId);
      if (error) {
        setVisuals(prev =>
          prev.map(x => (x.id === visualId ? { ...x, image_flip_horizontal: prevFlip } : x))
        );
      }
    },
    [supabase],
  );

  const handleImageReady = useCallback((visualId: string, _contentItemId: string, imageUrl: string) => {
    setVisuals(prev => prev.map(v =>
      v.id === visualId
        ? {
            ...v,
            image_url: imageUrl,
            image_status: 'ready' as const,
            image_error: null,
            image_flip_horizontal: false,
            edited_image_url: null,
            image_edit_json: null,
            image_edited_at: null,
          }
        : v
    ));
  }, []);

  const handleImageError = useCallback((visualId: string, _contentItemId: string, errorMsg: string) => {
    setVisuals(prev => prev.map(v =>
      v.id === visualId ? { ...v, image_status: 'error' as const, image_error: errorMsg } : v
    ));
  }, []);

  const startEditPrompt = useCallback((visual: ContentItemVisual) => {
    setEditingPromptId(visual.id);
    setEditingPromptText(visual.visual_prompt);
  }, []);

  const cancelEditPrompt = useCallback(() => {
    setEditingPromptId(null);
    setEditingPromptText('');
  }, []);

  const saveVisualPrompt = useCallback(async (visualId: string) => {
    const trimmed = editingPromptText.trim();
    if (!trimmed) return;
    setSavingPromptId(visualId);
    const { error } = await supabase
      .from('content_item_visuals')
      .update({ visual_prompt: trimmed, updated_at: new Date().toISOString() })
      .eq('id', visualId);
    if (!error) {
      setVisuals(prev => prev.map(v =>
        v.id === visualId ? { ...v, visual_prompt: trimmed } : v
      ));
    }
    setSavingPromptId(null);
    setEditingPromptId(null);
    setEditingPromptText('');
  }, [editingPromptText, supabase]);

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
      production_specs: buildProductionSpecs(
        numSlides,
        durationSeconds,
        mediaType,
        sceneSummary,
        item.production_specs?.locked_space
      ),
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
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-surface-800 uppercase tracking-wider">Imágenes generadas</h4>
                  {visuals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setImageGenQueue(visuals.map(v => ({ visualId: v.id, contentItemId: item.id, label: v.label || `Visual ${v.visual_index + 1}` })))}
                      disabled={!!imageGenQueue}
                      className="text-xs font-bold uppercase tracking-wider text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition-colors"
                    >
                      Generar {visuals.length} imágenes
                    </button>
                  )}
                </div>
                <p className="text-xs text-surface-500 -mt-2">
                  Genera la imagen de cada visual usando {IMAGE_GENERATION_MODEL}. Edita texto y filtros antes de descargar.
                </p>
                {visuals.map(visual => {
                  const hasImage = visual.image_status === 'ready' && visual.image_url;
                  const hasError = visual.image_status === 'error';
                  return (
                    <div key={visual.id} className="border border-surface-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between gap-2 bg-surface-50 px-3 py-2 border-b border-surface-200 flex-wrap">
                        <span className="text-xs font-bold text-surface-700 uppercase tracking-wider">
                          {visual.label || `Visual ${visual.visual_index + 1}`}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setImageGenQueue([{ visualId: visual.id, contentItemId: item.id, label: visual.label || `Visual ${visual.visual_index + 1}` }])}
                            disabled={!!imageGenQueue}
                            className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait ${
                              hasImage
                                ? 'bg-violet-600 text-white hover:bg-violet-700'
                                : 'bg-brand-600 text-white hover:bg-brand-700'
                            }`}
                          >
                            {hasImage ? 'Regenerar imagen' : 'Generar imagen'}
                          </button>
                          {hasImage && (
                            <>
                              <button
                                type="button"
                                onClick={() => setImageEditorVisual(visual)}
                                className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-surface-300 transition-colors ${
                                  visualHasSavedEdit(visual)
                                    ? 'bg-teal-600 text-white border-teal-700'
                                    : 'bg-white text-surface-800 hover:bg-surface-100'
                                }`}
                              >
                                {visualHasSavedEdit(visual) ? 'Editar ✓' : 'Editar'}
                              </button>
                              <button
                                type="button"
                                title="Animar esta imagen con IA de vídeo (Veo)"
                                onClick={() => setVideoModalVisual(visual)}
                                className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border transition-colors ${
                                  visualHasVideo(visual)
                                    ? 'bg-fuchsia-600 text-white border-fuchsia-700'
                                    : 'bg-white text-surface-800 border-surface-300 hover:bg-surface-100'
                                }`}
                              >
                                {visualHasVideo(visual) ? '🎬 ✓' : '🎬 Animar'}
                              </button>
                              <button
                                type="button"
                                title={
                                  visualHasSavedEdit(visual)
                                    ? 'Quita la edición para usar espejo'
                                    : 'Voltear horizontal (espejo)'
                                }
                                disabled={visualHasSavedEdit(visual)}
                                onClick={() => void toggleImageFlipHorizontal(visual.id)}
                                className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-surface-300 transition-colors disabled:opacity-40 ${
                                  visual.image_flip_horizontal === true
                                    ? 'bg-amber-100 text-amber-900 border-amber-400'
                                    : 'bg-white text-surface-800 hover:bg-surface-100'
                                }`}
                              >
                                Espejo
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {hasError && (
                        <div className="bg-red-50 px-3 py-2 border-b border-surface-200">
                          <span className="text-xs text-red-700 font-mono">Error: {visual.image_error || 'Error desconocido'}</span>
                        </div>
                      )}

                      {visualHasVideo(visual) && (
                        <div className="bg-black">
                          <video
                            src={visual.video_url!}
                            controls
                            loop
                            playsInline
                            className="w-full max-h-[280px] object-contain bg-black"
                          />
                          <div className="flex items-center justify-between gap-2 bg-surface-900 px-3 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-fuchsia-300">🎬 Vídeo IA</span>
                            <a
                              href={visual.video_url!}
                              download
                              className="text-[9px] font-bold uppercase tracking-widest text-white hover:text-fuchsia-300"
                            >
                              Descargar MP4
                            </a>
                          </div>
                        </div>
                      )}

                      {hasImage && (
                        <div className="p-3 bg-white">
                          <div className="relative group overflow-hidden rounded-lg">
                            <img
                              src={getVisualDisplayUrl(visual)!}
                              alt={visual.label || `Visual ${visual.visual_index + 1}`}
                              className={`w-full max-h-[280px] object-cover rounded-lg border border-surface-200 ${visualUsesCssFlip(visual) ? '-scale-x-100' : ''}`}
                              loading="lazy"
                            />
                            <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a
                                href={getVisualDisplayUrl(visual)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur text-surface-900 border border-surface-300 px-2 py-1 rounded-lg hover:bg-white transition-colors"
                              >
                                Abrir
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDownloadVisual(
                                    visual,
                                    buildImageFilename(projectName, item.scheduled_date, item.format, visual.visual_index, visual.label),
                                  )
                                }
                                className="text-[10px] font-bold uppercase tracking-wider bg-surface-900/90 backdrop-blur text-white border border-surface-900 px-2 py-1 rounded-lg hover:bg-surface-900 transition-colors"
                              >
                                Descargar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-surface-900 text-emerald-300 px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-surface-500">Prompt</span>
                          <div className="flex items-center gap-1.5">
                            {editingPromptId === visual.id ? (
                              <>
                                <button type="button" onClick={cancelEditPrompt} className="text-[9px] font-bold uppercase tracking-widest text-surface-400 hover:text-white transition-colors">Cancelar</button>
                                <button type="button" onClick={() => saveVisualPrompt(visual.id)} disabled={savingPromptId === visual.id} className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">{savingPromptId === visual.id ? 'Guardando…' : 'Guardar'}</button>
                              </>
                            ) : (
                              <button type="button" onClick={() => startEditPrompt(visual)} className="text-[9px] font-bold uppercase tracking-widest text-surface-500 hover:text-amber-400 transition-colors">Editar</button>
                            )}
                          </div>
                        </div>
                        {editingPromptId === visual.id ? (
                          <textarea
                            value={editingPromptText}
                            onChange={e => setEditingPromptText(e.target.value)}
                            className="w-full bg-surface-800 text-emerald-300 text-[11px] font-mono leading-relaxed p-2 border border-surface-600 focus:border-emerald-500 focus:outline-none resize-y min-h-[100px] rounded-lg"
                            rows={6}
                            autoFocus
                          />
                        ) : (
                          <div className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                            {visual.visual_prompt.slice(0, 300)}{visual.visual_prompt.length > 300 ? '…' : ''}
                          </div>
                        )}
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

      {imageEditorVisual && (
        <ImageEditorModal
          visual={imageEditorVisual}
          onClose={() => setImageEditorVisual(null)}
          onSaved={patch => {
            setVisuals(prev =>
              prev.map(v => (v.id === imageEditorVisual.id ? { ...v, ...patch } : v)),
            );
            setImageEditorVisual(null);
          }}
          onCleared={() => {
            setVisuals(prev =>
              prev.map(v =>
                v.id === imageEditorVisual.id
                  ? { ...v, edited_image_url: null, image_edit_json: null, image_edited_at: null }
                  : v,
              ),
            );
          }}
        />
      )}

      {videoModalVisual && (
        <VideoGenModal
          visual={videoModalVisual}
          onClose={() => setVideoModalVisual(null)}
          onGenerated={patch => {
            setVisuals(prev =>
              prev.map(v => (v.id === videoModalVisual.id ? { ...v, ...patch } : v)),
            );
            setVideoModalVisual(prev => (prev ? { ...prev, ...patch } : prev));
          }}
        />
      )}

      {imageGenQueue && (
        <ImageGenProgressModal
          queue={imageGenQueue}
          onImageReady={handleImageReady}
          onImageError={handleImageError}
          onComplete={() => setImageGenQueue(null)}
          onClose={() => setImageGenQueue(null)}
        />
      )}
    </div>
  );
}
