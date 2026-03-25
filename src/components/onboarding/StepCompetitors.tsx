'use client';

import { useOnboardingStore } from '@/store/onboarding-store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function StepCompetitors() {
  const { formData, addCompetitor, removeCompetitor, updateCompetitor, nextStep, prevStep } = useOnboardingStore();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-2xl font-bold text-surface-900">Competencia</h2>
        <p className="text-surface-500 mt-1">Añade competidores para analizar su estrategia (opcional)</p>
      </div>

      <div className="space-y-4">
        {formData.competitors.map((comp, index) => (
          <div key={index} className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-600">Competidor {index + 1}</span>
              {formData.competitors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCompetitor(index)}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  Eliminar
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="Nombre del competidor"
                value={comp.name}
                onChange={(e) => updateCompetitor(index, 'name', e.target.value)}
              />
              <Input
                placeholder="URL o red social"
                value={comp.url}
                onChange={(e) => updateCompetitor(index, 'url', e.target.value)}
              />
            </div>
            <Input
              placeholder="¿Por qué es competidor? (opcional)"
              value={comp.reason}
              onChange={(e) => updateCompetitor(index, 'reason', e.target.value)}
            />
          </div>
        ))}
      </div>

      {formData.competitors.length < 5 && (
        <button
          type="button"
          onClick={addCompetitor}
          className="w-full py-3 border-2 border-dashed border-surface-200 rounded-xl text-sm text-surface-500 hover:border-brand-300 hover:text-brand-600 transition-all"
        >
          + Añadir competidor
        </button>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={prevStep}>← Atrás</Button>
        <Button onClick={nextStep} size="lg">
          Siguiente →
        </Button>
      </div>
    </div>
  );
}
