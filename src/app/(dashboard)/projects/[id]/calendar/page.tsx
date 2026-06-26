import { createServerSupabase } from '@/lib/supabase/server';
import { fetchProjectForDashboard } from '@/lib/supabase/project-queries';
import { isAdmin } from '@/lib/auth/roles';
import { projectDashboardBasePath } from '@/lib/utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarView } from '@/components/calendar/CalendarView';

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const userIsAdmin = await isAdmin(supabase, user.id);
  let { data: project } = await fetchProjectForDashboard(
    supabase,
    user.id,
    id,
    userIsAdmin,
    'name, image_orientation'
  );

  // Fallback si la migración 022 (image_orientation) aún no está aplicada
  // en este entorno: reintentamos sin esa columna y asumimos default vertical.
  if (!project) {
    const retry = await fetchProjectForDashboard(supabase, user.id, id, userIsAdmin, 'name');
    project = retry.data;
  }

  if (!project) redirect(userIsAdmin ? '/administrator/projects' : '/projects');

  const projectBase = projectDashboardBasePath(id, userIsAdmin);

  const { data: items } = await supabase
    .from('content_items')
    .select('*')
    .eq('project_id', id)
    .order('scheduled_date', { ascending: true });

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-2 flex-wrap">
          <Link href={projectBase} className="hover:text-surface-900 transition-colors truncate max-w-[150px] sm:max-w-none">{project.name}</Link>
          <span>/</span>
          <span>Calendario</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight">Calendario de contenido</h1>
      </div>

      {items && items.length > 0 ? (
        <CalendarView
          items={items}
          projectId={id}
          projectName={project.name}
          imageOrientation={(project as { image_orientation?: string | null }).image_orientation ?? null}
        />
      ) : (
        <div className="bg-white rounded-xl border-2 border-dashed border-surface-300 p-12 text-center">
          <div className="w-14 h-14 bg-surface-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-400"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <h3 className="font-display font-bold text-surface-900 mb-1">Sin contenido generado</h3>
          <p className="text-sm text-surface-500 max-w-md mx-auto">
            En la página del proyecto, completa la <strong>estrategia</strong> y usa <strong>Generar calendario</strong>.
          </p>
          <Link href={projectBase} className="inline-flex mt-4 text-xs font-bold text-surface-900 uppercase tracking-wider hover:underline">
            ← Volver al proyecto
          </Link>
        </div>
      )}
    </div>
  );
}
