'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { downloadImageFromUrl } from '@/lib/utils';
import type { ContentItem, ContentItemStatus, ContentItemVisual } from '@/types';
import { PostEditor } from './PostEditor';
import { ProductionSpecsDisplay } from './ProductionSpecsDisplay';
import { ImageGenProgressModal, type ImageGenItem } from './ImageGenProgressModal';
import { buildImageFilename } from './ContentGallery';

interface CalendarTableProps {
  items: ContentItem[];
  projectId: string;
  onItemsChange: (next: ContentItem[]) => void;
  onGenerateBriefForPost?: (contentItemId: string) => void | Promise<void>;
  generatingBrief?: boolean;
  onGenerateAllImages?: () => void;
}

const typeColors: Record<string, string> = {
  educativo: 'bg-blue-50 text-blue-700 border-blue-200',
  inspiracional: 'bg-purple-50 text-purple-700 border-purple-200',
  comercial: 'bg-amber-50 text-amber-700 border-amber-200',
  entretenimiento: 'bg-pink-50 text-pink-700 border-pink-200',
  personal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  corporativo: 'bg-surface-50 text-surface-700 border-surface-200',
};

const WEEK_COLORS = [
  { bg: 'bg-blue-50/60',    border: 'border-l-blue-500',    header: 'bg-blue-100 text-blue-900',    bar: 'bg-blue-500' },
  { bg: 'bg-amber-50/60',   border: 'border-l-amber-500',   header: 'bg-amber-100 text-amber-900',  bar: 'bg-amber-500' },
  { bg: 'bg-emerald-50/60', border: 'border-l-emerald-500', header: 'bg-emerald-100 text-emerald-900', bar: 'bg-emerald-500' },
  { bg: 'bg-violet-50/60',  border: 'border-l-violet-500',  header: 'bg-violet-100 text-violet-900', bar: 'bg-violet-500' },
  { bg: 'bg-rose-50/60',    border: 'border-l-rose-500',    header: 'bg-rose-100 text-rose-900',    bar: 'bg-rose-500' },
];

export const FORMAT_CONFIG: Record<string, { label: string; icon: string; colors: string; pill: string }> = {
  story: { label: 'STORY', icon: '⏱️', colors: 'bg-orange-100 text-orange-700 border-orange-200', pill: 'bg-orange-500 text-white' },
  carrusel: { label: 'CARRUSEL', icon: '📑', colors: 'bg-sky-100 text-sky-700 border-sky-200', pill: 'bg-sky-500 text-white' },
  publicacion: { label: 'POST', icon: '🖼️', colors: 'bg-indigo-100 text-indigo-700 border-indigo-200', pill: 'bg-indigo-500 text-white' },
  reel: { label: 'REEL', icon: '🎬', colors: 'bg-rose-100 text-rose-700 border-rose-200', pill: 'bg-rose-500 text-white' },
};

export const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  educativo: { label: 'Educativo', icon: '📚' },
  inspiracional: { label: 'Inspiracional', icon: '💡' },
  comercial: { label: 'Comercial', icon: '💼' },
  entretenimiento: { label: 'Entretenimiento', icon: '🎭' },
  personal: { label: 'Personal', icon: '👤' },
  corporativo: { label: 'Corporativo', icon: '🏛️' },
};

function FormatBadge({ format, compact }: { format: string | null; compact?: boolean }) {
  const cfg = format ? FORMAT_CONFIG[format] : null;
  if (!cfg) return <span className="text-xs text-surface-400">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border-2 border-surface-900 ${cfg.colors}`}>
      <span>{cfg.icon}</span>
      {!compact && cfg.label}
    </span>
  );
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

interface WeekGroup {
  weekKey: string;
  weekIdx: number;
  startDate: Date;
  endDate: Date;
  items: ContentItem[];
  formatCounts: Record<string, number>;
}

export function CalendarTable({
  items,
  projectId: _projectId,
  onItemsChange,
  onGenerateBriefForPost,
  generatingBrief,
  onGenerateAllImages,
}: CalendarTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [visualsCache, setVisualsCache] = useState<Record<string, ContentItemVisual[]>>({});
  const [visualsLoading, setVisualsLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imageGenQueue, setImageGenQueue] = useState<ImageGenItem[] | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptText, setEditingPromptText] = useState('');
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  /** Vista previa: espejo horizontal por visual (no persiste en servidor). */
  const [flipHorizontalByVisualId, setFlipHorizontalByVisualId] = useState<Record<string, boolean>>({});
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();
  const supabase = createClient();

  const fetchVisuals = useCallback(async (contentItemId: string) => {
    if (visualsCache[contentItemId]) return;
    setVisualsLoading(contentItemId);
    const { data } = await supabase
      .from('content_item_visuals')
      .select('*')
      .eq('content_item_id', contentItemId)
      .order('visual_index', { ascending: true });
    if (data) {
      setVisualsCache(prev => ({ ...prev, [contentItemId]: data as ContentItemVisual[] }));
    }
    setVisualsLoading(null);
  }, [supabase, visualsCache]);

  const handleToggleBrief = useCallback((itemId: string) => {
    if (expandedBrief === itemId) {
      setExpandedBrief(null);
    } else {
      setExpandedBrief(itemId);
      fetchVisuals(itemId);
      setTimeout(() => {
        itemRefs.current[itemId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [expandedBrief, fetchVisuals]);

  const handleCopyPrompt = useCallback((text: string, visualId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(visualId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDownloadImage = useCallback(async (url: string, filename: string, flipHorizontal?: boolean) => {
    await downloadImageFromUrl(url, filename, { flipHorizontal: !!flipHorizontal });
  }, []);

  const startEditPrompt = useCallback((visual: ContentItemVisual) => {
    setEditingPromptId(visual.id);
    setEditingPromptText(visual.visual_prompt);
  }, []);

  const cancelEditPrompt = useCallback(() => {
    setEditingPromptId(null);
    setEditingPromptText('');
  }, []);

  const savePrompt = useCallback(async (visualId: string, contentItemId: string) => {
    const trimmed = editingPromptText.trim();
    if (!trimmed) return;
    setSavingPromptId(visualId);
    const { error } = await supabase
      .from('content_item_visuals')
      .update({ visual_prompt: trimmed, updated_at: new Date().toISOString() })
      .eq('id', visualId);
    if (!error) {
      setVisualsCache(prev => {
        const list = prev[contentItemId];
        if (!list) return prev;
        return {
          ...prev,
          [contentItemId]: list.map(v =>
            v.id === visualId ? { ...v, visual_prompt: trimmed } : v
          ),
        };
      });
    }
    setSavingPromptId(null);
    setEditingPromptId(null);
    setEditingPromptText('');
  }, [editingPromptText, supabase]);

  const handleImageReady = useCallback((visualId: string, contentItemId: string, imageUrl: string) => {
    setVisualsCache(prev => {
      const list = prev[contentItemId];
      if (!list) return prev;
      return {
        ...prev,
        [contentItemId]: list.map(v =>
          v.id === visualId ? { ...v, image_url: imageUrl, image_status: 'ready' as const, image_error: null } : v
        ),
      };
    });
  }, []);

  const handleImageError = useCallback((visualId: string, contentItemId: string, errorMsg: string) => {
    setVisualsCache(prev => {
      const list = prev[contentItemId];
      if (!list) return prev;
      return {
        ...prev,
        [contentItemId]: list.map(v =>
          v.id === visualId ? { ...v, image_status: 'error' as const, image_error: errorMsg } : v
        ),
      };
    });
  }, []);

  const requestImageGeneration = useCallback((visuals: ImageGenItem[]) => {
    if (visuals.length === 0) return;
    setImageGenQueue(visuals);
  }, []);

  const handleGeneratePostImages = useCallback((contentItemId: string) => {
    const visuals = visualsCache[contentItemId];
    if (!visuals || visuals.length === 0) return;
    const pending = visuals
      .filter(v => v.image_status !== 'ready' || !v.image_url)
      .map(v => ({ visualId: v.id, contentItemId, label: v.label || `Visual ${v.visual_index + 1}` }));
    if (pending.length === 0) {
      const all = visuals.map(v => ({ visualId: v.id, contentItemId, label: v.label || `Visual ${v.visual_index + 1}` }));
      requestImageGeneration(all);
    } else {
      requestImageGeneration(pending);
    }
  }, [visualsCache, requestImageGeneration]);

  const weekGroups = useMemo(() => {
    const groups: Record<string, { items: ContentItem[]; monday: Date }> = {};
    for (const item of items) {
      const d = new Date(item.scheduled_date);
      const monday = getMondayOfWeek(d);
      const key = monday.toISOString().slice(0, 10);
      if (!groups[key]) groups[key] = { items: [], monday };
      groups[key].items.push(item);
    }

    const sortedKeys = Object.keys(groups).sort();
    return sortedKeys.map((key, idx): WeekGroup => {
      const g = groups[key];
      const sunday = new Date(g.monday);
      sunday.setDate(sunday.getDate() + 6);
      const formatCounts: Record<string, number> = {};
      for (const item of g.items) {
        const f = item.format || 'otro';
        formatCounts[f] = (formatCounts[f] || 0) + 1;
      }
      return {
        weekKey: key,
        weekIdx: idx,
        startDate: g.monday,
        endDate: sunday,
        items: g.items.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
        formatCounts,
      };
    });
  }, [items]);

  async function handleSave(id: string, updates: Partial<ContentItem>) {
    const { error } = await supabase
      .from('content_items')
      .update({ ...updates, is_edited: true })
      .eq('id', id);

    if (!error) {
      onItemsChange(items.map(item => (item.id === id ? { ...item, ...updates, is_edited: true } : item)));
      setEditingId(null);
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('content_items').delete().eq('id', id);
    if (!error) {
      onItemsChange(items.filter(item => item.id !== id));
      setEditingId(null);
      router.refresh();
    }
  }

  async function handleStatusChange(id: string, status: ContentItemStatus) {
    const { error } = await supabase.from('content_items').update({ status }).eq('id', id);
    if (!error) {
      onItemsChange(items.map(item => (item.id === id ? { ...item, status } : item)));
    }
  }

  function fmtDate(d: Date) {
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  return (
    <div>
      <div className="space-y-4">
        {weekGroups.map((week) => {
          const wc = WEEK_COLORS[week.weekIdx % WEEK_COLORS.length];
          return (
            <div key={week.weekKey} className="bg-white border-2 border-surface-900 shadow-brutal overflow-hidden">
              {/* Week header */}
              <div className={`px-4 sm:px-5 py-3 flex items-center justify-between gap-2 border-b-2 border-surface-900 ${wc.header}`}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className={`w-2 h-8 shrink-0 ${wc.bar}`} />
                  <div className="min-w-0">
                    <span className="font-display font-bold text-sm uppercase tracking-wider">Sem {week.weekIdx + 1}</span>
                    <span className="text-xs opacity-70 ml-1 sm:ml-2 font-mono">{fmtDate(week.startDate)} — {fmtDate(week.endDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="hidden sm:flex items-center gap-2">
                    {Object.entries(week.formatCounts).map(([fmt, count]) => (
                      <div key={fmt} className="flex items-center gap-1">
                        <FormatBadge format={fmt} compact />
                        <span className="text-xs font-bold font-mono">x{count}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-surface-900 text-white px-2 py-0.5">{week.items.length} posts</span>
                </div>
              </div>

              {/* Items list - card layout for all sizes */}
              <div className="divide-y-2 divide-surface-900">
                {week.items.map((item) => {
                  const fmtCfg = item.format ? FORMAT_CONFIG[item.format] : null;
                  const typeCls = typeColors[item.content_type] || typeColors.corporativo;
                  return (
                    <div key={item.id} ref={el => { itemRefs.current[item.id] = el; }} className={`flex border-l-4 ${wc.border} hover:bg-surface-50/50 transition-colors`}>
                      {/* Format strip */}
                      <div className={`shrink-0 w-20 sm:w-24 flex flex-col items-center justify-center gap-1 py-4 border-r-2 border-surface-900 ${fmtCfg?.pill || 'bg-surface-500 text-white'}`}>
                        <span className="text-lg">{fmtCfg?.icon || '📄'}</span>
                        <span className="text-[10px] font-bold tracking-widest uppercase">{fmtCfg?.label || item.format || '—'}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 px-4 sm:px-5 py-4">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-surface-900 shrink-0 font-mono">
                              {new Date(item.scheduled_date).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border-2 border-surface-900 ${typeCls}`}>
                              {TYPE_LABELS[item.content_type]?.icon || ''} {TYPE_LABELS[item.content_type]?.label || item.content_type}
                            </span>
                            {item.is_edited && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border-2 border-amber-400 px-1.5 py-0.5">editado</span>}
                            {item.visual_prompt ? (
                              <button
                                type="button"
                                onClick={() => handleToggleBrief(item.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border-2 border-surface-900 hover:bg-emerald-200 hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                🎨 Prompt {expandedBrief === item.id ? '▲' : '▼'}
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400 bg-surface-100 border-2 border-surface-300 px-1.5 py-0.5">Sin brief</span>
                                {onGenerateBriefForPost && (
                                  <button
                                    type="button"
                                    onClick={() => onGenerateBriefForPost(item.id)}
                                    disabled={generatingBrief}
                                    className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 border-2 border-surface-900 px-1.5 py-0.5 hover:bg-brand-100 hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
                                  >
                                    Generar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <select
                              value={item.status}
                              onChange={(e) => handleStatusChange(item.id, e.target.value as ContentItemStatus)}
                              className="text-[10px] font-bold uppercase tracking-wider bg-white border-2 border-surface-900 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                            >
                              <option value="draft">Borrador</option>
                              <option value="approved">Aprobado</option>
                              <option value="published">Publicado</option>
                              <option value="archived">Archivado</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                              className="text-[10px] font-bold uppercase tracking-wider text-white bg-surface-900 px-3 py-1 border-2 border-surface-900 hover:bg-brand-600 transition-colors shrink-0"
                            >
                              {editingId === item.id ? 'Cerrar' : 'Editar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { if (confirm('¿Eliminar esta publicación?')) handleDelete(item.id); }}
                              className="text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 px-3 py-1 border-2 border-surface-900 hover:bg-red-100 transition-colors shrink-0"
                            >
                              Borrar
                            </button>
                          </div>
                        </div>

                        {/* Full text */}
                        <p className="text-sm font-bold text-surface-900 mb-1 uppercase">{item.idea}</p>
                        <div className="mb-2">
                          <ProductionSpecsDisplay specs={item.production_specs} />
                        </div>
                        {item.copy && (
                          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap border-l-4 border-surface-200 pl-3">{item.copy}</p>
                        )}
                        {(item.cta || item.post_goal || (item.hashtags && item.hashtags.length > 0)) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-surface-600 font-mono">
                            {item.cta && <span className="bg-surface-50 border border-surface-200 px-2 py-0.5"><span className="font-bold uppercase tracking-wider text-surface-900">CTA:</span> {item.cta}</span>}
                            {item.post_goal && <span className="bg-surface-50 border border-surface-200 px-2 py-0.5"><span className="font-bold uppercase tracking-wider text-surface-900">Obj:</span> {item.post_goal}</span>}
                            {item.hashtags && item.hashtags.length > 0 && (
                              <span className="text-surface-400 font-mono">{item.hashtags.join(' ')}</span>
                            )}
                          </div>
                        )}

                        {expandedBrief === item.id && item.visual_prompt && (
                          <div className="mt-4 border-t-2 border-surface-900 pt-4 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] bg-surface-900 text-white px-2 py-0.5">Prompts Visuales</span>
                                <span className="text-[10px] text-surface-500 font-mono">
                                  {visualsCache[item.id]?.length || '...'} {(() => {
                                    const count = visualsCache[item.id]?.length || 0;
                                    const isVid = item.production_specs?.media_type === 'video';
                                    if (isVid) return count === 1 ? 'fotograma' : 'fotogramas';
                                    return count === 1 ? 'imagen' : 'imágenes';
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {visualsCache[item.id] && visualsCache[item.id].length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleGeneratePostImages(item.id)}
                                    disabled={!!imageGenQueue}
                                    className="text-[10px] font-bold uppercase tracking-wider text-white bg-violet-600 border-2 border-surface-900 px-2 py-0.5 hover:bg-violet-700 hover:translate-x-[1px] hover:translate-y-[1px] shadow-brutal-sm hover:shadow-none transition-all disabled:opacity-50"
                                  >
                                    Generar {visualsCache[item.id].length} imágenes
                                  </button>
                                )}
                                {onGenerateBriefForPost && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVisualsCache(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                      onGenerateBriefForPost(item.id);
                                    }}
                                    disabled={generatingBrief}
                                    className="text-[10px] font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-2 py-0.5 hover:bg-brand-700 hover:translate-x-[1px] hover:translate-y-[1px] shadow-brutal-sm hover:shadow-none transition-all disabled:opacity-50"
                                  >
                                    Regenerar prompts
                                  </button>
                                )}
                              </div>
                            </div>

                            {visualsLoading === item.id && (
                              <div className="flex items-center gap-2 py-3">
                                <div className="w-2 h-2 bg-surface-900 animate-brutal-pop" style={{ animationIterationCount: 'infinite', animationDuration: '1s' }} />
                                <span className="text-xs text-surface-500 font-mono">Cargando visuals...</span>
                              </div>
                            )}

                            {visualsCache[item.id] && visualsCache[item.id].length > 0 && (
                              <div className="space-y-3">
                                {visualsCache[item.id].map((visual) => {
                                  const hasImage = visual.image_status === 'ready' && visual.image_url;
                                  const hasError = visual.image_status === 'error';
                                  return (
                                    <div key={visual.id} className="border-2 border-surface-900 overflow-hidden">
                                      <div className="flex items-center justify-between bg-surface-100 border-b-2 border-surface-900 px-3 py-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-surface-700">
                                          {visual.label || `Visual ${visual.visual_index + 1}`}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleCopyPrompt(visual.visual_prompt, visual.id)}
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${
                                              copiedId === visual.id
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-white text-surface-900 hover:bg-surface-100'
                                            }`}
                                          >
                                            {copiedId === visual.id ? 'Copiado' : 'Copiar prompt'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => requestImageGeneration([{ visualId: visual.id, contentItemId: item.id, label: visual.label || `Visual ${visual.visual_index + 1}` }])}
                                            disabled={!!imageGenQueue}
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-wait ${
                                              hasImage
                                                ? 'bg-violet-600 text-white hover:bg-violet-700'
                                                : 'bg-brand-600 text-white hover:bg-brand-700'
                                            }`}
                                          >
                                            {hasImage ? 'Regenerar' : '🖼️ Generar imagen'}
                                          </button>
                                          {hasImage && (
                                            <button
                                              type="button"
                                              title="Voltear horizontal (espejo)"
                                              onClick={() =>
                                                setFlipHorizontalByVisualId(prev => ({
                                                  ...prev,
                                                  [visual.id]: !prev[visual.id],
                                                }))
                                              }
                                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${
                                                flipHorizontalByVisualId[visual.id]
                                                  ? 'bg-amber-500 text-surface-900'
                                                  : 'bg-white text-surface-900 hover:bg-surface-100'
                                              }`}
                                            >
                                              Espejo
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {hasImage && (
                                        <div className="bg-surface-50 border-b-2 border-surface-900 p-3">
                                          <div className="relative group overflow-hidden">
                                            <img
                                              src={visual.image_url!}
                                              alt={visual.label || `Visual ${visual.visual_index + 1}`}
                                              className={`w-full max-h-[300px] object-cover border-2 border-surface-200 ${flipHorizontalByVisualId[visual.id] ? '-scale-x-100' : ''}`}
                                              loading="lazy"
                                            />
                                            <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <a
                                                href={visual.image_url!}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-bold uppercase tracking-wider bg-white text-surface-900 border-2 border-surface-900 px-2 py-1 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                              >
                                                Abrir
                                              </a>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleDownloadImage(
                                                    visual.image_url!,
                                                    buildImageFilename(item.scheduled_date, item.format, visual.visual_index, visual.label),
                                                    flipHorizontalByVisualId[visual.id],
                                                  )
                                                }
                                                className="text-[10px] font-bold uppercase tracking-wider bg-surface-900 text-white border-2 border-surface-900 px-2 py-1 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                              >
                                                Descargar
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {hasError && (
                                        <div className="bg-red-50 border-b-2 border-surface-900 px-3 py-2">
                                          <span className="text-xs text-red-700 font-mono">Error: {visual.image_error || 'Error desconocido'}</span>
                                        </div>
                                      )}

                                      <div className="bg-surface-900 text-emerald-300 px-3 py-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[9px] font-bold uppercase tracking-widest text-surface-500">Prompt</span>
                                          <div className="flex items-center gap-1.5">
                                            {editingPromptId === visual.id ? (
                                              <>
                                                <button type="button" onClick={cancelEditPrompt} className="text-[9px] font-bold uppercase tracking-widest text-surface-400 hover:text-white transition-colors">Cancelar</button>
                                                <button type="button" onClick={() => savePrompt(visual.id, item.id)} disabled={savingPromptId === visual.id} className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">{savingPromptId === visual.id ? 'Guardando…' : 'Guardar'}</button>
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
                                            className="w-full bg-surface-800 text-emerald-300 text-xs font-mono leading-relaxed p-2 border border-surface-600 focus:border-emerald-500 focus:outline-none resize-y min-h-[100px]"
                                            rows={6}
                                            autoFocus
                                          />
                                        ) : (
                                          <div className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                                            {visual.visual_prompt}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {visualsCache[item.id] && visualsCache[item.id].length === 0 && item.visual_prompt && (
                              <div className="bg-white border-2 border-surface-900 shadow-brutal-sm">
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] bg-emerald-600 text-white px-2 py-0.5">Prompt</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyPrompt(item.visual_prompt!, `legacy-${item.id}`)}
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${
                                      copiedId === `legacy-${item.id}`
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-white text-surface-900'
                                    }`}
                                  >
                                    {copiedId === `legacy-${item.id}` ? 'Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <div className="bg-surface-900 text-emerald-300 p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                                  {item.visual_prompt}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {imageGenQueue && (
        <ImageGenProgressModal
          queue={imageGenQueue}
          onImageReady={handleImageReady}
          onImageError={handleImageError}
          onComplete={() => setImageGenQueue(null)}
          onClose={() => setImageGenQueue(null)}
        />
      )}

      {editingId && (
        <PostEditor
          item={items.find(i => i.id === editingId)!}
          onSave={(updates) => handleSave(editingId, updates)}
          onStatusChange={(status) => handleStatusChange(editingId, status)}
          onClose={() => setEditingId(null)}
          onDelete={() => handleDelete(editingId)}
          onGenerateBrief={
            onGenerateBriefForPost ? () => onGenerateBriefForPost(editingId) : undefined
          }
          generatingBrief={generatingBrief}
        />
      )}
    </div>
  );
}
