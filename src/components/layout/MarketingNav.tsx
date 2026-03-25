'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AuthUserMenu } from '@/components/layout/AuthUserMenu';

function useAuthState() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(!!user);
      setReady(true);
    })();
  }, []);

  return { ready, authenticated };
}

const linkClass =
  'text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors uppercase tracking-wider';

const MOBILE_LINK_CLASS =
  'block w-full text-center py-3.5 text-base font-semibold text-surface-800 uppercase tracking-wider border-b border-surface-100 last:border-0 hover:bg-surface-100/80 transition-colors';

const FRONT_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/saber-mas', label: 'Saber más' },
  { href: '/pricing', label: 'Planes' },
  { href: '/contacto', label: 'Contacto' },
] as const;

/** Enlaces informativos solo escritorio (retrocompatible) */
export function MarketingNavLinks() {
  return (
    <div className="hidden sm:flex items-center gap-6">
      {FRONT_LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className={linkClass}>
          {label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Centro del nav marketing: enlaces en sm+, botón menú en móvil + off-canvas (portal al body).
 */
export function MarketingNavCenter() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const overlay =
    mounted && open
      ? createPortal(
          <div className="fixed inset-0 z-[200] flex justify-end sm:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-surface-900/45 backdrop-blur-[2px]"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
            />
            <div
              id="marketing-mobile-drawer"
              className="relative z-[1] flex h-full w-[min(100%,20rem)] flex-col bg-surface-50 shadow-2xl animate-slide-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="marketing-menu-title"
            >
              <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4">
                <span id="marketing-menu-title" className="font-display text-sm font-bold uppercase tracking-wider text-surface-900">
                  Menú
                </span>
                <button
                  type="button"
                  className="rounded-lg p-2 text-surface-600 hover:bg-surface-100 hover:text-surface-900"
                  aria-label="Cerrar menú"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2" onClick={() => setOpen(false)}>
                {FRONT_LINKS.map(({ href, label }) => (
                  <Link key={href} href={href} className={MOBILE_LINK_CLASS}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="hidden sm:flex items-center justify-center gap-6">
        {FRONT_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className={linkClass}>
            {label}
          </Link>
        ))}
      </div>
      <div className="flex justify-center sm:hidden">
        <button
          type="button"
          className="flex items-center justify-center rounded-xl p-2.5 text-surface-700 hover:bg-surface-100 hover:text-surface-900"
          aria-expanded={open}
          aria-controls={open ? 'marketing-mobile-drawer' : undefined}
          aria-label="Abrir menú de navegación"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>
      {overlay}
    </>
  );
}

/** Acciones de la derecha: avatar o login/registro */
export function MarketingNavActions() {
  const { ready, authenticated } = useAuthState();

  if (!ready) {
    return <div className="h-9 w-24 bg-surface-200 rounded animate-pulse" aria-hidden />;
  }

  if (authenticated) {
    return <AuthUserMenu showQuickLinks />;
  }

  return (
    <div className="flex items-center gap-3 sm:gap-6">
      <Link href="/login" className={`hidden sm:block ${linkClass}`}>
        Acceder
      </Link>
      <Link href="/register" className="btn-primary text-xs py-2.5 px-4 sm:px-5 whitespace-nowrap">
        Empezar gratis →
      </Link>
    </div>
  );
}

/** Wrapper retrocompatible (no usar en layouts nuevos) */
export function MarketingNav() {
  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <MarketingNavLinks />
      <MarketingNavActions />
    </div>
  );
}
