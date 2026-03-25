import { createServerSupabase } from '@/lib/supabase/server';
import { fetchProjectForDashboard } from '@/lib/supabase/project-queries';
import { isAdmin } from '@/lib/auth/roles';
import { projectDashboardBasePath } from '@/lib/utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StrategyView } from '@/components/strategy/StrategyView';

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const userIsAdmin = await isAdmin(supabase, user.id);
  const { data: project } = await fetchProjectForDashboard(supabase, user.id, id, userIsAdmin, 'name');

  if (!project) redirect(userIsAdmin ? '/administrator/projects' : '/projects');

  const projectBase = projectDashboardBasePath(id, userIsAdmin);

  const { data: strategy } = await supabase
    .from('strategies')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-2">
          <Link href={projectBase} className="hover:text-surface-900 transition-colors">{project.name}</Link>
          <span>/</span>
          <span>Estrategia</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-surface-900 tracking-tight">Estrategia de contenido</h1>
      </div>

      {strategy ? (
        <StrategyView strategy={strategy} projectId={id} />
      ) : (
        <div className="bg-white rounded-xl border-2 border-dashed border-surface-300 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 opacity-40">
            <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-10 w-auto" />
          </div>
          <h3 className="font-display font-bold text-surface-900 mb-1">Sin estrategia generada</h3>
          <p className="text-sm text-surface-500">Genera la estrategia desde la página del proyecto</p>
          <Link href={projectBase} className="inline-flex mt-4 text-xs font-bold text-surface-900 uppercase tracking-wider hover:underline">
            ← Volver al proyecto
          </Link>
        </div>
      )}
    </div>
  );
}
