'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentItem, ContentItemStatus, ContentItemVisual } from '@/types';
import { CalendarTable } from './CalendarTable';
import { CalendarGrid } from './CalendarGrid';
import { ContentGallery } from './ContentGallery';
import { PostEditor } from './PostEditor';
import { ImageGenProgressModal, type ImageGenItem } from './ImageGenProgressModal';
import { createClient } from '@/lib/supabase/client';
import { BriefsProgressModal } from '../projects/BriefsProgressModal';

interface CalendarViewProps {
  items: ContentItem[];
  projectId: string;
  projectName: string;
  /** Orientación de imagen del proyecto (migración 022). null si la columna aún no existe. */
  imageOrientation?: string | null;
}

export function CalendarView({ items, projectId, projectName, imageOrientation }: CalendarViewProps) {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'calendar' | 'content'>('calendar');
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [localItems, setLocalItems] = useState(items);
  const supabase = createClient();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  async function handleSave(id: string, updates: Partial<ContentItem>) {
    const { error } = await supabase
      .from('content_items')
      .update({ ...updates, is_edited: true })
      .eq('id', id);

    if (!error) {
      setLocalItems(prev => prev.map(item => item.id === id ? { ...item, ...updates, is_edited: true } : item));
      setEditingItem(null);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('content_items').delete().eq('id', id);
    if (!error) {
      setLocalItems(prev => prev.filter(item => item.id !== id));
      setEditingItem(null);
      router.refresh();
    }
  }

  async function handleStatusUpdate(id: string, status: ContentItemStatus) {
    const { error } = await supabase.from('content_items').update({ status }).eq('id', id);
    if (!error) {
      setLocalItems(prev => prev.map(item => (item.id === id ? { ...item, status } : item)));
    }
  }

  function handleExportJSON() {
    const data = JSON.stringify(localItems, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendario-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [briefsModalIds, setBriefsModalIds] = useState<string[] | null>(null);
  const [allImagesQueue, setAllImagesQueue] = useState<ImageGenItem[] | null>(null);

  const pendingBriefsCount = localItems.filter(i => !i.visual_prompt?.trim()).length;
  const itemsWithBriefs = localItems.filter(i => i.visual_prompt?.trim());

  const refreshCalendarItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_items')
      .select('*')
      .eq('project_id', projectId)
      .order('scheduled_date', { ascending: true });
    if (data) setLocalItems(data as ContentItem[]);
  }, [projectId, supabase]);

  const handleGenerateVisualBriefs = useCallback((itemIds?: string[]) => {
    setBriefsModalIds(itemIds || []);
  }, []);

  const buildImageQueue = useCallback(async (onlyPending: boolean): Promise<ImageGenItem[]> => {
    const itemIds = itemsWithBriefs.map(i => i.id);
    if (itemIds.length === 0) return [];
    const { data: visuals } = await supabase
      .from('content_item_visuals')
      .select('*')
      .in('content_item_id', itemIds)
      .order('visual_index', { ascending: true });
    if (!visuals || visuals.length === 0) return [];
    const filtered = onlyPending
      ? (visuals as ContentItemVisual[]).filter(v => v.image_status !== 'ready' || !v.image_url)
      : (visuals as ContentItemVisual[]);
    return filtered.map(v => ({
      visualId: v.id,
      contentItemId: v.content_item_id,
      label: v.label || `Visual ${v.visual_index + 1}`,
    }));
  }, [itemsWithBriefs, supabase]);

  const handleGeneratePendingImages = useCallback(async () => {
    const queue = await buildImageQueue(true);
    if (queue.length > 0) setAllImagesQueue(queue);
  }, [buildImageQueue]);

  const handleGenerateAllImages = useCallback(async () => {
    const queue = await buildImageQueue(false);
    if (queue.length > 0) setAllImagesQueue(queue);
  }, [buildImageQueue]);

  return (
    <div>
      {/* Controls bar
          Mobile  (< sm):  todo apilado en columna.
          Tablet  (sm-lg): tabs arriba, botones de acción debajo en grid 2 cols (ordenados, sin desorden).
          Desktop (xl+):   tabs a la izquierda, botones de acción a la derecha en una sola línea. */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest shrink-0">{localItems.length} posts</span>
          <div className="flex border-2 border-surface-900 p-0">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                view === 'list'
                  ? 'bg-surface-900 text-white'
                  : 'bg-white text-surface-500 hover:text-surface-900'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-l-2 border-surface-900 ${
                view === 'calendar'
                  ? 'bg-surface-900 text-white'
                  : 'bg-white text-surface-500 hover:text-surface-900'
              }`}
            >
              Calendario
            </button>
            <button
              onClick={() => setView('content')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-l-2 border-surface-900 ${
                view === 'content'
                  ? 'bg-surface-900 text-white'
                  : 'bg-white text-surface-500 hover:text-surface-900'
              }`}
            >
              Contenido
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex xl:flex-row xl:items-center gap-2 w-full xl:w-auto">
          {pendingBriefsCount > 0 && (
            <button
              onClick={() => handleGenerateVisualBriefs()}
              className="text-xs font-bold text-white uppercase tracking-wider px-3 sm:px-4 py-2 bg-brand-600 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-center"
            >
              Generar briefs pendientes ({pendingBriefsCount})
            </button>
          )}
          <button
            onClick={() => {
              const allIds = localItems.map(i => i.id);
              handleGenerateVisualBriefs(allIds);
            }}
            disabled={localItems.length === 0}
            className="text-xs font-bold text-surface-900 uppercase tracking-wider px-3 sm:px-4 py-2 bg-white border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-center"
          >
            Regenerar todos los briefs
          </button>
          {itemsWithBriefs.length > 0 && (
            <>
              <button
                onClick={handleGeneratePendingImages}
                disabled={!!allImagesQueue}
                className="text-xs font-bold text-white uppercase tracking-wider px-3 sm:px-4 py-2 bg-violet-600 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-700 text-center"
              >
                Generar imágenes pendientes
              </button>
              <button
                onClick={handleGenerateAllImages}
                disabled={!!allImagesQueue}
                className="text-xs font-bold text-surface-900 uppercase tracking-wider px-3 sm:px-4 py-2 bg-white border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-center"
              >
                Regenerar todas las imágenes
              </button>
            </>
          )}
          <button
            onClick={handleExportJSON}
            className="text-xs font-bold text-surface-900 uppercase tracking-wider px-3 sm:px-4 py-2 border-2 border-surface-900 bg-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-center"
          >
            Exportar JSON
          </button>
        </div>
      </div>

      {/* Views */}
      {view === 'list' && (
        <CalendarTable
          items={localItems}
          projectId={projectId}
          projectName={projectName}
          onItemsChange={setLocalItems}
          onGenerateBriefForPost={(id) => handleGenerateVisualBriefs([id])}
          generatingBrief={false}
        />
      )}
      {view === 'calendar' && (
        <>
          <CalendarGrid items={localItems} onSelectItem={setEditingItem} onItemsChange={setLocalItems} />
          <p className="text-xs text-surface-500 mt-3 max-w-3xl">
            <strong>Aprobar borradores:</strong> en el modal al pulsar <strong>Editar</strong> (selector <strong>Estado</strong>), en la lista, o en el detalle del día
            (número del día en la cuadrícula): pasa de <strong>Borrador</strong> a <strong>Aprobado</strong>.
          </p>
        </>
      )}
      {view === 'content' && (
        <ContentGallery items={localItems} projectId={projectId} projectName={projectName} imageOrientation={imageOrientation ?? null} />
      )}

      {editingItem && (
        <PostEditor
          item={localItems.find(i => i.id === editingItem.id) ?? editingItem}
          projectName={projectName}
          onSave={(updates) => handleSave(editingItem.id, updates)}
          onStatusChange={(status) => handleStatusUpdate(editingItem.id, status)}
          onClose={() => setEditingItem(null)}
          onDelete={() => handleDelete(editingItem.id)}
          onGenerateBrief={() => handleGenerateVisualBriefs([editingItem.id])}
          generatingBrief={false}
        />
      )}

      {briefsModalIds && (
        <BriefsProgressModal
          projectId={projectId}
          contentItemIds={briefsModalIds.length > 0 ? briefsModalIds : undefined}
          onClose={() => setBriefsModalIds(null)}
          onComplete={() => refreshCalendarItems()}
        />
      )}

      {allImagesQueue && (
        <ImageGenProgressModal
          queue={allImagesQueue}
          onImageReady={() => {}}
          onImageError={() => {}}
          onComplete={() => { setAllImagesQueue(null); refreshCalendarItems(); }}
          onClose={() => setAllImagesQueue(null)}
        />
      )}
    </div>
  );
}
