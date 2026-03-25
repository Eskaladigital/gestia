import { createServerSupabase } from '@/lib/supabase/server';
import { fetchUserProjectsList, fetchPipelineAggregatesForProjects } from '@/lib/supabase/project-queries';
import { getListBadgeStatusFromAggregates, projectListBadgePresentation } from '@/lib/projects/pipeline';
import { getUserProfile, getUserLimits, isAdminRole, postLoginPathForRole } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthUserMenu } from '@/components/layout/AuthUserMenu';

type DashboardPageProps = {
  searchParams: Promise<{ admin_denied?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const sp = await searchParams;
  const adminDenied = sp.admin_denied === '1';
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await getUserProfile(supabase, user.id);
  const [{ active }, limits] = await Promise.all([
    fetchUserProjectsList(supabase, user.id),
    getUserLimits(supabase, user.id, { profile }),
  ]);
  const projects = active.slice(0, 5);
  const dashAgg = await fetchPipelineAggregatesForProjects(
    supabase,
    active.map(p => p.id)
  );

  const totalPostsGenerated = Object.values(dashAgg.contentCountByProject).reduce((sum, count) => sum + count, 0);

  const planDisplay = limits.isAdmin
    ? 'Admin'
    : limits.isFreemium
      ? 'Freemium'
      : limits.trialActive
        ? `${limits.planName || 'Trial'} (prueba)`
        : limits.planName || 'Sin plan';

  const projectsDisplay = limits.maxProjects >= 999
    ? `${active.length} / ∞`
    : `${active.length} / ${limits.maxProjects}`;

  const trialDaysLeft = limits.trialActive && limits.trialExpiresAt
    ? Math.max(0, Math.ceil((new Date(limits.trialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="max-w-6xl mx-auto">
      {trialDaysLeft !== null && (
        <div className="mb-6 p-4 border-2 border-brand-400 bg-brand-50 text-surface-900 text-sm font-medium flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-bold text-brand-900">
              Te {trialDaysLeft === 1 ? 'queda' : 'quedan'} {trialDaysLeft} {trialDaysLeft === 1 ? 'dia' : 'dias'} de prueba gratuita
            </p>
            <p className="text-xs text-brand-700 mt-0.5">
              Disfruta de todas las funcionalidades. Cuando termine el periodo de prueba necesitaras activar tu plan.
            </p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-5 py-2 bg-brand-600 text-white font-bold text-xs uppercase tracking-wider border-2 border-brand-700 hover:bg-brand-700 transition-all shrink-0"
          >
            Ver planes
          </Link>
        </div>
      )}
      {adminDenied && (
        <div
          role="alert"
          className="mb-6 p-4 border-2 border-amber-600 bg-amber-50 text-surface-900 text-sm font-medium"
        >
          <p className="font-bold text-amber-900 mb-1">No tienes acceso al panel de administración</p>
          <p className="text-surface-700 text-xs leading-relaxed">
            La app solo mira <code className="font-mono bg-amber-100 px-1">public.profiles.role</code> (texto{' '}
            <code className="font-mono bg-amber-100 px-1">admin</code>), no el listado de usuarios de Authentication ni metadatos del usuario.
            En Table Editor abre la tabla <code className="font-mono bg-amber-100 px-1">profiles</code> y comprueba la columna{' '}
            <code className="font-mono bg-amber-100 px-1">role</code>. En el SQL Editor puedes forzar admin (sustituye el email):
          </p>
          <pre className="mt-3 p-3 bg-surface-900 text-amber-100 text-[11px] overflow-x-auto font-mono leading-relaxed">
            {`UPDATE public.profiles
SET role = 'admin', is_freemium = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'tu@email.com' LIMIT 1);`}
          </pre>
        </div>
      )}
      {/* Header */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.25em]">Panel</p>
            {isAdminRole(profile?.role) && (
              <span className="text-[9px] font-mono font-bold bg-red-600 text-white px-2 py-0.5 uppercase tracking-widest">Admin</span>
            )}
            {profile?.is_freemium && !isAdminRole(profile?.role) && (
              <span className="text-[9px] font-mono font-bold bg-green-600 text-white px-2 py-0.5 uppercase tracking-widest">Freemium</span>
            )}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">
            Hola, {profile?.full_name || 'usuario'}
          </h1>
          <p className="text-surface-500 mt-2 text-sm font-medium">Gestiona tus estrategias de contenido</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:pt-1">
          <p className="text-[10px] text-surface-400 font-medium uppercase tracking-wider hidden sm:block">Cuenta</p>
          <AuthUserMenu
            initialEmail={user.email ?? ''}
            initialName={profile?.full_name ?? null}
            initialPanelHref={postLoginPathForRole(isAdminRole(profile?.role))}
            showQuickLinks={false}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Proyectos', value: projectsDisplay, tag: 'Projects', icon: '📁' },
          { label: 'Posts generados', value: totalPostsGenerated, tag: 'Posts', icon: '📝' },
          { label: 'Plan actual', value: planDisplay, tag: 'Plan', icon: '⚡' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border-2 border-surface-900 shadow-brutal p-5 hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <span className="text-[9px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest">
                {stat.tag}
              </span>
            </div>
            <p className="font-display text-4xl font-bold text-surface-900 mb-1 tabular-nums">{stat.value}</p>
            <span className="text-xs text-surface-500 font-bold uppercase tracking-wider">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Recent projects header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <h2 className="font-display text-xl font-bold text-surface-900">Proyectos recientes</h2>
        {limits.canCreateProject ? (
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold text-xs uppercase tracking-wider border-2 border-surface-900 shadow-brutal hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 w-full sm:w-auto"
          >
            + Nuevo proyecto
          </Link>
        ) : (
          <div className="text-right">
            <span className="inline-flex items-center gap-2 px-6 py-3 bg-surface-200 text-surface-500 font-bold text-xs uppercase tracking-wider border-2 border-surface-400 cursor-not-allowed w-full sm:w-auto justify-center">
              Límite alcanzado
            </span>
            <p className="text-[10px] text-surface-400 font-medium mt-1">Mejora tu plan para crear más proyectos</p>
          </div>
        )}
      </div>

      {/* Recent projects list */}
      {projects && projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => {
            const badgeKey = getListBadgeStatusFromAggregates(project.id, project.status, dashAgg);
            const badge = projectListBadgePresentation(badgeKey);
            return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group block bg-white border-2 border-surface-900 shadow-brutal-sm p-5 hover:shadow-brutal hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-150"
            >
              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-surface-900 truncate group-hover:text-brand-700 transition-colors">{project.name}</h3>
                  <p className="text-xs text-surface-500 mt-1 font-medium truncate">
                    {project.sector || 'Sin sector'} · {project.url || 'Sin URL'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-1 border-2 border-surface-900 text-[10px] font-bold uppercase tracking-widest font-mono ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="text-[10px] font-bold text-surface-900 uppercase tracking-wider group-hover:text-brand-600 transition-colors hidden sm:block">
                    →
                  </span>
                </div>
              </div>
            </Link>
          );
          })}
        </div>
      ) : (
        <div className="bg-white border-2 border-dashed border-surface-900 p-12 text-center">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-12 w-auto" />
          </div>
          <h3 className="font-display text-xl font-bold text-surface-900 mb-1">Crea tu primer proyecto</h3>
          <p className="text-sm text-surface-500 mb-6">Empieza generando una estrategia de contenido para un cliente</p>
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
