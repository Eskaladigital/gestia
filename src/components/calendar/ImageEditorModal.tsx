'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseUpper,
  Italic,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { ContentItemVisual } from '@/types';
import {
  createTextLayer,
  EMPTY_VISUAL_IMAGE_EDIT,
  FONT_FAMILY_OPTIONS,
  TEXT_STYLE_PRESETS,
  type ImageTextLayer,
  type TextBackground,
  type TextEffect,
  type VisualImageEditJson,
} from '@/lib/visual-image-edit';
import { getVisualImageEditState } from '@/lib/visual-image';
import {
  canvasPointerToNormalized,
  FONT_STACKS,
  loadEditorFonts,
  paintVisualCompositeOnCanvas,
  renderVisualCompositeToBlob,
} from '@/lib/visual-image-canvas';

const PRESET_COLORS = [
  '#ffffff',
  '#000000',
  '#fbbf24',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
];

const EFFECT_OPTIONS: Array<{ id: TextEffect; label: string }> = [
  { id: 'none', label: 'Plano' },
  { id: 'shadow', label: 'Sombra' },
  { id: 'outline', label: 'Contorno' },
  { id: 'neon', label: 'Neón' },
];

/** Un preset está activo si la capa ya coincide con todos sus campos de estilo. */
function isPresetActive(layer: ImageTextLayer, patch: Partial<ImageTextLayer>): boolean {
  return (Object.keys(patch) as Array<keyof ImageTextLayer>).every(
    key => layer[key] === patch[key],
  );
}

const TOGGLE_ACTIVE = 'bg-white text-neutral-900';
const TOGGLE_IDLE = 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700';

/** Slider oscuro con etiqueta y valor, estilo panel de edición. */
function SliderRow({
  label,
  value,
  display,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-100 tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-1.5 accent-emerald-400 cursor-pointer"
      />
    </div>
  );
}

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

  // Forzamos un re-render cuando las fuentes están listas, para que los
  // chips "Aa" del selector se muestren en su tipografía real.
  const [, setFontsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadEditorFonts().then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

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

  const applyStylePreset = useCallback(
    (patch: Partial<ImageTextLayer>) => {
      if (!selectedId) return;
      updateLayer(selectedId, patch);
    },
    [selectedId, updateLayer],
  );

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

  const alignIcon = (al: ImageTextLayer['align']) =>
    al === 'left' ? <AlignLeft size={15} /> : al === 'right' ? <AlignRight size={15} /> : <AlignCenter size={15} />;

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/90 flex flex-col sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
    >
      <div
        className="bg-neutral-900 text-neutral-100 w-full h-full sm:h-[92vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-neutral-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Barra superior */}
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4 h-14 shrink-0 border-b border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-800 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          <h2 id="image-editor-title" className="text-sm font-semibold tracking-wide">
            Editor
          </h2>
          <button
            type="button"
            disabled={saving || !!loadError}
            onClick={() => void handleSave()}
            className="text-sm font-bold px-4 h-9 rounded-full bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Lienzo */}
          <div className="relative flex-1 flex items-center justify-center bg-neutral-950 p-3 min-h-[40vh] sm:min-h-0">
            {loadError ? (
              <p className="text-sm text-red-400 px-4 text-center">{loadError}</p>
            ) : (
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[44vh] sm:max-h-[78vh] rounded-lg shadow-lg cursor-move touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            )}
            {loading && (
              <span className="absolute text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Cargando…
              </span>
            )}

            {/* Botón flotante: añadir texto */}
            {!loadError && (
              <button
                type="button"
                onClick={addText}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-full bg-white/95 text-neutral-900 shadow-lg hover:bg-white transition-colors"
              >
                <Plus size={16} /> Añadir texto
              </button>
            )}
          </div>

          {/* Panel de herramientas */}
          <div className="w-full sm:w-[340px] shrink-0 border-t sm:border-t-0 sm:border-l border-neutral-800 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {selectedLayer ? (
                <>
                  <textarea
                    value={selectedLayer.text}
                    onChange={e => updateLayer(selectedLayer.id, { text: e.target.value })}
                    rows={2}
                    placeholder="Escribe tu texto…"
                    className="w-full text-base bg-neutral-800 rounded-xl p-3 text-white placeholder:text-neutral-500 border border-neutral-700 focus:border-emerald-400 focus:outline-none resize-none"
                  />

                  {/* Selector de tipografía (chips "Aa") */}
                  <div className="space-y-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Tipografía
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      {FONT_FAMILY_OPTIONS.map(f => {
                        const active = selectedLayer.fontFamily === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            title={f.label}
                            onClick={() => updateLayer(selectedLayer.id, { fontFamily: f.id })}
                            className={`shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all ${
                              active
                                ? 'bg-neutral-800 border-white ring-1 ring-white'
                                : 'bg-neutral-800/60 border-neutral-700 hover:border-neutral-500'
                            }`}
                          >
                            <span
                              className="text-2xl leading-none text-white"
                              style={{ fontFamily: FONT_STACKS[f.id] }}
                            >
                              Aa
                            </span>
                            <span className="text-[9px] uppercase tracking-wide text-neutral-400">
                              {f.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Formato rápido */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      title="Negrita"
                      onClick={() =>
                        updateLayer(selectedLayer.id, {
                          fontWeight: selectedLayer.fontWeight === 'bold' ? 'normal' : 'bold',
                        })
                      }
                      className={`w-9 h-9 flex items-center justify-center rounded-lg ${
                        selectedLayer.fontWeight === 'bold' ? TOGGLE_ACTIVE : TOGGLE_IDLE
                      }`}
                    >
                      <Bold size={15} />
                    </button>
                    <button
                      type="button"
                      title="Cursiva"
                      onClick={() => updateLayer(selectedLayer.id, { italic: !selectedLayer.italic })}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg ${
                        selectedLayer.italic ? TOGGLE_ACTIVE : TOGGLE_IDLE
                      }`}
                    >
                      <Italic size={15} />
                    </button>
                    <button
                      type="button"
                      title="Mayúsculas"
                      onClick={() => updateLayer(selectedLayer.id, { uppercase: !selectedLayer.uppercase })}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg ${
                        selectedLayer.uppercase ? TOGGLE_ACTIVE : TOGGLE_IDLE
                      }`}
                    >
                      <CaseUpper size={17} />
                    </button>
                    <div className="w-px bg-neutral-700 mx-0.5" />
                    {(['left', 'center', 'right'] as const).map(al => (
                      <button
                        key={al}
                        type="button"
                        title={`Alinear ${al}`}
                        onClick={() => updateLayer(selectedLayer.id, { align: al })}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg ${
                          selectedLayer.align === al ? TOGGLE_ACTIVE : TOGGLE_IDLE
                        }`}
                      >
                        {alignIcon(al)}
                      </button>
                    ))}
                  </div>

                  {/* Efecto */}
                  <div className="space-y-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Efecto
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {EFFECT_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateLayer(selectedLayer.id, { effect: opt.id })}
                          className={`text-[11px] font-semibold py-1.5 rounded-lg ${
                            selectedLayer.effect === opt.id ? TOGGLE_ACTIVE : TOGGLE_IDLE
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color del texto */}
                  <div className="space-y-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Color
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          onClick={() => updateLayer(selectedLayer.id, { color: c })}
                          className={`shrink-0 w-8 h-8 rounded-full border-2 transition-transform ${
                            selectedLayer.color === c
                              ? 'border-white ring-2 ring-white scale-110'
                              : 'border-neutral-600'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <label className="shrink-0 w-8 h-8 rounded-full border-2 border-neutral-600 overflow-hidden relative cursor-pointer">
                        <span className="absolute inset-0 bg-gradient-to-br from-fuchsia-500 via-yellow-400 to-cyan-400" />
                        <input
                          type="color"
                          value={selectedLayer.color}
                          onChange={e => updateLayer(selectedLayer.id, { color: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          title="Color personalizado"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="space-y-4">
                    <SliderRow
                      label="Tamaño"
                      value={Math.round(selectedLayer.fontSize * 100)}
                      display={`${Math.round(selectedLayer.fontSize * 100)}`}
                      min={2}
                      max={16}
                      onChange={n => updateLayer(selectedLayer.id, { fontSize: n / 100 })}
                    />
                    <SliderRow
                      label="Espaciado"
                      value={Math.round(selectedLayer.letterSpacing * 100)}
                      display={`${Math.round(selectedLayer.letterSpacing * 100)}`}
                      min={-2}
                      max={20}
                      onChange={n => updateLayer(selectedLayer.id, { letterSpacing: n / 100 })}
                    />
                    <SliderRow
                      label="Rotación"
                      value={Math.round(selectedLayer.rotation)}
                      display={`${Math.round(selectedLayer.rotation)}°`}
                      min={-180}
                      max={180}
                      onChange={n => updateLayer(selectedLayer.id, { rotation: n })}
                    />
                    <SliderRow
                      label="Opacidad"
                      value={Math.round(selectedLayer.opacity * 100)}
                      display={`${Math.round(selectedLayer.opacity * 100)}%`}
                      min={10}
                      max={100}
                      onChange={n => updateLayer(selectedLayer.id, { opacity: n / 100 })}
                    />
                  </div>

                  {/* Fondo */}
                  <div className="space-y-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Fondo
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ['none', 'Ninguno'],
                        ['translucent', 'Translúcido'],
                        ['solid', 'Sólido'],
                      ] as Array<[TextBackground, string]>).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => updateLayer(selectedLayer.id, { background: id })}
                          className={`text-[11px] font-semibold py-1.5 rounded-lg ${
                            selectedLayer.background === id ? TOGGLE_ACTIVE : TOGGLE_IDLE
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {selectedLayer.background === 'solid' && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 pt-1">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            title={c}
                            onClick={() => updateLayer(selectedLayer.id, { backgroundColor: c })}
                            className={`shrink-0 w-7 h-7 rounded-full border-2 ${
                              selectedLayer.backgroundColor === c
                                ? 'border-white ring-2 ring-white'
                                : 'border-neutral-600'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Estilos rápidos */}
                  <div className="space-y-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Estilos
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {TEXT_STYLE_PRESETS.map(preset => {
                        const active = isPresetActive(selectedLayer, preset.patch);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyStylePreset(preset.patch)}
                            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full ${
                              active ? TOGGLE_ACTIVE : TOGGLE_IDLE
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={removeSelected}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-400 hover:text-red-300 py-2"
                  >
                    <Trash2 size={14} /> Eliminar texto
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-8 gap-3">
                  <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
                    <Plus size={22} />
                  </div>
                  <p className="text-sm text-neutral-400 max-w-[220px]">
                    Toca un texto en la imagen para editarlo, o añade uno nuevo.
                  </p>
                  <button
                    type="button"
                    onClick={addText}
                    className="text-sm font-bold px-4 py-2 rounded-full bg-white text-neutral-900 hover:bg-neutral-200 transition-colors"
                  >
                    Añadir texto
                  </button>
                </div>
              )}

              {/* Ajustes de imagen */}
              <div className="space-y-4 pt-4 border-t border-neutral-800">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Imagen
                </span>
                {(['brightness', 'contrast', 'saturation'] as const).map(key => (
                  <SliderRow
                    key={key}
                    label={key === 'brightness' ? 'Brillo' : key === 'contrast' ? 'Contraste' : 'Saturación'}
                    value={edit.filter[key]}
                    display={`${edit.filter[key]}%`}
                    min={50}
                    max={150}
                    onChange={n =>
                      setEdit(prev => ({ ...prev, filter: { ...prev.filter, [key]: n } }))
                    }
                  />
                ))}
              </div>
            </div>

            {/* Pie del panel */}
            <div className="p-4 border-t border-neutral-800 space-y-2 bg-neutral-900">
              {saveError && <p className="text-xs text-red-400 font-mono">{saveError}</p>}
              <button
                type="button"
                disabled={saving || !!loadError}
                onClick={() => void handleSave()}
                className="w-full text-sm font-bold py-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando…' : 'Guardar edición'}
              </button>
              {(visual.edited_image_url || visual.image_edit_json) && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleClear()}
                  className="w-full text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-red-400 disabled:opacity-50 py-1"
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
