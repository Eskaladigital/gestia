'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import {
  DEFAULT_IMAGE_ORIENTATION,
  IMAGE_ORIENTATION_LABELS,
} from '@/lib/ai/constants';
import type {
  ClientType,
  CommercialLevel,
  Complexity,
  ImageOrientation,
  PrimaryGoal,
  WeeklyFormatDistribution,
} from '@/types';

export type ProjectSettingsInitial = {
  client_type: ClientType | null;
  primary_goal: PrimaryGoal | null;
  secondary_goals: string[];
  commercial_level: CommercialLevel;
  complexity: Complexity;
  tone_formality: number;
  tone_proximity: number;
  tone_emotion: number;
  tone_humor: number;
  tone_disruption: number;
  weekly_format_distribution: WeeklyFormatDistribution;
  description: string | null;
  monthly_fee: number | null | undefined;
  ai_rules: string | null | undefined;
  image_orientation: ImageOrientation | null | undefined;
  updated_at: string;
};

const IMAGE_ORIENTATION_OPTIONS: ImageOrientation[] = ['vertical', 'cuadrado', 'horizontal'];

const inputClass =
  'w-full px-3 py-2 border-2 border-surface-900 bg-white text-surface-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500';

const GOALS: { value: PrimaryGoal; label: string; icon: string }[] = [
  { value: 'ventas', label: 'Ventas', icon: '💰' },
  { value: 'leads', label: 'Leads', icon: '🎯' },
  { value: 'branding', label: 'Branding', icon: '✨' },
  { value: 'viralidad', label: 'Viralidad', icon: '🚀' },
  { value: 'comunidad', label: 'Comunidad', icon: '👥' },
];

const TONE_SLIDERS: Array<{
  key: keyof Pick<
    ProjectSettingsInitial,
    'tone_formality' | 'tone_proximity' | 'tone_emotion' | 'tone_humor' | 'tone_disruption'
  >;
  label: string;
  low: string;
  high: string;
}> = [
  { key: 'tone_formality', label: 'Formalidad', low: 'Informal', high: 'Profesional' },
  { key: 'tone_proximity', label: 'Proximidad', low: 'Cercano', high: 'Corporativo' },
  { key: 'tone_emotion', label: 'Emoción', low: 'Emocional', high: 'Racional' },
  { key: 'tone_humor', label: 'Humor', low: 'Divertido', high: 'Serio' },
  { key: 'tone_disruption', label: 'Disrupción', low: 'Disruptivo', high: 'Conservador' },
];

function normalizeDist(d: WeeklyFormatDistribution): WeeklyFormatDistribution {
  return {
    story: Math.max(0, Math.round(Number(d.story)) || 0),
    carrusel: Math.max(0, Math.round(Number(d.carrusel)) || 0),
    publicacion: Math.max(0, Math.round(Number(d.publicacion)) || 0),
    reel: Math.max(0, Math.round(Number(d.reel)) || 0),
  };
}

function feeToInput(v: number | null | undefined): string {
  if (v == null || v === undefined) return '';
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? String(n) : '';
}

interface ProjectSettingsPanelProps {
  projectId: string;
  initial: ProjectSettingsInitial;
}

export function ProjectSettingsPanel({ projectId, initial }: ProjectSettingsPanelProps) {
  const router = useRouter();
  const [clientType, setClientType] = useState<string>(initial.client_type || '');
  const [primaryGoal, setPrimaryGoal] = useState<string>(initial.primary_goal || '');
  const [secondaryGoals, setSecondaryGoals] = useState<string[]>(initial.secondary_goals || []);
  const [commercialLevel, setCommercialLevel] = useState<string>(initial.commercial_level || 'medio');
  const [complexity, setComplexity] = useState<string>(initial.complexity || 'medio');
  const [tones, setTones] = useState({
    tone_formality: initial.tone_formality ?? 50,
    tone_proximity: initial.tone_proximity ?? 50,
    tone_emotion: initial.tone_emotion ?? 50,
    tone_humor: initial.tone_humor ?? 50,
    tone_disruption: initial.tone_disruption ?? 50,
  });
  const [dist, setDist] = useState<WeeklyFormatDistribution>(
    normalizeDist(initial.weekly_format_distribution || { story: 0, carrusel: 0, publicacion: 0, reel: 0 })
  );
  const [description, setDescription] = useState(initial.description || '');
  const [monthlyFeeInput, setMonthlyFeeInput] = useState(feeToInput(initial.monthly_fee));
  const [aiRules, setAiRules] = useState(initial.ai_rules || '');
  const [imageOrientation, setImageOrientation] = useState<ImageOrientation>(
    initial.image_orientation || DEFAULT_IMAGE_ORIENTATION
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setClientType(initial.client_type || '');
    setPrimaryGoal(initial.primary_goal || '');
    setSecondaryGoals(initial.secondary_goals || []);
    setCommercialLevel(initial.commercial_level || 'medio');
    setComplexity(initial.complexity || 'medio');
    setTones({
      tone_formality: initial.tone_formality ?? 50,
      tone_proximity: initial.tone_proximity ?? 50,
      tone_emotion: initial.tone_emotion ?? 50,
      tone_humor: initial.tone_humor ?? 50,
      tone_disruption: initial.tone_disruption ?? 50,
    });
    setDist(normalizeDist(initial.weekly_format_distribution));
    setDescription(initial.description || '');
    setMonthlyFeeInput(feeToInput(initial.monthly_fee));
    setAiRules(initial.ai_rules || '');
    setImageOrientation(initial.image_orientation || DEFAULT_IMAGE_ORIENTATION);
  }, [initial.updated_at]);

  const totalWeekly = dist.story + dist.carrusel + dist.publicacion + dist.reel;
  const distOk = totalWeekly >= 1 && totalWeekly <= 21;

  function toggleSecondary(goal: PrimaryGoal) {
    if (goal === primaryGoal) return;
    setSecondaryGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  }

  const save = useCallback(async () => {
    if (!distOk) {
      setMessage({ type: 'err', text: 'La suma de formatos semanales debe estar entre 1 y 21.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const feeTrim = monthlyFeeInput.trim();
    const parsedFee: number | null =
      feeTrim === '' ? null : parseFloat(feeTrim.replace(',', '.'));
    if (feeTrim !== '' && (parsedFee === null || !Number.isFinite(parsedFee) || parsedFee < 0)) {
      setMessage({ type: 'err', text: 'Honorarios mensuales no válidos.' });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_type: clientType || null,
          primary_goal: primaryGoal || null,
          secondary_goals: secondaryGoals,
          commercial_level: commercialLevel,
          complexity,
          tone_formality: tones.tone_formality,
          tone_proximity: tones.tone_proximity,
          tone_emotion: tones.tone_emotion,
          tone_humor: tones.tone_humor,
          tone_disruption: tones.tone_disruption,
          weekly_format_distribution: normalizeDist(dist),
          description: description.trim() || null,
          monthly_fee: parsedFee === null ? null : Math.round(parsedFee * 100) / 100,
          ai_rules: aiRules.trim() || null,
          image_orientation: imageOrientation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      if (typeof data.warning === 'string' && data.warning.trim()) {
        setMessage({ type: 'err', text: `Guardado parcial: ${data.warning}` });
      } else {
        setMessage({ type: 'ok', text: 'Ajustes guardados.' });
      }
      router.refresh();
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }, [
    clientType,
    primaryGoal,
    secondaryGoals,
    commercialLevel,
    complexity,
    tones,
    dist,
    description,
    monthlyFeeInput,
    aiRules,
    imageOrientation,
    distOk,
    projectId,
    router,
  ]);

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal mb-6 overflow-hidden">
      {/* Header */}
      <div className="bg-surface-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚙️</span>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Ajustes del proyecto</h2>
            <p className="text-surface-400 text-xs font-medium mt-0.5">
              Objetivos, tono, formatos y configuración avanzada antes de lanzar IA
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {message && (
            <span className={`text-xs font-bold px-3 py-1.5 border-2 ${
              message.type === 'ok'
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                : 'border-red-400 bg-red-500/20 text-red-300'
            }`}>
              {message.text}
            </span>
          )}
          <Button onClick={save} loading={saving} size="md">
            Guardar ajustes
          </Button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-6">
            {/* Section: Cliente y objetivos */}
            <div className="border-2 border-surface-900 p-4">
              <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em] mb-4 pb-2 border-b-2 border-surface-200">
                Cliente y objetivos
              </p>
              <div className="space-y-5">
                <Select
                  label="Tipo de cliente"
                  value={clientType}
                  onChange={setClientType}
                  placeholder="Seleccionar…"
                  options={[
                    { value: 'premium', label: '👑 Premium' },
                    { value: 'medio', label: '⚖️ Medio' },
                    { value: 'low_cost', label: '🏷️ Low cost' },
                    { value: 'b2b', label: '🏢 B2B' },
                    { value: 'b2c', label: '🛍️ B2C' },
                  ]}
                />
                <div>
                  <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">
                    Objetivo principal
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {GOALS.map(g => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => setPrimaryGoal(g.value)}
                        className={`flex items-center gap-3 px-4 py-3 border-2 text-left text-sm transition-all duration-150 ${
                          primaryGoal === g.value
                            ? 'border-surface-900 bg-surface-900 text-white shadow-brutal-sm'
                            : 'border-surface-300 hover:border-surface-900 bg-white'
                        }`}
                      >
                        <span className="text-lg">{g.icon}</span>
                        <span className="font-bold">{g.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">
                    Objetivos secundarios
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {GOALS.filter(g => g.value !== primaryGoal).map(g => (
                      <Chip
                        key={g.value}
                        label={`${g.icon} ${g.label}`}
                        selected={secondaryGoals.includes(g.value)}
                        onClick={() => toggleSecondary(g.value)}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Nivel comercial"
                    value={commercialLevel}
                    onChange={setCommercialLevel}
                    options={[
                      { value: 'bajo', label: 'Bajo' },
                      { value: 'medio', label: 'Medio' },
                      { value: 'alto', label: 'Alto' },
                    ]}
                  />
                  <Select
                    label="Complejidad"
                    value={complexity}
                    onChange={setComplexity}
                    options={[
                      { value: 'basico', label: 'Básico' },
                      { value: 'medio', label: 'Medio' },
                      { value: 'experto', label: 'Experto' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Section: Notas y reglas */}
            <div className="border-2 border-surface-900 p-4">
              <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em] mb-4 pb-2 border-b-2 border-surface-200">
                Notas y reglas
              </p>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">
                    Descripción del proyecto
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    className={inputClass}
                    placeholder="Resumen manual del cliente o del encargo…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">
                    Reglas IA del proyecto
                  </label>
                  <textarea
                    value={aiRules}
                    onChange={e => setAiRules(e.target.value)}
                    rows={3}
                    className={inputClass}
                    placeholder="Ej: NO usar la palabra «rutas». Siempre incluir CTA de WhatsApp…"
                  />
                  <p className="text-[10px] text-surface-400 font-bold uppercase tracking-wider mt-1.5">
                    Se inyectan en los prompts de Estrategia y Calendario
                  </p>
                </div>
              </div>
            </div>

            {/* Section: Honorarios */}
            <div className="border-2 border-surface-900 p-4">
              <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em] mb-4 pb-2 border-b-2 border-surface-200">
                Gestión comercial
              </p>
              <div>
                <label className="block text-xs font-bold text-surface-900 uppercase tracking-wider mb-2">
                  Honorarios mensuales (EUR)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-surface-400">€</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={monthlyFeeInput}
                    onChange={e => setMonthlyFeeInput(e.target.value)}
                    className={inputClass}
                    placeholder="850"
                  />
                </div>
                <p className="text-[10px] text-surface-400 font-bold uppercase tracking-wider mt-1.5">
                  Uso interno — no afecta a la generación de contenido
                </p>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Section: Formatos */}
            <div className="border-2 border-surface-900 p-4">
              <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-surface-200">
                <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em]">
                  Distribución semanal
                </p>
                <span
                  className={`text-xs font-mono font-bold tabular-nums px-2 py-0.5 border-2 ${
                    distOk
                      ? 'border-surface-900 bg-surface-100 text-surface-900'
                      : 'border-red-600 bg-red-50 text-red-600'
                  }`}
                >
                  {totalWeekly} posts/sem
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'story' as const, label: 'Stories', icon: '⏱️' },
                    { key: 'carrusel' as const, label: 'Carruseles', icon: '📑' },
                    { key: 'publicacion' as const, label: 'Publicaciones', icon: '🖼️' },
                    { key: 'reel' as const, label: 'Reels', icon: '🎬' },
                  ] as const
                ).map(({ key, label, icon }) => (
                  <div
                    key={key}
                    className="border-2 border-surface-900 bg-white p-3 hover:shadow-brutal-sm transition-all duration-150"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{icon}</span>
                      <span className="text-xs font-bold text-surface-900 uppercase tracking-wider">{label}</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={dist[key]}
                      onChange={e =>
                        setDist(d => ({
                          ...d,
                          [key]: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full px-3 py-2 border-2 border-surface-900 bg-surface-50 text-surface-900 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Section: Orientación de imagen IA */}
            <div className="border-2 border-surface-900 p-4">
              <div className="flex items-center justify-between mb-1 pb-2 border-b-2 border-surface-200">
                <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em]">
                  Orientación de imagen IA
                </p>
                <span className="text-[10px] font-mono font-bold text-surface-500 uppercase tracking-wider">
                  {IMAGE_ORIENTATION_LABELS[imageOrientation].ratio}
                </span>
              </div>
              <p className="text-[11px] text-surface-500 leading-relaxed mb-3">
                Aplica a todas las imágenes IA generadas en este proyecto.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {IMAGE_ORIENTATION_OPTIONS.map(opt => {
                  const meta = IMAGE_ORIENTATION_LABELS[opt];
                  const selected = imageOrientation === opt;
                  const previewClass =
                    opt === 'vertical'
                      ? 'w-6 h-10'
                      : opt === 'cuadrado'
                        ? 'w-9 h-9'
                        : 'w-10 h-6';
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setImageOrientation(opt)}
                      className={`flex flex-col items-center gap-2 p-3 border-2 text-center transition-all duration-150 ${
                        selected
                          ? 'border-surface-900 bg-surface-900 text-white shadow-brutal-sm'
                          : 'border-surface-300 hover:border-surface-900 bg-white text-surface-900'
                      }`}
                      aria-pressed={selected}
                    >
                      <div
                        className={`${previewClass} border-2 ${
                          selected ? 'border-white bg-white/20' : 'border-surface-900 bg-surface-50'
                        }`}
                      />
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {meta.icon} {meta.label}
                        </span>
                        <span className={`text-[10px] font-mono ${selected ? 'text-white/70' : 'text-surface-500'}`}>
                          {meta.ratio}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-surface-400 font-bold uppercase tracking-wider mt-3">
                {IMAGE_ORIENTATION_LABELS[imageOrientation].hint}
              </p>
            </div>

            {/* Section: Tono */}
            <div className="border-2 border-surface-900 p-4">
              <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em] mb-4 pb-2 border-b-2 border-surface-200">
                Tono de comunicación
              </p>
              <div className="space-y-5">
                {TONE_SLIDERS.map(t => (
                  <Slider
                    key={t.key}
                    label={t.label}
                    value={tones[t.key]}
                    onChange={v => setTones(prev => ({ ...prev, [t.key]: v }))}
                    leftLabel={t.low}
                    rightLabel={t.high}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile save button */}
        <div className="mt-6 pt-4 border-t-2 border-surface-900 flex justify-end md:hidden">
          <Button onClick={save} loading={saving} className="w-full">
            Guardar ajustes
          </Button>
        </div>
      </div>
    </div>
  );
}
