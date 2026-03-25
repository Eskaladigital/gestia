import { create } from 'zustand';
import type { OnboardingFormData, PrimaryGoal, ClientType, CommercialLevel, Complexity, HumanPresence, Experimentation, ContentStyleWeights, WeeklyFormatDistribution } from '@/types';

const defaultContentStyle: ContentStyleWeights = {
  educativo: 50,
  inspiracional: 50,
  comercial: 50,
  entretenimiento: 50,
  personal: 50,
  corporativo: 50,
};

const defaultWeeklyFormats: WeeklyFormatDistribution = {
  story: 1,
  carrusel: 2,
  publicacion: 1,
  reel: 1,
};

const initialFormData: OnboardingFormData = {
  name: '',
  url: '',
  sector: '',
  location: '',
  description: '',
  primary_goal: '',
  secondary_goals: [],
  client_type: '',
  competitors: [{ name: '', url: '', reason: '' }],
  tone_formality: 50,
  tone_proximity: 50,
  tone_emotion: 50,
  tone_humor: 50,
  tone_disruption: 50,
  content_style: { ...defaultContentStyle },
  commercial_level: 'medio',
  complexity: 'medio',
  human_presence: 'media',
  experimentation: 'equilibrado',
  weekly_format_distribution: { ...defaultWeeklyFormats },
};

interface OnboardingStore {
  currentStep: number;
  formData: OnboardingFormData;
  projectId: string | null;
  isSubmitting: boolean;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateField: <K extends keyof OnboardingFormData>(key: K, value: OnboardingFormData[K]) => void;
  updateContentStyle: (key: keyof ContentStyleWeights, value: number) => void;
  updateFormatDistribution: (key: keyof WeeklyFormatDistribution, value: number) => void;
  addCompetitor: () => void;
  removeCompetitor: (index: number) => void;
  updateCompetitor: (index: number, field: string, value: string) => void;
  setProjectId: (id: string) => void;
  setSubmitting: (v: boolean) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  currentStep: 1,
  formData: { ...initialFormData },
  projectId: null,
  isSubmitting: false,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 5) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),

  updateField: (key, value) =>
    set((s) => ({ formData: { ...s.formData, [key]: value } })),

  updateContentStyle: (key, value) =>
    set((s) => ({
      formData: {
        ...s.formData,
        content_style: { ...s.formData.content_style, [key]: value },
      },
    })),

  updateFormatDistribution: (key, value) =>
    set((s) => ({
      formData: {
        ...s.formData,
        weekly_format_distribution: { ...s.formData.weekly_format_distribution, [key]: Math.max(0, value) },
      },
    })),

  addCompetitor: () =>
    set((s) => ({
      formData: {
        ...s.formData,
        competitors: [...s.formData.competitors, { name: '', url: '', reason: '' }],
      },
    })),

  removeCompetitor: (index) =>
    set((s) => ({
      formData: {
        ...s.formData,
        competitors: s.formData.competitors.filter((_, i) => i !== index),
      },
    })),

  updateCompetitor: (index, field, value) =>
    set((s) => {
      const updated = [...s.formData.competitors];
      updated[index] = { ...updated[index], [field]: value };
      return { formData: { ...s.formData, competitors: updated } };
    }),

  setProjectId: (id) => set({ projectId: id }),
  setSubmitting: (v) => set({ isSubmitting: v }),
  reset: () => set({ currentStep: 1, formData: { ...initialFormData }, projectId: null, isSubmitting: false }),
}));
