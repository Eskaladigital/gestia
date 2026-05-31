'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { ProjectReferenceImage } from '@/types';
import {
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  MAX_PROJECT_REFERENCE_IMAGES,
} from '@/lib/projects/reference-images-shared';

interface ProjectReferenceImagesCardProps {
  projectId: string;
  initialImages: ProjectReferenceImage[];
  /** Si el proyecto ya tiene reglas físicas guardadas, para avisar antes de reemplazarlas. */
  hasPhysicalConstraints?: boolean;
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string };
    if (typeof data.error === 'string' && data.error) return data.error;
  } catch {
    /* ignore */
  }
  return text.trim() || `Error HTTP ${res.status}`;
}

export function ProjectReferenceImagesCard({
  projectId,
  initialImages,
  hasPhysicalConstraints = false,
}: ProjectReferenceImagesCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionBusyId, setCaptionBusyId] = useState<string | null>(null);
  const [bulkCaptioning, setBulkCaptioning] = useState(false);
  const [generatingRules, setGeneratingRules] = useState(false);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));

      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await readApiError(res));

      setMessage({ type: 'ok', text: 'Imágenes de referencia guardadas.' });
      router.refresh();
      if (inputRef.current) inputRef.current.value = '';
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error subiendo imágenes' });
    } finally {
      setUploading(false);
    }
  }

  async function togglePrimary(imageId: string, isPrimary: boolean) {
    setBusyId(imageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, isPrimary }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setMessage({ type: 'ok', text: 'Referencias principales actualizadas.' });
      router.refresh();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error actualizando la referencia' });
    } finally {
      setBusyId(null);
    }
  }

  async function saveCaption(imageId: string, caption: string) {
    setCaptionBusyId(imageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, caption }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setMessage({ type: 'ok', text: 'Descripción guardada.' });
      setEditingCaptionId(null);
      setCaptionDrafts(prev => {
        const { [imageId]: _omit, ...rest } = prev;
        return rest;
      });
      router.refresh();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error guardando la descripción' });
    } finally {
      setCaptionBusyId(null);
    }
  }

  async function regenerateAllPendingCaptions() {
    setBulkCaptioning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateAllPending: true }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as { processed?: number };
      const n = data.processed ?? 0;
      setMessage({
        type: 'ok',
        text: n === 0 ? 'No había descripciones pendientes.' : `Se regeneraron ${n} descripciones.`,
      });
      router.refresh();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error generando descripciones' });
    } finally {
      setBulkCaptioning(false);
    }
  }

  // Herramienta de un clic: mira las fotos de referencia y redacta + guarda las
  // "Reglas físicas e identitarias inviolables" del proyecto. Encadena tres pasos
  // que antes eran manuales: (1) generar las descripciones IA pendientes de las
  // fotos, (2) pedir al modelo que redacte las reglas mirando esas fotos, (3)
  // guardarlas en el proyecto. El usuario las verá y podrá editarlas en Ajustes.
  async function generatePhysicalConstraints() {
    if (initialImages.length === 0) return;
    const overwriteNote = hasPhysicalConstraints
      ? 'El proyecto YA tiene reglas físicas guardadas y se REEMPLAZARÁN por unas nuevas. '
      : '';
    const ok = window.confirm(
      `${overwriteNote}La IA mirará las fotos de referencia, redactará las "Reglas físicas e identitarias inviolables del producto" y las guardará en los Ajustes del proyecto. ¿Continuar?`
    );
    if (!ok) return;

    setGeneratingRules(true);
    setMessage(null);
    try {
      // 1) Asegurar que todas las fotos tienen descripción IA (alimenta la redacción).
      if (pendingCaptionCount > 0) {
        const capRes = await fetch(`/api/projects/${projectId}/reference-images`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regenerateAllPending: true }),
        });
        if (!capRes.ok) throw new Error(await readApiError(capRes));
      }

      // 2) Redactar las reglas mirando el dossier + las fotos.
      const sugRes = await fetch(`/api/projects/${projectId}/suggest-physical-constraints`, {
        method: 'POST',
      });
      const sugData = (await sugRes.json().catch(() => ({}))) as {
        error?: string;
        suggestion?: string;
        insufficient?: boolean;
        message?: string;
      };
      if (!sugRes.ok) throw new Error(sugData.error || 'Error generando las reglas físicas');
      if (sugData.insufficient) {
        throw new Error(
          sugData.message ||
            'No hay suficiente información en las fotos para escribir reglas. Sube más imágenes reales del producto (interior, exterior, detalle) y vuelve a intentarlo.'
        );
      }
      const suggestion = (sugData.suggestion || '').trim();
      if (!suggestion) throw new Error('La IA no devolvió ninguna regla.');

      // 3) Guardar las reglas en el proyecto (guardado parcial: solo este campo).
      const saveRes = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physical_constraints: suggestion }),
      });
      const saveData = (await saveRes.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!saveRes.ok) throw new Error(saveData.error || 'Error guardando las reglas');

      setMessage({
        type: 'ok',
        text: saveData.warning
          ? `Reglas generadas, pero: ${saveData.warning}`
          : 'Reglas físicas generadas desde las fotos y guardadas. Revísalas y ajústalas en "Ajustes del proyecto".',
      });
      router.refresh();
    } catch (error: unknown) {
      setMessage({
        type: 'err',
        text: error instanceof Error ? error.message : 'Error generando las reglas físicas',
      });
    } finally {
      setGeneratingRules(false);
    }
  }

  async function regenerateCaption(imageId: string) {
    setCaptionBusyId(imageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, regenerateCaption: true }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setMessage({ type: 'ok', text: 'Descripción regenerada por IA.' });
      router.refresh();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error regenerando la descripción' });
    } finally {
      setCaptionBusyId(null);
    }
  }

  async function removeImage(imageId: string) {
    setBusyId(imageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setMessage({ type: 'ok', text: 'Referencia eliminada.' });
      router.refresh();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error eliminando la referencia' });
    } finally {
      setBusyId(null);
    }
  }

  const primaryCount = initialImages.filter(image => image.is_primary).length;
  const canUploadMore = initialImages.length < MAX_PROJECT_REFERENCE_IMAGES;
  const pendingCaptionCount = initialImages.filter(image => {
    if (image.caption_is_manual) return false;
    const status = image.caption_status ?? 'pending';
    return status !== 'ready' || !image.caption;
  }).length;

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal mb-6 overflow-hidden">
      <div className="bg-surface-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🖼️</span>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Imágenes de producto</h2>
            <p className="text-surface-400 text-xs font-medium mt-0.5">
              Paso intermedio recomendado antes del primer procesamiento con IA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-xs font-bold px-3 py-1.5 border-2 ${
              message.type === 'ok'
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                : 'border-red-400 bg-red-500/20 text-red-300'
            }`}>
              {message.text}
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={event => void handleUpload(event.target.files)}
          />
          {pendingCaptionCount > 0 && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void regenerateAllPendingCaptions()}
              loading={bulkCaptioning}
            >
              Generar {pendingCaptionCount} descripcion{pendingCaptionCount === 1 ? '' : 'es'} IA
            </Button>
          )}
          {initialImages.length > 0 && (
            <Button
              variant="success"
              size="md"
              onClick={() => void generatePhysicalConstraints()}
              loading={generatingRules}
              disabled={uploading || bulkCaptioning}
            >
              ✨ Generar reglas físicas con IA
            </Button>
          )}
          <Button
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            disabled={!canUploadMore}
            size="md"
          >
            {canUploadMore ? 'Subir imágenes' : 'Límite alcanzado'}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="border-2 border-surface-900 p-4 bg-surface-50">
          <p className="text-sm text-surface-800 leading-relaxed">
            Estas imágenes se tendrán en cuenta en la generación de imágenes del proyecto para que los productos
            representados se parezcan lo máximo posible a los ejemplos reales.
          </p>
          <p className="text-xs text-surface-600 mt-2 font-medium leading-relaxed">
            Las referencias fijan el producto real, no el encuadre: la IA debe respetar forma, proporciones,
            acabados y detalles, pero seguirá decidiendo si conviene usar plano aéreo, plano abierto, primer plano,
            segundo plano o detalle según la pieza.
          </p>
          <p className="text-xs text-surface-600 mt-2 font-medium leading-relaxed">
            Cuando tengas las fotos subidas, pulsa <strong>«✨ Generar reglas físicas con IA»</strong>: la IA mirará
            estas imágenes y escribirá las <strong>reglas físicas e identitarias inviolables</strong> del producto
            (geometría, materiales, identidad, prohibiciones) y las guardará en Ajustes. Es lo que hace que las
            imágenes generadas se parezcan de verdad al producto real.
          </p>
          <div className="flex flex-wrap gap-2 mt-3 text-[10px] font-bold uppercase tracking-wider">
            <span className="border-2 border-surface-900 px-2 py-1 bg-white">
              {initialImages.length}/{MAX_PROJECT_REFERENCE_IMAGES} referencias
            </span>
            <span className="border-2 border-surface-900 px-2 py-1 bg-white">
              {primaryCount}/{DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI} principales
            </span>
            {pendingCaptionCount > 0 ? (
              <span className="border-2 border-amber-500 px-2 py-1 bg-amber-500/20 text-amber-900">
                {pendingCaptionCount} sin descripción IA
              </span>
            ) : initialImages.length > 0 ? (
              <span className="border-2 border-emerald-500 px-2 py-1 bg-emerald-500/20 text-emerald-900">
                Todas con descripción
              </span>
            ) : null}
          </div>
        </div>

        {initialImages.length === 0 ? (
          <div className="border-2 border-dashed border-surface-400 p-8 text-center bg-surface-50">
            <p className="text-sm font-bold text-surface-900">Todavía no hay referencias de producto.</p>
            <p className="text-xs text-surface-500 mt-2 max-w-2xl mx-auto">
              Recomendado: sube entre 3 y 10 imágenes reales del producto. Idealmente mezcla frontal, lateral,
              interior, detalle y contexto de uso.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {initialImages.map(image => (
              <div key={image.id} className="border-2 border-surface-900 bg-white shadow-brutal-sm overflow-hidden">
                <div className="aspect-[4/3] bg-surface-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.image_url}
                    alt={image.original_filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-3 space-y-3 border-t-2 border-surface-900">
                  <div>
                    <p className="text-xs font-bold text-surface-900 truncate">{image.original_filename}</p>
                    <p className="text-[10px] text-surface-500 uppercase tracking-wider font-bold mt-1">
                      {image.is_primary ? 'Principal para IA' : 'Secundaria'}
                    </p>
                  </div>

                  {/* Caption: descripción IA / manual */}
                  <div className="border-2 border-surface-900 bg-surface-50 p-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-surface-700">
                        Descripción IA
                      </span>
                      {(() => {
                        const status = image.caption_status ?? 'pending';
                        const labels: Record<string, { text: string; cls: string }> = {
                          ready: image.caption_is_manual
                            ? { text: 'Manual', cls: 'bg-blue-500/20 text-blue-800 border-blue-500' }
                            : { text: 'IA', cls: 'bg-emerald-500/20 text-emerald-800 border-emerald-500' },
                          generating: { text: 'Generando…', cls: 'bg-amber-500/20 text-amber-800 border-amber-500' },
                          pending: { text: 'Pendiente', cls: 'bg-surface-200 text-surface-700 border-surface-400' },
                          error: { text: 'Error', cls: 'bg-red-500/20 text-red-800 border-red-500' },
                        };
                        const tag = labels[status] ?? labels.pending;
                        return (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${tag.cls}`}>
                            {tag.text}
                          </span>
                        );
                      })()}
                    </div>
                    {editingCaptionId === image.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={captionDrafts[image.id] ?? image.caption ?? ''}
                          onChange={event =>
                            setCaptionDrafts(prev => ({ ...prev, [image.id]: event.target.value }))
                          }
                          rows={3}
                          className="w-full text-xs border-2 border-surface-900 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-surface-900"
                          placeholder="Describe en 1-2 frases qué se ve en esta imagen…"
                          maxLength={2000}
                          disabled={captionBusyId === image.id}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              void saveCaption(
                                image.id,
                                (captionDrafts[image.id] ?? image.caption ?? '').trim()
                              )
                            }
                            loading={captionBusyId === image.id}
                          >
                            Guardar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingCaptionId(null);
                              setCaptionDrafts(prev => {
                                const { [image.id]: _omit, ...rest } = prev;
                                return rest;
                              });
                            }}
                            disabled={captionBusyId === image.id}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-surface-800 leading-relaxed min-h-[36px]">
                          {image.caption || (
                            <span className="italic text-surface-500">
                              Sin descripción todavía. Pulsa &quot;Regenerar&quot; o escribe la tuya.
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingCaptionId(image.id);
                              setCaptionDrafts(prev => ({ ...prev, [image.id]: image.caption ?? '' }));
                            }}
                            disabled={captionBusyId === image.id}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void regenerateCaption(image.id)}
                            loading={captionBusyId === image.id}
                          >
                            Regenerar IA
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={image.is_primary ? 'success' : 'secondary'}
                      size="sm"
                      onClick={() => void togglePrimary(image.id, !image.is_primary)}
                      loading={busyId === image.id}
                    >
                      {image.is_primary ? 'Quitar principal' : 'Marcar principal'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void removeImage(image.id)}
                      loading={busyId === image.id}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
