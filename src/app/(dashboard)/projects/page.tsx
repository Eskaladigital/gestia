import { createServerSupabase } from '@/lib/supabase/server';
import { fetchUserProjectsList, fetchPipelineAggregatesForProjects } from '@/lib/supabase/project-queries';
import { getListBadgeStatusFromAggregates } from '@/lib/projects/pipeline';
import { getUserLimits } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ProjectsListCards, { type ProjectListRow } from '@/components/projects/ProjectsListCards';
import type { Project } from '@/types';

function toProjectListRow(project: Project, listBadgeStatus: string): ProjectListRow {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    listBadgeStatus,
    sector: project.sector,
    url: project.url,
    primary_goal: project.primary_goal,
    posts_per_week: project.posts_per_week,
    updated_at: project.updated_at,
  };
}

export default async function ProjectsListPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ active, trashed }, limits] = await Promise.all([
    fetchUserProjectsList(supabase, user.id),
    getUserLimits(supabase, user.id),
  ]);
  const allIds = [...active, ...trashed].map(p => p.id);
  const pipelineAgg = await fetchPipelineAggregatesForProjects(supabase, allIds);

  const activeRows = active.map(p =>
    toProjectListRow(p, getListBadgeStatusFromAggregates(p.id, p.status, pipelineAgg))
  );
  const trashedRows = trashed.map(p =>
    toProjectListRow(p, getListBadgeStatusFromAggregates(p.id, p.status, pipelineAgg))
  );

  const maxLabel = limits.maxProjects >= 999 ? '∞' : limits.maxProjects;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
        <div>
          <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.25em] mb-2">Panel</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">Proyectos</h1>
          <p className="text-surface-500 mt-2 text-sm font-medium">
            {active.length} / {maxLabel} proyecto{active.length !== 1 ? 's' : ''}
            {limits.planName && <span className="ml-2 text-[10px] font-bold text-brand-600 uppercase">· {limits.planName}</span>}
          </p>
        </div>
        {limits.canCreateProject ? (
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold text-xs uppercase tracking-wider border-2 border-surface-900 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 shrink-0 w-full sm:w-auto"
          >
            + Nuevo proyecto
          </Link>
        ) : (
          <div className="text-right shrink-0">
            <span className="inline-flex items-center gap-2 px-6 py-3 bg-surface-200 text-surface-500 font-bold text-xs uppercase tracking-wider border-2 border-surface-400 cursor-not-allowed w-full sm:w-auto justify-center">
              Límite alcanzado
            </span>
            <p className="text-[10px] text-surface-400 font-medium mt-1">Mejora tu plan para más proyectos</p>
          </div>
        )}
      </div>

      {active.length > 0 || trashed.length > 0 ? (
        <ProjectsListCards activeProjects={activeRows} trashedProjects={trashedRows} />
      ) : (
        <div className="bg-white border-2 border-dashed border-surface-900 p-12 text-center">
          <div className="w-16 h-16 bg-surface-900 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3 className="font-display text-xl font-bold text-surface-900 mb-1">Sin proyectos</h3>
          <p className="text-sm text-surface-500 mb-6">Crea tu primer proyecto para empezar</p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold text-xs uppercase tracking-wider border-2 border-surface-900 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150"
          >
            + Nuevo proyecto
          </Link>
        </div>
      )}
    </div>
  );
}
