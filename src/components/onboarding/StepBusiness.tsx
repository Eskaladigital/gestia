'use client';

import { useOnboardingStore } from '@/store/onboarding-store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function StepBusiness() {
  const { formData, updateField, nextStep } = useOnboardingStore();

  function handleNext() {
    if (!formData.name.trim()) return;
    nextStep();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-2xl font-bold text-surface-900">Datos del negocio</h2>
        <p className="text-surface-500 mt-1">Cuéntanos sobre el cliente para el que vas a crear contenido</p>
      </div>

      <div className="space-y-4">
        <Input
          label="Nombre de la empresa *"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Ej: Clínica Dental Sonrisa"
        />
        <Input
          label="URL del sitio web"
          value={formData.url}
          onChange={(e) => updateField('url', e.target.value)}
          placeholder="https://www.ejemplo.com"
          hint="La analizaremos para generar la estrategia"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Sector"
            value={formData.sector}
            onChange={(e) => updateField('sector', e.target.value)}
            placeholder="Ej: Salud, Hostelería..."
          />
          <Input
            label="Ubicación"
            value={formData.location}
            onChange={(e) => updateField('location', e.target.value)}
            placeholder="Ej: Murcia, España"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5">Descripción (opcional)</label>
          <textarea
            value={formData.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Describe brevemente el negocio, sus servicios principales y lo que lo hace especial..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-200 bg-white text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 hover:border-surface-300 transition-all resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleNext} size="lg" disabled={!formData.name.trim()}>
          Siguiente →
        </Button>
      </div>
    </div>
  );
}
