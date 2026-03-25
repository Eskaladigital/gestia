'use client';

import { cn } from '@/lib/utils';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-bold rounded-none transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider border-2 border-surface-900';

    const variants = {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px]',
      secondary: 'bg-white text-surface-900 hover:bg-surface-100 focus:ring-surface-400 shadow-brutal-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]',
      success: 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-500 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px]',
      ghost: 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 focus:ring-surface-400 border-transparent shadow-none',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px]',
    };

    const sizes = {
      sm: 'px-4 py-1.5 text-xs gap-1.5',
      md: 'px-6 py-2.5 text-xs gap-2',
      lg: 'px-8 py-3.5 text-sm gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
