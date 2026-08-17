'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Download, ExternalLink, X } from 'lucide-react';
import { cn, projectDashboardBasePath } from '@/lib/utils';
import { aspectClassForOrientation, aspectRatioForOrientation } from '@/lib/ai/constants';
import type { ImageGenerationStatus, ImageOrientation } from '@/types';

const FORMAT_LABEL: Record<string, string> = {
  story: 'STORY',
  carrusel: 'CARRUSEL',
  publicacion: 'POST',
  reel: 'REEL',
};

export type AdminContentVisual = {
  id: string;
  visualIndex: number;
  label: string | null;
  visualPrompt: string;
  imageUrl: string | null;
  editedImageUrl: string | null;
  displayUrl: string | null;
  imageStatus: ImageGenerationStatus;
  imageError: string | null;
  flipHorizontal: boolean;
  videoUrl: string | null;
  videoStatus: string | null;
  createdAt: string;
  contentItemId: string;
  projectId: string;
  projectName: string;
  projectDeleted: boolean;
  orientation: ImageOrientation | null;
  scheduledDate: string;
  format: string | null;
  idea: string;
};

type GridDensity = 'large' | 'medium' | 'small';

const GRID: Record<GridDensity, string> = {
  large: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  medium: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  small: 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8',
};

const STATUS_LABEL: Record<ImageGenerationStatus, string> = {
  ready: 'Lista',
  generating: 'Generando',
  pending: 'Pendiente',
  error: 'Error',
};

const STATUS_STYLE: Record<ImageGenerationStatus, string> = {
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-800',
  generating: 'bg-amber-100 text-amber-800 border-amber-800',
  pending: 'bg-surface-100 text-surface-600 border-surface-500',
  error: 'bg-red-100 text-red-800 border-red-800',
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminContentClient({
  visuals,
  totalCount,
}: {
  visuals: AdminContentVisual[];
  totalCount: number;
}) {
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('all');
  const [density, setDensity] = useState<GridDensity>('medium');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const projects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const v of visuals) {
      const prev = map.get(v.projectId);
      map.set(v.projectId, {
        id: v.projectId,
        name: v.projectName,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [visuals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visuals.filter((v) => {
      if (projectId !== 'all' && v.projectId !== projectId) return false;
      if (!q) return true;
      return (
        v.projectName.toLowerCase().includes(q) ||
        v.visualPrompt.toLowerCase().includes(q) ||
        v.idea.toLowerCase().includes(q) ||
        (v.label ?? '').toLowerCase().includes(q) ||
        (v.format ?? '').toLowerCase().includes(q)
      );
    });
  }, [visuals, projectId, search]);

  const selected = useMemo(
    () => filtered.find((v) => v.id === selectedId) ?? visuals.find((v) => v.id === selectedId) ?? null,
    [filtered, visuals, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  useEffect(() => {
    document.body.style.overflow = selectedId ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedId]);

  async function copyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="bg-white border-2 border-surface-900 shadow-brutal-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <label className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1">
              Buscar
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Proyecto, prompt, idea, formato…"
              className="w-full border-2 border-surface-900 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-red-500"
            />
          </label>
          <label className="lg:w-64">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1">
              Proyecto
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full border-2 border-surface-900 px-3 py-2 text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Todos ({visuals.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1.5">
            {(['large', 'medium', 'small'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDensity(key)}
                title={key === 'large' ? 'Grande' : key === 'medium' ? 'Mediana' : 'Pequeña'}
                className={cn(
                  'px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider border-2',
                  density === key
                    ? 'bg-surface-900 text-white border-surface-900'
                    : 'border-surface-300 text-surface-500 hover:border-surface-900',
                )}
              >
                {key === 'large' ? 'L' : key === 'medium' ? 'M' : 'S'}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-surface-500 font-medium">
          {filtered.length} imágenes generadas
          {totalCount > visuals.length ? ` · cargadas ${visuals.length} de ${totalCount}` : ''}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-surface-900 p-12 text-center">
          <p className="text-sm text-surface-500 font-medium">
            {visuals.length === 0
              ? 'Aún no hay imágenes generadas en la plataforma.'
              : 'Ninguna imagen coincide con la búsqueda o el proyecto seleccionado.'}
          </p>
        </div>
      ) : (
        <div className={cn('grid gap-2 items-start', GRID[density])}>
          {filtered.map((visual) => {
            const fmtLabel = visual.format ? FORMAT_LABEL[visual.format] : null;
            return (
              <button
                key={visual.id}
                type="button"
                onClick={() => setSelectedId(visual.id)}
                className="group relative flex w-full flex-col bg-white border-2 border-surface-900 text-left overflow-hidden shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                {/* Imagen en flujo (no absolute): el <button> de Chrome colapsa el aspect-ratio si el hijo no tiene altura intrínseca */}
                {visual.displayUrl ? (
                  <img
                    src={visual.displayUrl}
                    alt={visual.label || visual.projectName}
                    className={cn(
                      'w-full object-cover bg-surface-100',
                      aspectClassForOrientation(visual.orientation),
                      visual.flipHorizontal && '-scale-x-100',
                    )}
                    style={{ aspectRatio: aspectRatioForOrientation(visual.orientation) }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <span
                    className={cn(
                      'flex w-full items-center justify-center bg-surface-100 px-2 text-[10px] font-bold uppercase tracking-wider text-surface-400 text-center',
                      aspectClassForOrientation(visual.orientation),
                    )}
                    style={{ aspectRatio: aspectRatioForOrientation(visual.orientation) }}
                  >
                    {STATUS_LABEL[visual.imageStatus]}
                  </span>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-surface-900/85 text-white px-1.5 py-0.5 line-clamp-1">
                    {visual.projectName}
                  </span>
                  {visual.editedImageUrl && (
                    <span className="text-[8px] font-bold uppercase bg-teal-600 text-white px-1 py-0.5 shrink-0">
                      Edit
                    </span>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] font-bold text-white line-clamp-1">
                    {fmtLabel || visual.format || 'Visual'} · {visual.label || `#${visual.visualIndex + 1}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch justify-center p-3 sm:p-6"
          onClick={() => setSelectedId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Detalle de imagen"
        >
          <div
            className="relative w-full max-w-6xl max-h-full bg-white border-2 border-surface-900 shadow-brutal overflow-hidden flex flex-col lg:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center bg-white border-2 border-surface-900 hover:bg-surface-100"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>

            <div className="lg:w-[58%] bg-surface-950 flex items-center justify-center min-h-[240px] lg:min-h-0 overflow-auto">
              {selected.displayUrl ? (
                <img
                  src={selected.displayUrl}
                  alt={selected.label || selected.projectName}
                  className={cn(
                    'max-w-full max-h-[48vh] lg:max-h-[88vh] object-contain',
                    selected.flipHorizontal && '-scale-x-100',
                  )}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <p className="text-white/70 text-sm font-medium px-6 text-center">
                  {selected.imageError || 'Esta visual aún no tiene imagen.'}
                </p>
              )}
            </div>

            <aside className="lg:w-[42%] p-5 sm:p-6 overflow-y-auto border-t-2 lg:border-t-0 lg:border-l-2 border-surface-900">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600 mb-2">
                Playground · imagen
              </p>
              <h2 className="font-display text-2xl font-bold text-surface-900 leading-tight">
                {selected.projectName}
              </h2>
              <p className="text-sm text-surface-500 font-medium mt-1">
                {selected.idea || 'Sin idea de post'}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-4">
                <span className={cn('text-[10px] font-bold uppercase border px-2 py-1', STATUS_STYLE[selected.imageStatus])}>
                  {STATUS_LABEL[selected.imageStatus]}
                </span>
                {selected.format && (
                  <span className="text-[10px] font-bold uppercase border-2 border-surface-900 px-2 py-1">
                    {FORMAT_LABEL[selected.format] || selected.format}
                  </span>
                )}
                <span className="text-[10px] font-bold uppercase border border-surface-300 px-2 py-1 text-surface-600">
                  {selected.label || `Slide ${selected.visualIndex + 1}`}
                </span>
                {selected.videoStatus === 'ready' && (
                  <span className="text-[10px] font-bold uppercase bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-800 px-2 py-1">
                    Vídeo
                  </span>
                )}
                {selected.projectDeleted && (
                  <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-800 px-2 py-1">
                    Papelera
                  </span>
                )}
              </div>

              <dl className="mt-5 space-y-2 text-xs font-medium text-surface-600">
                <div className="flex justify-between gap-4">
                  <dt className="uppercase tracking-wider text-[10px] font-bold text-surface-400">Publicación</dt>
                  <dd className="font-mono tabular-nums">{selected.scheduledDate.slice(0, 10)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="uppercase tracking-wider text-[10px] font-bold text-surface-400">Generada</dt>
                  <dd className="font-mono tabular-nums">{formatWhen(selected.createdAt)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Prompt</p>
                  <button
                    type="button"
                    onClick={() => void copyPrompt(selected.visualPrompt)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-700 hover:underline"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-surface-50 border-2 border-surface-200 p-3 max-h-64 overflow-y-auto font-sans text-surface-800">
                  {selected.visualPrompt || 'Sin prompt'}
                </pre>
              </div>

              {selected.imageError && (
                <p className="mt-4 text-xs font-medium text-red-700 border-2 border-red-300 bg-red-50 p-3">
                  {selected.imageError}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href={`${projectDashboardBasePath(selected.projectId, true)}/calendar`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider bg-red-600 text-white border-2 border-red-600 hover:bg-red-700"
                >
                  Abrir calendario
                  <ExternalLink size={12} />
                </Link>
                {selected.displayUrl && (
                  <a
                    href={selected.displayUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider border-2 border-surface-900 text-surface-900 hover:bg-surface-100"
                  >
                    <Download size={12} />
                    Descargar
                  </a>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
