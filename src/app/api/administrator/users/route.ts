import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/roles';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    await requireAdmin(supabase, user.id);

    const serviceClient = createServiceSupabase();

    const { data: profiles, error } = await serviceClient
      .from('profiles')
      .select('id, full_name, avatar_url, company_name, plan, role, is_freemium, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });

    const emailMap: Record<string, string> = {};
    for (const au of authUsers ?? []) {
      emailMap[au.id] = au.email ?? '';
    }

    const { data: subs } = await serviceClient
      .from('user_subscriptions')
      .select('user_id, plan_id, status, subscription_plans(name, max_projects)')
      .eq('status', 'active');

    const subMap: Record<string, any> = {};
    for (const s of (subs ?? []) as any[]) {
      subMap[s.user_id] = s;
    }

    const { data: projectCounts } = await serviceClient
      .from('projects')
      .select('user_id')
      .is('deleted_at', null);

    const projectCountMap: Record<string, number> = {};
    for (const p of projectCounts ?? []) {
      projectCountMap[p.user_id] = (projectCountMap[p.user_id] ?? 0) + 1;
    }

    const enriched = (profiles ?? []).map((p: any) => ({
      ...p,
      email: emailMap[p.id] ?? '',
      active_subscription: subMap[p.id] ?? null,
      project_count: projectCountMap[p.id] ?? 0,
    }));

    return NextResponse.json({ users: enriched });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    await requireAdmin(supabase, user.id);

    const body = await request.json();
    const { userId, action, value } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId y action son obligatorios' }, { status: 400 });
    }

    const serviceClient = createServiceSupabase();

    switch (action) {
      case 'set_role': {
        const validRoles = ['admin', 'agency', 'user'];
        if (!validRoles.includes(value)) {
          return NextResponse.json({ error: 'Rol no válido' }, { status: 400 });
        }
        const { error } = await serviceClient
          .from('profiles')
          .update({ role: value })
          .eq('id', userId);
        if (error) throw error;
        break;
      }

      case 'set_freemium': {
        const { error } = await serviceClient
          .from('profiles')
          .update({ is_freemium: !!value })
          .eq('id', userId);
        if (error) throw error;
        break;
      }

      case 'assign_plan': {
        await serviceClient
          .from('user_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'active');

        if (value) {
          const { error } = await serviceClient
            .from('user_subscriptions')
            .insert({
              user_id: userId,
              plan_id: value,
              status: 'active',
              started_at: new Date().toISOString(),
            });
          if (error) throw error;
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
