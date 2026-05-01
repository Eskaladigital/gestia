import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FEEDBACK_LENGTH = 2000;

/**
 * POST /api/report-image-error
 *
 * Body: { visual_id: string, feedback: string }
 *
 * Guarda en `content_item_visuals.user_feedback` un texto del usuario describiendo
 * qué está mal en la imagen generada. Ese texto se inyecta en el prompt al
 * regenerar (`/api/generate-image`) para que la IA corrija específicamente eso.
 *
 * Si `feedback` viene vacío, borra el feedback previo (botón "quitar reporte").
 */
export async function POST(request: NextRequest) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: { visual_id?: string; feedback?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const visualId = typeof body.visual_id === 'string' ? body.visual_id.trim() : '';
  if (!visualId) {
    return NextResponse.json({ error: 'visual_id es obligatorio' }, { status: 400 });
  }

  const rawFeedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  const feedback = rawFeedback.length > 0 ? rawFeedback.slice(0, MAX_FEEDBACK_LENGTH) : null;

  const service = createServiceSupabase();

  const { data: visual, error: vErr } = await service
    .from('content_item_visuals')
    .select('id, content_items!inner(project_id, projects!inner(user_id))')
    .eq('id', visualId)
    .maybeSingle();

  if (vErr || !visual) {
    return NextResponse.json({ error: 'Visual no encontrado' }, { status: 404 });
  }

  const ownerId = (visual as any).content_items?.projects?.user_id;
  if (!ownerId || ownerId !== user.id) {
    return NextResponse.json({ error: 'No autorizado para este visual' }, { status: 403 });
  }

  const { error: updErr } = await service
    .from('content_item_visuals')
    .update({
      user_feedback: feedback,
      user_feedback_at: feedback ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', visualId);

  if (updErr) {
    console.error('[report-image-error] update error:', updErr);
    return NextResponse.json({ error: 'No se pudo guardar el reporte' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleared: feedback === null,
    feedback,
  });
}
