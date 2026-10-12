import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { canActOnOwnedProject, isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  RUNWAY_API_BASE,
  RUNWAY_API_VERSION,
  RUNWAY_DEFAULT_DURATION,
  RUNWAY_DEFAULT_MODEL,
  RUNWAY_DURATIONS,
  RUNWAY_MAX_PROMPT_LENGTH,
  RUNWAY_VIDEO_MODELS,
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_MODEL,
  type RunwayVideoModel,
  type VideoEngine,
} from '@/lib/ai/constants';
import type { ImageOrientation, KeyProvider } from '@/types';

// Animación imagen → vídeo de un visual.
// - Veo: síncrono (se lanza y se espera en esta misma petición, máx. ~270 s).
// - Runway: ASÍNCRONO. POST crea la tarea, guarda `video_task_id` y responde al
//   instante con status 'generating'. El cliente consulta GET ?visual_id=… cada
//   pocos segundos; cada GET mira la tarea en Runway una vez y, cuando termina,
//   descarga el MP4, lo sube a Storage y deja el visual en 'ready'. Así una cola
//   larga (cuentas Runway que procesan 1–2 tareas a la vez) no choca con el
//   límite de 300 s de la función.
export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'visual-assets';
const MAX_MOTION_PROMPT_LENGTH = 1500;
const MIN_MOTION_PROMPT_LENGTH = 3;
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 270_000;
/** Si una tarea Runway sigue sin terminar tras esto, se da por perdida. */
const RUNWAY_TASK_TTL_MS = 30 * 60_000;

/** Veo solo soporta 16:9 y 9:16. El cuadrado cae a vertical (lo más usado en RRSS). */
function resolveVideoAspectRatio(orientation: ImageOrientation | string | null | undefined): string {
  return orientation === 'horizontal' ? '16:9' : '9:16';
}

/** Runway usa ratios en píxeles. Igual que Veo: el cuadrado cae a vertical. */
function resolveRunwayRatio(orientation: ImageOrientation | string | null | undefined): string {
  return orientation === 'horizontal' ? '1280:720' : '720:1280';
}

async function resolveProviderKey(userId: string, provider: KeyProvider, envFallback: string | undefined) {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('provider_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  return data?.api_key || envFallback || '';
}

const BUCKET_MIME = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const BUCKET_LIMIT = 50 * 1024 * 1024;

async function ensureBucket(supabase: ReturnType<typeof createServiceSupabase>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) {
    const mimes = data.allowed_mime_types ?? [];
    const allowsVideo = mimes.includes('video/mp4');
    const bigEnough = (data.file_size_limit ?? 0) >= BUCKET_LIMIT;
    if (allowsVideo && bigEnough) return;
    const { error } = await supabase.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: BUCKET_LIMIT,
      allowedMimeTypes: BUCKET_MIME,
    });
    if (error) console.error('[generate-video] updateBucket:', error.message);
    return;
  }
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: BUCKET_LIMIT,
    allowedMimeTypes: BUCKET_MIME,
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Veo (Google) ────────────────────────────────────────────────────────────

async function generateWithVeo(opts: {
  apiKey: string;
  prompt: string;
  imageUrl: string;
  aspectRatio: string;
}): Promise<Buffer> {
  const { base64, mimeType } = await fetchImageAsBase64(opts.imageUrl);
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  let operation = await ai.models.generateVideos({
    model: VIDEO_GENERATION_MODEL,
    prompt: opts.prompt,
    image: { imageBytes: base64, mimeType },
    config: {
      aspectRatio: opts.aspectRatio,
      numberOfVideos: 1,
      durationSeconds: VIDEO_GENERATION_DURATION_SECONDS,
    },
  });

  const startedAt = Date.now();
  while (!operation.done) {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new Error('La generación de vídeo superó el tiempo máximo de espera.');
    }
    await sleep(POLL_INTERVAL_MS);
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
  if (generated.videoBytes) {
    return Buffer.from(generated.videoBytes, 'base64');
  }
  if (generated.uri) {
    const downloadUrl = generated.uri.includes('key=')
      ? generated.uri
      : `${generated.uri}${generated.uri.includes('?') ? '&' : '?'}key=${opts.apiKey}`;
    const dl = await fetch(downloadUrl);
    if (!dl.ok) {
      throw new Error(`No se pudo descargar el vídeo generado (${dl.status})`);
    }
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error('Veo no devolvió ni bytes ni URI del vídeo.');
}

// ── Runway ──────────────────────────────────────────────────────────────────

async function runwayFetch(apiKey: string, path: string, init?: RequestInit) {
  const res = await fetch(`${RUNWAY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error || json?.message || JSON.stringify(json).slice(0, 300);
    const err: any = new Error(
      res.status === 401
        ? 'Runway rechazó la API key (401). Revísala en Ajustes → Proveedores IA.'
        : res.status === 429
          ? 'Runway: demasiadas tareas a la vez o sin créditos (429). Espera un poco o recarga créditos.'
          : `Runway devolvió un error (${res.status}): ${detail}`,
    );
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Crea la tarea en Runway y devuelve su id (no espera al resultado). */
async function createRunwayTask(opts: {
  apiKey: string;
  prompt: string;
  imageUrl: string;
  ratio: string;
  model: RunwayVideoModel;
  duration: number;
}): Promise<string> {
  // Runway acepta la URL pública (Supabase Storage). Si no fuera https, data URI.
  let promptImage = opts.imageUrl;
  if (!/^https:\/\//i.test(promptImage)) {
    const { base64, mimeType } = await fetchImageAsBase64(opts.imageUrl);
    promptImage = `data:${mimeType};base64,${base64}`;
  }
  const created = await runwayFetch(opts.apiKey, '/image_to_video', {
    method: 'POST',
    body: JSON.stringify({
      model: opts.model,
      promptImage,
      promptText: opts.prompt.slice(0, RUNWAY_MAX_PROMPT_LENGTH),
      ratio: opts.ratio,
      duration: opts.duration,
    }),
  });
  const taskId: string | undefined = created?.id;
  if (!taskId) throw new Error('Runway no devolvió el id de la tarea.');
  return taskId;
}

type RunwayCheck =
  | { state: 'running'; runwayStatus: string }
  | { state: 'succeeded'; outputUrl: string }
  | { state: 'failed'; reason: string };

/** Mira el estado de la tarea una sola vez. Estados: PENDING | THROTTLED | RUNNING | SUCCEEDED | FAILED | CANCELLED. */
async function checkRunwayTask(apiKey: string, taskId: string): Promise<RunwayCheck> {
  const task = await runwayFetch(apiKey, `/tasks/${taskId}`);
  if (task.status === 'SUCCEEDED') {
    const url: string | undefined = Array.isArray(task.output) ? task.output[0] : undefined;
    if (!url) return { state: 'failed', reason: 'Runway terminó pero no devolvió el vídeo.' };
    return { state: 'succeeded', outputUrl: url };
  }
  if (task.status === 'FAILED' || task.status === 'CANCELLED') {
    return { state: 'failed', reason: `Runway no pudo generar el vídeo: ${task.failure || task.failureCode || task.status}` };
  }
  return { state: 'running', runwayStatus: String(task.status || 'PENDING') };
}

// ── Comunes ─────────────────────────────────────────────────────────────────

type LoadedVisual = { visual: any; project: any; userId: string };

async function loadVisualForUser(visualId: string): Promise<LoadedVisual | NextResponse> {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const service = createServiceSupabase();
  let { data: visual, error: vErr } = await service
    .from('content_item_visuals')
    .select(`*, content_items!inner( id, project_id, projects!inner( id, user_id, image_orientation ) )`)
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
  return { visual, project, userId: user.id };
}

/** Sube el MP4 a Storage y marca el visual como listo. */
async function saveVideo(visual: any, videoBuffer: Buffer, modelLabel: string) {
  if (videoBuffer.length < 1000) {
    throw new Error(`Vídeo generado demasiado pequeño (${videoBuffer.length} bytes)`);
  }
  const service = createServiceSupabase();
  await ensureBucket(service);
  const contentItemId = visual.content_item_id;
  const projectId = visual.content_items?.project_id;
  const storagePath = `${projectId}/${contentItemId}/${visual.visual_index}-video-${Date.now()}.mp4`;
  const { error: uploadErr } = await service.storage.from(BUCKET).upload(storagePath, videoBuffer, {
    contentType: 'video/mp4',
    upsert: true,
  });
  if (uploadErr) throw new Error(`Error subiendo vídeo a Storage: ${uploadErr.message}`);
  const { data: pubData } = service.storage.from(BUCKET).getPublicUrl(storagePath);
  const videoUrl = pubData?.publicUrl;
  if (!videoUrl) throw new Error('No se pudo obtener la URL pública del vídeo');
  const now = new Date().toISOString();
  const { data: savedRow, error: saveErr } = await service
    .from('content_item_visuals')
    .update({
      video_url: videoUrl,
      video_status: 'ready',
      video_error: null,
      video_model: modelLabel,
      video_task_id: null,
      video_generated_at: now,
      updated_at: now,
    })
    .eq('id', visual.id)
    .select('id')
    .maybeSingle();
  if (saveErr || !savedRow) {
    throw new Error(`No se pudo guardar el vídeo en la base de datos: ${saveErr?.message || 'fila no encontrada'}`);
  }
  console.log(`[generate-video] ✓ Visual ${visual.id} → ${videoUrl} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return { videoUrl, now };
}

async function markError(visualId: string, msg: string) {
  const service = createServiceSupabase();
  const { error } = await service
    .from('content_item_visuals')
    .update({
      video_status: 'error',
      video_error: msg.slice(0, 500),
      video_task_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', visualId);
  if (error) console.error(`[generate-video] mark-error failed for ${visualId}:`, error);
}

// ── GET: estado de una animación Runway en curso ────────────────────────────

export async function GET(request: NextRequest) {
  const visualId = (request.nextUrl.searchParams.get('visual_id') || '').trim();
  if (!visualId) return NextResponse.json({ error: 'visual_id es obligatorio' }, { status: 400 });
  const loaded = await loadVisualForUser(visualId);
  if (loaded instanceof NextResponse) return loaded;
  const { visual, userId } = loaded;

  const base = {
    video_url: visual.video_url ?? null,
    video_model: visual.video_model ?? null,
    video_motion_prompt: visual.video_motion_prompt ?? null,
    video_generated_at: visual.video_generated_at ?? null,
  };
  if (visual.video_status !== 'generating') {
    return NextResponse.json({ ...base, status: visual.video_status || 'pending', error: visual.video_error ?? null });
  }
  const taskId: string | null = visual.video_task_id ?? null;
  if (!taskId || taskId.startsWith('claimed:')) {
    // Veo en curso (síncrono) u otra petición está guardando el resultado.
    return NextResponse.json({ ...base, status: 'generating', runway_status: taskId ? 'SAVING' : null });
  }

  const startedAt = visual.video_task_started_at ? Date.parse(visual.video_task_started_at) : NaN;
  if (Number.isFinite(startedAt) && Date.now() - startedAt > RUNWAY_TASK_TTL_MS) {
    const msg = 'Runway no terminó el vídeo en 30 minutos. Vuelve a intentarlo.';
    await markError(visualId, msg);
    return NextResponse.json({ ...base, status: 'error', error: msg });
  }

  try {
    const apiKey = await resolveProviderKey(userId, 'runway', process.env.RUNWAYML_API_SECRET);
    if (!apiKey) throw new Error('No se encontró API key de Runway.');
    const check = await checkRunwayTask(apiKey, taskId);
    if (check.state === 'running') {
      return NextResponse.json({ ...base, status: 'generating', runway_status: check.runwayStatus });
    }
    if (check.state === 'failed') {
      await markError(visualId, check.reason);
      return NextResponse.json({ ...base, status: 'error', error: check.reason });
    }
    // Reclama el guardado (evita que dos consultas simultáneas suban el vídeo dos veces).
    const service = createServiceSupabase();
    const { data: claimed } = await service
      .from('content_item_visuals')
      .update({ video_task_id: `claimed:${taskId}` })
      .eq('id', visualId)
      .eq('video_task_id', taskId)
      .select('id')
      .maybeSingle();
    if (!claimed) return NextResponse.json({ ...base, status: 'generating', runway_status: 'SAVING' });
    try {
      const dl = await fetch(check.outputUrl);
      if (!dl.ok) throw new Error(`No se pudo descargar el vídeo de Runway (${dl.status})`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const modelLabel = visual.video_model || 'runway';
      const { videoUrl, now } = await saveVideo(visual, buf, modelLabel);
      return NextResponse.json({
        ...base,
        status: 'ready',
        video_url: videoUrl,
        video_generated_at: now,
        video_model: modelLabel,
      });
    } catch (e) {
      // Devuelve la tarea para reintentar el guardado en la siguiente consulta.
      await service.from('content_item_visuals').update({ video_task_id: taskId }).eq('id', visualId);
      throw e;
    }
  } catch (err: any) {
    console.error(`[generate-video] GET ✗ Visual ${visualId}:`, err?.message || err);
    // Error transitorio (red, 5xx): el cliente seguirá consultando.
    return NextResponse.json({ ...base, status: 'generating', warning: err?.message || 'Error consultando Runway' });
  }
}

// ── POST: lanzar animación ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    visual_id?: string;
    motion_prompt?: string;
    engine?: string;
    runway_model?: string;
    duration?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const visualId = typeof body.visual_id === 'string' ? body.visual_id.trim() : '';
  if (!visualId) {
    return NextResponse.json({ error: 'visual_id es obligatorio' }, { status: 400 });
  }
  const motionPrompt = typeof body.motion_prompt === 'string' ? body.motion_prompt.trim() : '';
  if (motionPrompt.length < MIN_MOTION_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: 'Describe cómo debe moverse la imagen (mínimo unas palabras).' },
      { status: 400 },
    );
  }
  const finalMotionPrompt = motionPrompt.slice(0, MAX_MOTION_PROMPT_LENGTH);

  const engine: VideoEngine = body.engine === 'runway' ? 'runway' : 'veo';
  const runwayModel: RunwayVideoModel = RUNWAY_VIDEO_MODELS.some(m => m.id === body.runway_model)
    ? (body.runway_model as RunwayVideoModel)
    : RUNWAY_DEFAULT_MODEL;
  const runwayDuration: number = (RUNWAY_DURATIONS as readonly number[]).includes(Number(body.duration))
    ? Number(body.duration)
    : RUNWAY_DEFAULT_DURATION;

  const loaded = await loadVisualForUser(visualId);
  if (loaded instanceof NextResponse) return loaded;
  const { visual, project, userId } = loaded;
  const service = createServiceSupabase();

  // Ya hay una animación Runway en curso para este visual: no lanzar otra (y no cobrar dos veces).
  if (visual.video_status === 'generating' && visual.video_task_id) {
    return NextResponse.json({ status: 'generating', task_id: visual.video_task_id, already_running: true });
  }

  // Imagen de partida: la edición final tiene prioridad sobre la generada por IA.
  const sourceImageUrl: string | null = visual.edited_image_url || visual.image_url || null;
  if (!sourceImageUrl) {
    return NextResponse.json(
      { error: 'Genera primero la imagen del visual antes de animarla.' },
      { status: 422 },
    );
  }
  const orientation: ImageOrientation =
    (project.image_orientation as ImageOrientation | undefined) || 'vertical';
  const modelLabel = engine === 'runway' ? `runway-${runwayModel}` : VIDEO_GENERATION_MODEL;

  try {
    const apiKey =
      engine === 'runway'
        ? await resolveProviderKey(userId, 'runway', process.env.RUNWAYML_API_SECRET)
        : await resolveProviderKey(userId, 'google', process.env.GOOGLE_AI_API_KEY);
    if (!apiKey) {
      throw new Error(
        engine === 'runway'
          ? 'No se encontró API key de Runway. Configúrala en Ajustes → Proveedores IA o en Vercel (RUNWAYML_API_SECRET).'
          : 'No se encontró API key de Google AI. Configúrala en Ajustes → Proveedores IA o en Vercel (GOOGLE_AI_API_KEY).',
      );
    }

    console.log(
      `[generate-video] visual ${visualId} → ${modelLabel} (${orientation}` +
        `${engine === 'runway' ? `, ${runwayDuration}s` : ''}), motion: ${finalMotionPrompt.length} chars`,
    );

    if (engine === 'runway') {
      const taskId = await createRunwayTask({
        apiKey,
        prompt: finalMotionPrompt,
        imageUrl: sourceImageUrl,
        ratio: resolveRunwayRatio(orientation),
        model: runwayModel,
        duration: runwayDuration,
      });
      const now = new Date().toISOString();
      const { error: markErr } = await service
        .from('content_item_visuals')
        .update({
          video_status: 'generating',
          video_error: null,
          video_motion_prompt: finalMotionPrompt,
          video_source_image_url: sourceImageUrl,
          video_model: modelLabel,
          video_task_id: taskId,
          video_task_started_at: now,
          updated_at: now,
        })
        .eq('id', visualId);
      if (markErr) throw new Error(`No se pudo guardar la tarea de Runway: ${markErr.message}`);
      return NextResponse.json({ status: 'generating', task_id: taskId, video_model: modelLabel });
    }

    // ----- Veo (síncrono) -----
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
    if (markErr) console.error(`[generate-video] mark-generating failed for ${visualId}:`, markErr);

    const videoBuffer = await generateWithVeo({
      apiKey,
      prompt: finalMotionPrompt,
      imageUrl: sourceImageUrl,
      aspectRatio: resolveVideoAspectRatio(orientation),
    });
    const { videoUrl, now } = await saveVideo(visual, videoBuffer, modelLabel);
    return NextResponse.json({
      video_url: videoUrl,
      status: 'ready',
      video_generated_at: now,
      video_motion_prompt: finalMotionPrompt,
      video_model: modelLabel,
    });
  } catch (err: any) {
    console.error(`[generate-video] ✗ Visual ${visualId}:`, err?.message || err);
    const errorMsg = err?.message || 'Error desconocido generando el vídeo';
    await markError(visualId, errorMsg);
    const status = err?.status === 429 ? 429 : err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
