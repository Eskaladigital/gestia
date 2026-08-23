'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { ProjectReferenceImage, ProjectReferenceRole } from '@/types';
import {
  countReferenceImagesNeedingReanalysis,
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  MAX_PROJECT_REFERENCE_IMAGES,
  PROJECT_REFERENCE_ROLE_CHOICES,
  PROJECT_REFERENCE_ROLE_LABELS,
} from '@/lib/projects/reference-images-shared';

interface ProjectReferenceImagesCardProps {
  projectId: string;
  initialImages: ProjectReferenceImage[];
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

// Vercel rechaza cuerpos > ~4,5 MB (FUNCTION_PAYLOAD_TOO_LARGE), así que
// comprimimos en el navegador y subimos en lotes que no superen este margen.
const MAX_UPLOAD_BATCH_BYTES = 3_500_000;
// El servidor normaliza a 2048 px (MAX_REFERENCE_IMAGE_DIMENSION): reducir en
// cliente a ese mismo tamaño no pierde calidad final y aligera la subida.
const CLIENT_MAX_DIMENSION = 2048;

/** Reduce y recomprime una imagen en el navegador. Si algo falla, devuelve el original. */
async function compressImageFile(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, CLIENT_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Fondo blanco por si el PNG tiene transparencia (el server también aplana a blanco).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.87)
    );
    if (!blob || blob.size >= file.size) return file;

    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Agrupa archivos en lotes cuyo peso total no supere el límite por petición. */
function splitIntoBatches(files: File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  for (const file of files) {
    if (current.length > 0 && currentBytes + file.size > MAX_UPLOAD_BATCH_BYTES) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function ProjectReferenceImagesCard({
  projectId,
  initialImages,
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
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const autoReanalyzeStarted = useRef(false);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);

    try {
      const compressed = await Promise.all(Array.from(files).map(compressImageFile));

      const tooBig = compressed.find(file => file.size > MAX_UPLOAD_BATCH_BYTES);
      if (tooBig) {
        throw new Error(
          `"${tooBig.name}" sigue ocupando ${(tooBig.size / 1024 / 1024).toFixed(1)} MB tras comprimir; supera el límite por petición. Reduce esa imagen y vuelve a intentarlo.`
        );
      }

      const batches = splitIntoBatches(compressed);
      let uploaded = 0;
      for (const [index, batch] of batches.entries()) {
        if (batches.length > 1) {
          setMessage({ type: 'ok', text: `Subiendo lote ${index + 1} de ${batches.length}…` });
        }
        const formData = new FormData();
        batch.forEach(file => formData.append('files', file));

        const res = await fetch(`/api/projects/${projectId}/reference-images`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const detail = await readApiError(res);
          throw new Error(
            uploaded > 0
              ? `Se guardaron ${uploaded} imágenes, pero falló el lote ${index + 1}: ${detail}`
              : detail
          );
        }
        uploaded += batch.length;
      }

      setMessage({ type: 'ok', text: `Imágenes de referencia guardadas (${uploaded}).` });
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

  async function changeRole(imageId: string, role: ProjectReferenceRole) {
    setRoleBusyId(imageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, role }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setMessage({ type: 'ok', text: 'Tipo de imagen actualizado.' });
      router.refresh();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error actualizando el tipo' });
    } finally {
      setRoleBusyId(null);
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
  const needsAnalysisCount = countReferenceImagesNeedingReanalysis(initialImages);
  const pendingCaptionCount = needsAnalysisCount;

  // Tras la migración 028 (o fotos antiguas sin rol), reanalizamos solas al
  // abrir el proyecto: clasificación + reglas físicas si hay producto.
  useEffect(() => {
    if (initialImages.length === 0 || needsAnalysisCount === 0 || autoReanalyzeStarted.current) {
      return;
    }
    autoReanalyzeStarted.current = true;
    setAutoAnalyzing(true);
    setMessage(null);

    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/reference-images`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regenerateAllPending: true }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const data = (await res.json()) as { processed?: number };
        const n = data.processed ?? needsAnalysisCount;
        setMessage({
          type: 'ok',
          text:
            n === 0
              ? 'Referencias ya clasificadas.'
              : `Clasificación automática: ${n} imagen${n === 1 ? '' : 'es'} analizadas (tipo de producto, reglas si aplica).`,
        });
        router.refresh();
      } catch (error: unknown) {
        setMessage({
          type: 'err',
          text:
            error instanceof Error
              ? error.message
              : 'Error en la clasificación automática de referencias',
        });
        autoReanalyzeStarted.current = false;
      } finally {
        setAutoAnalyzing(false);
      }
    })();
  }, [projectId, needsAnalysisCount, initialImages.length, router]);

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
          {(autoAnalyzing || bulkCaptioning) && (
            <span className="text-xs font-bold text-amber-200 animate-pulse">
              Clasificando imágenes con IA…
            </span>
          )}
          {pendingCaptionCount > 0 && !autoAnalyzing && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void regenerateAllPendingCaptions()}
              loading={bulkCaptioning}
            >
              Reclasificar {pendingCaptionCount} imagen{pendingCaptionCount === 1 ? '' : 'es'}
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
            Al subir cada imagen, la IA la clasifica automáticamente por <strong>tipo</strong>: las marcadas como
            <strong> Producto</strong> se reproducen con fidelidad total y las de <strong>Estilo</strong> o
            <strong> Lugar</strong> solo inspiran ambiente. Si la IA se equivoca, corrige el tipo en el desplegable de
            cada foto. Con fotos de <strong>Producto</strong>, la app redacta y actualiza sola las{' '}
            <strong>reglas físicas inviolables</strong> (visibles en Ajustes, solo lectura). Los deseos creativos del
            cliente van en <strong>Reglas IA</strong> y no cambian la forma del producto.
          </p>
          <div className="flex flex-wrap gap-2 mt-3 text-[10px] font-bold uppercase tracking-wider">
            <span className="border-2 border-surface-900 px-2 py-1 bg-white">
              {initialImages.length}/{MAX_PROJECT_REFERENCE_IMAGES} referencias
            </span>
            <span className="border-2 border-surface-900 px-2 py-1 bg-white">
              {primaryCount}/{DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI} principales
            </span>
            {autoAnalyzing ? (
              <span className="border-2 border-amber-500 px-2 py-1 bg-amber-500/20 text-amber-900">
                Clasificando con IA…
              </span>
            ) : pendingCaptionCount > 0 ? (
              <span className="border-2 border-amber-500 px-2 py-1 bg-amber-500/20 text-amber-900">
                {pendingCaptionCount} pendiente{pendingCaptionCount === 1 ? '' : 's'} de clasificar
              </span>
            ) : initialImages.length > 0 ? (
              <span className="border-2 border-emerald-500 px-2 py-1 bg-emerald-500/20 text-emerald-900">
                Todas clasificadas
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

                  {/* Tipo de imagen (rol): la IA lo detecta al subir; el usuario puede corregirlo. */}
                  <div className="border-2 border-surface-900 bg-surface-50 p-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-surface-700">
                        Tipo de imagen
                      </span>
                      {image.reference_role === 'product' ? (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border bg-emerald-500/20 text-emerald-800 border-emerald-500">
                          Fidelidad 100%
                        </span>
                      ) : (!image.reference_role || image.reference_role === 'pending') ? (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border bg-surface-200 text-surface-700 border-surface-400">
                          Sin clasificar
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border bg-surface-100 text-surface-700 border-surface-400">
                          Referencia
                        </span>
                      )}
                    </div>
                    <select
                      value={image.reference_role && image.reference_role !== 'pending' ? image.reference_role : ''}
                      onChange={event => void changeRole(image.id, event.target.value as ProjectReferenceRole)}
                      disabled={roleBusyId === image.id}
                      className="w-full text-xs border-2 border-surface-900 p-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-surface-900 disabled:opacity-60"
                    >
                      {(!image.reference_role || image.reference_role === 'pending') && (
                        <option value="" disabled>
                          Sin clasificar…
                        </option>
                      )}
                      {PROJECT_REFERENCE_ROLE_CHOICES.map(role => (
                        <option key={role} value={role}>
                          {PROJECT_REFERENCE_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    {image.reference_role === 'product' && image.product_identity && (
                      <p className="text-[10px] text-surface-600 mt-1 leading-snug">
                        <strong>Producto:</strong> {image.product_identity}
                        {image.reference_view ? ` · ${image.reference_view}` : ''}
                      </p>
                    )}
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
