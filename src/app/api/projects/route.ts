import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchUserProjectsList } from '@/lib/supabase/project-queries';
import { getUserLimits } from '@/lib/auth/roles';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { active } = await fetchUserProjectsList(supabase, user.id);
    return NextResponse.json({ projects: active });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const limits = await getUserLimits(supabase, user.id);
    if (!limits.canCreateProject) {
      return NextResponse.json(
        {
          error: 'Has alcanzado el límite de proyectos de tu plan.',
          maxProjects: limits.maxProjects,
          currentProjects: limits.currentProjects,
          planName: limits.planName,
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: body.name || 'Nuevo Proyecto',
        url: body.url || null,
        sector: body.sector || null,
        location: body.location || null,
        description: body.description || null,
        status: 'onboarding',
        onboarding_step: 1,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ project: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Actualizar proyecto (usado en onboarding)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
