import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdministratorDashboardPage() {
  const supabase = await createServerSupabase();
  const service = createServiceSupabase();

  const [
    { count: projectCount },
    { count: userCount },
    { data: plans },
    { data: recentProjects },
    { count: contentCount },
    { data: subs },
    { data: providerKeys },
  ] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('subscription_plans').select('id').eq('is_active', true),
    supabase
      .from('projects')
      .select('id, name, url, status, user_id, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase.from('content_items').select('id', { count: 'exact', head: true }),
    supabase.from('user_subscriptions').select('id, status'),
    supabase.from('provider_api_keys').select('provider, is_valid'),
  ]);

  const { data: { users: authUsers } } = await service.auth.admin.listUsers({ perPage: 1000 });

  const emailById: Record<string, string> = {};
  for (const u of authUsers ?? []) {
    emailById[u.id] = u.email ?? '';
  }

  const { data: profiles } = await supabase.from('profiles').select('id, role, is_freemium');
  const adminCount = (profiles ?? []).filter(p => p.role === 'admin').length;
  const freemiumCount = (profiles ?? []).filter(p => p.is_freemium).length;
  const activeSubCount = (subs ?? []).filter((s: any) => s.status === 'active').length;

  const connectedProviders = (providerKeys ?? []).filter((k: any) => k.is_valid).length;

  const stats = [
    { label: 'Proyectos activos', value: projectCount ?? 0, href: '/administrator/projects', tag: 'Projects' },
    { label: 'Usuarios', value: userCount ?? 0, href: '/administrator/users', tag: 'Users' },
    { label: 'Posts generados', value: contentCount ?? 0, href: '/administrator/content', tag: 'Content' },
    { label: 'Planes activos', value: plans?.length ?? 0, href: '/administrator/users', tag: 'Plans' },
    { label: 'Suscripciones', value: activeSubCount, href: '/administrator/users', tag: 'Subs' },
    { label: 'Proveedores IA', value: connectedProviders, href: '/settings/ai', tag: 'AI' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-10">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">
          Panel de administracion
        </h1>
        <p className="text-surface-500 mt-2 text-sm font-medium">
          Resumen de la plataforma Gestia RRSS
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white border-2 border-surface-900 shadow-brutal p-4 hover:shadow-brutal-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 block"
          >
            <span className="text-[9px] font-mono font-bold bg-red-600 text-white px-2 py-0.5 uppercase tracking-widest">
              {s.tag}
            </span>
            <p className="font-display text-3xl font-bold text-surface-900 mt-2 tabular-nums">{s.value}</p>
            <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">{s.label}</span>
          </Link>
        ))}
      </div>

      {/* Role / freemium breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-white border-2 border-surface-900 shadow-brutal-sm p-5">
          <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Roles</p>
          <div className="space-y-1 text-sm font-medium">
            <div className="flex justify-between"><span>Admins</span><span className="font-bold tabular-nums">{adminCount}</span></div>
            <div className="flex justify-between"><span>Usuarios normales</span><span className="font-bold tabular-nums">{(userCount ?? 0) - adminCount}</span></div>
          </div>
        </div>
        <div className="bg-white border-2 border-surface-900 shadow-brutal-sm p-5">
          <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Freemium</p>
          <p className="font-display text-3xl font-bold text-surface-900 tabular-nums">{freemiumCount}</p>
          <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">usuarios con acceso gratuito</span>
        </div>
        <div className="bg-white border-2 border-surface-900 shadow-brutal-sm p-5">
          <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Proveedores IA conectados</p>
          <div className="space-y-1 text-sm font-medium">
            {(providerKeys ?? []).map((k: any) => (
              <div key={k.provider} className="flex items-center justify-between">
                <span className="capitalize">{k.provider}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${k.is_valid ? 'bg-emerald-100 text-emerald-800 border-emerald-700' : 'bg-red-100 text-red-800 border-red-700'}`}>
                  {k.is_valid ? 'OK' : 'Error'}
                </span>
              </div>
            ))}
            {(providerKeys ?? []).length === 0 && (
              <p className="text-xs text-surface-400">Ninguno configurado</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent projects */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-surface-900">Proyectos recientes</h2>
          <Link href="/administrator/projects" className="text-xs font-bold text-red-700 uppercase tracking-wider hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="bg-white border-2 border-surface-900 shadow-brutal-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-surface-900 bg-surface-100">
                <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Proyecto</th>
                <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider hidden sm:table-cell">Propietario</th>
                <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-wider hidden md:table-cell">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {(recentProjects ?? []).map((p: any) => (
                <tr key={p.id} className="border-b border-surface-200 hover:bg-surface-50">
                  <td className="px-4 py-3">
                    <Link href={`/administrator/projects`} className="font-display font-bold text-surface-900 hover:text-red-700">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-surface-500 truncate max-w-[200px]">{p.url || 'Sin URL'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-600 hidden sm:table-cell font-mono">
                    {emailById[p.user_id] || p.user_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-mono font-bold uppercase border border-surface-900 px-2 py-1">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-500 hidden md:table-cell">
                    {new Date(p.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              ))}
              {(recentProjects ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-surface-500">No hay proyectos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white border-2 border-surface-900 shadow-brutal-sm p-6">
        <h2 className="font-display font-bold text-lg text-surface-900 mb-3">Accesos rapidos</h2>
        <ul className="space-y-2 text-sm font-medium text-surface-600">
          <li>
            <Link href="/administrator/projects" className="text-red-700 font-bold hover:underline">
              Ver todos los proyectos
            </Link>
            {' — '}propietario, estado y enlace a la ficha
          </li>
          <li>
            <Link href="/administrator/content" className="text-red-700 font-bold hover:underline">
              Muro de contenido
            </Link>
            {' — '}todas las fotos IA generadas en los proyectos
          </li>
          <li>
            <Link href="/administrator/users" className="text-red-700 font-bold hover:underline">
              Gestion de usuarios
            </Link>
            {' — '}roles, freemium y planes
          </li>
          <li>
            <Link href="/settings/ai" className="text-red-700 font-bold hover:underline">
              Configuracion IA
            </Link>
            {' — '}proveedores y agentes del pipeline
          </li>
        </ul>
      </div>
    </div>
  );
}
