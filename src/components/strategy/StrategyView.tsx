'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Strategy } from '@/types';
import { Button } from '@/components/ui/Button';

interface StrategyViewProps {
  strategy: Strategy;
  projectId: string;
}

type PillarRow = {
  name: string;
  description: string;
  percentage: string;
  example_topics: string;
  content_types: string;
};

type ThemeRow = {
  theme: string;
  description: string;
  frequency: string;
  example_topics: string;
};

type CompetitorRow = {
  name: string;
  strengths: string;
  weaknesses: string;
  detected_content_types: string;
  estimated_frequency: string;
  tone_detected: string;
};

type CompForm = {
  competitors: CompetitorRow[];
  market_opportunities: string;
  differentiation_ideas: string;
  content_gaps: string;
  competitorRecommendations: string;
  /** URLs de resultados Google del análisis de competidores (solo lectura en JSON; se preserva al guardar) */
  discovered_serp_urls: string[];
};

type FormState = {
  value_proposition: string;
  target_audience: string;
  positioning: string;
  tone_guidelines: string;
  recommendations: string;
  pillars: PillarRow[];
  themes: ThemeRow[];
  comp: CompForm;
};

function splitTopics(s: string): string[] {
  return s
    .split(/[,;\n]/)
    .map(t => t.trim())
    .filter(Boolean);
}

function joinTopics(arr: string[] | undefined): string {
  return Array.isArray(arr) ? arr.join(', ') : '';
}

function linesFromArray(arr: string[] | undefined): string {
  return Array.isArray(arr) ? arr.join('\n') : '';
}

function arrayFromLines(s: string): string[] {
  return s
    .split('\n')
    .map(l => l.replace(/^\s*[·\-*]\s*/, '').trim())
    .filter(Boolean);
}

function pillarsFromJson(json: unknown): PillarRow[] {
  if (!Array.isArray(json) || json.length === 0) {
    return [{ name: '', description: '', percentage: '', example_topics: '', content_types: '' }];
  }
  return json.map((p: Record<string, unknown>) => ({
    name: String(p.name ?? ''),
    description: String(p.description ?? ''),
    percentage: p.percentage != null ? String(p.percentage) : '',
    example_topics: joinTopics(p.example_topics as string[] | undefined),
    content_types: Array.isArray(p.content_types) ? (p.content_types as string[]).join(', ') : '',
  }));
}

function pillarsToJson(rows: PillarRow[]): unknown[] {
  return rows
    .filter(r => r.name.trim() || r.description.trim())
    .map(r => {
      const o: Record<string, unknown> = {
        name: r.name.trim(),
        description: r.description.trim(),
        percentage: Math.min(100, Math.max(0, parseInt(r.percentage, 10) || 0)),
        example_topics: splitTopics(r.example_topics),
      };
      if (r.content_types.trim()) {
        o.content_types = r.content_types.split(',').map(t => t.trim()).filter(Boolean);
      }
      return o;
    });
}

function themesFromJson(json: unknown): ThemeRow[] {
  if (!Array.isArray(json) || json.length === 0) {
    return [{ theme: '', description: '', frequency: '', example_topics: '' }];
  }
  return json.map((t: Record<string, unknown>) => ({
    theme: String(t.theme ?? ''),
    description: String(t.description ?? ''),
    frequency: String(t.frequency ?? ''),
    example_topics: joinTopics(t.example_topics as string[] | undefined),
  }));
}

function themesToJson(rows: ThemeRow[]): unknown[] {
  return rows
    .filter(r => r.theme.trim() || r.description.trim())
    .map(r => ({
      theme: r.theme.trim(),
      description: r.description.trim(),
      frequency: r.frequency.trim() || undefined,
      example_topics: splitTopics(r.example_topics),
    }));
}

function compFromJson(json: unknown): CompForm {
  const d = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const competitors = Array.isArray(d.competitors) ? d.competitors : [];
  return {
    competitors:
      competitors.length === 0
        ? [
            {
              name: '',
              strengths: '',
              weaknesses: '',
              detected_content_types: '',
              estimated_frequency: '',
              tone_detected: '',
            },
          ]
        : (competitors as Record<string, unknown>[]).map(c => ({
            name: String(c.name ?? ''),
            strengths: linesFromArray(c.strengths as string[] | undefined),
            weaknesses: linesFromArray(c.weaknesses as string[] | undefined),
            detected_content_types: Array.isArray(c.detected_content_types)
              ? (c.detected_content_types as string[]).join(', ')
              : '',
            estimated_frequency: String(c.estimated_frequency ?? ''),
            tone_detected: String(c.tone_detected ?? ''),
          })),
    market_opportunities: linesFromArray(d.market_opportunities as string[] | undefined),
    differentiation_ideas: linesFromArray(d.differentiation_ideas as string[] | undefined),
    content_gaps: linesFromArray(d.content_gaps as string[] | undefined),
    competitorRecommendations: String(d.recommendations ?? ''),
    discovered_serp_urls: Array.isArray(d.discovered_serp_urls)
      ? (d.discovered_serp_urls as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
  };
}

function compToJson(c: CompForm): Record<string, unknown> {
  return {
    competitors: c.competitors
      .filter(x => x.name.trim())
      .map(x => ({
        name: x.name.trim(),
        strengths: arrayFromLines(x.strengths),
        weaknesses: arrayFromLines(x.weaknesses),
        ...(x.detected_content_types.trim()
          ? {
              detected_content_types: x.detected_content_types.split(',').map(s => s.trim()).filter(Boolean),
            }
          : {}),
        ...(x.estimated_frequency.trim() ? { estimated_frequency: x.estimated_frequency.trim() } : {}),
        ...(x.tone_detected.trim() ? { tone_detected: x.tone_detected.trim() } : {}),
      })),
    market_opportunities: arrayFromLines(c.market_opportunities),
    differentiation_ideas: arrayFromLines(c.differentiation_ideas),
    content_gaps: arrayFromLines(c.content_gaps),
    ...(c.competitorRecommendations.trim() ? { recommendations: c.competitorRecommendations.trim() } : {}),
    ...(c.discovered_serp_urls.length > 0 ? { discovered_serp_urls: c.discovered_serp_urls } : {}),
  };
}

function strategyToForm(s: Strategy): FormState {
  return {
    value_proposition: s.value_proposition ?? '',
    target_audience: s.target_audience ?? '',
    positioning: s.positioning ?? '',
    tone_guidelines: s.tone_guidelines ?? '',
    recommendations: s.recommendations ?? '',
    pillars: pillarsFromJson(s.content_pillars),
    themes: themesFromJson(s.thematic_lines),
    comp: compFromJson(s.competitor_analysis),
  };
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border-2 border-surface-200 bg-white text-surface-900 text-sm font-medium focus:outline-none focus:ring-0 focus:border-surface-900 transition-colors';
const labelClass = 'block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5';

export function StrategyView({ strategy, projectId }: StrategyViewProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => strategyToForm(strategy));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setForm(strategyToForm(strategy));
  }, [strategy.id, strategy.updated_at]);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/strategy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value_proposition: form.value_proposition.trim() || null,
          target_audience: form.target_audience.trim() || null,
          positioning: form.positioning.trim() || null,
          tone_guidelines: form.tone_guidelines.trim() || null,
          recommendations: form.recommendations.trim() || null,
          content_pillars: pillarsToJson(form.pillars),
          thematic_lines: themesToJson(form.themes),
          competitor_analysis: compToJson(form.comp),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      setMessage({ type: 'ok', text: 'Estrategia guardada. El calendario usará esta versión al generarlo.' });
      router.refresh();
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }, [form, projectId, router]);

  function updatePillar(i: number, patch: Partial<PillarRow>) {
    setForm(f => ({
      ...f,
      pillars: f.pillars.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    }));
  }

  function addPillar() {
    setForm(f => ({
      ...f,
      pillars: [...f.pillars, { name: '', description: '', percentage: '', example_topics: '', content_types: '' }],
    }));
  }

  function removePillar(i: number) {
    setForm(f => ({
      ...f,
      pillars: f.pillars.length <= 1 ? f.pillars : f.pillars.filter((_, j) => j !== i),
    }));
  }

  function updateTheme(i: number, patch: Partial<ThemeRow>) {
    setForm(f => ({
      ...f,
      themes: f.themes.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    }));
  }

  function addTheme() {
    setForm(f => ({
      ...f,
      themes: [...f.themes, { theme: '', description: '', frequency: '', example_topics: '' }],
    }));
  }

  function removeTheme(i: number) {
    setForm(f => ({
      ...f,
      themes: f.themes.length <= 1 ? f.themes : f.themes.filter((_, j) => j !== i),
    }));
  }

  function updateCompetitor(i: number, patch: Partial<CompetitorRow>) {
    setForm(f => ({
      ...f,
      comp: {
        ...f.comp,
        competitors: f.comp.competitors.map((c, j) => (j === i ? { ...c, ...patch } : c)),
      },
    }));
  }

  function addCompetitor() {
    setForm(f => ({
      ...f,
      comp: {
        ...f.comp,
        competitors: [
          ...f.comp.competitors,
          {
            name: '',
            strengths: '',
            weaknesses: '',
            detected_content_types: '',
            estimated_frequency: '',
            tone_detected: '',
          },
        ],
      },
    }));
  }

  function removeCompetitor(i: number) {
    setForm(f => ({
      ...f,
      comp: {
        ...f.comp,
        competitors:
          f.comp.competitors.length <= 1
            ? f.comp.competitors
            : f.comp.competitors.filter((_, j) => j !== i),
      },
    }));
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 py-3 -mt-2 bg-surface-50/95 backdrop-blur border-b-2 border-surface-200 mb-2">
        <p className="text-xs text-surface-500 max-w-xl font-medium">
          Edita cualquier sección y guarda. Lo que cambies aquí es lo que la IA usará al <strong>generar el calendario</strong>.
        </p>
        <div className="flex items-center gap-3">
          {message && (
            <span
              className={`text-sm ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-600'} max-w-[220px]`}
            >
              {message.text}
            </span>
          )}
          <Button onClick={save} loading={saving} size="md">
            Guardar cambios
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
          <h3 className="font-display font-bold text-surface-900 mb-2">Propuesta de valor</h3>
          <label className={labelClass}>Texto</label>
          <textarea
            value={form.value_proposition}
            onChange={e => setForm(f => ({ ...f, value_proposition: e.target.value }))}
            rows={5}
            className={inputClass}
            placeholder="Qué ofreces y por qué importa…"
          />
        </div>
        <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
          <h3 className="font-display font-bold text-surface-900 mb-2">Público objetivo</h3>
          <label className={labelClass}>Texto</label>
          <textarea
            value={form.target_audience}
            onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
            rows={5}
            className={inputClass}
          />
        </div>
        <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
          <h3 className="font-display font-bold text-surface-900 mb-2">Posicionamiento</h3>
          <label className={labelClass}>Texto</label>
          <textarea
            value={form.positioning}
            onChange={e => setForm(f => ({ ...f, positioning: e.target.value }))}
            rows={5}
            className={inputClass}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
        <h3 className="font-display font-bold text-surface-900 mb-3">Guías de tono y voz</h3>
        <textarea
          value={form.tone_guidelines}
          onChange={e => setForm(f => ({ ...f, tone_guidelines: e.target.value }))}
          rows={8}
          className={inputClass}
          placeholder="Cómo habla la marca, qué evitar, ejemplos…"
        />
      </div>

      <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-surface-900">Pilares de contenido</h3>
          <Button variant="secondary" size="sm" type="button" onClick={addPillar}>
            + Añadir pilar
          </Button>
        </div>
        <div className="space-y-4">
          {form.pillars.map((pillar, i) => (
            <div key={i} className="bg-surface-50 rounded-lg p-4 border-2 border-surface-200">
              <div className="flex justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Pilar {i + 1}</span>
                {form.pillars.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePillar(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mb-2">
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input
                    value={pillar.name}
                    onChange={e => updatePillar(i, { name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Porcentaje (0–100)</label>
                  <input
                    value={pillar.percentage}
                    onChange={e => updatePillar(i, { percentage: e.target.value })}
                    className={inputClass}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <label className={labelClass}>Descripción</label>
              <textarea
                value={pillar.description}
                onChange={e => updatePillar(i, { description: e.target.value })}
                rows={3}
                className={`${inputClass} mb-2`}
              />
              <label className={labelClass}>Temas ejemplo (separados por coma)</label>
              <input
                value={pillar.example_topics}
                onChange={e => updatePillar(i, { example_topics: e.target.value })}
                className={inputClass}
              />
              <label className={`${labelClass} mt-2`}>Tipos de contenido (opcional, separados por coma)</label>
              <input
                value={pillar.content_types}
                onChange={e => updatePillar(i, { content_types: e.target.value })}
                className={inputClass}
                placeholder="educativo, inspiracional…"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-surface-900">Líneas temáticas</h3>
          <Button variant="secondary" size="sm" type="button" onClick={addTheme}>
            + Añadir línea
          </Button>
        </div>
        <div className="space-y-4">
          {form.themes.map((theme, i) => (
            <div key={i} className="bg-surface-50 rounded-lg p-4 border-2 border-surface-200">
              <div className="flex justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Línea {i + 1}</span>
                {form.themes.length > 1 && (
                  <button type="button" onClick={() => removeTheme(i)} className="text-xs text-red-600 hover:underline">
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mb-2">
                <div>
                  <label className={labelClass}>Tema</label>
                  <input
                    value={theme.theme}
                    onChange={e => updateTheme(i, { theme: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Frecuencia (ej. semanal)</label>
                  <input
                    value={theme.frequency}
                    onChange={e => updateTheme(i, { frequency: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <label className={labelClass}>Descripción</label>
              <textarea
                value={theme.description}
                onChange={e => updateTheme(i, { description: e.target.value })}
                rows={2}
                className={`${inputClass} mb-2`}
              />
              <label className={labelClass}>Temas ejemplo (coma)</label>
              <input
                value={theme.example_topics}
                onChange={e => updateTheme(i, { example_topics: e.target.value })}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-surface-900">Análisis competitivo</h3>
          <Button variant="secondary" size="sm" type="button" onClick={addCompetitor}>
            + Añadir competidor
          </Button>
        </div>
        <div className="space-y-4">
          {form.comp.competitors.map((comp, i) => (
            <div key={i} className="bg-surface-50 rounded-lg p-4 border-2 border-surface-200">
              <div className="flex justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Competidor {i + 1}</span>
                {form.comp.competitors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCompetitor(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <label className={labelClass}>Nombre</label>
              <input
                value={comp.name}
                onChange={e => updateCompetitor(i, { name: e.target.value })}
                className={`${inputClass} mb-2`}
              />
              <div className="grid sm:grid-cols-2 gap-3 mb-2">
                <div>
                  <label className={labelClass}>Fortalezas (una por línea)</label>
                  <textarea
                    value={comp.strengths}
                    onChange={e => updateCompetitor(i, { strengths: e.target.value })}
                    rows={4}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Debilidades (una por línea)</label>
                  <textarea
                    value={comp.weaknesses}
                    onChange={e => updateCompetitor(i, { weaknesses: e.target.value })}
                    rows={4}
                    className={inputClass}
                  />
                </div>
              </div>
              <label className={labelClass}>Tipos de contenido detectados (coma)</label>
              <input
                value={comp.detected_content_types}
                onChange={e => updateCompetitor(i, { detected_content_types: e.target.value })}
                className={`${inputClass} mb-2`}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Frecuencia estimada</label>
                  <input
                    value={comp.estimated_frequency}
                    onChange={e => updateCompetitor(i, { estimated_frequency: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Tono detectado</label>
                  <input
                    value={comp.tone_detected}
                    onChange={e => updateCompetitor(i, { tone_detected: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>Oportunidades de mercado (una por línea)</label>
            <textarea
              value={form.comp.market_opportunities}
              onChange={e =>
                setForm(f => ({ ...f, comp: { ...f.comp, market_opportunities: e.target.value } }))
              }
              rows={4}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Ideas de diferenciación (una por línea)</label>
            <textarea
              value={form.comp.differentiation_ideas}
              onChange={e =>
                setForm(f => ({ ...f, comp: { ...f.comp, differentiation_ideas: e.target.value } }))
              }
              rows={3}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Brechas de contenido (una por línea)</label>
            <textarea
              value={form.comp.content_gaps}
              onChange={e => setForm(f => ({ ...f, comp: { ...f.comp, content_gaps: e.target.value } }))}
              rows={3}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Recomendaciones del bloque competitivo</label>
            <textarea
              value={form.comp.competitorRecommendations}
              onChange={e =>
                setForm(f => ({ ...f, comp: { ...f.comp, competitorRecommendations: e.target.value } }))
              }
              rows={3}
              className={inputClass}
              placeholder="Texto del análisis competitivo (aparte de las recomendaciones generales de estrategia)"
            />
          </div>
        </div>
      </div>

      <div className="bg-brand-50 rounded-xl border-2 border-brand-200 p-6">
        <h3 className="font-display font-bold text-brand-900 mb-2">Recomendaciones</h3>
        <textarea
          value={form.recommendations}
          onChange={e => setForm(f => ({ ...f, recommendations: e.target.value }))}
          rows={6}
          className={inputClass}
          placeholder="Próximos pasos, prioridades, riesgos…"
        />
      </div>

      {(strategy.prompt_tokens || strategy.completion_tokens) && (
        <div className="text-xs text-surface-400 text-right">
          Última generación IA: {strategy.prompt_tokens || 0} prompt + {strategy.completion_tokens || 0}{' '}
          completion · Los cambios manuales no actualizan estos números.
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 border-t-2 border-surface-200 backdrop-blur flex justify-center z-30 md:hidden">
        <Button onClick={save} loading={saving} className="w-full max-w-md">
          Guardar estrategia
        </Button>
      </div>
    </div>
  );
}
