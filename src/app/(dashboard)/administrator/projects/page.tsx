import { createServiceSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import { projectDashboardBasePath } from '@/lib/utils';

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

  const rows = ((projects ?? []) as ProjectRow[]).map((p) => {
    const email = emailById[p.user_id] || '—';
    const profileName = profileById[p.user_id]?.full_name;
    const metaName = nameById[p.user_id];
    return {
      ...p,
      email,
      ownerName: profileName || metaName || email,
      company: profileById[p.user_id]?.company_name || null,
      posts: contentCountByProject[p.id] ?? 0,
      strategies: strategyCountByProject[p.id] ?? 0,
    };
  });

  const activeCount = rows.filter(r => !r.deleted_at).length;
  const deletedCount = rows.filter(r => r.deleted_at).length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">
          Proyectos
        </h1>
        <p className="text-surface-500 mt-2 text-sm font-medium">
          {rows.length} proyectos en total · {activeCount} activos · {deletedCount} en papelera
        </p>
      </div>

      <div className="bg-white border-2 border-surface-900 shadow-brutal-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-surface-900 bg-surface-100">
              <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Proyecto</th>
              <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Propietario</th>
              <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider hidden md:table-cell">Email</th>
              <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider hidden lg:table-cell">Posts</th>
              <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Estado</th>
              <th className="text-right px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Ficha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-surface-200 hover:bg-surface-50">
                <td className="px-4 py-3 align-top">
                  <span className="font-display font-bold text-surface-900 block">{p.name}</span>
                  <span className="text-xs text-surface-500 line-clamp-1">{p.url || 'Sin URL'}</span>
                  {p.deleted_at && (
                    <span className="inline-block mt-1 text-[9px] font-bold uppercase bg-amber-100 text-amber-900 px-1.5 py-0.5 border border-amber-800">
                      Papelera
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-surface-700">
                  <span className="font-medium">{p.ownerName}</span>
                  {p.company && <span className="block text-xs text-surface-500">{p.company}</span>}
                </td>
                <td className="px-4 py-3 align-top text-surface-600 hidden md:table-cell font-mono text-xs">
                  {p.email}
                </td>
                <td className="px-4 py-3 align-top hidden lg:table-cell">
                  <span className="font-mono text-xs font-bold text-surface-700 tabular-nums">{p.posts}</span>
                  <span className="text-[10px] text-surface-400 ml-1">/ {p.strategies} estrat.</span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="text-[10px] font-mono font-bold uppercase border border-surface-900 px-2 py-1">
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-right">
                  <Link
                    href={projectDashboardBasePath(p.id, true)}
                    className="text-xs font-bold text-red-700 uppercase tracking-wider hover:underline"
                  >
                    Abrir →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-8 text-center text-sm text-surface-500 font-medium">No hay proyectos</p>
        )}
      </div>
    </div>
  );
}
