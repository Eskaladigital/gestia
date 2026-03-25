'use client';

import { useOnboardingStore } from '@/store/onboarding-store';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import type { PrimaryGoal } from '@/types';

const goals: { value: PrimaryGoal; label: string; icon: string; desc: string }[] = [
  { value: 'ventas', label: 'Ventas', icon: '💰', desc: 'Generar ventas directas' },
  { value: 'leads', label: 'Leads', icon: '🎯', desc: 'Captar potenciales clientes' },
  { value: 'branding', label: 'Branding', icon: '✨', desc: 'Construir marca y reputación' },
  { value: 'viralidad', label: 'Viralidad', icon: '🚀', desc: 'Máximo alcance y visibilidad' },
  { value: 'comunidad', label: 'Comunidad', icon: '👥', desc: 'Crear comunidad y engagement' },
];

export function StepGoals() {
  const { formData, updateField, nextStep, prevStep } = useOnboardingStore();

  function toggleSecondary(goal: PrimaryGoal) {
    if (goal === formData.primary_goal) return;
    const current = formData.secondary_goals;
    if (current.includes(goal)) {
      updateField('secondary_goals', current.filter(g => g !== goal));
    } else {
      updateField('secondary_goals', [...current, goal]);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-2xl font-bold text-surface-900">Objetivos</h2>
        <p className="text-surface-500 mt-1">¿Qué quieres conseguir con las redes sociales?</p>
      </div>

      {/* Objetivo principal */}
      <div>
        <label className="block text-sm font-medium text-surface-700 mb-3">Objetivo principal *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {goals.map((goal) => (
            <button
              key={goal.value}
              type="button"
              onClick={() => updateField('primary_goal', goal.value)}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                formData.primary_goal === goal.value
                  ? 'border-brand-500 bg-brand-50 shadow-sm'
                  : 'border-surface-200 hover:border-surface-300 bg-white'
              }`}
            >
              <span className="text-2xl">{goal.icon}</span>
              <div>
                <p className="font-medium text-surface-900">{goal.label}</p>
                <p className="text-xs text-surface-500">{goal.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Objetivos secundarios */}
      <div>
        <label className="block text-sm font-medium text-surface-700 mb-3">Objetivos secundarios (opcional)</label>
        <div className="flex flex-wrap gap-2">
          {goals
            .filter(g => g.value !== formData.primary_goal)
            .map((goal) => (
              <Chip
                key={goal.value}
                label={`${goal.icon} ${goal.label}`}
                selected={formData.secondary_goals.includes(goal.value)}
                onClick={() => toggleSecondary(goal.value)}
              />
            ))}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={prevStep}>← Atrás</Button>
        <Button onClick={nextStep} size="lg" disabled={!formData.primary_goal}>
          Siguiente →
        </Button>
      </div>
    </div>
  );
}
