'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentItem, ContentItemStatus } from '@/types';
import { CalendarTable } from './CalendarTable';
import { CalendarGrid } from './CalendarGrid';
import { PostEditor } from './PostEditor';
import { createClient } from '@/lib/supabase/client';
import { BriefsProgressModal } from '../projects/BriefsProgressModal';

interface CalendarViewProps {
  items: ContentItem[];
  projectId: string;
}

export function CalendarView({ items, projectId }: CalendarViewProps) {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
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

  const pendingBriefsCount = localItems.filter(i => !i.visual_brief?.trim()).length;

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

  return (
    <div>
      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
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
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleGenerateVisualBriefs()}
            disabled={pendingBriefsCount === 0}
            className="text-xs font-bold text-white uppercase tracking-wider px-4 py-2 bg-brand-600 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {pendingBriefsCount === 0
                ? 'Briefs completados'
                : `Generar briefs visuales (${pendingBriefsCount})`}
          </button>
          <button
            onClick={handleExportJSON}
            className="text-xs font-bold text-surface-900 uppercase tracking-wider px-4 py-2 border-2 border-surface-900 bg-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all w-full sm:w-auto"
          >
            Exportar JSON
          </button>
        </div>
      </div>

      {/* Views */}
      {view === 'list' ? (
        <CalendarTable
          items={localItems}
          projectId={projectId}
          onItemsChange={setLocalItems}
          onGenerateBriefForPost={(id) => handleGenerateVisualBriefs([id])}
          generatingBrief={false}
        />
      ) : (
        <CalendarGrid items={localItems} onSelectItem={setEditingItem} onItemsChange={setLocalItems} />
      )}

      {view === 'calendar' && (
        <p className="text-xs text-surface-500 mt-3 max-w-3xl">
          <strong>Aprobar borradores:</strong> en el modal al pulsar <strong>Editar</strong> (selector <strong>Estado</strong>), en la lista, o en el detalle del día
          (número del día en la cuadrícula): pasa de <strong>Borrador</strong> a <strong>Aprobado</strong>.
        </p>
      )}

      {editingItem && (
        <PostEditor
          item={localItems.find(i => i.id === editingItem.id) ?? editingItem}
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
    </div>
  );
}
