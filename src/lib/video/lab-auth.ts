import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function requireLabAdmin() {
  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!(await isAdmin(auth, user.id))) {
    return { error: NextResponse.json({ error: 'Solo administradores' }, { status: 403 }) };
  }
  return { user, service: createServiceSupabase() };
}
