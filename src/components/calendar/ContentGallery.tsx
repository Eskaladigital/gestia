'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/client';
import { downloadImageFromUrl, imageBlobFlippedHorizontally } from '@/lib/utils';
import type { ContentItem, ContentItemVisual } from '@/types';
import { ImageGenProgressModal, type ImageGenItem } from './ImageGenProgressModal';
import { FORMAT_CONFIG, TYPE_LABELS } from './CalendarTable';
import { aspectClassForOrientation } from '@/lib/ai/constants';

/**
 * Genera el nombre de archivo para una imagen visual.
 * Formato: "2025-04-13 CARRUSEL 1.png"
 */
export function buildImageFilename(
  scheduledDate: string,
  format: string | null,
  visualIndex: number,
  label?: string | null,
): string {
  const date = scheduledDate.slice(0, 10);
  const fmt = (format || 'POST').toUpperCase();
  const idx = visualIndex + 1;
  const suffix = label ? ` ${label}` : '';
  return `${date} ${fmt} ${idx}${suffix}.png`;
}

const WEEK_COLORS = [
  { bg: 'bg-blue-50/60', header: 'bg-blue-100 text-blue-900', accent: 'border-blue-500' },
  { bg: 'bg-amber-50/60', header: 'bg-amber-100 text-amber-900', accent: 'border-amber-500' },
  { bg: 'bg-emerald-50/60', header: 'bg-emerald-100 text-emerald-900', accent: 'border-emerald-500' },
  { bg: 'bg-violet-50/60', header: 'bg-violet-100 text-violet-900', accent: 'border-violet-500' },
  { bg: 'bg-rose-50/60', header: 'bg-rose-100 text-rose-900', accent: 'border-rose-500' },
];

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatWeekRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('es-ES', opts)} — ${end.toLocaleDateString('es-ES', opts)}`;
}

interface ContentGalleryProps {
  items: ContentItem[];
  projectId: string;
  /** Orientación de las imágenes IA del proyecto (vertical/cuadrado/horizontal). */
  imageOrientation?: string | null;
}

interface PostWithVisuals {
  item: ContentItem;
  visuals: ContentItemVisual[];
}

interface WeekGroup {
  weekKey: string;
  weekIdx: number;
  startDate: Date;
  endDate: Date;
  posts: PostWithVisuals[];
}

export function ContentGallery({ items, projectId, imageOrientation }: ContentGalleryProps) {
  const aspectClass = aspectClassForOrientation(imageOrientation);
  const supabase = createClient();
  const [visualsMap, setVisualsMap] = useState<Record<string, ContentItemVisual[]>>({});
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imageGenQueue, setImageGenQueue] = useState<ImageGenItem[] | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptText, setEditingPromptText] = useState('');
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    url: string;
    filename: string;
    visualId: string;
    contentItemId: string;
  } | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const visualsMapRef = useRef(visualsMap);
  visualsMapRef.current = visualsMap;

  const itemsWithBriefs = useMemo(() => items.filter(i => i.visual_prompt?.trim()), [items]);

  useEffect(() => {
    if (itemsWithBriefs.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = itemsWithBriefs.map(i => i.id);
      const { data } = await supabase
        .from('content_item_visuals')
        .select('*')
        .in('content_item_id', ids)
        .order('visual_index', { ascending: true });
      if (cancelled) return;
      if (data) {
        const map: Record<string, ContentItemVisual[]> = {};
        for (const v of data as ContentItemVisual[]) {
          if (!map[v.content_item_id]) map[v.content_item_id] = [];
          map[v.content_item_id].push(v);
        }
        setVisualsMap(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [itemsWithBriefs, supabase]);

  const weekGroups = useMemo<WeekGroup[]>(() => {
    const groups: Record<string, { posts: PostWithVisuals[]; monday: Date }> = {};
    for (const item of itemsWithBriefs) {
      const visuals = visualsMap[item.id];
      if (!visuals || visuals.length === 0) continue;
      const d = new Date(item.scheduled_date);
      const monday = getMondayOfWeek(d);
      const key = monday.toISOString().slice(0, 10);
      if (!groups[key]) groups[key] = { posts: [], monday };
      groups[key].posts.push({ item, visuals });
    }
    const sortedKeys = Object.keys(groups).sort();
    return sortedKeys.map((key, idx) => {
      const g = groups[key];
      const sunday = new Date(g.monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        weekKey: key,
        weekIdx: idx,
        startDate: g.monday,
        endDate: sunday,
        posts: g.posts.sort((a, b) => a.item.scheduled_date.localeCompare(b.item.scheduled_date)),
      };
    });
  }, [itemsWithBriefs, visualsMap]);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDownload = useCallback(async (url: string, filename: string, flipHorizontal?: boolean) => {
    await downloadImageFromUrl(url, filename, { flipHorizontal: !!flipHorizontal });
  }, []);

  const toggleImageFlipHorizontal = useCallback(
    async (visualId: string, contentItemId: string) => {
      const list = visualsMapRef.current[contentItemId];
      const v = list?.find(x => x.id === visualId);
      if (!v) return;
      const prevFlip = v.image_flip_horizontal === true;
      const nextFlip = !prevFlip;
      setVisualsMap(prev => {
        const L = prev[contentItemId];
        if (!L) return prev;
        return {
          ...prev,
          [contentItemId]: L.map(x =>
            x.id === visualId ? { ...x, image_flip_horizontal: nextFlip } : x
          ),
        };
      });
      const { error } = await supabase
        .from('content_item_visuals')
        .update({ image_flip_horizontal: nextFlip, updated_at: new Date().toISOString() })
        .eq('id', visualId);
      if (error) {
        setVisualsMap(prev => {
          const L = prev[contentItemId];
          if (!L) return prev;
          return {
            ...prev,
            [contentItemId]: L.map(x =>
              x.id === visualId ? { ...x, image_flip_horizontal: prevFlip } : x
            ),
          };
        });
      }
    },
    [supabase],
  );

  const handleImageReady = useCallback((visualId: string, contentItemId: string, imageUrl: string) => {
    setVisualsMap(prev => {
      const list = prev[contentItemId];
      if (!list) return prev;
      return {
        ...prev,
        [contentItemId]: list.map(v =>
          v.id === visualId
            ? { ...v, image_url: imageUrl, image_status: 'ready' as const, image_error: null, image_flip_horizontal: false }
            : v
        ),
      };
    });
  }, []);

  const handleImageError = useCallback((visualId: string, contentItemId: string, errorMsg: string) => {
    setVisualsMap(prev => {
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

  const togglePrompt = useCallback((id: string) => {
    if (editingPromptId === id) return;
    setExpandedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [editingPromptId]);

  const startEditPrompt = useCallback((visual: ContentItemVisual) => {
    setEditingPromptId(visual.id);
    setEditingPromptText(visual.visual_prompt);
    setExpandedPrompts(prev => new Set(prev).add(visual.id));
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
      setVisualsMap(prev => {
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

  const totalVisuals = useMemo(() =>
    Object.values(visualsMap).reduce((sum, list) => sum + list.length, 0),
  [visualsMap]);

  const readyCount = useMemo(() =>
    Object.values(visualsMap).flat().filter(v => v.image_status === 'ready' && v.image_url).length,
  [visualsMap]);

  const itemsById = useMemo(() => {
    const map: Record<string, ContentItem> = {};
    for (const item of items) map[item.id] = item;
    return map;
  }, [items]);

  const handleDownloadAllZip = useCallback(async () => {
    const allReady = Object.values(visualsMap)
      .flat()
      .filter(v => v.image_status === 'ready' && v.image_url);
    if (allReady.length === 0) return;

    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const visual of allReady) {
        const parentItem = itemsById[visual.content_item_id];
        let filename = parentItem
          ? buildImageFilename(parentItem.scheduled_date, parentItem.format, visual.visual_index, visual.label)
          : `visual-${visual.visual_index + 1}.png`;

        while (usedNames.has(filename)) {
          filename = filename.replace('.png', ' (copia).png');
        }
        usedNames.add(filename);

        try {
          const res = await fetch(visual.image_url!);
          let blob = await res.blob();
          if (visual.image_flip_horizontal === true) {
            const flipped = await imageBlobFlippedHorizontally(blob);
            if (flipped) blob = flipped;
          }
          zip.file(filename, blob);
        } catch {
          // skip failed downloads
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contenido-visual-${projectId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingZip(false);
    }
  }, [visualsMap, itemsById, projectId]);

  const lightboxVisual = useMemo(() => {
    if (!lightbox) return null;
    const row = visualsMap[lightbox.contentItemId];
    return row?.find(v => v.id === lightbox.visualId) ?? null;
  }, [lightbox, visualsMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold uppercase tracking-widest text-surface-500">Cargando contenido visual…</p>
        </div>
      </div>
    );
  }

  if (itemsWithBriefs.length === 0) {
    return (
      <div className="border-2 border-surface-900 bg-surface-50 p-10 text-center">
        <p className="text-surface-500 font-bold uppercase tracking-wider text-sm mb-2">Sin contenido visual</p>
        <p className="text-surface-400 text-xs">Genera primero los briefs visuales desde los botones superiores.</p>
      </div>
    );
  }

  if (weekGroups.length === 0 && !loading) {
    return (
      <div className="border-2 border-surface-900 bg-surface-50 p-10 text-center">
        <p className="text-surface-500 font-bold uppercase tracking-wider text-sm mb-2">Briefs generados, sin visuals</p>
        <p className="text-surface-400 text-xs">Los briefs existen pero aun no se han creado las filas de visuals individuales. Regenera los briefs para crear los visuals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 border-2 border-surface-900 bg-white px-4 py-3">
        <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest">
          {weekGroups.reduce((s, g) => s + g.posts.length, 0)} posts
        </span>
        <span className="text-[10px] font-mono font-bold bg-violet-600 text-white px-2 py-0.5 uppercase tracking-widest">
          {totalVisuals} visuals
        </span>
        <span className="text-[10px] font-mono font-bold bg-emerald-600 text-white px-2 py-0.5 uppercase tracking-widest">
          {readyCount} imágenes listas
        </span>
        {totalVisuals - readyCount > 0 && (
          <span className="text-[10px] font-mono font-bold bg-amber-500 text-white px-2 py-0.5 uppercase tracking-widest">
            {totalVisuals - readyCount} pendientes
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {totalVisuals - readyCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const pending = Object.values(visualsMap)
                  .flat()
                  .filter(v => v.image_status !== 'ready' || !v.image_url);
                if (pending.length === 0) return;
                setImageGenQueue(pending.map(v => ({
                  visualId: v.id,
                  contentItemId: v.content_item_id,
                  label: v.label || `Visual ${v.visual_index + 1}`,
                })));
              }}
              disabled={!!imageGenQueue}
              className="text-[10px] font-bold uppercase tracking-wider text-white bg-violet-600 border-2 border-surface-900 px-3 py-1 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
            >
              Generar pendientes ({totalVisuals - readyCount})
            </button>
          )}
          {readyCount > 0 && (
            <button
              type="button"
              onClick={handleDownloadAllZip}
              disabled={downloadingZip}
              className="text-[10px] font-bold uppercase tracking-wider text-white bg-surface-900 border-2 border-surface-900 px-3 py-1 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {downloadingZip ? 'Descargando…' : `Descargar todas (${readyCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Week groups */}
      {weekGroups.map(week => {
        const wc = WEEK_COLORS[week.weekIdx % WEEK_COLORS.length];
        const weekVisuals = week.posts.flatMap(p => p.visuals);
        const weekPending = weekVisuals.filter(v => v.image_status !== 'ready' || !v.image_url);

        return (
          <div key={week.weekKey} className="border-2 border-surface-900 overflow-hidden">
            {/* Week header */}
            <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b-2 border-surface-900 ${wc.header}`}>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest">
                  Semana {week.weekIdx + 1}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {formatWeekRange(week.startDate, week.endDate)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                  {week.posts.length} {week.posts.length === 1 ? 'post' : 'posts'} · {weekVisuals.length} visuals
                </span>
                {weekPending.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setImageGenQueue(weekPending.map(v => ({
                      visualId: v.id,
                      contentItemId: v.content_item_id,
                      label: v.label || `Visual ${v.visual_index + 1}`,
                    })))}
                    disabled={!!imageGenQueue}
                    className="text-[10px] font-bold uppercase tracking-wider text-white bg-violet-600 border-2 border-surface-900 px-2 py-0.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
                  >
                    Generar {weekPending.length} imágenes
                  </button>
                )}
              </div>
            </div>

            {/* Posts */}
            <div className={`divide-y-2 divide-surface-900 ${wc.bg}`}>
              {week.posts.map(({ item, visuals }) => {
                const fmtCfg = item.format ? FORMAT_CONFIG[item.format] : null;
                const typeCfg = item.content_type ? TYPE_LABELS[item.content_type] : null;
                const postPending = visuals.filter(v => v.image_status !== 'ready' || !v.image_url);

                return (
                  <div key={item.id} className="p-4">
                    {/* Post header */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest">
                        {formatDateShort(item.scheduled_date)}
                      </span>
                      {fmtCfg && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border-2 border-surface-900 ${fmtCfg.colors}`}>
                          {fmtCfg.icon} {fmtCfg.label}
                        </span>
                      )}
                      {typeCfg && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">
                          {typeCfg.icon} {typeCfg.label}
                        </span>
                      )}
                      <span className="text-xs font-bold text-surface-800 truncate flex-1 min-w-0">
                        {item.idea}
                      </span>
                      {postPending.length > 0 && visuals.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setImageGenQueue(postPending.map(v => ({
                            visualId: v.id,
                            contentItemId: item.id,
                            label: v.label || `Visual ${v.visual_index + 1}`,
                          })))}
                          disabled={!!imageGenQueue}
                          className="text-[10px] font-bold uppercase tracking-wider text-white bg-violet-600 border-2 border-surface-900 px-2 py-0.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 shrink-0"
                        >
                          Generar {postPending.length}
                        </button>
                      )}
                    </div>

                    {/* Visuals grid */}
                    <div className={`grid gap-4 ${visuals.length === 1 ? 'grid-cols-1 max-w-2xl' : 'grid-cols-1 md:grid-cols-2'}`}>
                      {visuals.map(visual => {
                        const hasImage = visual.image_status === 'ready' && visual.image_url;
                        const hasError = visual.image_status === 'error';
                        const isExpanded = expandedPrompts.has(visual.id);

                        return (
                          <div key={visual.id} className="border-2 border-surface-900 bg-white overflow-hidden">
                            {/* Visual label + actions */}
                            <div className="flex items-center justify-between bg-surface-100 border-b-2 border-surface-900 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-surface-700">
                                  {visual.label || `Visual ${visual.visual_index + 1}`}
                                </span>
                                {hasImage && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                )}
                                {hasError && (
                                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                )}
                                {!hasImage && !hasError && (
                                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(visual.visual_prompt, visual.id)}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${
                                    copiedId === visual.id
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-white text-surface-900 hover:bg-surface-100'
                                  }`}
                                >
                                  {copiedId === visual.id ? 'Copiado' : 'Copiar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setImageGenQueue([{
                                    visualId: visual.id,
                                    contentItemId: item.id,
                                    label: visual.label || `Visual ${visual.visual_index + 1}`,
                                  }])}
                                  disabled={!!imageGenQueue}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 ${
                                    hasImage
                                      ? 'bg-violet-600 text-white hover:bg-violet-700'
                                      : 'bg-brand-600 text-white hover:bg-brand-700'
                                  }`}
                                >
                                  {hasImage ? 'Regenerar' : 'Generar'}
                                </button>
                                {hasImage && (
                                  <>
                                    <button
                                      type="button"
                                      title="Voltear horizontal (espejo) — se guarda en el proyecto"
                                      onClick={() => void toggleImageFlipHorizontal(visual.id, item.id)}
                                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${
                                        visual.image_flip_horizontal === true
                                          ? 'bg-amber-500 text-surface-900'
                                          : 'bg-white text-surface-900 hover:bg-surface-100'
                                      }`}
                                    >
                                      Espejo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownload(
                                          visual.image_url!,
                                          buildImageFilename(item.scheduled_date, item.format, visual.visual_index, visual.label),
                                          visual.image_flip_horizontal === true,
                                        )
                                      }
                                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-surface-900 bg-surface-900 text-white shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                    >
                                      Descargar
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Image area */}
                            {hasImage ? (
                              <div
                                className="relative cursor-pointer group overflow-hidden"
                                onClick={() =>
                                  setLightbox({
                                    url: visual.image_url!,
                                    filename: buildImageFilename(item.scheduled_date, item.format, visual.visual_index, visual.label),
                                    visualId: visual.id,
                                    contentItemId: item.id,
                                  })
                                }
                              >
                                <img
                                  src={visual.image_url!}
                                  alt={visual.label || `Visual ${visual.visual_index + 1}`}
                                  className={`w-full ${aspectClass} object-cover ${visual.image_flip_horizontal === true ? '-scale-x-100' : ''}`}
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <span className="text-white text-sm font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity bg-surface-900/80 px-3 py-1.5">
                                    Ver grande
                                  </span>
                                </div>
                              </div>
                            ) : hasError ? (
                              <div className={`${aspectClass} bg-red-50 flex flex-col items-center justify-center gap-2 px-4`}>
                                <span className="text-2xl">⚠️</span>
                                <span className="text-xs text-red-700 font-mono text-center">{visual.image_error || 'Error desconocido'}</span>
                              </div>
                            ) : (
                              <div className={`${aspectClass} bg-surface-100 flex flex-col items-center justify-center gap-2`}>
                                <span className="text-3xl opacity-30">🖼️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-surface-400">Pendiente de generar</span>
                              </div>
                            )}

                            {/* Prompt */}
                            <div className="bg-surface-900 text-emerald-300 px-3 py-2">
                              <div className="flex items-center justify-between mb-1">
                                <span
                                  className="text-[9px] font-bold uppercase tracking-widest text-surface-500 cursor-pointer"
                                  onClick={() => togglePrompt(visual.id)}
                                >
                                  Prompt {isExpanded && editingPromptId !== visual.id ? '▲' : !isExpanded ? '▼' : ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {editingPromptId === visual.id ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={cancelEditPrompt}
                                        className="text-[9px] font-bold uppercase tracking-widest text-surface-400 hover:text-white transition-colors"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => savePrompt(visual.id, item.id)}
                                        disabled={savingPromptId === visual.id}
                                        className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                                      >
                                        {savingPromptId === visual.id ? 'Guardando…' : 'Guardar'}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); startEditPrompt(visual); }}
                                      className="text-[9px] font-bold uppercase tracking-widest text-surface-500 hover:text-amber-400 transition-colors"
                                    >
                                      Editar
                                    </button>
                                  )}
                                </div>
                              </div>
                              {editingPromptId === visual.id ? (
                                <textarea
                                  value={editingPromptText}
                                  onChange={e => setEditingPromptText(e.target.value)}
                                  className="w-full bg-surface-800 text-emerald-300 text-[11px] font-mono leading-relaxed p-2 border border-surface-600 focus:border-emerald-500 focus:outline-none resize-y min-h-[120px]"
                                  rows={8}
                                  autoFocus
                                />
                              ) : (
                                <p
                                  className={`text-[11px] font-mono leading-relaxed whitespace-pre-wrap cursor-pointer ${isExpanded ? '' : 'line-clamp-2'}`}
                                  onClick={() => togglePrompt(visual.id)}
                                >
                                  {visual.visual_prompt}
                                </p>
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
          </div>
        );
      })}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt="Vista ampliada"
              className={`w-full h-auto max-h-[85vh] object-contain border-4 border-white ${
                lightboxVisual?.image_flip_horizontal === true ? '-scale-x-100' : ''
              }`}
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                type="button"
                title="Voltear horizontal (espejo) — se guarda en el proyecto"
                onClick={() => void toggleImageFlipHorizontal(lightbox.visualId, lightbox.contentItemId)}
                className={`text-xs font-bold uppercase tracking-wider border-2 border-surface-900 px-3 py-1.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${
                  lightboxVisual?.image_flip_horizontal === true
                    ? 'bg-amber-500 text-surface-900'
                    : 'bg-white text-surface-900'
                }`}
              >
                Espejo
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleDownload(
                    lightbox.url,
                    lightbox.filename,
                    lightboxVisual?.image_flip_horizontal === true,
                  )
                }
                className="text-xs font-bold uppercase tracking-wider bg-white text-surface-900 border-2 border-surface-900 px-3 py-1.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Descargar
              </button>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="text-xs font-bold uppercase tracking-wider bg-surface-900 text-white border-2 border-white px-3 py-1.5 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image generation modal */}
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
