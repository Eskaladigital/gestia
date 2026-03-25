'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isAdminRole, POST_LOGIN_PATH_USER, postLoginPathForRole } from '@/lib/auth/roles';

type AuthUserMenuProps = {
  /** Si vienen del servidor, evita parpadeo al cargar */
  initialEmail?: string;
  initialName?: string | null;
  /** Destino del enlace «Panel» (servidor conoce el rol) */
  initialPanelHref?: string;
  /** Enlaces rápidos dentro del desplegable (p. ej. en dashboard) */
  showQuickLinks?: boolean;
};

export function AuthUserMenu({
  initialEmail = '',
  initialName = null,
  initialPanelHref,
  showQuickLinks = true,
}: AuthUserMenuProps) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState<string | null>(initialName);
  const [panelHref, setPanelHref] = useState(initialPanelHref ?? POST_LOGIN_PATH_USER);
  const [admin, setAdmin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmail(initialEmail);
    setName(initialName);
    if (initialPanelHref) setPanelHref(initialPanelHref);
  }, [initialEmail, initialName, initialPanelHref]);

  const syncFromSession = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEmail('');
      setName(null);
      return;
    }
    setEmail(user.email ?? '');
    const { data: p } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .maybeSingle();
    setName(p?.full_name ?? null);
    const adm = isAdminRole(p?.role);
    setAdmin(adm);
    setPanelHref(postLoginPathForRole(adm));
  }, [supabase]);

  useEffect(() => {
    if (!initialEmail) {
      syncFromSession();
    }
  }, [initialEmail, syncFromSession]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      syncFromSession();
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, syncFromSession]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        requestAnimationFrame(() => setOpen(false));
      }
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  if (!email) return null;

  const initial = (name?.trim()?.[0] || email[0] || '?').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menú de cuenta de usuario"
        className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-surface-900 bg-surface-900 text-white text-sm font-display font-bold hover:bg-surface-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-2 w-56 border-2 border-surface-900 bg-white shadow-brutal z-[200] py-2 text-left pointer-events-auto"
        >
          <div className="px-3 pb-2 border-b border-surface-200">
            <p className="text-xs font-bold text-surface-900 truncate">{name || 'Tu cuenta'}</p>
            <p className="text-[10px] text-surface-500 truncate mt-0.5">{email}</p>
          </div>
          {showQuickLinks && (
            <div className="py-1 border-b border-surface-200">
              <Link
                href={panelHref}
                role="menuitem"
                className="block px-3 py-2 text-xs font-bold text-surface-700 hover:bg-surface-100 uppercase tracking-wider"
                onClick={() => setOpen(false)}
              >
                Panel
              </Link>
              <Link
                href="/projects"
                role="menuitem"
                className="block px-3 py-2 text-xs font-bold text-surface-700 hover:bg-surface-100 uppercase tracking-wider"
                onClick={() => setOpen(false)}
              >
                Proyectos
              </Link>
              {admin && (
                <Link
                  href="/settings/ai"
                  role="menuitem"
                  className="block px-3 py-2 text-xs font-bold text-surface-700 hover:bg-surface-100 uppercase tracking-wider"
                  onClick={() => setOpen(false)}
                >
                  Config IA
                </Link>
              )}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2.5 text-xs font-bold text-red-700 uppercase tracking-wider hover:bg-red-50"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
