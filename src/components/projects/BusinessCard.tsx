'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { BusinessAnalysis } from '@/types';

interface BusinessCardProps {
  projectId: string;
  strategyId: string | null;
  initialData: Partial<BusinessAnalysis> | null;
}

const inputClass = 'w-full px-3 py-2 border-2 border-surface-900 bg-white text-surface-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500';

function BusinessCardEditForm({
  localData,
  setLocalData,
  onSave,
  onCancel,
  saving
}: {
  localData: Partial<BusinessAnalysis>;
  setLocalData: (d: Partial<BusinessAnalysis>) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const updateField = (field: keyof BusinessAnalysis, val: string) => {
    setLocalData({ ...localData, [field]: val });
  };

  const updateArrayField = (field: keyof BusinessAnalysis, val: string) => {
    const arr = val.split('\n').map(s => s.trim()).filter(Boolean);
    setLocalData({ ...localData, [field]: arr });
  };

  return (
    <form onSubmit={onSave} className="p-6 space-y-8 bg-surface-50">
      <div>
        <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Descripción detallada</label>
        <textarea
          value={localData.detailed_business_description || ''}
          onChange={e => updateField('detailed_business_description', e.target.value)}
          rows={4}
          className={inputClass}
          placeholder="Ej: Somos una empresa dedicada a..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Propuesta de valor</label>
          <textarea
            value={localData.value_proposition || ''}
            onChange={e => updateField('value_proposition', e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Ej: Calidad y servicio..."
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Público objetivo</label>
          <textarea
            value={localData.target_audience || ''}
            onChange={e => updateField('target_audience', e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Ej: Profesionales de..."
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Posicionamiento</label>
          <textarea
            value={localData.positioning || ''}
            onChange={e => updateField('positioning', e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Ej: Líderes en..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Personalidad de marca</label>
        <textarea
          value={localData.brand_personality || ''}
          onChange={e => updateField('brand_personality', e.target.value)}
          rows={2}
          className={inputClass}
          placeholder="Ej: Innovadora, cercana..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Servicios / Oferta (uno por línea)</label>
          <textarea
            value={(localData.key_services || []).join('\n')}
            onChange={e => updateArrayField('key_services', e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="Ej: Consultoría\nDesarrollo web..."
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Diferenciales (uno por línea)</label>
          <textarea
            value={(localData.unique_selling_points || []).join('\n')}
            onChange={e => updateArrayField('unique_selling_points', e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="Ej: Experiencia de 10 años\nSoporte 24/7..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Oportunidades de contenido (una por línea)</label>
        <textarea
          value={(localData.content_opportunities || []).join('\n')}
          onChange={e => updateArrayField('content_opportunities', e.target.value)}
          rows={4}
          className={inputClass}
          placeholder="Ej: Casos de éxito\nTutoriales..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t-2 border-surface-200">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-surface-900 bg-white text-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving} className="px-6 py-2 text-xs font-bold uppercase tracking-wider border-2 border-surface-900 bg-brand-600 text-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar ficha'}
        </button>
      </div>
    </form>
  );
}

export function BusinessCard({
  projectId,
  strategyId,
  initialData,
}: BusinessCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localData, setLocalData] = useState<Partial<BusinessAnalysis>>(initialData || {});

  useEffect(() => {
    setLocalData(initialData || {});
  }, [initialData]);

  const hasData = !!initialData;

  async function saveEdits(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        web_site_analysis: localData,
        value_proposition: localData.value_proposition,
        target_audience: localData.target_audience,
        positioning: localData.positioning,
        updated_at: new Date().toISOString()
      };

      if (strategyId) {
        const { error: updateErr } = await supabase
          .from('strategies')
          .update(payload)
          .eq('id', strategyId);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { error: insertErr } = await supabase
          .from('strategies')
          .insert({
            project_id: projectId,
            ...payload
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

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b-2 border-surface-900">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-surface-900 mb-1">Ficha del negocio / Análisis Web</h2>
          <p className="text-surface-400 text-xs font-medium mt-0.5">
            Resultado del análisis de la web. Los ajustes operativos están en <strong>Ajustes del proyecto</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto shrink-0">
          {hasData && (
            <button
              onClick={() => {
                if (isEditing) {
                  setLocalData(initialData || {});
                  setIsEditing(false);
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={saving}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-150 disabled:opacity-50 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${isEditing ? 'bg-surface-100 text-surface-600' : 'bg-surface-900 text-white'}`}
            >
              {isEditing ? 'Cancelar' : 'Editar Ficha'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {!hasData && (
        <div className="border-2 border-dashed border-surface-900 bg-surface-50/50 p-8 text-center text-sm text-surface-500 m-6">
          Aún no hay análisis de web en la estrategia. Usa <strong>Analizar web</strong> o <strong>Análisis base completo</strong> en
          Procesamiento con IA.
        </div>
      )}

      {hasData && (
        isEditing ? (
          <BusinessCardEditForm
            localData={localData}
            setLocalData={setLocalData}
            onSave={saveEdits}
            onCancel={() => {
              setLocalData(initialData || {});
              setIsEditing(false);
            }}
            saving={saving}
          />
        ) : (
          <div className="p-6">
            <div className="mb-6 border-2 border-surface-900 bg-brand-50/30 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-mono font-bold bg-brand-600 text-white px-2 py-0.5 border-2 border-surface-900 uppercase tracking-widest">Análisis IA</span>
                {localData.confidence_level && (
                  <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 rounded uppercase tracking-widest">
                    Confianza: {localData.confidence_level}
                  </span>
                )}
              </div>
              
              {localData.detailed_business_description && (
                <p className="text-sm text-surface-800 leading-relaxed whitespace-pre-wrap mb-4">{localData.detailed_business_description}</p>
              )}

              {(localData.value_proposition || localData.target_audience || localData.positioning) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-brand-100/80">
                  {localData.value_proposition && (
                    <div>
                      <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Propuesta de valor</p>
                      <p className="text-sm text-surface-800 leading-snug">{localData.value_proposition}</p>
                    </div>
                  )}
                  {localData.target_audience && (
                    <div>
                      <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Público objetivo</p>
                      <p className="text-sm text-surface-800 leading-snug">{localData.target_audience}</p>
                    </div>
                  )}
                  {localData.positioning && (
                    <div>
                      <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Posicionamiento</p>
                      <p className="text-sm text-surface-800 leading-snug">{localData.positioning}</p>
                    </div>
                  )}
                </div>
              )}

              {localData.brand_personality && (
                <div className="mt-4 pt-3 border-t border-brand-100/80">
                  <p className="text-[10px] font-medium text-surface-500 uppercase mb-1">Personalidad de marca</p>
                  <p className="text-sm text-surface-800">{localData.brand_personality}</p>
                </div>
              )}

              {(localData.key_services?.length || localData.unique_selling_points?.length) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-100/80">
                  {localData.key_services && localData.key_services.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-surface-500 uppercase mb-2">Servicios / oferta detectada</p>
                      <ul className="text-sm text-surface-800 space-y-1 list-disc list-inside">
                        {localData.key_services.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {localData.unique_selling_points && localData.unique_selling_points.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-surface-500 uppercase mb-2">Diferenciales</p>
                      <ul className="text-sm text-surface-800 space-y-1 list-disc list-inside">
                        {localData.unique_selling_points.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              {localData.content_opportunities && localData.content_opportunities.length > 0 && (
                <div className="mt-4 pt-3 border-t border-brand-100/80">
                  <p className="text-[10px] font-medium text-surface-500 uppercase mb-2">Oportunidades de contenido</p>
                  <ul className="text-sm text-surface-800 space-y-1">
                    {localData.content_opportunities.map((o, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-brand-500 shrink-0">·</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
