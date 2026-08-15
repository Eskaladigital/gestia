import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchAccessibleProject } from '@/lib/auth/roles';

export const maxDuration = 30;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { project_id } = body;

    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { project } = await fetchAccessibleProject(supabase, user.id, project_id);

    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // Delete all content items for this project
    const { error: delErr } = await supabase
      .from('content_items')
      .delete()
      .eq('project_id', project_id);

    if (delErr) {
      console.error('[clear-calendar] Error al borrar:', delErr);
      return NextResponse.json({ error: 'No se pudo vaciar el calendario' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[clear-calendar] Error interno:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
