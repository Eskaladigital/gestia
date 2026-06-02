import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import {
  buildProjectReferenceImageStoragePath,
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  ensureProjectReferenceImagesBucket,
  isProjectReferenceImagesTableError,
  isProjectReferenceRole,
  listProjectReferenceImages,
  MAX_PROJECT_REFERENCE_IMAGES,
  NORMALIZED_REFERENCE_EXTENSION,
  NORMALIZED_REFERENCE_MIME,
  normalizeReferenceImageBuffer,
  persistReferenceImageAnalysis,
  reanalyzeProjectReferenceImages,
  resolveOpenAIKeyForUser,
  syncProjectPhysicalConstraintsFromReferences,
} from '@/lib/projects/reference-images';

// El captioning con visión puede tardar 1-3 s por imagen; con varias subidas
// a la vez nos podemos pasar de los 60 s por defecto de Vercel.
export const runtime = 'nodejs';
export const maxDuration = 120;

/** Columnas de rol/identidad (migración 028); puede no existir en BD antiguas. */
function isReferenceRoleColumnError(error: { message?: string } | null | undefined): boolean {
  const m = (error?.message || '').toLowerCase();
  return (
    m.includes('reference_role') ||
    m.includes('role_confidence') ||
    m.includes('role_is_manual') ||
    m.includes('product_identity') ||
    m.includes('product_traits') ||
    m.includes('reference_view')
  );
}

function referenceAnalysisContext(project: {
  sector?: string | null;
  description?: string | null;
  sells_physical_product?: boolean | null;
}) {
  return {
    sector: project.sector ?? null,
    description: project.description ?? null,
    sellsPhysicalProduct: project.sells_physical_product ?? null,
  };
}

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

    let imagesAfterUpsert = await listProjectReferenceImages(service, id);

    // Captioning automático: para las referencias que no tengan caption listo y
    // que NO sean ediciones manuales, le pedimos a la IA que las describa. Es
    // síncrono pero limitado a las que se acaban de subir (en la práctica 1-4
    // imágenes a la vez).
    const incomingPathSet = new Set(rows.map(row => row.storage_path));
    const needsCaption = imagesAfterUpsert.filter(
      image =>
        incomingPathSet.has(image.storage_path) &&
        image.caption_is_manual !== true &&
        (!image.caption || image.caption_status !== 'ready')
    );

    if (needsCaption.length > 0) {
      const apiKey = await resolveOpenAIKeyForUser(service, user.id);
      if (apiKey) {
        const analysisCtx = referenceAnalysisContext(project);
        await Promise.all(
          needsCaption.map(image =>
            persistReferenceImageAnalysis(service, apiKey, image, analysisCtx)
          )
        );
        imagesAfterUpsert = await listProjectReferenceImages(service, id);

        // Reglas físicas: la app las regenera siempre a partir de fotos de producto.
        try {
          await syncProjectPhysicalConstraintsFromReferences({
            service,
            project,
            referenceImages: imagesAfterUpsert,
            apiKey,
          });
        } catch (syncErr) {
          console.warn('[reference-images] auto physical_constraints falló:', (syncErr as Error)?.message);
        }
      } else {
        console.warn('[reference-images] sin API key OpenAI: se sube sin caption automático');
      }
    }

    return NextResponse.json({ success: true, images: imagesAfterUpsert });
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
    const body = await request.json() as {
      imageId?: string;
      isPrimary?: boolean;
      caption?: string;
      role?: string;
      regenerateCaption?: boolean;
      regenerateAllPending?: boolean;
    };

    // Acción especial: regenerar TODAS las descripciones pendientes/erróneas/sin
    // caption del proyecto. No requiere imageId. Útil para retro-poblar las
    // referencias antiguas que se subieron antes de existir el campo caption.
    if (body.regenerateAllPending === true) {
      const service = createServiceSupabase();
      try {
        const { processed, images } = await reanalyzeProjectReferenceImages({
          service,
          projectId: id,
          userId: user.id,
          project,
        });
        return NextResponse.json({ success: true, images, processed });
      } catch (reanalyzeErr) {
        const message = reanalyzeErr instanceof Error ? reanalyzeErr.message : 'Error analizando referencias';
        const status = message.includes('API key') ? 422 : 500;
        return NextResponse.json({ error: message }, { status });
      }
    }

    const imageId = typeof body.imageId === 'string' ? body.imageId : '';
    if (!imageId) {
      return NextResponse.json({ error: 'imageId es obligatorio' }, { status: 400 });
    }

    const isPrimaryProvided = typeof body.isPrimary === 'boolean';
    const captionProvided = typeof body.caption === 'string';
    const roleProvided = typeof body.role === 'string';
    const regenerateCaption = body.regenerateCaption === true;

    if (roleProvided && (!isProjectReferenceRole(body.role) || body.role === 'pending')) {
      return NextResponse.json(
        { error: 'Rol no válido. Usa product, style, place, logo, person, scene u other.' },
        { status: 400 }
      );
    }

    if (!isPrimaryProvided && !captionProvided && !roleProvided && !regenerateCaption) {
      return NextResponse.json(
        { error: 'Indica al menos isPrimary, caption, role o regenerateCaption' },
        { status: 400 }
      );
    }

    const service = createServiceSupabase();
    const existing = await listProjectReferenceImages(service, id);
    const target = existing.find(image => image.id === imageId);
    if (!target) {
      return NextResponse.json({ error: 'Imagen de referencia no encontrada' }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    if (isPrimaryProvided) {
      const isPrimary = body.isPrimary as boolean;
      if (isPrimary) {
        const currentPrimaryCount = existing.filter(image => image.is_primary).length;
        if (!target.is_primary && currentPrimaryCount >= DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI) {
          return NextResponse.json(
            { error: `Máximo ${DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI} imágenes principales.` },
            { status: 400 }
          );
        }
      }
      update.is_primary = isPrimary;
    }

    if (captionProvided) {
      const trimmed = (body.caption as string).trim();
      if (trimmed.length === 0) {
        update.caption = null;
        update.caption_status = 'pending';
        update.caption_is_manual = false;
        update.caption_at = null;
      } else {
        update.caption = trimmed.slice(0, 2000);
        update.caption_status = 'ready';
        update.caption_is_manual = true;
        update.caption_at = new Date().toISOString();
      }
    }

    if (roleProvided) {
      update.reference_role = body.role;
      update.role_is_manual = true;
      // Si el usuario marca algo que NO es producto, limpiamos los campos de
      // producto para que no arrastren identidad/vista de una clasificación previa.
      if (body.role !== 'product') {
        update.product_identity = null;
        update.product_traits = null;
        update.reference_view = null;
      }
    }

    if (Object.keys(update).length > 0) {
      const { error } = await service
        .from('project_reference_images')
        .update(update)
        .eq('id', imageId)
        .eq('project_id', id);
      if (error) {
        if (isProjectReferenceImagesTableError(error)) {
          return NextResponse.json(
            { error: 'Falta la tabla project_reference_images. Ejecuta la migración 021.' },
            { status: 503 }
          );
        }
        // Migración 028 (rol) no aplicada: reintentamos sin los campos de rol.
        if (isReferenceRoleColumnError(error)) {
          const legacyUpdate = { ...update };
          delete legacyUpdate.reference_role;
          delete legacyUpdate.role_is_manual;
          delete legacyUpdate.product_identity;
          delete legacyUpdate.product_traits;
          delete legacyUpdate.reference_view;
          if (Object.keys(legacyUpdate).length > 0) {
            const { error: legacyErr } = await service
              .from('project_reference_images')
              .update(legacyUpdate)
              .eq('id', imageId)
              .eq('project_id', id);
            if (legacyErr) throw new Error(legacyErr.message);
          }
        } else {
          throw new Error(error.message);
        }
      }
    }

    if (regenerateCaption) {
      const apiKey = await resolveOpenAIKeyForUser(service, user.id);
      if (!apiKey) {
        return NextResponse.json(
          { error: 'No hay API key de OpenAI configurada para regenerar el caption.' },
          { status: 422 }
        );
      }
      await persistReferenceImageAnalysis(
        service,
        apiKey,
        {
          ...target,
          role_is_manual: roleProvided ? true : target.role_is_manual,
        },
        referenceAnalysisContext(project)
      );
    }

    const images = await listProjectReferenceImages(service, id);

    // Si cambió el rol o el caption, recalculamos las reglas físicas del sistema.
    if (roleProvided || regenerateCaption) {
      try {
        const apiKey = await resolveOpenAIKeyForUser(service, user.id);
        if (apiKey) {
          await syncProjectPhysicalConstraintsFromReferences({
            service,
            project,
            referenceImages: images,
            apiKey,
          });
        }
      } catch (syncErr) {
        console.warn('[reference-images] auto physical_constraints falló:', (syncErr as Error)?.message);
      }
    }

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
    try {
      const apiKey = await resolveOpenAIKeyForUser(service, user.id);
      if (apiKey) {
        await syncProjectPhysicalConstraintsFromReferences({
          service,
          project,
          referenceImages: images,
          apiKey,
        });
      }
    } catch (syncErr) {
      console.warn('[reference-images] auto physical_constraints tras borrar falló:', (syncErr as Error)?.message);
    }
    return NextResponse.json({ success: true, images });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error eliminando la referencia';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
