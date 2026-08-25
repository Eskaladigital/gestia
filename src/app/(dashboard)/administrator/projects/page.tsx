import { createServiceSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import { projectDashboardBasePath } from '@/lib/utils';
import { AdministratorTrashedProjectActions } from '@/components/administrator/AdministratorTrashedProjectActions';

type ProjectRow = {
  id: string;
  name: string;
  url: string | null;
  sector: string | null;
  status: string;
  user_id: string;
  updated_at: string;
  deleted_at: string | null;
};

type EnrichedProjectRow = ProjectRow & {
  email: string;
  ownerName: string;
  company: string | null;
  posts: number;
  strategies: number;
};

const actionLinkClass =
  'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 border-2 border-surface-900 bg-white text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap';

function AdminProjectsTable({
  rows,
  variant,
}: {
  rows: EnrichedProjectRow[];
  variant: 'active' | 'trashed';
}) {
  if (rows.length === 0) return null;

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal-sm overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b-2 border-surface-900 bg-surface-100">
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider">Proyecto</th>
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider">Propietario</th>
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider hidden xl:table-cell">Sector</th>
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider">Posts</th>
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider">Estado</th>
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider hidden lg:table-cell">Actualizado</th>
            <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className={`border-b border-surface-200 last:border-b-0 hover:bg-surface-50 ${p.deleted_at ? 'opacity-80 bg-surface-50/80' : ''}`}
            >
              <td className="px-5 py-3.5 align-middle">
                <span className="font-display font-bold text-surface-900 block">{p.name}</span>
                <span className="text-xs text-surface-500 line-clamp-1">{p.url || 'Sin URL'}</span>
                {p.deleted_at && (
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase bg-amber-100 text-amber-900 px-1.5 py-0.5 border border-amber-800">
                    Papelera
                  </span>
                )}
              </td>
              <td className="px-5 py-3.5 align-middle text-surface-700">
                <span className="font-medium block">{p.ownerName}</span>
                <span className="block text-xs text-surface-500 font-mono">{p.email}</span>
                {p.company ? <span className="block text-xs text-surface-400">{p.company}</span> : null}
              </td>
              <td className="px-5 py-3.5 align-middle text-xs text-surface-600 hidden xl:table-cell">
                {p.sector || '—'}
              </td>
              <td className="px-5 py-3.5 align-middle">
                <span className="font-mono text-xs font-bold text-surface-700 tabular-nums">{p.posts}</span>
                <span className="block text-[10px] text-surface-400">{p.strategies} estrat.</span>
              </td>
              <td className="px-5 py-3.5 align-middle">
                <span className="text-[10px] font-mono font-bold uppercase border border-surface-900 px-2 py-1">
                  {p.status}
                </span>
              </td>
              <td className="px-5 py-3.5 align-middle text-xs text-surface-500 hidden lg:table-cell whitespace-nowrap">
                {new Date(p.updated_at).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
              <td className="px-5 py-3.5 align-middle">
                <div className="flex items-center gap-1.5">
                  {variant === 'active' && !p.deleted_at ? (
                    <>
                      <Link href={projectDashboardBasePath(p.id, true)} className={actionLinkClass}>
                        Abrir
                      </Link>
                      <Link href={`${projectDashboardBasePath(p.id, true)}/calendar`} className={actionLinkClass}>
                        Calendario
                      </Link>
                    </>
                  ) : null}
                  <AdministratorTrashedProjectActions
                    projectId={p.id}
                    projectName={p.name}
                    variant={variant}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdministratorProjectsPage() {
  const service = createServiceSupabase();

  const [{ data: projects }, { data: { users: authUsers } }, { data: profiles }, { data: contentItems }, { data: strategies }] =
    await Promise.all([
      service.from('projects').select('id, name, url, sector, status, user_id, updated_at, deleted_at').order('updated_at', { ascending: false }),
      service.auth.admin.listUsers({ perPage: 1000 }),
      service.from('profiles').select('id, full_name, company_name'),
      service.from('content_items').select('id, project_id'),
      service.from('strategies').select('id, project_id'),
    ]);

  const emailById: Record<string, string> = {};
  for (const u of authUsers ?? []) {
    emailById[u.id] = u.email ?? '';
  }

  const profileById: Record<string, { full_name: string | null; company_name: string | null }> = {};
  for (const p of profiles ?? []) {
    profileById[p.id] = { full_name: p.full_name, company_name: p.company_name };
  }

  const contentCountByProject: Record<string, number> = {};
  for (const c of contentItems ?? []) {
    contentCountByProject[c.project_id] = (contentCountByProject[c.project_id] ?? 0) + 1;
  }

  const strategyCountByProject: Record<string, number> = {};
  for (const s of strategies ?? []) {
    strategyCountByProject[s.project_id] = (strategyCountByProject[s.project_id] ?? 0) + 1;
  }

  const nameById: Record<string, string> = {};
  for (const u of authUsers ?? []) {
    nameById[u.id] = u.user_metadata?.full_name || '';
  }

  const rows: EnrichedProjectRow[] = ((projects ?? []) as ProjectRow[]).map((p) => {
    const email = emailById[p.user_id] || '—';
    const profileName = profileById[p.user_id]?.full_name;
    const metaName = nameById[p.user_id];
    return {
      ...p,
      email,
      ownerName: profileName || metaName || 'Sin nombre',
      company: profileById[p.user_id]?.company_name || null,
      posts: contentCountByProject[p.id] ?? 0,
      strategies: strategyCountByProject[p.id] ?? 0,
    };
  });

  const activeRows = rows.filter((r) => !r.deleted_at);
  const trashedRows = rows.filter((r) => r.deleted_at);
  const activeCount = activeRows.length;
  const deletedCount = trashedRows.length;

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">
          Proyectos
        </h1>
        <p className="text-surface-500 mt-2 text-sm font-medium">
          {rows.length} proyectos en total · {activeCount} activos · {deletedCount} en papelera
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-surface-900 p-12 text-center">
          <p className="text-sm text-surface-500 font-medium">No hay proyectos</p>
        </div>
      ) : (
        <>
          <section className="mb-2">
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">Activos</h2>
            <p className="text-xs text-surface-500 font-medium mb-4">
              Proyectos en uso. Puedes abrir la ficha o el calendario, moverlos a la papelera o eliminarlos del todo.
            </p>
            {activeRows.length > 0 ? (
              <AdminProjectsTable rows={activeRows} variant="active" />
            ) : (
              <p className="text-sm text-surface-500 font-medium py-6 border-2 border-dashed border-surface-300 px-4">
                Ahora mismo no hay proyectos activos (solo entradas en la papelera más abajo).
              </p>
            )}
          </section>

          {trashedRows.length > 0 ? (
            <section className={activeRows.length > 0 ? 'mt-12 pt-10 border-t-2 border-surface-900' : ''}>
              <div className="flex items-start gap-3 mb-4">
                <span className="text-xl leading-none" aria-hidden>🗑️</span>
                <div>
                  <h2 className="font-display text-lg font-bold text-surface-900">Papelera</h2>
                  <p className="text-xs text-surface-500 font-medium mt-1">
                    Archivados por el cliente desde su panel. Puedes <strong className="text-surface-700">restaurarlos</strong> (vuelven a activos y se puede abrir ficha) o{' '}
                    <strong className="text-surface-700">eliminarlos del todo</strong> como haría el propietario.
                  </p>
                </div>
              </div>
              <AdminProjectsTable rows={trashedRows} variant="trashed" />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
