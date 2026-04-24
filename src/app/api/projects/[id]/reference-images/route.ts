import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import {
  buildProjectReferenceImageStoragePath,
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  ensureProjectReferenceImagesBucket,
  isProjectReferenceImagesTableError,
  listProjectReferenceImages,
  MAX_PROJECT_REFERENCE_IMAGES,
  NORMALIZED_REFERENCE_EXTENSION,
  NORMALIZED_REFERENCE_MIME,
  normalizeReferenceImageBuffer,
} from '@/lib/projects/reference-images';

export const runtime = 'nodejs';

async function getOwnedProject(projectId: string, userId: string) {
  const supabase = await createServerSupabase();
  const { data: project } = await fetchActiveProjectForUser(supabase, userId, projectId);
  return { project, supabase };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { project } = await getOwnedProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
    }

    const service = createServiceSupabase();
    await ensureProjectReferenceImagesBucket(service);

    const existing = await listProjectReferenceImages(service, id);
    const existingByPath = new Map(existing.map(image => [image.storage_path, image]));
    const currentPrimaryCount = existing.filter(image => image.is_primary).length;
    const maxSortOrder = existing.reduce((max, image) => Math.max(max, image.sort_order), -1);

    const normalizedNameFor = (originalName: string): string => {
      const stem = (originalName || 'referencia').replace(/\.[^.]+$/, '');
      return `${stem}.${NORMALIZED_REFERENCE_EXTENSION}`;
    };

    const incomingPaths = files.map(file =>
      buildProjectReferenceImageStoragePath(id, normalizedNameFor(file.name))
    );
    const newUniqueCount = incomingPaths.filter(path => !existingByPath.has(path)).length;
    if (existing.length + newUniqueCount > MAX_PROJECT_REFERENCE_IMAGES) {
      return NextResponse.json(
        { error: `Máximo ${MAX_PROJECT_REFERENCE_IMAGES} imágenes de referencia por proyecto.` },
        { status: 400 }
      );
    }

    let nextSortOrder = maxSortOrder + 1;
    let autoPrimaryAssigned = 0;
    const rows = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: `El archivo "${file.name}" no es una imagen válida.` }, { status: 400 });
      }

      const storagePath = buildProjectReferenceImageStoragePath(id, normalizedNameFor(file.name));
      const existingRow = existingByPath.get(storagePath);

      const rawBuffer = Buffer.from(await file.arrayBuffer());
      let uploadBuffer: Buffer;
      try {
        uploadBuffer = await normalizeReferenceImageBuffer(rawBuffer);
      } catch (normalizeErr: unknown) {
        const message = normalizeErr instanceof Error ? normalizeErr.message : 'Error desconocido';
        return NextResponse.json(
          { error: `No se pudo procesar "${file.name}" como imagen: ${message}` },
          { status: 400 }
        );
      }

      const { error: uploadErr } = await service.storage
        .from('project-reference-images')
        .upload(storagePath, uploadBuffer, {
          contentType: NORMALIZED_REFERENCE_MIME,
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Error subiendo "${file.name}": ${uploadErr.message}`);
      }

      const { data: pub } = service.storage.from('project-reference-images').getPublicUrl(storagePath);
      if (!pub?.publicUrl) {
        throw new Error(`No se pudo obtener la URL pública de "${file.name}"`);
      }

      const shouldAutoPrimary =
        !existingRow &&
        currentPrimaryCount + autoPrimaryAssigned < DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI;
      if (shouldAutoPrimary) autoPrimaryAssigned += 1;

      rows.push({
        project_id: id,
        storage_path: storagePath,
        image_url: pub.publicUrl,
        original_filename: file.name,
        mime_type: NORMALIZED_REFERENCE_MIME,
        file_size_bytes: uploadBuffer.length,
        is_primary: existingRow?.is_primary ?? shouldAutoPrimary,
        sort_order: existingRow?.sort_order ?? nextSortOrder++,
      });
    }

    const { error: upsertErr } = await service
      .from('project_reference_images')
      .upsert(rows, { onConflict: 'storage_path' });

    if (upsertErr) {
      if (isProjectReferenceImagesTableError(upsertErr)) {
        return NextResponse.json(
          { error: 'Falta la tabla project_reference_images. Ejecuta la migración 021.' },
          { status: 503 }
        );
      }
      throw new Error(upsertErr.message);
    }

    const images = await listProjectReferenceImages(service, id);
    return NextResponse.json({ success: true, images });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error subiendo imágenes de referencia';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { project } = await getOwnedProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const imageId = typeof body.imageId === 'string' ? body.imageId : '';
    const isPrimary = body.isPrimary;
    if (!imageId || typeof isPrimary !== 'boolean') {
      return NextResponse.json({ error: 'imageId e isPrimary son obligatorios' }, { status: 400 });
    }

    const service = createServiceSupabase();
    const existing = await listProjectReferenceImages(service, id);
    if (!existing.find(image => image.id === imageId)) {
      return NextResponse.json({ error: 'Imagen de referencia no encontrada' }, { status: 404 });
    }

    if (isPrimary) {
      const currentPrimaryCount = existing.filter(image => image.is_primary).length;
      const alreadyPrimary = existing.some(image => image.id === imageId && image.is_primary);
      if (!alreadyPrimary && currentPrimaryCount >= DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI) {
        return NextResponse.json(
          { error: `Máximo ${DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI} imágenes principales.` },
          { status: 400 }
        );
      }
    }

    const { error } = await service
      .from('project_reference_images')
      .update({ is_primary: isPrimary })
      .eq('id', imageId)
      .eq('project_id', id);

    if (error) {
      if (isProjectReferenceImagesTableError(error)) {
        return NextResponse.json(
          { error: 'Falta la tabla project_reference_images. Ejecuta la migración 021.' },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }

    const images = await listProjectReferenceImages(service, id);
    return NextResponse.json({ success: true, images });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error actualizando la referencia';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { project } = await getOwnedProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const imageId = typeof body.imageId === 'string' ? body.imageId : '';
    if (!imageId) {
      return NextResponse.json({ error: 'imageId es obligatorio' }, { status: 400 });
    }

    const service = createServiceSupabase();
    const existing = await listProjectReferenceImages(service, id);
    const target = existing.find(image => image.id === imageId);
    if (!target) {
      return NextResponse.json({ error: 'Imagen de referencia no encontrada' }, { status: 404 });
    }

    const { error: storageErr } = await service.storage
      .from('project-reference-images')
      .remove([target.storage_path]);

    if (storageErr) {
      throw new Error(storageErr.message);
    }

    const { error } = await service
      .from('project_reference_images')
      .delete()
      .eq('id', imageId)
      .eq('project_id', id);

    if (error) {
      if (isProjectReferenceImagesTableError(error)) {
        return NextResponse.json(
          { error: 'Falta la tabla project_reference_images. Ejecuta la migración 021.' },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }

    const images = await listProjectReferenceImages(service, id);
    return NextResponse.json({ success: true, images });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error eliminando la referencia';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
