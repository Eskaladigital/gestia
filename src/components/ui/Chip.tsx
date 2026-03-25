'use client';

import { cn } from '@/lib/utils';

interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function Chip({ label, selected, onClick, size = 'md' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-2 border-surface-900 transition-all duration-150 font-bold uppercase tracking-wider',
        size === 'sm' ? 'px-3 py-1 text-[10px]' : 'px-4 py-2 text-xs',
        selected
          ? 'bg-surface-900 text-white shadow-brutal-sm'
          : 'bg-white text-surface-600 hover:bg-surface-100 hover:text-surface-900'
      )}
    >
      {label}
    </button>
  );
}
