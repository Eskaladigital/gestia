'use client';

import { cn } from '@/lib/utils';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isClickable = onStepClick && stepNum <= currentStep;

          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(stepNum)}
                  disabled={!isClickable}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 font-mono uppercase',
                    isCompleted && 'bg-surface-900 text-white border-surface-900',
                    isCurrent && 'bg-brand-600 text-white border-brand-700 ring-4 ring-brand-100',
                    !isCompleted && !isCurrent && 'bg-surface-50 text-surface-400 border-surface-300',
                    isClickable && 'cursor-pointer hover:scale-105'
                  )}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </button>
                <span className={cn(
                  'text-[10px] mt-2 font-semibold text-center max-w-[80px] uppercase tracking-wider',
                  isCurrent ? 'text-surface-900' : isCompleted ? 'text-surface-600' : 'text-surface-400'
                )}>
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 mx-3 transition-colors duration-300',
                  isCompleted ? 'bg-surface-900' : 'bg-surface-200'
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
