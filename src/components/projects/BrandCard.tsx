'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { BrandColorEntry, BrandFontEntry, BrandIdentityDetail } from '@/types';

/** Imagen con ocultación en error; solo usable en componentes cliente o importada desde ellos. */
export function FaviconImg({
  src,
  alt = '',
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

interface BrandCardProps {
  projectId: string;
  projectUrl: string | null;
  brandColors: BrandColorEntry[];
  brandFonts: BrandFontEntry[];
  brandLogoUrl: string | null;
  brandFaviconUrl: string | null;
  brandSummary: string | null;
  brandAnalyzedAt: string | null;
  brandIdentityDetail?: BrandIdentityDetail | null;
  /** Si true, no se muestra el botón propio: el análisis de marca va en el flujo «Análisis base completo». */
  manualAnalyzeDisabled?: boolean;
}

const inputClass = 'w-full px-3 py-2 border-2 border-surface-900 bg-white text-surface-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500';

function DetailAccordion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-2 border-surface-900 transition-colors">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-surface-900 uppercase tracking-wider flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-[10px] font-normal text-surface-400 shrink-0 group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-surface-700 leading-relaxed border-t-2 border-surface-900 pt-3 whitespace-pre-wrap">
        {children}
      </div>
    </details>
  );
}

function IdentityDetailSections({ detail }: { detail: BrandIdentityDetail }) {
  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">Análisis en profundidad</p>
      {detail.palette_analysis && (
        <DetailAccordion title="Paleta y armonía cromática">{detail.palette_analysis}</DetailAccordion>
      )}
      {detail.typography_analysis && (
        <DetailAccordion title="Tipografía y jerarquía">{detail.typography_analysis}</DetailAccordion>
      )}
      {detail.layout_components && (
        <DetailAccordion title="Layout, componentes y espaciado">{detail.layout_components}</DetailAccordion>
      )}
      {detail.imagery_iconography && (
        <DetailAccordion title="Imagen, iconografía y estilo visual">{detail.imagery_iconography}</DetailAccordion>
      )}
      {detail.accessibility_notes && (
        <DetailAccordion title="Accesibilidad y contraste">{detail.accessibility_notes}</DetailAccordion>
      )}
      {(detail.brand_feel_keywords?.length ?? 0) > 0 && (
        <div className="border-2 border-surface-900 bg-surface-50/50 px-4 py-3">
          <p className="text-xs font-semibold text-surface-600 mb-2">Sensación de marca</p>
          <div className="flex flex-wrap gap-1.5">
            {detail.brand_feel_keywords!.map((kw, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-lg bg-white border border-surface-200 text-surface-700">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
      {(detail.css_tokens_cited?.length ?? 0) > 0 && (
        <div className="border-2 border-surface-900 bg-surface-50/50 px-4 py-3">
          <p className="text-xs font-semibold text-surface-600 mb-2">Tokens / variables CSS citadas</p>
          <ul className="space-y-1.5 text-sm text-surface-700">
            {detail.css_tokens_cited!.map((t, i) => (
              <li key={i}>
                <code className="text-xs bg-white px-1.5 py-0.5 rounded border border-surface-200">{t.token}</code>
                {t.role ? <span className="text-surface-500"> — {t.role}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(detail.rrss_practical_tips?.length ?? 0) > 0 && (
        <div className="border-2 border-surface-900 bg-surface-50/50 px-4 py-3">
          <p className="text-xs font-semibold text-surface-600 mb-2">Consejos prácticos para redes</p>
          <ul className="list-disc pl-4 space-y-1.5 text-sm text-surface-700">
            {detail.rrss_practical_tips!.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
      {((detail.dos?.length ?? 0) > 0 || (detail.donts?.length ?? 0) > 0) && (
        <div className="grid sm:grid-cols-2 gap-2">
          {(detail.dos?.length ?? 0) > 0 && (
            <div className="border-2 border-surface-900 bg-emerald-50/40 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2">Qué sí hacer</p>
              <ul className="list-disc pl-4 space-y-1 text-sm text-emerald-900/90">
                {detail.dos!.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {(detail.donts?.length ?? 0) > 0 && (
            <div className="border-2 border-surface-900 bg-red-50/40 px-4 py-3">
              <p className="text-xs font-semibold text-red-800 mb-2">Qué evitar</p>
              <ul className="list-disc pl-4 space-y-1 text-sm text-red-900/90">
                {detail.donts!.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const USAGE_LABELS: Record<string, string> = {
  primary: 'Primario',
  secondary: 'Secundario',
  accent: 'Acento',
  text: 'Texto',
  background: 'Fondo',
};

const USAGE_ORDER: Record<string, number> = {
  primary: 0,
  secondary: 1,
  accent: 2,
  text: 3,
  background: 4,
};

function BrandCardEditForm({
  localData,
  setLocalData,
  onSave,
  onCancel,
  saving
}: {
  localData: any;
  setLocalData: (d: any) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const updateSummary = (val: string) => setLocalData({ ...localData, brandSummary: val });
  
  const addColor = () => setLocalData({
    ...localData,
    brandColors: [...localData.brandColors, { name: '', hex: '', usage: 'primary', notes: '' }]
  });
  const updateColor = (idx: number, field: string, val: string) => {
    const newColors = [...localData.brandColors];
    newColors[idx] = { ...newColors[idx], [field]: val };
    setLocalData({ ...localData, brandColors: newColors });
  };
  const removeColor = (idx: number) => {
    const newColors = [...localData.brandColors];
    newColors.splice(idx, 1);
    setLocalData({ ...localData, brandColors: newColors });
  };

  const addFont = () => setLocalData({
    ...localData,
    brandFonts: [...localData.brandFonts, { name: '', usage: 'primary', weights: '' }]
  });
  const updateFont = (idx: number, field: string, val: string) => {
    const newFonts = [...localData.brandFonts];
    newFonts[idx] = { ...newFonts[idx], [field]: val };
    setLocalData({ ...localData, brandFonts: newFonts });
  };
  const removeFont = (idx: number) => {
    const newFonts = [...localData.brandFonts];
    newFonts.splice(idx, 1);
    setLocalData({ ...localData, brandFonts: newFonts });
  };

  const updateKeywords = (val: string) => {
    const arr = val.split(',').map(s => s.trim()).filter(Boolean);
    setLocalData({
      ...localData,
      brandIdentityDetail: {
        ...(localData.brandIdentityDetail || {}),
        brand_feel_keywords: arr
      }
    });
  };

  return (
    <form onSubmit={onSave} className="p-6 space-y-8 bg-surface-50">
      <div>
        <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Resumen de marca</label>
        <textarea
          value={localData.brandSummary || ''}
          onChange={e => updateSummary(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="Ej: Somos una marca joven y dinámica..."
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider">Colores corporativos</label>
          <button type="button" onClick={addColor} className="text-[10px] font-bold uppercase tracking-wider bg-surface-900 text-white px-3 py-1 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">+ Añadir color</button>
        </div>
        <div className="space-y-3">
          {localData.brandColors.map((c: any, i: number) => (
            <div key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-2 border-2 border-surface-200 bg-white p-3 relative">
              <div className="flex-1 min-w-[150px] space-y-1">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Nombre</span>
                <input type="text" value={c.name} onChange={e => updateColor(i, 'name', e.target.value)} className={inputClass} placeholder="Ej: Azul Oscuro" />
              </div>
              <div className="w-24 space-y-1">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Hex</span>
                <div className="flex items-center gap-1">
                  <input type="color" value={c.hex || '#000000'} onChange={e => updateColor(i, 'hex', e.target.value)} className="w-8 h-8 p-0 border-0 shrink-0" />
                  <input type="text" value={c.hex} onChange={e => updateColor(i, 'hex', e.target.value)} className={inputClass} placeholder="#000000" />
                </div>
              </div>
              <div className="w-32 space-y-1">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Uso</span>
                <select value={c.usage} onChange={e => updateColor(i, 'usage', e.target.value)} className={inputClass}>
                  <option value="primary">Primario</option>
                  <option value="secondary">Secundario</option>
                  <option value="accent">Acento</option>
                  <option value="text">Texto</option>
                  <option value="background">Fondo</option>
                </select>
              </div>
              <button type="button" onClick={() => removeColor(i)} className="absolute -top-3 -right-3 w-6 h-6 bg-red-100 text-red-600 border-2 border-red-200 rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-200 transition-colors">×</button>
            </div>
          ))}
          {localData.brandColors.length === 0 && <p className="text-xs text-surface-500 italic">No hay colores. Añade uno.</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider">Tipografías</label>
          <button type="button" onClick={addFont} className="text-[10px] font-bold uppercase tracking-wider bg-surface-900 text-white px-3 py-1 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">+ Añadir fuente</button>
        </div>
        <div className="space-y-3">
          {localData.brandFonts.map((f: any, i: number) => (
            <div key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-2 border-2 border-surface-200 bg-white p-3 relative">
              <div className="flex-1 min-w-[150px] space-y-1">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Familia</span>
                <input type="text" value={f.name} onChange={e => updateFont(i, 'name', e.target.value)} className={inputClass} placeholder="Ej: Inter, serif" />
              </div>
              <div className="w-32 space-y-1">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Uso</span>
                <input type="text" value={f.usage} onChange={e => updateFont(i, 'usage', e.target.value)} className={inputClass} placeholder="Ej: Titulares" />
              </div>
              <div className="flex-1 min-w-[100px] space-y-1">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Pesos (opcional)</span>
                <input type="text" value={f.weights || ''} onChange={e => updateFont(i, 'weights', e.target.value)} className={inputClass} placeholder="Ej: 400, 700" />
              </div>
              <button type="button" onClick={() => removeFont(i)} className="absolute -top-3 -right-3 w-6 h-6 bg-red-100 text-red-600 border-2 border-red-200 rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-200 transition-colors">×</button>
            </div>
          ))}
          {localData.brandFonts.length === 0 && <p className="text-xs text-surface-500 italic">No hay fuentes. Añade una.</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">Sensación de marca (Keywords)</label>
        <input
          type="text"
          value={(localData.brandIdentityDetail?.brand_feel_keywords || []).join(', ')}
          onChange={e => updateKeywords(e.target.value)}
          className={inputClass}
          placeholder="Ej: moderno, cercano, profesional (separado por comas)"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t-2 border-surface-200">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-surface-900 bg-white text-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving} className="px-6 py-2 text-xs font-bold uppercase tracking-wider border-2 border-surface-900 bg-brand-600 text-white shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar ADN'}
        </button>
      </div>
    </form>
  );
}

export function BrandCard({
  projectId,
  projectUrl,
  brandColors,
  brandFonts,
  brandLogoUrl,
  brandFaviconUrl,
  brandSummary,
  brandAnalyzedAt,
  brandIdentityDetail = null,
  manualAnalyzeDisabled = false,
}: BrandCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localData, setLocalData] = useState({
    brandColors,
    brandFonts,
    brandLogoUrl,
    brandFaviconUrl,
    brandSummary,
    brandAnalyzedAt,
    brandIdentityDetail,
  });

  useEffect(() => {
    setLocalData({
      brandColors,
      brandFonts,
      brandLogoUrl,
      brandFaviconUrl,
      brandSummary,
      brandAnalyzedAt,
      brandIdentityDetail,
    });
  }, [brandColors, brandFonts, brandLogoUrl, brandFaviconUrl, brandSummary, brandAnalyzedAt, brandIdentityDetail]);

  const hasData = localData.brandAnalyzedAt !== null;

  async function analyzeBrand() {
    if (!projectUrl) return;
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setLocalData({
        brandColors: data.brand.brand_colors || [],
        brandFonts: data.brand.brand_fonts || [],
        brandLogoUrl: data.brand.brand_logo_url,
        brandFaviconUrl: data.brand.brand_favicon_url,
        brandSummary: data.brand.brand_summary,
        brandAnalyzedAt: data.brand.brand_analyzed_at,
        brandIdentityDetail: data.brand.brand_identity_detail ?? null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function parseSafeHex(hex: string): string | null {
    const s = (hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
    return s;
  }

  function contrastColor(hex: string): string {
    const s = parseSafeHex(hex);
    if (!s) return '#111827';
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff';
  }

  async function saveEdits(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from('projects')
        .update({
          brand_colors: localData.brandColors,
          brand_fonts: localData.brandFonts,
          brand_summary: localData.brandSummary,
          brand_identity_detail: localData.brandIdentityDetail,
        })
        .eq('id', projectId);

      if (updateErr) throw new Error(updateErr.message);
      setIsEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal overflow-hidden mb-6">
      <div className="flex items-center justify-between px-6 py-4 border-b-2 border-surface-900">
        <div className="flex items-center gap-3">
          {localData.brandFaviconUrl && (
            <img src={localData.brandFaviconUrl} alt="Favicon" className="w-6 h-6 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <div>
            <h2 className="font-display font-bold text-surface-900">Identidad visual / ADN</h2>
            {localData.brandAnalyzedAt && (
              <p className="text-[10px] text-surface-400 font-mono uppercase tracking-wider">
                Analizado {new Date(localData.brandAnalyzedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!manualAnalyzeDisabled && !isEditing ? (
            <button
              onClick={analyzeBrand}
              disabled={analyzing || !projectUrl}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-150 disabled:opacity-50 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] text-surface-900"
            >
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-brand-600 border-t-transparent rounded-full" />
                  Analizando...
                </span>
              ) : hasData ? (
                'Re-analizar'
              ) : (
                'Analizar marca'
              )}
            </button>
          ) : null}
          {hasData && (
            <button
              onClick={() => {
                if (isEditing) {
                  setLocalData({ brandColors, brandFonts, brandLogoUrl, brandFaviconUrl, brandSummary, brandAnalyzedAt, brandIdentityDetail });
                  setIsEditing(false);
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={analyzing || saving}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-150 disabled:opacity-50 border-2 border-surface-900 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${isEditing ? 'bg-surface-100 text-surface-600' : 'bg-surface-900 text-white'}`}
            >
              {isEditing ? 'Cancelar' : 'Editar ADN'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {!hasData && !analyzing && (
        <div className="px-6 py-10 text-center">
          <p className="text-3xl mb-3">🎨</p>
          <p className="text-surface-600 text-sm">
            {projectUrl
              ? manualAnalyzeDisabled
                ? 'Usa «Análisis base completo» en la sección Procesamiento con IA (más abajo): incluye identidad visual, web, competidores y estrategia.'
                : 'Pulsa «Analizar marca» para detectar colores, fuentes y logo.'
              : 'Configura una URL del proyecto para poder analizar su identidad visual.'}
          </p>
        </div>
      )}

      {analyzing && !hasData && (
        <div className="px-6 py-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent mx-auto mb-3" />
          <p className="text-surface-600 text-sm">
            Visitando la web y generando análisis detallado (puede tardar un poco más que antes)…
          </p>
        </div>
      )}

      {hasData && (
        isEditing ? (
          <BrandCardEditForm
            localData={localData}
            setLocalData={setLocalData}
            onSave={saveEdits}
            onCancel={() => {
              setLocalData({ brandColors, brandFonts, brandLogoUrl, brandFaviconUrl, brandSummary, brandAnalyzedAt, brandIdentityDetail });
              setIsEditing(false);
            }}
            saving={saving}
          />
        ) : (
          <div className="p-6 space-y-5">
          {/* Logo & Summary */}
          <div className="flex items-start gap-5">
            {localData.brandLogoUrl && (
              <div className="shrink-0 w-20 h-20 bg-surface-50 rounded-xl border border-surface-200 flex items-center justify-center p-2 overflow-hidden">
                <img
                  src={localData.brandLogoUrl}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')}
                />
              </div>
            )}
            {localData.brandSummary && (
              <div className="flex-1">
                <p className="text-xs font-medium text-surface-500 mb-1">Resumen de marca</p>
                <p className="text-sm text-surface-800 leading-relaxed">{localData.brandSummary}</p>
              </div>
            )}
          </div>

          {/* Colors */}
          {localData.brandColors.length > 0 && (() => {
            const sorted = [...localData.brandColors].sort(
              (a, b) => (USAGE_ORDER[a.usage] ?? 99) - (USAGE_ORDER[b.usage] ?? 99),
            );
            const hero = sorted.filter((c) => ['primary', 'secondary', 'accent'].includes(c.usage));
            const rest = sorted.filter((c) => !['primary', 'secondary', 'accent'].includes(c.usage));

            return (
              <div>
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Colores corporativos</p>

                {/* Hero palette strip */}
                {hero.length > 0 && (
                  <div className="overflow-hidden border-2 border-surface-900 mb-3">
                    <div className="flex">
                      {hero.map((color, i) => {
                        const safeHex = parseSafeHex(color.hex);
                        const swatchBg = safeHex ?? '#e5e7eb';
                        const fg = contrastColor(swatchBg);
                        return (
                          <div
                            key={i}
                            className="flex-1 relative group transition-all duration-200"
                            style={{ backgroundColor: swatchBg, minHeight: '120px' }}
                          >
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center" style={{ color: fg }}>
                              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                                {USAGE_LABELS[color.usage] || color.usage}
                              </span>
                              <span className="text-lg font-bold tracking-tight">{color.name}</span>
                              <span className="text-xs font-mono opacity-80">{safeHex ?? '—'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hero.some((c) => c.notes) && (
                      <div className="bg-white px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 border-t border-surface-100">
                        {hero.filter((c) => c.notes).map((c, i) => (
                          <p key={i} className="text-[11px] text-surface-500">
                            <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle border border-surface-200" style={{ backgroundColor: parseSafeHex(c.hex) ?? '#e5e7eb' }} />
                            {c.notes}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Auxiliary colors */}
                {rest.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {rest.map((color, i) => {
                      const safeHex = parseSafeHex(color.hex);
                      const swatchBg = safeHex ?? '#e5e7eb';
                      return (
                        <div key={i} className="flex items-center gap-2.5 border-2 border-surface-900 bg-white px-3 py-2">
                          <span
                            className="w-8 h-8 rounded-lg shrink-0 border border-black/5 shadow-sm"
                            style={{ backgroundColor: swatchBg }}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-surface-800 truncate">{color.name}</p>
                            <p className="text-[10px] text-surface-400 font-mono">{safeHex ?? '—'} · {USAGE_LABELS[color.usage] || color.usage}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Fonts */}
          {localData.brandFonts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-surface-500 mb-2">Tipografías</p>
              <div className="flex flex-wrap gap-2">
                {localData.brandFonts.map((font, i) => (
                  <div key={i} className="bg-surface-50 border-2 border-surface-900 px-4 py-2.5 max-w-xs">
                    <p className="text-sm font-semibold text-surface-900" style={{ fontFamily: `'${font.name}', sans-serif` }}>
                      {font.name}
                    </p>
                    <p className="text-[10px] text-surface-500">{font.usage}</p>
                    {font.weights && (
                      <p className="text-[10px] text-surface-400 mt-1">Pesos: {font.weights}</p>
                    )}
                    {font.fallbacks && (
                      <p className="text-[9px] text-surface-400 mt-0.5 truncate" title={font.fallbacks}>
                        Fallbacks: {font.fallbacks}
                      </p>
                    )}
                    {font.notes && (
                      <p className="text-[10px] text-surface-500 mt-1 leading-snug">{font.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {localData.brandIdentityDetail && (
            <IdentityDetailSections detail={localData.brandIdentityDetail} />
          )}
        </div>
        )
      )}
    </div>
  );
}
