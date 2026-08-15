import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminRole, isTrialExpired, postLoginPathForRole } from '@/lib/auth/roles';

type SessionResolution = {
  user: { id: string } | null;
  response: NextResponse;
  supabase: SupabaseClient;
};

function getBearerToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) return '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

async function resolveSession(request: NextRequest): Promise<SessionResolution> {
  const bearer = getBearerToken(request);

  // Scripts / automatización: Authorization Bearer (sin cookies SSR).
  // En Edge el getUser() a Supabase puede fallar por TLS corporativo; en /api/*
  // dejamos pasar y valida createServerSupabase (Node) en la ruta.
  if (bearer && request.nextUrl.pathname.startsWith('/api/')) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
    return {
      user: { id: 'bearer-pending-route-auth' },
      response: NextResponse.next({ request: { headers: request.headers } }),
      supabase,
    };
  }

  if (bearer) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return {
      user,
      response: NextResponse.next({ request: { headers: request.headers } }),
      supabase,
    };
  }

  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, response, supabase };
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApiPath = path.startsWith('/api/');

  // Automatización: Bearer en /api/* → la ruta valida el JWT en runtime Node.
  // Evita getUser() en Edge (TLS corporativo) y el redirect HTML a /login.
  if (isApiPath && getBearerToken(request)) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const { user, response, supabase } = await resolveSession(request);

  const publicPaths = ['/', '/login', '/register', '/callback', '/pricing', '/saber-mas', '/contacto', '/trial-expired'];
  const isPublicPath = publicPaths.some(
    p => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/')
  );

  if (!user && !isPublicPath) {
    // APIs: 401 JSON (no redirect HTML) para que scripts fallen con claridad.
    if (isApiPath) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/register'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const url = request.nextUrl.clone();
    url.pathname = postLoginPathForRole(isAdminRole(profile?.role));
    return NextResponse.redirect(url);
  }

  if (user && path === '/dashboard' && request.nextUrl.searchParams.get('app') !== '1') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (isAdminRole(profile?.role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/administrator/dashboard';
      url.searchParams.delete('admin_denied');
      return NextResponse.redirect(url);
    }
  }

  // Usuarios normales solo usan rutas sin /administrator: /dashboard, /projects, /settings/ai, etc.
  // El prefijo /administrator/* está reservado a role = 'admin' (comprobación justo debajo).

  // Legado: /admin y /admin/* → /administrator (sin afectar /administrator)
  if (user && (path === '/admin' || path.startsWith('/admin/'))) {
    const url = request.nextUrl.clone();
    url.pathname =
      path === '/admin' ? '/administrator/dashboard' : `/administrator${path.slice('/admin'.length)}`;
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith('/settings/ai')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || !isAdminRole(profile.role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  if (user && (path === '/administrator' || path.startsWith('/administrator/'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !isAdminRole(profile.role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.searchParams.set('admin_denied', '1');
      return NextResponse.redirect(url);
    }
  }

  const appPaths = ['/dashboard', '/projects', '/settings'];
  const isAppPath = appPaths.some(
    p => path === p || path.startsWith(p + '/')
  );
  if (user && isAppPath) {
    const expired = await isTrialExpired(supabase, user.id);
    if (expired) {
      const url = request.nextUrl.clone();
      url.pathname = '/trial-expired';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
