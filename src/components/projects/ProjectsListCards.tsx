'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { projectListBadgePresentation } from '@/lib/projects/pipeline';

export type ProjectListRow = {
  id: string;
  name: string;
  status: string;
  /** Clave derivada del pipeline (p. ej. `ready` aunque `status` en BD sea `draft`). */
  listBadgeStatus: string;
  sector: string | null;
  url: string | null;
  primary_goal: string | null;
  posts_per_week: number | null;
  updated_at: string;
};

const GOAL_CONFIG: Record<string, { icon: string; color: string }> = {
  ventas: { icon: '💰', color: 'bg-amber-400' },
  leads: { icon: '🎯', color: 'bg-brand-500' },
  branding: { icon: '✨', color: 'bg-violet-500' },
  viralidad: { icon: '🚀', color: 'bg-pink-500' },
  comunidad: { icon: '👥', color: 'bg-emerald-500' },
};

function StatusBadge({ badgeKey }: { badgeKey: string }) {
  const { label, className } = projectListBadgePresentation(badgeKey);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 border-2 border-surface-900 text-[10px] font-bold uppercase tracking-widest font-mono shrink-0 ${className}`}>
      {label}
    </span>
  );
}

function CardBody({ project, showBadge = false }: { project: ProjectListRow; showBadge?: boolean }) {
  const goal = project.primary_goal ? GOAL_CONFIG[project.primary_goal] : null;
  const stripColor = goal?.color || 'bg-surface-900';

  return (
    <div className="flex flex-col h-full">
      {/* Top strip */}
      <div className={`${stripColor} h-2 w-full`} />

      <div className="p-5 pt-4 flex flex-col flex-1">
        {/* Header: icon + name */}
        <div className="flex items-start gap-3 mb-3">
          {goal && (
            <span className="text-2xl leading-none mt-0.5 shrink-0">{goal.icon}</span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-bold text-surface-900 leading-tight group-hover:text-brand-700 transition-colors">
              {project.name}
            </h3>
            {project.sector && (
              <p className="text-xs font-bold text-surface-500 uppercase tracking-wider mt-1">{project.sector}</p>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 space-y-2">
          {project.url && (
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-400 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <p className="truncate font-mono text-xs text-surface-500">{project.url}</p>
            </div>
          )}
          {project.primary_goal && (
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-400 shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <p className="text-xs font-medium text-surface-600 capitalize">{project.primary_goal}</p>
            </div>
          )}
          {project.posts_per_week != null && (
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-400 shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <p className="text-xs font-medium text-surface-600">{project.posts_per_week} posts/semana</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t-2 border-surface-200">
          <p className="text-[10px] text-surface-400 font-mono uppercase tracking-wider">
            {new Date(project.updated_at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          {showBadge ? (
            <StatusBadge badgeKey={project.listBadgeStatus} />
          ) : (
            <span className="text-[10px] font-bold text-surface-900 uppercase tracking-wider group-hover:text-brand-600 transition-colors">
              Abrir →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsListCards({
  activeProjects,
  trashedProjects,
}: {
  activeProjects: ProjectListRow[];
  trashedProjects: ProjectListRow[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function patchProject(id: string, body: Record<string, unknown>) {
    const res = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Error al actualizar');
    }
    router.refresh();
  }

  async function moveToTrash(id: string) {
    if (!confirm('¿Mover este proyecto a la papelera? Podrás restaurarlo o borrarlo definitivamente después.')) {
      return;
    }
    setLoadingId(id);
    setError('');
    try {
      await patchProject(id, { deleted_at: new Date().toISOString() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingId(null);
    }
  }

  async function restore(id: string) {
    setLoadingId(id);
    setError('');
    try {
      await patchProject(id, { deleted_at: null });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingId(null);
    }
  }

  async function permanentDelete(id: string) {
    if (!confirm('¿Eliminar definitivamente? Se borrarán estrategia, calendario y datos asociados. No se puede deshacer.')) {
      return;
    }
    setLoadingId(id);
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Error al eliminar');
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border-2 border-surface-900 text-red-700 px-4 py-3 text-xs font-bold">{error}</div>
      )}

      {activeProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white border-2 border-surface-900 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 group overflow-hidden flex flex-col"
            >
              {/* Main clickable area */}
              <Link href={`/projects/${project.id}`} className="flex flex-col flex-1">
                <CardBody project={project} showBadge />
              </Link>

              {/* Action bar: badge context + delete */}
              <div className="flex items-center justify-between px-5 py-2.5 border-t-2 border-surface-200 bg-surface-50">
                <span className="text-[10px] font-bold text-surface-900 uppercase tracking-wider group-hover:text-brand-600 transition-colors">
                  Abrir proyecto →
                </span>
                <button
                  type="button"
                  title="Mover a la papelera"
                  aria-label="Mover a la papelera"
                  disabled={loadingId === project.id}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveToTrash(project.id); }}
                  className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 border-2 border-transparent hover:border-surface-900 transition-all disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {trashedProjects.length > 0 ? (
        <section className={activeProjects.length > 0 ? 'mt-12 pt-10 border-t-2 border-surface-900' : ''}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">🗑️</span>
            <div>
              <h2 className="font-display text-xl font-bold text-surface-900">Papelera</h2>
              <p className="text-xs text-surface-500 font-medium">
                Restaura o elimina definitivamente
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {trashedProjects.map((project) => (
              <div
                key={project.id}
                className="bg-surface-50 border-2 border-dashed border-surface-900 overflow-hidden opacity-70 hover:opacity-100 transition-opacity"
              >
                <CardBody project={project} />
                <div className="flex border-t-2 border-surface-300">
                  <button
                    type="button"
                    disabled={loadingId === project.id}
                    onClick={() => restore(project.id)}
                    className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider text-surface-900 hover:bg-surface-200 transition-colors disabled:opacity-50 border-r border-surface-300"
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === project.id}
                    onClick={() => permanentDelete(project.id)}
                    className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
