'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn, ESKALA_MARKETING_DIGITAL } from '@/lib/utils';
import type { UserRole } from '@/types';
import { isAdminRole, normalizeUserRole, postLoginPathForRole } from '@/lib/auth/roles';
import { AuthUserMenu } from '@/components/layout/AuthUserMenu';

const navItemsBase = [
  { label: 'Dashboard', href: '/dashboard', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
  )},
  { label: 'Proyectos', href: '/projects', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  )},
];

const configIAItem = { label: 'Config IA', href: '/settings/ai', icon: (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m18.07-5.07l-4.24 4.24M9.17 14.83l-4.24 4.24m0-14.14l4.24 4.24m5.66 5.66l4.24 4.24"/></svg>
)};

/** Solo visible si role = 'admin'. Rutas bajo /administrator. */
const administratorNavItems = [
  {
    label: 'Panel admin',
    href: '/administrator/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    ),
  },
  {
    label: 'Proyectos (todos)',
    href: '/administrator/projects',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    ),
  },
  {
    label: 'Usuarios',
    href: '/administrator/users',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [account, setAccount] = useState<{ email: string; name: string | null } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => { close(); }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error && process.env.NODE_ENV === 'development') {
        console.warn('[Sidebar profile]', error.message);
      }
      setAccount({ email: user.email ?? '', name: data?.full_name ?? null });
      const nr = normalizeUserRole(data?.role);
      if (nr) setUserRole(nr);
    })();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const mainNavEntries = useMemo(() => {
    if (userRole === 'admin') {
      return [
        { ...navItemsBase[0], label: 'Panel admin', href: '/administrator/dashboard' },
        navItemsBase[1],
        configIAItem,
      ];
    }
    return [...navItemsBase];
  }, [userRole]);

  const adminSecondaryNav = useMemo(
    () => administratorNavItems.filter((i) => i.href !== '/administrator/dashboard'),
    []
  );

  const homeHref = userRole === 'admin' ? '/administrator/dashboard' : '/dashboard';

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b-2 border-surface-900 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center" onClick={close}>
          <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-8 w-auto" />
        </Link>
        <button onClick={close} className="lg:hidden p-1.5 -mr-1.5 text-surface-400 hover:text-surface-900 transition-colors" aria-label="Cerrar menú">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 mb-3 text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em]">Navegacion</p>
        {mainNavEntries.map((item) => {
          const isActive =
            item.href === '/administrator/dashboard'
              ? pathname === '/administrator/dashboard' || pathname === '/administrator'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              onClick={close}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-sm font-bold transition-all duration-150 border-2',
                isActive
                  ? 'bg-surface-900 text-white border-surface-900'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 border-transparent hover:border-surface-900'
              )}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {userRole === 'admin' && (
          <>
            <div className="my-3 border-t border-surface-200" />
            <p className="px-3 mb-3 text-[10px] font-bold text-red-600 uppercase tracking-[0.2em]">Administración</p>
            {adminSecondaryNav.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm font-bold transition-all duration-150 border-2',
                    isActive
                      ? 'bg-red-600 text-white border-red-600'
                      : 'text-red-500 hover:bg-red-50 hover:text-red-700 border-transparent hover:border-red-600'
                  )}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {account && (
        <div className="px-3 py-3 border-t border-surface-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-surface-900 bg-surface-900 text-white text-sm font-display font-bold flex items-center justify-center flex-shrink-0">
            {(account.name?.trim()?.[0] || account.email[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-surface-900 truncate">{account.name || 'Tu cuenta'}</p>
            <p className="text-[10px] text-surface-500 truncate">{account.email}</p>
          </div>
        </div>
      )}

      <div className="px-3 py-3 border-t border-surface-200">
        <a
          href={ESKALA_MARKETING_DIGITAL.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-bold text-surface-500 hover:text-brand-600 uppercase tracking-wider transition-colors block"
        >
          {ESKALA_MARKETING_DIGITAL.name}
        </a>
        <p className="text-[9px] text-surface-400 mt-1 leading-snug">{ESKALA_MARKETING_DIGITAL.tagline}</p>
      </div>

      <div className="px-3 py-4 border-t-2 border-surface-900">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-surface-400 hover:bg-surface-100 hover:text-surface-900 transition-all w-full border-2 border-transparent hover:border-surface-900"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b-2 border-surface-900 z-40 flex items-center px-4 gap-3">
        <button onClick={() => setOpen(true)} className="p-1.5 -ml-1.5 text-surface-600 hover:text-surface-900 transition-colors" aria-label="Abrir menú">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <Link href={homeHref} className="flex items-center min-w-0">
          <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-7 w-auto" />
        </Link>
        {account ? (
          <div className="ml-auto flex-shrink-0">
            <AuthUserMenu
              initialEmail={account.email}
              initialName={account.name}
              initialPanelHref={postLoginPathForRole(isAdminRole(userRole))}
              showQuickLinks={false}
            />
          </div>
        ) : (
          <div className="ml-auto w-10 h-10 rounded-full bg-surface-200 border-2 border-surface-300 animate-pulse" aria-hidden />
        )}
      </div>

      {/* Mobile overlay + drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white flex flex-col animate-in shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 bg-white border-r-2 border-surface-900 flex-col z-40">
        {sidebarContent}
      </aside>
    </>
  );
}
