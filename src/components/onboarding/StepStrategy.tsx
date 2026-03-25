'use client';

import { useOnboardingStore } from '@/store/onboarding-store';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Select } from '@/components/ui/Select';
import type { ContentStyleWeights, WeeklyFormatDistribution } from '@/types';

const styleLabels: Record<keyof ContentStyleWeights, string> = {
  educativo: '📚 Educativo',
  inspiracional: '💡 Inspiracional',
  comercial: '💼 Comercial',
  entretenimiento: '🎭 Entretenimiento',
  personal: '👤 Personal',
  corporativo: '🏛️ Corporativo',
};

const formatLabels: Record<keyof WeeklyFormatDistribution, { label: string; icon: string; desc: string }> = {
  story: { label: 'Stories', icon: '⏱️', desc: 'Contenido efímero, cercano y espontáneo' },
  carrusel: { label: 'Carruseles', icon: '📑', desc: 'Posts de varias slides, educativos o informativos' },
  publicacion: { label: 'Publicación cualificada', icon: '🖼️', desc: 'Imagen diseñada para el feed (estática)' },
  reel: { label: 'Reels', icon: '🎬', desc: 'Vídeo corto vertical, máximo alcance' },
};

export function StepStrategy() {
  const {
    formData,
    updateField,
    updateContentStyle,
    updateFormatDistribution,
    prevStep,
    isSubmitting,
  } = useOnboardingStore();

  const dist = formData.weekly_format_distribution;
  const totalWeekly = dist.story + dist.carrusel + dist.publicacion + dist.reel;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="font-display text-2xl font-bold text-surface-900">Variables estratégicas</h2>
        <p className="text-surface-500 mt-1">Configura el tono, estilo y distribución de contenido semanal</p>
      </div>

      {/* Distribución semanal */}
      <div className="bg-white rounded-2xl border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-semibold text-surface-900">📅 Distribución semanal de publicaciones</h3>
            <p className="text-sm text-surface-500 mt-0.5">Define cuántas publicaciones de cada tipo quieres por semana</p>
          </div>
          <div className="bg-brand-50 text-brand-700 px-4 py-2 rounded-xl text-sm font-bold">
            {totalWeekly} / semana
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.keys(formatLabels) as Array<keyof WeeklyFormatDistribution>).map((key) => {
            const fmt = formatLabels[key];
            return (
              <div key={key} className="flex items-center gap-4 p-4 rounded-xl border border-surface-200 bg-surface-50/50">
                <div className="text-2xl w-10 text-center shrink-0">{fmt.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-surface-900 text-sm">{fmt.label}</p>
                  <p className="text-xs text-surface-400 line-clamp-1">{fmt.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateFormatDistribution(key, dist[key] - 1)}
                    disabled={dist[key] <= 0}
                    className="w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg font-medium"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-bold text-surface-900 text-lg tabular-nums">{dist[key]}</span>
                  <button
                    type="button"
                    onClick={() => updateFormatDistribution(key, dist[key] + 1)}
                    disabled={dist[key] >= 14}
                    className="w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg font-medium"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {totalWeekly === 0 && (
          <p className="text-sm text-red-500 mt-3">Debes tener al menos 1 publicación por semana</p>
        )}
      </div>

      {/* Tono */}
      <div className="bg-white rounded-2xl border border-surface-200 p-6">
        <h3 className="font-display font-semibold text-surface-900 mb-5">🎨 Tono de comunicación</h3>
        <div className="space-y-5">
          <Slider label="Formalidad" value={formData.tone_formality} onChange={(v) => updateField('tone_formality', v)} leftLabel="Informal" rightLabel="Profesional" />
          <Slider label="Proximidad" value={formData.tone_proximity} onChange={(v) => updateField('tone_proximity', v)} leftLabel="Cercano" rightLabel="Corporativo" />
          <Slider label="Emoción" value={formData.tone_emotion} onChange={(v) => updateField('tone_emotion', v)} leftLabel="Emocional" rightLabel="Racional" />
          <Slider label="Humor" value={formData.tone_humor} onChange={(v) => updateField('tone_humor', v)} leftLabel="Divertido" rightLabel="Serio" />
          <Slider label="Disrupción" value={formData.tone_disruption} onChange={(v) => updateField('tone_disruption', v)} leftLabel="Disruptivo" rightLabel="Conservador" />
        </div>
      </div>

      {/* Estilo de contenido */}
      <div className="bg-white rounded-2xl border border-surface-200 p-6">
        <h3 className="font-display font-semibold text-surface-900 mb-5">📊 Peso por estilo de contenido</h3>
        <div className="space-y-4">
          {(Object.keys(formData.content_style) as Array<keyof ContentStyleWeights>).map((key) => (
            <Slider
              key={key}
              label={styleLabels[key]}
              value={formData.content_style[key]}
              onChange={(v) => updateContentStyle(key, v)}
              leftLabel="Poco"
              rightLabel="Mucho"
            />
          ))}
        </div>
      </div>

      {/* Otras variables */}
      <div className="bg-white rounded-2xl border border-surface-200 p-6">
        <h3 className="font-display font-semibold text-surface-900 mb-5">⚙️ Otros parámetros</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Nivel comercial"
            value={formData.commercial_level}
            onChange={(v) => updateField('commercial_level', v as any)}
            options={[
              { value: 'bajo', label: 'Bajo — Poco enfoque en ventas' },
              { value: 'medio', label: 'Medio — Equilibrado' },
              { value: 'alto', label: 'Alto — Muy orientado a conversión' },
            ]}
          />
          <Select
            label="Complejidad del contenido"
            value={formData.complexity}
            onChange={(v) => updateField('complexity', v as any)}
            options={[
              { value: 'basico', label: 'Básico — Fácil de entender' },
              { value: 'medio', label: 'Medio — Público informado' },
              { value: 'experto', label: 'Experto — Contenido técnico' },
            ]}
          />
          <Select
            label="Presencia humana"
            value={formData.human_presence}
            onChange={(v) => updateField('human_presence', v as any)}
            options={[
              { value: 'baja', label: 'Baja — Sin personas' },
              { value: 'media', label: 'Media — Equilibrado' },
              { value: 'alta', label: 'Alta — Mucho rostro humano' },
            ]}
          />
          <Select
            label="Nivel de experimentación"
            value={formData.experimentation}
            onChange={(v) => updateField('experimentation', v as any)}
            options={[
              { value: 'conservador', label: '🛡️ Conservador' },
              { value: 'equilibrado', label: '⚖️ Equilibrado' },
              { value: 'experimental', label: '🧪 Experimental' },
            ]}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={prevStep}>← Atrás</Button>
        <Button type="submit" size="lg" loading={isSubmitting} disabled={totalWeekly === 0}>
          🚀 Crear proyecto y generar estrategia
        </Button>
      </div>
    </div>
  );
}
