import type { ProductionSpecs } from '@/types';

interface ProductionSpecsDisplayProps {
  specs: ProductionSpecs | null | undefined;
  /** Si true, muestra caja vacía con texto cuando no hay datos */
  showEmptyHint?: boolean;
  compact?: boolean;
}

/**
 * Muestra la guía que generó el calendario (slides, duración, guion) — misma información que recibe el generador de briefs.
 */
export function ProductionSpecsDisplay({
  specs,
  showEmptyHint = true,
  compact = false,
}: ProductionSpecsDisplayProps) {
  const hasAny =
    specs &&
    (specs.num_slides != null ||
      specs.duration_seconds != null ||
      specs.media_type ||
      (specs.scene_summary && specs.scene_summary.trim()) ||
      (specs.locked_space && specs.locked_space.trim()));

  if (!hasAny) {
    if (!showEmptyHint) return null;
    return (
      <div className="rounded-lg border border-dashed border-surface-300 bg-surface-50/80 px-3 py-2 text-xs text-surface-500">
        <span className="font-bold text-surface-600 uppercase tracking-wider text-[10px]">Guía de producción</span>
        <p className="mt-1">
          Sin datos aún (p. ej. calendario generado antes de guardar specs). Regenera el calendario o completa la guía en{' '}
          <strong>Editar</strong>.
        </p>
      </div>
    );
  }

  const s = specs!;

  return (
    <div
      className={
        compact
          ? 'rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 space-y-2'
          : 'rounded-lg border-2 border-surface-900 bg-amber-50/40 px-3 py-3 space-y-2 shadow-brutal-sm'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-surface-800">
          Guía de producción
        </span>
        <span className="text-[10px] text-surface-500">— la usa el generador de briefs</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {s.num_slides != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-sky-200 text-sky-900 border border-sky-400">
            📑 {s.num_slides} slides
          </span>
        )}
        {s.duration_seconds != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-200 text-rose-900 border border-rose-400">
            ⏱️ {s.duration_seconds}s
          </span>
        )}
        {s.media_type && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-violet-200 text-violet-900 border border-violet-400">
            {s.media_type === 'video' ? '🎬' : '🖼️'} {s.media_type}
          </span>
        )}
      </div>
      {s.locked_space?.trim() && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-600 mb-1">Estancia única (misma en todos los slides)</p>
          <p className="text-xs text-surface-800 leading-relaxed whitespace-pre-wrap font-medium">{s.locked_space}</p>
        </div>
      )}
      {s.scene_summary?.trim() && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-600 mb-1">Guión / escenas (del calendario)</p>
          <p className="text-xs text-surface-800 leading-relaxed whitespace-pre-wrap font-medium">{s.scene_summary}</p>
        </div>
      )}
    </div>
  );
}
