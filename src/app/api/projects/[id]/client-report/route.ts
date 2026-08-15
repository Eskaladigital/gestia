import { NextResponse } from 'next/server';
import { fetchAccessibleProject } from '@/lib/auth/roles';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { project, error: pErr } = await fetchAccessibleProject(supabase, user.id, id);

    if (pErr || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const { data: strategy } = await supabase
      .from('strategies')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: contentItems } = await supabase
      .from('content_items')
      .select('*')
      .eq('project_id', id)
      .order('scheduled_date', { ascending: true });

    const { data: competitors } = await supabase
      .from('competitors')
      .select('*')
      .eq('project_id', id);

    return NextResponse.json({
      project,
      strategy,
      contentItems: contentItems ?? [],
      competitors: competitors ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
