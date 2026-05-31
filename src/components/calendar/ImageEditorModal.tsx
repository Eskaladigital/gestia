'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentItemVisual } from '@/types';
import {
  createTextLayer,
  EMPTY_VISUAL_IMAGE_EDIT,
  type ImageTextLayer,
  type VisualImageEditJson,
} from '@/lib/visual-image-edit';
import { getVisualImageEditState } from '@/lib/visual-image';
import {
  canvasPointerToNormalized,
  paintVisualCompositeOnCanvas,
  renderVisualCompositeToBlob,
} from '@/lib/visual-image-canvas';

const PRESET_COLORS = ['#ffffff', '#000000', '#fbbf24', '#ef4444', '#3b82f6', '#10b981'];

interface ImageEditorModalProps {
  visual: ContentItemVisual;
  onClose: () => void;
  onSaved: (patch: Pick<ContentItemVisual, 'edited_image_url' | 'image_edit_json' | 'image_edited_at'>) => void;
  onCleared: () => void;
}

export function ImageEditorModal({ visual, onClose, onSaved, onCleared }: ImageEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const naturalRef = useRef({ width: 1, height: 1 });
  const [edit, setEdit] = useState<VisualImageEditJson>(() => {
    return getVisualImageEditState(visual) ?? { ...EMPTY_VISUAL_IMAGE_EDIT, texts: [] };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const flip = visual.image_flip_horizontal === true;
  const baseUrl = visual.image_url!;

  const selectedLayer = edit.texts.find(t => t.id === selectedId) ?? null;

  const repaint = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dims = await paintVisualCompositeOnCanvas(canvas, {
        baseImageUrl: baseUrl,
        flipHorizontal: flip,
        edit,
      });
      naturalRef.current = { width: dims.width, height: dims.height };
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar la imagen');
    }
  }, [baseUrl, flip, edit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await repaint();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [repaint]);

  const updateLayer = useCallback((id: string, patch: Partial<ImageTextLayer>) => {
    setEdit(prev => ({
      ...prev,
      texts: prev.texts.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const addText = useCallback(() => {
    const layer = createTextLayer();
    setEdit(prev => ({ ...prev, texts: [...prev.texts, layer] }));
    setSelectedId(layer.id);
  }, []);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setEdit(prev => ({ ...prev, texts: prev.texts.filter(t => t.id !== selectedId) }));
    setSelectedId(null);
  }, [selectedId]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = canvasPointerToNormalized(
      canvas,
      e.clientX,
      e.clientY,
      naturalRef.current.width,
      naturalRef.current.height,
    );
    let hit: ImageTextLayer | null = null;
    for (let i = edit.texts.length - 1; i >= 0; i--) {
      const t = edit.texts[i];
      const dx = Math.abs(t.x - x);
      const dy = Math.abs(t.y - y);
      if (dx < 0.12 && dy < 0.06) {
        hit = t;
        break;
      }
    }
    if (hit) {
      setSelectedId(hit.id);
      dragRef.current = { id: hit.id, startX: x, startY: y, origX: hit.x, origY: hit.y };
      canvas.setPointerCapture(e.pointerId);
    } else {
      setSelectedId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = canvasPointerToNormalized(
      canvas,
      e.clientX,
      e.clientY,
      naturalRef.current.width,
      naturalRef.current.height,
    );
    const d = dragRef.current;
    const dx = x - d.startX;
    const dy = y - d.startY;
    updateLayer(d.id, {
      x: Math.min(1, Math.max(0, d.origX + dx)),
      y: Math.min(1, Math.max(0, d.origY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await renderVisualCompositeToBlob({
        baseImageUrl: baseUrl,
        flipHorizontal: flip,
        edit,
      });
      const form = new FormData();
      form.append('visual_id', visual.id);
      form.append('image_edit_json', JSON.stringify(edit));
      form.append('image', blob, 'edited.png');

      const res = await fetch('/api/save-visual-image-edit', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo guardar');
      }
      onSaved({
        edited_image_url: data.edited_image_url,
        image_edit_json: data.image_edit_json,
        image_edited_at: data.image_edited_at,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!visual.edited_image_url && !visual.image_edit_json) {
      onClose();
      return;
    }
    if (!window.confirm('¿Quitar la edición guardada y volver a la imagen generada por IA?')) return;
    setSaving(true);
    setSaveError(null);
    try {
      const form = new FormData();
      form.append('visual_id', visual.id);
      form.append('clear', 'true');
      const res = await fetch('/api/save-visual-image-edit', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo quitar la edición');
      onCleared();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
    >
      <div
        className="bg-white border-2 border-surface-900 shadow-brutal w-full sm:max-w-4xl max-h-[100dvh] sm:max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-surface-900 bg-surface-100 shrink-0">
          <div>
            <h2 id="image-editor-title" className="text-sm font-bold uppercase tracking-wider text-surface-900">
              Editar imagen
            </h2>
            <p className="text-[10px] text-surface-600 mt-0.5">
              Texto y filtros · se guarda para vista y descarga
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 border-2 border-surface-900 bg-white hover:bg-surface-50"
          >
            Cerrar
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-surface-900/5 p-3 min-h-[200px] sm:min-h-0">
            {loadError ? (
              <p className="text-sm text-red-600 px-4 text-center">{loadError}</p>
            ) : (
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[50vh] sm:max-h-[60vh] border-2 border-surface-300 cursor-crosshair touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            )}
            {loading && (
              <span className="absolute text-xs font-bold uppercase text-surface-500">Cargando…</span>
            )}
          </div>

          <div className="w-full sm:w-72 border-t-2 sm:border-t-0 sm:border-l-2 border-surface-900 flex flex-col shrink-0 overflow-y-auto max-h-[45vh] sm:max-h-none">
            <div className="p-3 space-y-3 flex-1">
              <button
                type="button"
                onClick={addText}
                className="w-full text-xs font-bold uppercase tracking-wider py-2 border-2 border-surface-900 bg-brand-600 text-white shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                + Añadir texto
              </button>

              {selectedLayer ? (
                <div className="space-y-2 border-2 border-surface-200 p-2">
                  <p className="text-[10px] font-bold uppercase text-surface-500">Texto seleccionado</p>
                  <textarea
                    value={selectedLayer.text}
                    onChange={e => updateLayer(selectedLayer.id, { text: e.target.value })}
                    rows={3}
                    className="w-full text-sm border-2 border-surface-300 p-2 focus:border-brand-500 focus:outline-none"
                  />
                  <label className="block text-[10px] font-bold uppercase text-surface-600">
                    Tamaño
                    <input
                      type="range"
                      min={2}
                      max={14}
                      value={Math.round(selectedLayer.fontSize * 100)}
                      onChange={e =>
                        updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) / 100 })
                      }
                      className="w-full mt-1"
                    />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        onClick={() => updateLayer(selectedLayer.id, { color: c })}
                        className={`w-7 h-7 rounded-full border-2 ${
                          selectedLayer.color === c ? 'border-brand-600 ring-2 ring-brand-300' : 'border-surface-400'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedLayer.fontWeight === 'bold'}
                      onChange={e =>
                        updateLayer(selectedLayer.id, {
                          fontWeight: e.target.checked ? 'bold' : 'normal',
                        })
                      }
                    />
                    Negrita
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedLayer.withBackground}
                      onChange={e =>
                        updateLayer(selectedLayer.id, { withBackground: e.target.checked })
                      }
                    />
                    Fondo detrás del texto
                  </label>
                  <select
                    value={selectedLayer.align}
                    onChange={e =>
                      updateLayer(selectedLayer.id, {
                        align: e.target.value as ImageTextLayer['align'],
                      })
                    }
                    className="w-full text-xs border-2 border-surface-300 p-1.5"
                  >
                    <option value="left">Izquierda</option>
                    <option value="center">Centro</option>
                    <option value="right">Derecha</option>
                  </select>
                  <button
                    type="button"
                    onClick={removeSelected}
                    className="w-full text-[10px] font-bold uppercase text-red-700 hover:underline"
                  >
                    Eliminar capa
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-surface-500">
                  Toca un texto en la imagen para editarlo, o añade uno nuevo.
                </p>
              )}

              <div className="space-y-2 pt-2 border-t border-surface-200">
                <p className="text-[10px] font-bold uppercase text-surface-500">Filtros</p>
                {(['brightness', 'contrast', 'saturation'] as const).map(key => (
                  <label key={key} className="block text-[10px] font-bold uppercase text-surface-600">
                    {key === 'brightness' ? 'Brillo' : key === 'contrast' ? 'Contraste' : 'Saturación'}
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={edit.filter[key]}
                      onChange={e =>
                        setEdit(prev => ({
                          ...prev,
                          filter: { ...prev.filter, [key]: Number(e.target.value) },
                        }))
                      }
                      className="w-full mt-1"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="p-3 border-t-2 border-surface-900 space-y-2 bg-surface-50">
              {saveError && (
                <p className="text-xs text-red-600 font-mono">{saveError}</p>
              )}
              <button
                type="button"
                disabled={saving || !!loadError}
                onClick={() => void handleSave()}
                className="w-full text-xs font-bold uppercase tracking-wider py-2.5 border-2 border-surface-900 bg-emerald-600 text-white shadow-brutal-sm hover:shadow-none disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar edición'}
              </button>
              {(visual.edited_image_url || visual.image_edit_json) && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleClear()}
                  className="w-full text-[10px] font-bold uppercase text-surface-600 hover:text-red-700 disabled:opacity-50"
                >
                  Quitar edición guardada
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
