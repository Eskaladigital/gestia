import { NextRequest, NextResponse } from 'next/server';
import { canActOnOwnedProject, isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { parseVisualImageEditJson } from '@/lib/visual-image-edit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'visual-assets';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function ensureBucket(supabase: ReturnType<typeof createServiceSupabase>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error && !String(error.message || '').includes('already exists')) {
    console.error('[save-visual-image-edit] createBucket:', error.message);
  }
}

/**
 * POST /api/save-visual-image-edit
 *
 * multipart/form-data:
 * - visual_id (required)
 * - clear=true → borra edición guardada
 * - image_edit_json (JSON string, required unless clear)
 * - image (PNG file, required unless clear)
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 });
  }

  const visualId = String(form.get('visual_id') || '').trim();
  if (!visualId) {
    return NextResponse.json({ error: 'visual_id es obligatorio' }, { status: 400 });
  }

  const clear = form.get('clear') === 'true';

  const service = createServiceSupabase();

  const { data: visual, error: vErr } = await service
    .from('content_item_visuals')
    .select(
      'id, content_item_id, visual_index, image_url, content_items!inner(project_id, projects!inner(user_id))',
    )
    .eq('id', visualId)
    .maybeSingle();

  if (vErr || !visual) {
    return NextResponse.json({ error: 'Visual no encontrado' }, { status: 404 });
  }

  const ownerId = (visual as { content_items?: { projects?: { user_id?: string } } }).content_items
    ?.projects?.user_id;
  const userIsAdmin = await isAdmin(authSupabase, user.id);
  if (!canActOnOwnedProject(user.id, ownerId, userIsAdmin)) {
    return NextResponse.json({ error: 'No autorizado para este visual' }, { status: 403 });
  }

  if (!(visual as { image_url?: string | null }).image_url) {
    return NextResponse.json({ error: 'No hay imagen base generada' }, { status: 400 });
  }

  const projectId = (visual as { content_items?: { project_id?: string } }).content_items?.project_id;
  const contentItemId = visual.content_item_id;

  if (clear) {
    const { error: updErr } = await service
      .from('content_item_visuals')
      .update({
        edited_image_url: null,
        image_edit_json: null,
        image_edited_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visualId);

    if (updErr) {
      console.error('[save-visual-image-edit] clear:', updErr);
      return NextResponse.json({ error: 'No se pudo quitar la edición' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cleared: true, edited_image_url: null });
  }

  const rawJson = form.get('image_edit_json');
  let parsedRaw: unknown = null;
  if (typeof rawJson === 'string') {
    try {
      parsedRaw = JSON.parse(rawJson);
    } catch {
      return NextResponse.json({ error: 'image_edit_json no es JSON válido' }, { status: 400 });
    }
  }
  const editJson = parseVisualImageEditJson(parsedRaw);
  if (!editJson) {
    return NextResponse.json({ error: 'image_edit_json inválido' }, { status: 400 });
  }

  const file = form.get('image');
  if (!file || !(file instanceof Blob) || file.size < 100) {
    return NextResponse.json({ error: 'Imagen editada obligatoria' }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Imagen demasiado grande (máx. 15 MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await ensureBucket(service);

  const ts = Date.now();
  const storagePath = `${projectId}/${contentItemId}/${visualId}-edited-${ts}.png`;

  const { error: uploadErr } = await service.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Error subiendo imagen: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: pubData } = service.storage.from(BUCKET).getPublicUrl(storagePath);
  const editedUrl = pubData?.publicUrl;
  if (!editedUrl) {
    return NextResponse.json({ error: 'No se pudo obtener URL pública' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: saved, error: saveErr } = await service
    .from('content_item_visuals')
    .update({
      edited_image_url: editedUrl,
      image_edit_json: editJson,
      image_edited_at: now,
      updated_at: now,
    })
    .eq('id', visualId)
    .select('id, edited_image_url, image_edit_json, image_edited_at')
    .maybeSingle();

  if (saveErr || !saved) {
    console.error('[save-visual-image-edit] save:', saveErr);
    return NextResponse.json({ error: 'No se pudo guardar en la base de datos' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    edited_image_url: saved.edited_image_url,
    image_edit_json: saved.image_edit_json,
    image_edited_at: saved.image_edited_at,
  });
}
