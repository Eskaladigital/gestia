'use client';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  leftLabel,
  rightLabel,
}: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-surface-900 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-mono font-bold text-surface-900 bg-surface-100 border-2 border-surface-900 px-2 py-0.5 tabular-nums">
          {value}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-3 border-2 border-surface-900 bg-surface-100">
          <div
            className="h-full bg-brand-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 w-full h-3 appearance-none cursor-pointer bg-transparent
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:bg-surface-900 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-900
            [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]
            [&::-webkit-slider-thumb]:hover:bg-brand-600 [&::-webkit-slider-thumb]:transition-colors
            [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:bg-surface-900 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface-900
            [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:cursor-pointer
            [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-0"
        />
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">{leftLabel}</span>
          <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
