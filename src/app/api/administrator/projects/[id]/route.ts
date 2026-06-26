import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/roles';
import { isDeletedAtColumnError } from '@/lib/supabase/project-queries';

/** Restaurar o archivar proyecto (solo administradores). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    await requireAdmin(supabase, user.id);

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== 'restore' && body.action !== 'trash') {
      return NextResponse.json({ error: 'Se espera { "action": "restore" | "trash" }' }, { status: 400 });
    }

    const service = createServiceSupabase();
    const { data: row, error: fetchErr } = await service
      .from('projects')
      .select('id, deleted_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr && isDeletedAtColumnError(fetchErr)) {
      if (body.action === 'restore') {
        return NextResponse.json(
          { error: 'No hay columna deleted_at; no hay papelera que restaurar.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: 'No hay columna deleted_at; no se puede archivar en papelera.' },
        { status: 503 }
      );
    }
    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    if (body.action === 'restore') {
      if (row.deleted_at == null) {
        return NextResponse.json({ error: 'El proyecto ya está activo' }, { status: 400 });
      }
      const { error: upErr } = await service.from('projects').update({ deleted_at: null }).eq('id', id);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (row.deleted_at != null) {
      return NextResponse.json({ error: 'El proyecto ya está en la papelera' }, { status: 400 });
    }

    const { error: trashErr } = await service
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (trashErr) {
      return NextResponse.json({ error: trashErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Borrado definitivo de cualquier proyecto (solo administradores). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    await requireAdmin(supabase, user.id);

    const service = createServiceSupabase();
    const { data: row, error: fetchErr } = await service
      .from('projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr && !isDeletedAtColumnError(fetchErr)) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const { error } = await service.from('projects').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
