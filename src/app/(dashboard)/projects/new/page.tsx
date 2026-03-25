'use client';

import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/store/onboarding-store';
import { createClient } from '@/lib/supabase/client';
import { Stepper } from '@/components/ui/Stepper';
import { StepBusiness } from '@/components/onboarding/StepBusiness';
import { StepGoals } from '@/components/onboarding/StepGoals';
import { StepClientType } from '@/components/onboarding/StepClientType';
import { StepCompetitors } from '@/components/onboarding/StepCompetitors';
import { StepStrategy } from '@/components/onboarding/StepStrategy';

const STEPS = ['Negocio', 'Objetivos', 'Cliente', 'Competencia', 'Estrategia'];

export default function NewProjectPage() {
  const router = useRouter();
  const supabase = createClient();
  const { currentStep, formData, setStep, setSubmitting, setProjectId } = useOnboardingStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // 1. Crear proyecto
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          url: formData.url,
          sector: formData.sector,
          location: formData.location,
          description: formData.description,
        }),
      });

      const { project } = await res.json();
      if (!project?.id) throw new Error('Error al crear proyecto');

      setProjectId(project.id);

      // 2. Actualizar con todos los datos del onboarding
      await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          client_type: formData.client_type,
          primary_goal: formData.primary_goal,
          secondary_goals: formData.secondary_goals,
          tone_formality: formData.tone_formality,
          tone_proximity: formData.tone_proximity,
          tone_emotion: formData.tone_emotion,
          tone_humor: formData.tone_humor,
          tone_disruption: formData.tone_disruption,
          content_style: formData.content_style,
          commercial_level: formData.commercial_level,
          complexity: formData.complexity,
          human_presence: formData.human_presence,
          experimentation: formData.experimentation,
          weekly_format_distribution: formData.weekly_format_distribution,
          posts_per_week: Object.values(formData.weekly_format_distribution).reduce((a: number, b: number) => a + b, 0),
          status: 'draft',
          onboarding_step: 5,
        }),
      });

      // 3. Guardar competidores
      const validCompetitors = formData.competitors.filter(c => c.name.trim());
      if (validCompetitors.length > 0) {
        const { error } = await supabase.from('competitors').insert(
          validCompetitors.map(c => ({
            project_id: project.id,
            name: c.name,
            url: c.url || null,
            reason: c.reason || null,
          }))
        );
        if (error) console.error('Error saving competitors:', error);
      }

      // 4. Redirigir al proyecto (sin análisis automático: todo es manual desde la ficha)
      router.push(`/projects/${project.id}`);
    } catch (err) {
      console.error('Onboarding error:', err);
      alert('Error al crear el proyecto. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const stepComponents: Record<number, React.ReactNode> = {
    1: <StepBusiness />,
    2: <StepGoals />,
    3: <StepClientType />,
    4: <StepCompetitors />,
    5: <StepStrategy />,
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-2">Nuevo proyecto</p>
        <h1 className="font-display text-3xl font-bold text-surface-900 tracking-tight mb-2">Configura tu proyecto</h1>
        <p className="text-surface-500 text-sm font-medium">Paso a paso, cuéntanos sobre tu cliente</p>
      </div>

      <div className="mb-10">
        <Stepper steps={STEPS} currentStep={currentStep} onStepClick={setStep} />
      </div>

      <form onSubmit={handleSubmit}>
        {stepComponents[currentStep]}
      </form>
    </div>
  );
}
