'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

/** Enlaces informativos centrados */
export function MarketingNavLinks() {
  return (
    <div className="hidden sm:flex items-center gap-6">
      <Link href="/" className={linkClass}>
        Home
      </Link>
      <Link href="/saber-mas" className={linkClass}>
        Saber más
      </Link>
      <Link href="/pricing" className={linkClass}>
        Planes
      </Link>
      <Link href="/contacto" className={linkClass}>
        Contacto
      </Link>
    </div>
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
    <div className="flex items-center gap-4 sm:gap-6">
      <Link href="/pricing" className={`${linkClass} sm:hidden`}>
        Planes
      </Link>
      <Link href="/login" className={`hidden sm:block ${linkClass}`}>
        Acceder
      </Link>
      <Link href="/register" className="btn-primary text-xs py-2.5 px-5">
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
