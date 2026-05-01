'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { CompetitorAnalysis } from '@/types';

interface CompetitorsCardProps {
  projectId: string;
  strategyId: string | null;
  competitors: any[]; // The manually declared competitors
  initialAnalysis: CompetitorAnalysis | null;
}

const inputClass = 'w-full px-3 py-2 border-2 border-surface-900 bg-white text-surface-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500';

function CompetitorsCardEditForm({
  localData,
  setLocalData,
  onSave,
  onCancel,
  saving
}: {
  localData: Partial<CompetitorAnalysis>;
  setLocalData: (d: Partial<CompetitorAnalysis>) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const updateArrayField = (field: keyof CompetitorAnalysis, val: string) => {
    const arr = val.split('\n').map(s => s.trim()).filter(Boolean);
    setLocalData({ ...localData, [field]: arr });
  };

  const addCompetitor = () => {
    const current = localData.competitors || [];
    setLocalData({
      ...localData,
      competitors: [...current, { name: '', strengths: [], weaknesses: [], detected_content_types: [], estimated_frequency: '', tone_detected: '' }]
    });
  };

  const updateCompetitor = (idx: number, field: string, val: string | string[]) => {
    const newComps = [...(localData.competitors || [])];
    newComps[idx] = { ...newComps[idx], [field]: val };
    setLocalData({ ...localData, competitors: newComps });
  };

  const removeCompetitor = (idx: number) => {
    const newComps = [...(localData.competitors || [])];
    newComps.splice(idx, 1);
    setLocalData({ ...localData, competitors: newComps });
  };

  return (
    <form onSubmit={onSave} className="p-6 space-y-8 bg-surface-50">
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Oportunidades de mercado (una por línea)</label>
          <textarea
            value={(localData.market_opportunities || []).join('\n')}
            onChange={e => updateArrayField('market_opportunities', e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="Ej: Nicho desatendido en..."
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Ideas de diferenciación (una por línea)</label>
          <textarea
            value={(localData.differentiation_ideas || []).join('\n')}
            onChange={e => updateArrayField('differentiation_ideas', e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="Ej: Tono más humorístico..."
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider">Análisis IA por Competidor</label>
          <button type="button" onClick={addCompetitor} className="text-[10px] font-bold uppercase tracking-wider bg-surface-900 text-white px-3 py-1 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">+ Añadir</button>
        </div>
        <div className="space-y-4">
          {(localData.competitors || []).map((c, i) => (
            <div key={i} className="border-2 border-surface-200 bg-white p-4 relative space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest block mb-1">Nombre de la marca</span>
                  <input type="text" value={c.name || ''} onChange={e => updateCompetitor(i, 'name', e.target.value)} className={inputClass} placeholder="Nombre" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest block mb-1">Tono detectado</span>
                  <input type="text" value={c.tone_detected || ''} onChange={e => updateCompetitor(i, 'tone_detected', e.target.value)} className={inputClass} placeholder="Ej: Formal" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest block mb-1">Frecuencia estimada</span>
                  <input type="text" value={c.estimated_frequency || ''} onChange={e => updateCompetitor(i, 'estimated_frequency', e.target.value)} className={inputClass} placeholder="Ej: 3 post / semana" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block mb-1">Fortalezas (una por línea)</span>
                  <textarea value={(c.strengths || []).join('\n')} onChange={e => updateCompetitor(i, 'strengths', e.target.value.split('\n').filter(Boolean))} rows={3} className={inputClass} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block mb-1">Debilidades (una por línea)</span>
                  <textarea value={(c.weaknesses || []).join('\n')} onChange={e => updateCompetitor(i, 'weaknesses', e.target.value.split('\n').filter(Boolean))} rows={3} className={inputClass} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest block mb-1">Tipos de contenido (por línea)</span>
                  <textarea value={(c.detected_content_types || []).join('\n')} onChange={e => updateCompetitor(i, 'detected_content_types', e.target.value.split('\n').filter(Boolean))} rows={3} className={inputClass} />
                </div>
              </div>
              
              <button type="button" onClick={() => removeCompetitor(i)} className="absolute -top-3 -right-3 w-6 h-6 bg-red-100 text-red-600 border-2 border-red-200 rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-200 transition-colors">×</button>
            </div>
          ))}
          {(localData.competitors || []).length === 0 && <p className="text-xs text-surface-500 italic">No hay análisis de competidores.</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t-2 border-surface-200">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-surface-900 bg-white text-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving} className="px-6 py-2 text-xs font-bold uppercase tracking-wider border-2 border-surface-900 bg-brand-600 text-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar análisis'}
        </button>
      </div>
    </form>
  );
}

export function CompetitorsCard({
  projectId,
  strategyId,
  competitors,
  initialAnalysis,
}: CompetitorsCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localData, setLocalData] = useState<Partial<CompetitorAnalysis>>(initialAnalysis || {});

  useEffect(() => {
    setLocalData(initialAnalysis || {});
  }, [initialAnalysis]);

  const hasData = !!initialAnalysis;

  async function saveEdits(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (strategyId) {
        const { error: updateErr } = await supabase
          .from('strategies')
          .update({ competitor_analysis: localData })
          .eq('id', strategyId);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { error: insertErr } = await supabase
          .from('strategies')
          .insert({
            project_id: projectId,
            competitor_analysis: localData,
            updated_at: new Date().toISOString()
          });
        if (insertErr) throw new Error(insertErr.message);
      }

      setIsEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const serpDiscoveryUrls: string[] = Array.isArray(initialAnalysis?.discovered_serp_urls)
    ? (initialAnalysis!.discovered_serp_urls as string[]).filter(
        (u) => typeof u === 'string' && u.trim().length > 0
      )
    : [];
    
  const aiCompetitorRows: any[] = Array.isArray(initialAnalysis?.competitors)
    ? initialAnalysis!.competitors
    : [];
    
  const declaredCompetitorList = competitors ?? [];
  
  function aiNameMatchesDeclaredComp(aiName: string): boolean {
    const n = aiName.trim().toLowerCase();
    if (!n) return true;
    return declaredCompetitorList.some((comp: { name?: string }) => {
      const dbn = (comp.name || '').trim().toLowerCase();
      if (!dbn) return false;
      return n.includes(dbn) || dbn.includes(n);
    });
  }
  
  const extraAiCompetitors = aiCompetitorRows.filter(
    c => typeof c.name === 'string' && (c.name as string).trim() && !aiNameMatchesDeclaredComp(c.name as string)
  );

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b-2 border-surface-900">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-surface-900 mb-1">
            Competidores <span className="text-surface-400">({competitors.length} declarados)</span>
          </h2>
          <p className="text-surface-400 text-xs font-medium mt-0.5">
            Análisis de las fortalezas, debilidades y tácticas de tu competencia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto shrink-0">
          {hasData && (
            <button
              onClick={() => {
                if (isEditing) {
                  setLocalData(initialAnalysis || {});
                  setIsEditing(false);
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={saving}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-150 disabled:opacity-50 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${isEditing ? 'bg-surface-100 text-surface-600' : 'bg-surface-900 text-white'}`}
            >
              {isEditing ? 'Cancelar' : 'Editar Análisis'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {(!hasData || competitors.length === 0) && !isEditing && (
        <div className="border-2 border-dashed border-surface-900 bg-surface-50/50 p-8 text-center text-sm text-surface-500 m-6">
          {!hasData ? (
            <>Aún no hay análisis de competidores en la estrategia. Usa <strong>Analizar competidores</strong> en Procesamiento con IA.</>
          ) : (
            <>No tienes competidores declarados. Añádelos en la configuración o deja que la IA los encuentre en el análisis web.</>
          )}
        </div>
      )}

      {hasData && (
        isEditing ? (
          <CompetitorsCardEditForm
            localData={localData}
            setLocalData={setLocalData}
            onSave={saveEdits}
            onCancel={() => {
              setLocalData(initialAnalysis || {});
              setIsEditing(false);
            }}
            saving={saving}
          />
        ) : (
          <div className="p-6">
            {serpDiscoveryUrls.length > 0 && (
              <p className="text-xs text-surface-500 mb-3">
                El análisis incluyó además <strong>{serpDiscoveryUrls.length}</strong> sitio(s) hallados en Google (no sustituyen a los declarados; ver bloque siguiente).
              </p>
            )}
            {serpDiscoveryUrls.length === 0 && extraAiCompetitors.length > 0 && (
              <p className="text-xs text-surface-500 mb-3">
                La IA devolvió perfiles de <strong>{extraAiCompetitors.length}</strong> actor(es) adicional(es) respecto a los declarados.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {competitors.map((comp: any) => {
                const aiComp = aiCompetitorRows.find(
                  c =>
                    typeof c.name === 'string' &&
                    comp.name &&
                    c.name.toLowerCase().includes(String(comp.name).toLowerCase())
                ) as Record<string, unknown> | undefined;
                return (
                  <div key={comp.id} className="bg-surface-50 p-4 border-2 border-surface-900 shadow-brutal-sm hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-surface-900">{comp.name}</p>
                        {comp.url && (
                          <a href={comp.url.startsWith('http') ? comp.url : `https://${comp.url}`} target="_blank" rel="noopener" className="text-xs text-brand-600 hover:underline">
                            {comp.url}
                          </a>
                        )}
                      </div>
                    </div>
                    {comp.reason && <p className="text-xs text-surface-600 mb-2">Motivo: {comp.reason}</p>}

                    {aiComp && (
                      <div className="mt-2 pt-2 border-t border-surface-200 space-y-1.5">
                        {!!aiComp.tone_detected && (
                          <p className="text-xs text-surface-600"><span className="font-medium">Tono:</span> {String(aiComp.tone_detected)}</p>
                        )}
                        {!!aiComp.estimated_frequency && (
                          <p className="text-xs text-surface-600"><span className="font-medium">Frecuencia:</span> {String(aiComp.estimated_frequency)}</p>
                        )}
                        {Array.isArray(aiComp.strengths) && aiComp.strengths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-emerald-600 uppercase">Fortalezas</p>
                            <ul className="text-xs text-surface-600 list-disc list-inside">
                              {(aiComp.strengths as string[]).map((s: string, i: number) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiComp.weaknesses) && aiComp.weaknesses.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-red-500 uppercase">Debilidades</p>
                            <ul className="text-xs text-surface-600 list-disc list-inside">
                              {(aiComp.weaknesses as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiComp.detected_content_types) && aiComp.detected_content_types.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(aiComp.detected_content_types as string[]).map((t: string) => (
                              <span key={t} className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {serpDiscoveryUrls.length > 0 && (
              <div className="mt-4 border-2 border-surface-900 bg-amber-50/40 p-4">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">Sitios detectados en Google (usados en el análisis)</p>
                <p className="text-xs text-surface-600 mb-3">
                  No están en la tabla de competidores del proyecto; se obtuvieron por búsqueda orgánica (sector + ubicación). Vuelve a ejecutar <strong>Analizar competidores</strong> para refrescar esta lista.
                </p>
                <ul className="space-y-2">
                  {serpDiscoveryUrls.map((url, i) => (
                    <li key={`${url}-${i}`}>
                      <a
                        href={url.startsWith('http') ? url : `https://${url}`}
                        target="_blank"
                        rel="noopener"
                        className="text-xs text-brand-600 hover:underline break-all font-mono"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {extraAiCompetitors.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-surface-600 uppercase tracking-wider mb-2">Otros actores en el informe IA</p>
                <p className="text-xs text-surface-500 mb-3">
                  Entradas del JSON de análisis que no coinciden con tus competidores declarados (p. ej. marcas vistas en el scrape de Google).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {extraAiCompetitors.map((aiComp, idx) => (
                    <div key={`extra-${idx}`} className="bg-violet-50/50 p-4 border-2 border-surface-900 shadow-brutal-sm">
                      <p className="font-bold text-surface-900">{String(aiComp.name)}</p>
                      <div className="mt-2 pt-2 border-t border-violet-200 space-y-1.5">
                        {!!aiComp.tone_detected && (
                          <p className="text-xs text-surface-600"><span className="font-medium">Tono:</span> {String(aiComp.tone_detected)}</p>
                        )}
                        {!!aiComp.estimated_frequency && (
                          <p className="text-xs text-surface-600"><span className="font-medium">Frecuencia:</span> {String(aiComp.estimated_frequency)}</p>
                        )}
                        {Array.isArray(aiComp.strengths) && aiComp.strengths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-emerald-600 uppercase">Fortalezas</p>
                            <ul className="text-xs text-surface-600 list-disc list-inside">
                              {(aiComp.strengths as string[]).map((s: string, i: number) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiComp.weaknesses) && aiComp.weaknesses.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-red-500 uppercase">Debilidades</p>
                            <ul className="text-xs text-surface-600 list-disc list-inside">
                              {(aiComp.weaknesses as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiComp.detected_content_types) && aiComp.detected_content_types.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(aiComp.detected_content_types as string[]).map((t: string) => (
                              <span key={t} className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(initialAnalysis?.market_opportunities) && initialAnalysis.market_opportunities.length > 0 && (
              <div className="mt-4 bg-emerald-50/50 p-4 border-2 border-surface-900">
                <p className="text-xs font-medium text-emerald-700 mb-2">Oportunidades de mercado detectadas</p>
                <ul className="text-sm text-surface-800 space-y-1">
                  {(initialAnalysis.market_opportunities as string[]).map((o: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">+</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(initialAnalysis?.differentiation_ideas) && initialAnalysis.differentiation_ideas.length > 0 && (
              <div className="mt-3 bg-blue-50/50 p-4 border-2 border-surface-900">
                <p className="text-xs font-medium text-blue-700 mb-2">Ideas de diferenciación</p>
                <ul className="text-sm text-surface-800 space-y-1">
                  {(initialAnalysis.differentiation_ideas as string[]).map((d: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">→</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
