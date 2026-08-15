import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { canActOnOwnedProject, isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_MODEL,
} from '@/lib/ai/constants';
import type { ImageOrientation } from '@/types';

// La generación de vídeo con Veo es una operación larga (long-running): se lanza
// y se hace polling hasta que el MP4 está listo. Puede tardar varios minutos.
export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'visual-assets';
const MAX_MOTION_PROMPT_LENGTH = 1500;
const MIN_MOTION_PROMPT_LENGTH = 3;
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 270_000;

/** Veo solo soporta 16:9 y 9:16. El cuadrado cae a vertical (lo más usado en RRSS). */
function resolveVideoAspectRatio(orientation: ImageOrientation | string | null | undefined): string {
  return orientation === 'horizontal' ? '16:9' : '9:16';
}

async function resolveGoogleKey(userId: string): Promise<string> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('provider_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  return data?.api_key || process.env.GOOGLE_AI_API_KEY || '';
}

async function ensureBucket(supabase: ReturnType<typeof createServiceSupabase>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'],
  });
  if (error && !String(error.message || '').includes('already exists')) {
    console.error('[generate-video] createBucket:', error.message);
  }
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar la imagen base (${res.status})`);
  }
  const mimeType = res.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error('La imagen base es demasiado pequeña o está vacía');
  }
  return { base64: buffer.toString('base64'), mimeType };
}

export async function POST(request: NextRequest) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: { visual_id?: string; motion_prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const visualId = typeof body.visual_id === 'string' ? body.visual_id.trim() : '';
  if (!visualId) {
    return NextResponse.json({ error: 'visual_id es obligatorio' }, { status: 400 });
  }

  const motionPrompt =
    typeof body.motion_prompt === 'string' ? body.motion_prompt.trim() : '';
  if (motionPrompt.length < MIN_MOTION_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: 'Describe cómo debe moverse la imagen (mínimo unas palabras).' },
      { status: 400 },
    );
  }
  const finalMotionPrompt = motionPrompt.slice(0, MAX_MOTION_PROMPT_LENGTH);

  const service = createServiceSupabase();

  let { data: visual, error: vErr } = await service
    .from('content_item_visuals')
    .select(
      `*, content_items!inner( id, project_id, projects!inner( id, user_id, image_orientation ) )`,
    )
    .eq('id', visualId)
    .maybeSingle();

  if (vErr && /image_orientation/i.test(String(vErr.message || ''))) {
    const retry = await service
      .from('content_item_visuals')
      .select(`*, content_items!inner( id, project_id, projects!inner( id, user_id ) )`)
      .eq('id', visualId)
      .maybeSingle();
    visual = retry.data;
    vErr = retry.error;
  }

  if (vErr || !visual) {
    return NextResponse.json({ error: 'Visual no encontrado' }, { status: 404 });
  }

  const project = (visual as any).content_items?.projects;
  const userIsAdmin = await isAdmin(authSupabase, user.id);
  if (!project || !canActOnOwnedProject(user.id, project.user_id, userIsAdmin)) {
    return NextResponse.json({ error: 'No autorizado para este proyecto' }, { status: 403 });
  }

  // Imagen de partida: la edición final tiene prioridad sobre la generada por IA.
  const sourceImageUrl: string | null =
    (visual as any).edited_image_url || (visual as any).image_url || null;
  if (!sourceImageUrl) {
    return NextResponse.json(
      { error: 'Genera primero la imagen del visual antes de animarla.' },
      { status: 422 },
    );
  }

  const orientation: ImageOrientation =
    (project.image_orientation as ImageOrientation | undefined) || 'vertical';
  const aspectRatio = resolveVideoAspectRatio(orientation);

  try {
    const apiKey = await resolveGoogleKey(user.id);
    if (!apiKey) {
      throw new Error(
        'No se encontró API key de Google AI. Configúrala en Ajustes → Proveedores IA o en Vercel (GOOGLE_AI_API_KEY).',
      );
    }

    const { error: markErr } = await service
      .from('content_item_visuals')
      .update({
        video_status: 'generating',
        video_error: null,
        video_motion_prompt: finalMotionPrompt,
        video_source_image_url: sourceImageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visualId);
    if (markErr) {
      console.error(`[generate-video] mark-generating failed for ${visualId}:`, markErr);
    }

    const { base64, mimeType } = await fetchImageAsBase64(sourceImageUrl);

    const ai = new GoogleGenAI({ apiKey });

    console.log(
      `[generate-video] visual ${visualId} → Veo ${VIDEO_GENERATION_MODEL} (${aspectRatio}), ` +
        `motion: ${finalMotionPrompt.length} chars`,
    );

    let operation = await ai.models.generateVideos({
      model: VIDEO_GENERATION_MODEL,
      prompt: finalMotionPrompt,
      image: { imageBytes: base64, mimeType },
      config: {
        aspectRatio,
        numberOfVideos: 1,
        durationSeconds: VIDEO_GENERATION_DURATION_SECONDS,
      },
    });

    const startedAt = Date.now();
    while (!operation.done) {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        throw new Error('La generación de vídeo superó el tiempo máximo de espera.');
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      const msg =
        (operation.error as any)?.message || JSON.stringify(operation.error).slice(0, 300);
      throw new Error(`Veo devolvió un error: ${msg}`);
    }

    const generated = operation.response?.generatedVideos?.[0]?.video;
    if (!generated) {
      const filtered = operation.response?.raiMediaFilteredReasons?.[0];
      throw new Error(
        filtered
          ? `Veo bloqueó el vídeo por políticas de contenido: ${filtered}`
          : 'Veo no devolvió ningún vídeo.',
      );
    }

    // El SDK puede devolver bytes directamente o una URI que requiere la API key.
    let videoBuffer: Buffer;
    if (generated.videoBytes) {
      videoBuffer = Buffer.from(generated.videoBytes, 'base64');
    } else if (generated.uri) {
      const downloadUrl = generated.uri.includes('key=')
        ? generated.uri
        : `${generated.uri}${generated.uri.includes('?') ? '&' : '?'}key=${apiKey}`;
      const dl = await fetch(downloadUrl);
      if (!dl.ok) {
        throw new Error(`No se pudo descargar el vídeo generado (${dl.status})`);
      }
      videoBuffer = Buffer.from(await dl.arrayBuffer());
    } else {
      throw new Error('Veo no devolvió ni bytes ni URI del vídeo.');
    }

    if (videoBuffer.length < 1000) {
      throw new Error(`Vídeo generado demasiado pequeño (${videoBuffer.length} bytes)`);
    }

    await ensureBucket(service);

    const contentItemId = (visual as any).content_item_id;
    const projectId = (visual as any).content_items?.project_id;
    const ts = Date.now();
    const storagePath = `${projectId}/${contentItemId}/${(visual as any).visual_index}-video-${ts}.mp4`;

    const { error: uploadErr } = await service.storage.from(BUCKET).upload(storagePath, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });
    if (uploadErr) {
      throw new Error(`Error subiendo vídeo a Storage: ${uploadErr.message}`);
    }

    const { data: pubData } = service.storage.from(BUCKET).getPublicUrl(storagePath);
    const videoUrl = pubData?.publicUrl;
    if (!videoUrl) {
      throw new Error('No se pudo obtener la URL pública del vídeo');
    }

    const now = new Date().toISOString();
    const { data: savedRow, error: saveErr } = await service
      .from('content_item_visuals')
      .update({
        video_url: videoUrl,
        video_status: 'ready',
        video_error: null,
        video_model: VIDEO_GENERATION_MODEL,
        video_generated_at: now,
        updated_at: now,
      })
      .eq('id', visualId)
      .select('id, video_url, video_status')
      .maybeSingle();

    if (saveErr || !savedRow) {
      throw new Error(
        `No se pudo guardar el vídeo en la base de datos: ${saveErr?.message || 'fila no encontrada'}`,
      );
    }

    console.log(
      `[generate-video] ✓ Visual ${visualId} → ${videoUrl} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`,
    );

    return NextResponse.json({
      video_url: videoUrl,
      status: 'ready',
      video_generated_at: now,
      video_motion_prompt: finalMotionPrompt,
    });
  } catch (err: any) {
    console.error(`[generate-video] ✗ Visual ${visualId}:`, err?.message || err);

    const errorMsg = err?.message || 'Error desconocido generando el vídeo';
    const { error: markErr } = await service
      .from('content_item_visuals')
      .update({
        video_status: 'error',
        video_error: errorMsg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', visualId);
    if (markErr) {
      console.error(`[generate-video] mark-error fallback also failed for ${visualId}:`, markErr);
    }

    const status = err?.status === 429 ? 429 : err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
