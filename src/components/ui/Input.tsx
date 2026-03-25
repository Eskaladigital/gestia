'use client';

import { cn } from '@/lib/utils';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-4 py-3 border-2 border-surface-900 bg-white text-surface-900 placeholder:text-surface-400 font-medium',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
            error
              ? 'border-red-500 focus:border-red-600'
              : '',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs text-surface-400">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input };
