'use client';

import { useOnboardingStore } from '@/store/onboarding-store';
import { Button } from '@/components/ui/Button';
import type { ClientType } from '@/types';

const clientTypes: { value: ClientType; label: string; icon: string; desc: string }[] = [
  { value: 'premium', label: 'Premium', icon: '👑', desc: 'Clientes de alto poder adquisitivo, exclusividad' },
  { value: 'medio', label: 'Medio', icon: '⚖️', desc: 'Público general con capacidad media' },
  { value: 'low_cost', label: 'Low Cost', icon: '🏷️', desc: 'Sensibles al precio, volumen alto' },
  { value: 'b2b', label: 'B2B', icon: '🏢', desc: 'Empresa a empresa, decisores profesionales' },
  { value: 'b2c', label: 'B2C', icon: '🛍️', desc: 'Directo al consumidor final' },
];

export function StepClientType() {
  const { formData, updateField, nextStep, prevStep } = useOnboardingStore();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-2xl font-bold text-surface-900">Tipo de cliente</h2>
        <p className="text-surface-500 mt-1">Define el perfil de tu cliente objetivo</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {clientTypes.map((ct) => (
          <button
            key={ct.value}
            type="button"
            onClick={() => updateField('client_type', ct.value)}
            className={`flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
              formData.client_type === ct.value
                ? 'border-brand-500 bg-brand-50 shadow-sm'
                : 'border-surface-200 hover:border-surface-300 bg-white'
            }`}
          >
            <span className="text-3xl">{ct.icon}</span>
            <div>
              <p className="font-semibold text-surface-900">{ct.label}</p>
              <p className="text-sm text-surface-500">{ct.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={prevStep}>← Atrás</Button>
        <Button onClick={nextStep} size="lg" disabled={!formData.client_type}>
          Siguiente →
        </Button>
      </div>
    </div>
  );
}
