import { createServiceSupabase } from '@/lib/supabase/server';
import {
  RUNWAY_API_BASE,
  RUNWAY_API_VERSION,
  RUNWAY_MAX_PROMPT_LENGTH,
  RUNWAY_VIDEO_MODELS,
  type RunwayVideoModel,
} from '@/lib/ai/constants';
import type { ImageOrientation, KeyProvider } from '@/types';

const BUCKET = 'visual-assets';
const BUCKET_MIME = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const BUCKET_LIMIT = 50 * 1024 * 1024;

/**
 * Modelos que esta integración ha validado en image-to-video.
 * Duración 5 o 10 s. Ratio vertical 720:1280 u horizontal 1280:720.
 * Gen-4 no admite `seed` en esta API: se guarda en el laboratorio pero no se envía.
 * seedance2 y veo3.1_fast no están en el cliente actual (otro contrato de duración/ratio).
 */
export const LAB_MODELS: {
  id: RunwayVideoModel;
  durations: readonly number[];
  ratios: readonly string[];
  creditsPerSecond: number;
  supportsSeed: boolean;
}[] = RUNWAY_VIDEO_MODELS.map(m => ({
  id: m.id,
  durations: [5, 10],
  ratios: ['720:1280', '1280:720'],
  creditsPerSecond: m.creditsPerSecond,
  supportsSeed: false,
}));

export function labModel(id: string) {
  return LAB_MODELS.find(m => m.id === id) ?? null;
}

export function assertLabVariant(model: string, duration: number, ratio: string) {
  const m = labModel(model);
  if (!m) throw new Error(`Modelo no admitido: ${model}. Válidos: ${LAB_MODELS.map(x => x.id).join(', ')}.`);
  if (!m.durations.includes(duration)) throw new Error(`${model} solo admite duraciones ${m.durations.join(' o ')} s.`);
  if (!m.ratios.includes(ratio)) throw new Error(`${model} solo admite ratios ${m.ratios.join(' o ')}.`);
  return m;
}

export async function resolveProviderKey(userId: string, provider: KeyProvider, envFallback: string | undefined) {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('provider_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  return data?.api_key || envFallback || '';
}

export async function ensureVisualAssetsBucket() {
  const supabase = createServiceSupabase();
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
    if (error) console.error('[video] updateBucket:', error.message);
    return;
  }
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: BUCKET_LIMIT,
    allowedMimeTypes: BUCKET_MIME,
  });
  if (error && !String(error.message || '').includes('already exists')) {
    console.error('[video] createBucket:', error.message);
  }
}

export async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen base (${res.status})`);
  const mimeType = res.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error('La imagen base es demasiado pequeña o está vacía');
  return { base64: buffer.toString('base64'), mimeType };
}

export function resolveRunwayRatio(orientation: ImageOrientation | string | null | undefined): string {
  return orientation === 'horizontal' ? '1280:720' : '720:1280';
}

export async function runwayFetch(apiKey: string, path: string, init?: RequestInit) {
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

/** Saldo de créditos si la API lo devuelve. null si el endpoint no está o cambia de forma. */
export async function getRunwayCreditBalance(apiKey: string): Promise<number | null> {
  try {
    const org = await runwayFetch(apiKey, '/organization');
    const n = org?.creditBalance ?? org?.credits ?? org?.balance ?? org?.credit_balance;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function createRunwayTask(opts: {
  apiKey: string;
  prompt: string;
  imageUrl: string;
  ratio: string;
  model: RunwayVideoModel;
  duration: number;
  seed?: number | null;
  /** Solo se envía si el modelo lo admite. Gen-4 no. */
  allowSeed?: boolean;
}): Promise<string> {
  let promptImage = opts.imageUrl;
  if (!/^https:\/\//i.test(promptImage)) {
    const { base64, mimeType } = await fetchImageAsBase64(opts.imageUrl);
    promptImage = `data:${mimeType};base64,${base64}`;
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    promptImage,
    promptText: opts.prompt.slice(0, RUNWAY_MAX_PROMPT_LENGTH),
    ratio: opts.ratio,
    duration: opts.duration,
  };
  if (opts.allowSeed && typeof opts.seed === 'number' && Number.isFinite(opts.seed)) {
    body.seed = Math.round(opts.seed);
  }
  const created = await runwayFetch(opts.apiKey, '/image_to_video', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const taskId: string | undefined = created?.id;
  if (!taskId) throw new Error('Runway no devolvió el id de la tarea.');
  return taskId;
}

export type RunwayCheck =
  | { state: 'running'; runwayStatus: string }
  | { state: 'succeeded'; outputUrl: string }
  | { state: 'failed'; reason: string };

export async function checkRunwayTask(apiKey: string, taskId: string): Promise<RunwayCheck> {
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
