import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdminRole, postLoginPathForRole, POST_LOGIN_PATH_USER } from '@/lib/auth/roles';

function safeInternalPath(path: string | null, fallback: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNext = safeInternalPath(searchParams.get('next'), POST_LOGIN_PATH_USER);

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      let redirectPath = requestedNext;
      if (user && requestedNext === POST_LOGIN_PATH_USER) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        redirectPath = postLoginPathForRole(isAdminRole(profile?.role));
      }
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
