'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentItem, ContentItemStatus } from '@/types';
import { CalendarTable } from './CalendarTable';
import { CalendarGrid } from './CalendarGrid';
import { PostEditor } from './PostEditor';
import { createClient } from '@/lib/supabase/client';

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

  const [generatingBriefs, setGeneratingBriefs] = useState(false);
  const [briefsMessage, setBriefsMessage] = useState<string | null>(null);

  const pendingBriefsCount = localItems.filter(i => !i.visual_brief?.trim()).length;

  /** Mientras la API genera briefs (varios lotes / llamadas IA), la lista solo se refrescaba al final; sondeamos Supabase para ver cada ítem en cuanto se guarda. */
  const briefPollCancelRef = useRef(false);
  const briefPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCalendarItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_items')
      .select('*')
      .eq('project_id', projectId)
      .order('scheduled_date', { ascending: true });
    if (data) setLocalItems(data as ContentItem[]);
  }, [projectId, supabase]);

  const startBriefGenerationPolling = useCallback(() => {
    briefPollCancelRef.current = false;
    const tick = async () => {
      if (briefPollCancelRef.current) return;
      await refreshCalendarItems();
      if (!briefPollCancelRef.current) {
        briefPollTimeoutRef.current = setTimeout(tick, 1800);
      }
    };
    briefPollTimeoutRef.current = setTimeout(tick, 400);
  }, [refreshCalendarItems]);

  const stopBriefGenerationPolling = useCallback(() => {
    briefPollCancelRef.current = true;
    if (briefPollTimeoutRef.current != null) {
      clearTimeout(briefPollTimeoutRef.current);
      briefPollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => stopBriefGenerationPolling(), [stopBriefGenerationPolling]);

  const handleGenerateVisualBriefs = useCallback(async (itemIds?: string[]) => {
    setGeneratingBriefs(true);
    setBriefsMessage(null);
    startBriefGenerationPolling();
    try {
      const payload: { project_id: string; content_item_ids?: string[] } = { project_id: projectId };
      if (itemIds?.length) payload.content_item_ids = itemIds;

      const res = await fetch('/api/generate-visual-briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setBriefsMessage(json.error || 'Error al generar briefs');
        return;
      }

      const total = typeof json.total === 'number' ? json.total : json.updated;
      setBriefsMessage(`${json.updated} de ${total} briefs generados`);
    } catch {
      setBriefsMessage('Error de red al generar briefs');
    } finally {
      stopBriefGenerationPolling();
      setGeneratingBriefs(false);
      await refreshCalendarItems();
    }
  }, [projectId, supabase, startBriefGenerationPolling, stopBriefGenerationPolling, refreshCalendarItems]);

  return (
    <div>
      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 rounded uppercase tracking-widest shrink-0">{localItems.length} posts</span>
          <div className="flex border-2 border-surface-200 rounded-full p-0.5">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                view === 'list'
                  ? 'bg-surface-900 text-white'
                  : 'text-surface-500 hover:text-surface-900'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                view === 'calendar'
                  ? 'bg-surface-900 text-white'
                  : 'text-surface-500 hover:text-surface-900'
              }`}
            >
              Calendario
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {briefsMessage && (
            <span className="text-xs text-surface-600 px-2 py-1 bg-surface-50 rounded-full text-center">{briefsMessage}</span>
          )}
          <button
            onClick={() => handleGenerateVisualBriefs()}
            disabled={generatingBriefs || pendingBriefsCount === 0}
            className="text-xs font-bold text-white uppercase tracking-wider px-4 py-2 bg-brand-600 rounded-full hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {generatingBriefs
              ? pendingBriefsCount > 0
                ? `Generando briefs… (${pendingBriefsCount} pendientes)`
                : 'Generando briefs…'
              : pendingBriefsCount === 0
                ? 'Briefs completados'
                : `Generar briefs visuales (${pendingBriefsCount})`}
          </button>
          <button
            onClick={handleExportJSON}
            className="text-xs font-bold text-surface-900 uppercase tracking-wider px-4 py-2 border-2 border-surface-300 rounded-full hover:border-surface-900 transition-colors w-full sm:w-auto"
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
          generatingBrief={generatingBriefs}
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
          onGenerateBrief={async () => {
            await handleGenerateVisualBriefs([editingItem.id]);
          }}
          generatingBrief={generatingBriefs}
        />
      )}
    </div>
  );
}
