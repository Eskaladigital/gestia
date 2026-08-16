'use client';

import {
  IMAGE_GENERATION_ESTIMATED_COST_USD,
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_QUALITY,
} from '@/lib/ai/constants';

interface ImageCostConfirmModalProps {
  imageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImageCostConfirmModal({ imageCount, onConfirm, onCancel }: ImageCostConfirmModalProps) {
  const estimatedCost = (imageCount * IMAGE_GENERATION_ESTIMATED_COST_USD).toFixed(2);
  const estimatedMinutes = Math.ceil((imageCount * 45) / 60);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white border-2 border-surface-900 shadow-brutal w-full max-w-md animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-amber-100 border-b-2 border-surface-900 px-5 py-3">
          <h3 className="font-display font-bold text-surface-900 uppercase tracking-wider text-sm">
            Confirmar generación de imágenes
          </h3>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-50 border-2 border-surface-900 p-3 text-center">
              <div className="text-2xl font-bold font-mono text-surface-900">{imageCount}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">
                {imageCount === 1 ? 'Imagen' : 'Imágenes'}
              </div>
            </div>
            <div className="bg-amber-50 border-2 border-surface-900 p-3 text-center">
              <div className="text-2xl font-bold font-mono text-amber-700">~{estimatedMinutes}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Minutos</div>
            </div>
            <div className="bg-red-50 border-2 border-surface-900 p-3 text-center">
              <div className="text-2xl font-bold font-mono text-red-700">${estimatedCost}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500 mt-1">Coste est.</div>
            </div>
          </div>

          <div className="bg-surface-50 border border-surface-200 p-3 text-xs text-surface-600 leading-relaxed space-y-1">
            <p>Cada imagen se genera con <strong>{IMAGE_GENERATION_MODEL}</strong> en proporción nativa de Instagram: 4:5 en feed/carrusel y 9:16 en stories/reels (calidad {IMAGE_GENERATION_QUALITY}).</p>
            <p>Coste estimado: <strong>${IMAGE_GENERATION_ESTIMATED_COST_USD.toFixed(2)}/imagen</strong>. Duración: ~30-60 segundos por imagen.</p>
            <p>Las imágenes se generan de forma secuencial. Puedes cerrar esta ventana y seguirán generándose.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t-2 border-surface-900 bg-surface-50">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold uppercase tracking-wider text-surface-700 bg-white border-2 border-surface-900 px-4 py-2 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="text-xs font-bold uppercase tracking-wider text-white bg-brand-600 border-2 border-surface-900 px-4 py-2 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all hover:bg-brand-700"
          >
            Generar {imageCount} {imageCount === 1 ? 'imagen' : 'imágenes'}
          </button>
        </div>
      </div>
    </div>
  );
}
