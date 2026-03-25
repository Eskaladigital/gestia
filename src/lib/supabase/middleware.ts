import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminRole, isTrialExpired, postLoginPathForRole } from '@/lib/auth/roles';

export async function updateSession(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const publicPaths = ['/', '/login', '/register', '/callback', '/pricing', '/saber-mas', '/contacto', '/trial-expired'];
  const isPublicPath = publicPaths.some(
    p => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/')
  );

  if (!user && !isPublicPath) {
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
