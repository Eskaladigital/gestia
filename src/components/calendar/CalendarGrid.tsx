'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { ContentItem } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { FORMAT_CONFIG, TYPE_LABELS } from './CalendarTable';
import { ProductionSpecsDisplay } from './ProductionSpecsDisplay';

interface CalendarGridProps {
  items: ContentItem[];
  onSelectItem: (item: ContentItem) => void;
  onItemsChange: (next: ContentItem[]) => void;
}

const TYPE_BORDER: Record<string, string> = {
  educativo: 'border-l-blue-400',
  inspiracional: 'border-l-purple-400',
  comercial: 'border-l-amber-400',
  entretenimiento: 'border-l-pink-400',
  personal: 'border-l-emerald-400',
  corporativo: 'border-l-surface-400',
};

const typeColors: Record<string, { bg: string; border: string; dot: string }> = {
  educativo:       { bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  inspiracional:   { bg: 'bg-purple-50',  border: 'border-purple-200',  dot: 'bg-purple-500' },
  comercial:       { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  entretenimiento: { bg: 'bg-pink-50',    border: 'border-pink-200',    dot: 'bg-pink-500' },
  personal:        { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  corporativo:     { bg: 'bg-surface-50', border: 'border-surface-200', dot: 'bg-surface-500' },
};

const WEEK_COLORS = [
  { bg: 'bg-blue-50/40',    label: 'text-blue-600',    bar: 'bg-blue-400' },
  { bg: 'bg-amber-50/40',   label: 'text-amber-600',   bar: 'bg-amber-400' },
  { bg: 'bg-emerald-50/40', label: 'text-emerald-600', bar: 'bg-emerald-400' },
  { bg: 'bg-violet-50/40',  label: 'text-violet-600',  bar: 'bg-violet-400' },
  { bg: 'bg-rose-50/40',    label: 'text-rose-600',    bar: 'bg-rose-400' },
];

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function FormatIcon({ format }: { format: string | null }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (format) {
    case 'story':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="9" strokeDasharray="4 2" /></svg>;
    case 'carrusel':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M19 9h1a1 1 0 011 1v8a2 2 0 01-2 2h-8a1 1 0 01-1-1v-1" /></svg>;
    case 'publicacion':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;
    case 'reel':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="5 3 19 12 5 21 5 3" /></svg>;
    default:
      return <span className="text-[9px] text-surface-400">{format}</span>;
  }
}

function getMonthDays(year: number, month: number) {
  const lastDay = new Date(year, month + 1, 0);
  let startWeekday = new Date(year, month, 1).getDay();
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

  const days: Array<{ date: Date | null; dayNum: number | null }> = [];
  for (let i = 0; i < startWeekday; i++) days.push({ date: null, dayNum: null });
  for (let d = 1; d <= lastDay.getDate(); d++) days.push({ date: new Date(year, month, d), dayNum: d });
  const remainder = days.length % 7;
  if (remainder > 0) for (let i = 0; i < 7 - remainder; i++) days.push({ date: null, dayNum: null });
  return days;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function CalendarGrid({ items, onSelectItem, onItemsChange }: CalendarGridProps) {
  const supabase = createClient();
  const allDates = items.map(i => new Date(i.scheduled_date));
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date();

  const [currentMonth, setCurrentMonth] = useState(minDate.getMonth());
  const [currentYear, setCurrentYear] = useState(minDate.getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const itemsByDate = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const item of items) {
      const d = new Date(item.scheduled_date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const monthsWithContent = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const d = new Date(item.scheduled_date);
      set.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    return set;
  }, [items]);

  // Map ISO week numbers to sequential week indices for coloring
  const weekColorMap = useMemo(() => {
    const days = getMonthDays(currentYear, currentMonth);
    const weekNums: number[] = [];
    for (const day of days) {
      if (day.date) {
        const wn = getISOWeek(day.date);
        if (!weekNums.includes(wn)) weekNums.push(wn);
      }
    }
    const map: Record<number, number> = {};
    weekNums.forEach((wn, i) => { map[wn] = i; });
    return map;
  }, [currentYear, currentMonth]);

  const days = getMonthDays(currentYear, currentMonth);
  const today = new Date();
  const isToday = (d: Date | null) =>
    d !== null && d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }

  const postsThisMonth = items.filter(i => {
    const d = new Date(i.scheduled_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  useEffect(() => {
    if (selectedDay && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedDay]);

  const selectedDayItems = useMemo(() => {
    if (!selectedDay) return [];
    return (itemsByDate[selectedDay] || []);
  }, [selectedDay, itemsByDate]);

  async function handleStatusChange(id: string, status: string) {
    await supabase.from('content_items').update({ status }).eq('id', id);
    onItemsChange(
      items.map(item => (item.id === id ? { ...item, status: status as ContentItem['status'] } : item))
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={prevMonth} className="p-2 border-2 border-surface-900 bg-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-surface-900">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="font-display text-lg sm:text-xl font-black text-surface-900 uppercase tracking-wider min-w-[160px] sm:min-w-[200px] text-center">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h2>
          <button onClick={nextMonth} className="p-2 border-2 border-surface-900 bg-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-surface-900">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest ml-auto sm:ml-0">{postsThisMonth} posts</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-wrap gap-1">
            {Array.from(monthsWithContent).map(key => {
              const [y, m] = key.split('-').map(Number);
              const isActive = y === currentYear && m === currentMonth;
              return (
                <button key={key} onClick={() => { setCurrentYear(y); setCurrentMonth(m); }}
                  className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider border-2 transition-all ${isActive ? 'bg-brand-600 text-white border-surface-900 shadow-brutal-sm' : 'bg-white text-surface-500 border-surface-200 hover:border-surface-900 hover:text-surface-900'}`}>
                  {MONTH_NAMES[m].slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend - hidden on mobile, visible on md+ */}
      <div className="hidden md:flex flex-wrap gap-x-6 gap-y-2 mb-4 bg-white border-2 border-surface-900 shadow-brutal-sm px-4 py-3">
        <div>
          <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.15em] mb-1.5">Formato</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5"><FormatIcon format="story" /><span className="text-xs font-medium text-surface-700">Story</span></div>
            <div className="flex items-center gap-1.5"><FormatIcon format="carrusel" /><span className="text-xs font-medium text-surface-700">Carrusel</span></div>
            <div className="flex items-center gap-1.5"><FormatIcon format="publicacion" /><span className="text-xs font-medium text-surface-700">Publicación</span></div>
            <div className="flex items-center gap-1.5"><FormatIcon format="reel" /><span className="text-xs font-medium text-surface-700">Reel</span></div>
          </div>
        </div>
        <div className="border-l-2 border-surface-900 pl-6">
          <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.15em] mb-1.5">Intención</p>
          <div className="flex items-center gap-3">
            {[
              { key: 'educativo', label: 'Educativo', dot: 'bg-blue-500' },
              { key: 'inspiracional', label: 'Inspiracional', dot: 'bg-purple-500' },
              { key: 'comercial', label: 'Comercial', dot: 'bg-amber-500' },
              { key: 'entretenimiento', label: 'Entretenim.', dot: 'bg-pink-500' },
              { key: 'personal', label: 'Personal', dot: 'bg-emerald-500' },
              { key: 'corporativo', label: 'Corporativo', dot: 'bg-surface-500' },
            ].map(t => (
              <div key={t.key} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 border border-surface-900 ${t.dot}`} />
                <span className="text-xs font-medium text-surface-700">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-l-2 border-surface-900 pl-6">
          <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.15em] mb-1.5">Semana</p>
          <div className="flex items-center gap-2">
            {Object.values(weekColorMap).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map(idx => (
              <div key={idx} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 border border-surface-900 ${WEEK_COLORS[idx % WEEK_COLORS.length].bar}`} />
                <span className="text-xs font-medium text-surface-500">Sem {idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Grid */}
      <div className="hidden md:block bg-white border-2 border-surface-900 shadow-brutal overflow-hidden">
        <div className="grid grid-cols-7 border-b-2 border-surface-900 bg-surface-50">
          {WEEKDAYS.map(day => (
            <div key={day} className="px-2 py-2.5 text-center text-[10px] font-bold text-surface-900 uppercase tracking-[0.15em]">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dateKey = day.date ? `${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}` : '';
            const dayItems = dateKey ? (itemsByDate[dateKey] || []) : [];
            const hasItems = dayItems.length > 0;
            const todayMark = isToday(day.date);

            const weekIdx = day.date ? weekColorMap[getISOWeek(day.date)] ?? 0 : 0;
            const weekColor = day.date ? WEEK_COLORS[weekIdx % WEEK_COLORS.length] : null;
            const isMonday = day.date ? day.date.getDay() === 1 : false;

            return (
              <div key={i} className={`min-h-[120px] border-b border-r border-surface-200 p-1.5 transition-colors relative ${
                day.date ? (weekColor?.bg || 'bg-white') : 'bg-surface-50/30'
              } ${hasItems ? 'hover:brightness-95' : ''}`}>
                {day.dayNum !== null && (
                  <>
                    {isMonday && weekColor && (
                      <div className={`absolute top-0 left-0 w-full h-1 ${weekColor.bar}`} />
                    )}
                    <div className="flex items-center gap-1 mb-1">
                      {hasItems ? (
                        <button
                          type="button"
                          title="Ver publicaciones completas del día"
                          onClick={() => setSelectedDay(dateKey === selectedDay ? null : dateKey)}
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center transition-colors ${
                            todayMark ? 'bg-brand-600 text-white border-2 border-surface-900' : 'text-surface-900 hover:bg-surface-200'
                          } ${dateKey === selectedDay ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`}
                        >
                          {day.dayNum}
                        </button>
                      ) : (
                        <div
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center ${
                            todayMark ? 'bg-brand-600 text-white border-2 border-surface-900' : 'text-surface-400'
                          }`}
                        >
                          {day.dayNum}
                        </div>
                      )}
                      {isMonday && weekColor && (
                        <span className={`text-[9px] font-bold uppercase ${weekColor.label}`}>S{weekIdx + 1}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayItems.map((item) => {
                        const colors = typeColors[item.content_type] || typeColors.corporativo;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onSelectItem(item);
                            }}
                            className={`w-full text-left p-1.5 border-2 border-surface-900 ${colors.bg} shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer`}
                          >
                            <div className="flex items-start gap-1">
                              <div className="mt-0.5 shrink-0 text-surface-500 flex flex-col items-center gap-0.5">
                                <FormatIcon format={item.format} />
                                {item.visual_brief && (
                                  <div className="w-2 h-2 bg-emerald-400 border border-surface-900" title="Brief visual" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-surface-900 line-clamp-2 leading-tight">{item.idea}</p>
                                {item.copy && (
                                  <p className="text-[10px] text-surface-500 line-clamp-1 mt-0.5 leading-tight">{item.copy}</p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="hidden md:block text-xs text-surface-500 mt-2 mb-1 max-w-3xl">
        Pulsa el <strong>número del día</strong> (si tiene publicaciones) para ver debajo el mismo detalle que en lista: copy completo, CTA, hashtags y{' '}
        <strong>estado</strong> (borrador → aprobado).
      </p>

      {/* Mobile compact monthly grid */}
      <div className="md:hidden">
        <div className="bg-white border-2 border-surface-900 shadow-brutal overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b-2 border-surface-900 bg-surface-50">
            {WEEKDAYS_SHORT.map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-black text-surface-900 uppercase tracking-widest">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dateKey = day.date ? `${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}` : '';
              const dayItems = dateKey ? (itemsByDate[dateKey] || []) : [];
              const hasItems = dayItems.length > 0;
              const todayMark = isToday(day.date);
              const isSelected = dateKey === selectedDay;

              return (
                <button
                  key={i}
                  type="button"
                  disabled={!day.date}
                  onClick={() => {
                    if (!day.date || !hasItems) { setSelectedDay(null); return; }
                    setSelectedDay(isSelected ? null : dateKey);
                  }}
                  className={`min-h-[52px] border-b border-r border-surface-200 p-1 flex flex-col items-center gap-0.5 transition-colors relative ${
                    !day.date ? 'bg-surface-50/30' : isSelected ? 'bg-brand-50 ring-2 ring-inset ring-brand-600' : hasItems ? 'active:bg-surface-100' : ''
                  }`}
                >
                  {day.dayNum !== null && (
                    <>
                      <div className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center ${
                        todayMark ? 'bg-brand-600 text-white border-2 border-surface-900' : hasItems ? 'text-surface-900 font-black' : 'text-surface-400'
                      }`}>
                        {day.dayNum}
                      </div>
                      {hasItems && (
                        <div className="flex items-center justify-center gap-0.5 flex-wrap">
                          {dayItems.slice(0, 3).map((item) => {
                            const dotColor = typeColors[item.content_type]?.dot || 'bg-surface-400';
                            return (
                              <div key={item.id} className="flex items-center gap-0">
                                <div className={`w-1.5 h-1.5 border border-surface-900 ${dotColor}`} />
                              </div>
                            );
                          })}
                          {dayItems.length > 3 && (
                            <span className="text-[8px] text-surface-900 font-black">+{dayItems.length - 3}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detalle del día: texto completo + estado (PC y móvil) — en PC pulsa el número del día en la cuadrícula */}
      {selectedDay && selectedDayItems.length > 0 && (
        <div
          ref={detailRef}
          className="mt-4 bg-white border-2 border-surface-900 shadow-brutal overflow-hidden"
        >
          <div className="px-4 py-3 bg-surface-50 border-b-2 border-surface-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-surface-900 text-sm uppercase tracking-wider">
                {(() => {
                  const [y, m, d] = selectedDay.split('-').map(Number);
                  return new Date(y, m, d).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  });
                })()}
              </span>
              <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-1.5 py-0.5 uppercase tracking-widest">
                {selectedDayItems.length} {selectedDayItems.length === 1 ? 'post' : 'posts'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs font-bold text-surface-900 uppercase tracking-wider border-2 border-surface-900 px-3 py-1 hover:bg-surface-900 hover:text-white transition-colors"
            >
              Cerrar
            </button>
          </div>
          <div className="divide-y-2 divide-surface-200">
            {selectedDayItems.map(item => {
              const fmtCfg = item.format ? FORMAT_CONFIG[item.format] : null;
              const tb = TYPE_BORDER[item.content_type] || TYPE_BORDER.corporativo;
              const typeCls = typeColors[item.content_type] || typeColors.corporativo;
              return (
                <div
                  key={item.id}
                  className={`flex flex-col sm:flex-row border-l-4 ${tb} bg-white`}
                >
                  <div
                    className={`shrink-0 sm:w-24 flex flex-row sm:flex-col items-center justify-center gap-2 py-3 px-3 sm:px-2 ${fmtCfg?.pill || 'bg-surface-500 text-white'}`}
                  >
                    <span className="text-lg">{fmtCfg?.icon || '📄'}</span>
                    <span className="text-[10px] font-black tracking-wider text-center uppercase">
                      {fmtCfg?.label || item.format || '—'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 border-2 border-surface-900 text-xs font-bold ${typeCls.bg} text-surface-900`}
                        >
                          {TYPE_LABELS[item.content_type]?.icon}{' '}
                          {TYPE_LABELS[item.content_type]?.label || item.content_type}
                        </span>
                        {item.is_edited && (
                          <span className="text-xs text-amber-600 font-bold uppercase">editado</span>
                        )}
                        {item.visual_brief ? (
                          <span className="text-xs text-emerald-600 font-bold uppercase">brief</span>
                        ) : (
                          <span className="text-xs text-surface-300 font-bold uppercase">sin brief</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={item.status}
                          onChange={e => handleStatusChange(item.id, e.target.value)}
                          className="text-xs font-bold bg-white border-2 border-surface-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        >
                          <option value="draft">Borrador</option>
                          <option value="approved">Aprobado</option>
                          <option value="published">Publicado</option>
                          <option value="archived">Archivado</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onSelectItem(item)}
                          className="text-xs font-bold text-white bg-brand-600 border-2 border-surface-900 px-3 py-1 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all uppercase tracking-wider"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-surface-900 mb-1">{item.idea}</p>
                    <div className="mb-2">
                      <ProductionSpecsDisplay specs={item.production_specs} compact />
                    </div>
                    {item.copy && (
                      <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{item.copy}</p>
                    )}
                    {(item.cta || item.post_goal || (item.hashtags && item.hashtags.length > 0)) && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-surface-500">
                        {item.cta && (
                          <span>
                            <span className="font-bold text-surface-700">CTA:</span> {item.cta}
                          </span>
                        )}
                        {item.post_goal && (
                          <span>
                            <span className="font-bold text-surface-700">Objetivo:</span> {item.post_goal}
                          </span>
                        )}
                        {item.hashtags && item.hashtags.length > 0 && (
                          <span className="text-surface-400 font-medium">{item.hashtags.join(' ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
