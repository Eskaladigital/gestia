'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ContentItem, ContentItemStatus } from '@/types';
import { PostEditor } from './PostEditor';
import { ProductionSpecsDisplay } from './ProductionSpecsDisplay';

interface CalendarTableProps {
  items: ContentItem[];
  projectId: string;
  onItemsChange: (next: ContentItem[]) => void;
  onGenerateBriefForPost?: (contentItemId: string) => void | Promise<void>;
  generatingBrief?: boolean;
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
  { bg: 'bg-blue-50/60',    border: 'border-l-blue-400',    header: 'bg-blue-50 text-blue-800',    bar: 'bg-blue-400' },
  { bg: 'bg-amber-50/60',   border: 'border-l-amber-400',   header: 'bg-amber-50 text-amber-800',  bar: 'bg-amber-400' },
  { bg: 'bg-emerald-50/60', border: 'border-l-emerald-400', header: 'bg-emerald-50 text-emerald-800', bar: 'bg-emerald-400' },
  { bg: 'bg-violet-50/60',  border: 'border-l-violet-400',  header: 'bg-violet-50 text-violet-800', bar: 'bg-violet-400' },
  { bg: 'bg-rose-50/60',    border: 'border-l-rose-400',    header: 'bg-rose-50 text-rose-800',    bar: 'bg-rose-400' },
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.colors}`}>
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
}: CalendarTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

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
            <div key={week.weekKey} className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
              {/* Week header */}
              <div className={`px-4 sm:px-5 py-3 flex items-center justify-between gap-2 ${wc.header}`}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className={`w-1.5 h-8 rounded-full shrink-0 ${wc.bar}`} />
                  <div className="min-w-0">
                    <span className="font-display font-bold text-sm">Sem {week.weekIdx + 1}</span>
                    <span className="text-xs opacity-70 ml-1 sm:ml-2">{fmtDate(week.startDate)} — {fmtDate(week.endDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="hidden sm:flex items-center gap-2">
                    {Object.entries(week.formatCounts).map(([fmt, count]) => (
                      <div key={fmt} className="flex items-center gap-1">
                        <FormatBadge format={fmt} compact />
                        <span className="text-xs font-medium">x{count}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-xs opacity-60">{week.items.length} posts</span>
                </div>
              </div>

              {/* Items list - card layout for all sizes */}
              <div className="divide-y divide-surface-100">
                {week.items.map((item) => {
                  const fmtCfg = item.format ? FORMAT_CONFIG[item.format] : null;
                  const typeCls = typeColors[item.content_type] || typeColors.corporativo;
                  return (
                    <div key={item.id} className={`flex border-l-4 ${wc.border} hover:bg-surface-50/30 transition-colors`}>
                      {/* Format strip */}
                      <div className={`shrink-0 w-20 sm:w-24 flex flex-col items-center justify-center gap-1 py-4 ${fmtCfg?.pill || 'bg-surface-500 text-white'}`}>
                        <span className="text-lg">{fmtCfg?.icon || '📄'}</span>
                        <span className="text-[10px] font-bold tracking-wider">{fmtCfg?.label || item.format || '—'}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 px-4 sm:px-5 py-4">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-surface-900 shrink-0">
                              {new Date(item.scheduled_date).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${typeCls}`}>
                              {TYPE_LABELS[item.content_type]?.icon || ''} {TYPE_LABELS[item.content_type]?.label || item.content_type}
                            </span>
                            {item.is_edited && <span className="text-xs text-amber-600 font-medium">editado</span>}
                            {item.visual_brief ? (
                              <button
                                type="button"
                                onClick={() => setExpandedBrief(expandedBrief === item.id ? null : item.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 transition-colors"
                              >
                                🎨 Brief {expandedBrief === item.id ? '▲' : '▼'}
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-surface-400 font-medium">Sin brief</span>
                                {onGenerateBriefForPost && (
                                  <button
                                    type="button"
                                    onClick={() => onGenerateBriefForPost(item.id)}
                                    disabled={generatingBrief}
                                    className="text-[10px] font-bold uppercase tracking-wider text-brand-600 hover:text-brand-700 underline disabled:opacity-50"
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
                              className="text-xs bg-transparent border border-surface-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            >
                              <option value="draft">Borrador</option>
                              <option value="approved">Aprobado</option>
                              <option value="published">Publicado</option>
                              <option value="archived">Archivado</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                              className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0"
                            >
                              {editingId === item.id ? 'Cerrar' : 'Editar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { if (confirm('¿Eliminar esta publicación?')) handleDelete(item.id); }}
                              className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0"
                            >
                              Borrar
                            </button>
                          </div>
                        </div>

                        {/* Full text */}
                        <p className="text-sm font-semibold text-surface-900 mb-1">{item.idea}</p>
                        <div className="mb-2">
                          <ProductionSpecsDisplay specs={item.production_specs} />
                        </div>
                        {item.copy && (
                          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{item.copy}</p>
                        )}
                        {(item.cta || item.post_goal || (item.hashtags && item.hashtags.length > 0)) && (
                          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-surface-500">
                            {item.cta && <span><span className="font-medium text-surface-600">CTA:</span> {item.cta}</span>}
                            {item.post_goal && <span><span className="font-medium text-surface-600">Objetivo:</span> {item.post_goal}</span>}
                            {item.hashtags && item.hashtags.length > 0 && (
                              <span className="text-surface-400">{item.hashtags.join(' ')}</span>
                            )}
                          </div>
                        )}

                        {expandedBrief === item.id && item.visual_brief && (
                          <div className="mt-3 border-t-2 border-surface-900 pt-3 space-y-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">Brief Creativo</span>
                                  <span className="text-[10px] text-surface-400">— para diseñador / equipo</span>
                                </div>
                                {onGenerateBriefForPost && (
                                  <button
                                    type="button"
                                    onClick={() => onGenerateBriefForPost(item.id)}
                                    disabled={generatingBrief}
                                    className="text-[10px] font-bold uppercase text-brand-600 hover:text-brand-700 border border-brand-300 px-1.5 py-0.5 hover:bg-brand-50 transition-colors disabled:opacity-50"
                                  >
                                    Regenerar
                                  </button>
                                )}
                              </div>
                              <div className="bg-surface-50 border-2 border-surface-200 p-3 text-sm text-surface-800 leading-relaxed whitespace-pre-wrap">
                                {item.visual_brief}
                              </div>
                            </div>
                            {item.visual_prompt && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">Prompt IA Generativa</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.visual_prompt!);
                                    }}
                                    className="text-[10px] font-bold uppercase text-brand-600 hover:text-brand-700 border border-brand-300 px-1.5 py-0.5 hover:bg-brand-50 transition-colors"
                                  >
                                    Copiar
                                  </button>
                                </div>
                                <div className="bg-surface-900 text-emerald-300 border-2 border-surface-700 p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap">
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
