import { NextRequest, NextResponse } from 'next/server';
import { canActOnOwnedProject, isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAI } from '@/lib/ai/openai-client';

// Montaje del reel completo (clips + textos + cierre). El vídeo se dibuja en el
// navegador (`src/lib/reel-assembler.ts`); este endpoint solo:
//  - action 'suggest' → propone con IA los textos de cada escena y el cierre.
//  - action 'motions' → escribe con IA el prompt de movimiento (Runway) de cada
//                       escena a partir de su brief, para animarlas en bloque.
//  - action 'sign'    → URL firmada para subir el MP4 directo a Storage (sin
//                       pasar por la función: los reels pesan 10–30 MB).
//  - action 'save'    → guarda la URL pública del reel en el post (migración 034).
export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'visual-assets';

async function loadItem(contentItemId: string) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  const service = createServiceSupabase();
  const { data: item } = await service
    .from('content_items')
    .select('id, project_id, idea, copy, cta, hashtags, format, projects!inner( id, user_id, name )')
    .eq('id', contentItemId)
    .maybeSingle();
  if (!item) return { error: NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 }) };
  const project = (item as any).projects;
  const admin = await isAdmin(authSupabase, user.id);
  if (!project || !canActOnOwnedProject(user.id, project.user_id, admin)) {
    return { error: NextResponse.json({ error: 'No autorizado para este proyecto' }, { status: 403 }) };
  }
  return { item: item as any, project, userId: user.id, service };
}

type Suggestion = {
  scenes: string[];
  closing_a: string;
  closing_b: string;
  cta: string;
  location: string;
  brand_sub: string;
};

/** Se añade siempre: Runway deforma la carrocería si el prompt mueve puertas o muebles. */
const LOCKED_GEOMETRY =
  'The vehicle body, doors, windows, walls, cabinets, seats, tables and the interior layout stay perfectly still and unchanged. Do not open, close, swing or reshape any door. Slow push-in only. Realistic natural motion, no morphing. Keep logos and text unchanged.';

function lockMotionPrompt(raw: string): string {
  const kept = raw
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => {
      const rigid = /\b(door|tailgate|hatch|window|cabinet|bodywork|body panel|sliding)\b/i.test(s);
      const moves = /\b(sway|swing|close|closes|closing|open|opens|opening|shut|slide|slides|fold|morph|reshape)\b/i.test(s);
      return !(rigid && moves);
    });
  return `${kept.join(' ')} ${LOCKED_GEOMETRY}`.replace(/\s+/g, ' ').trim().slice(0, 900);
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const contentItemId = typeof body?.content_item_id === 'string' ? body.content_item_id : '';
  if (!contentItemId) return NextResponse.json({ error: 'content_item_id es obligatorio' }, { status: 400 });
  const loaded = await loadItem(contentItemId);
  if ('error' in loaded) return loaded.error;
  const { item, project, userId, service } = loaded;

  if (body.action === 'suggest') {
    const { data: visuals } = await service
      .from('content_item_visuals')
      .select('visual_index, label, visual_brief')
      .eq('content_item_id', contentItemId)
      .order('visual_index');
    const n = Math.max(1, Number(body.scene_count) || visuals?.length || 1);
    const scenesInfo = (visuals || [])
      .slice(0, n)
      .map((v: any, i: number) => `Escena ${i + 1}: ${(v.visual_brief || v.label || '').slice(0, 400)}`)
      .join('\n');
    const system =
      'Eres editor de reels de Instagram en español. Escribes rótulos que aparecen sobre cada escena de un vídeo vertical. ' +
      'Cada rótulo: una frase corta y natural (máx. 7 palabras), sin emojis ni hashtags, con punto final, que siga el hilo del copy y encaje con lo que se ve en la escena. ' +
      'El cierre son dos frases cortas: closing_a (planteamiento) y closing_b (remate que se resalta en color). ' +
      'cta: una línea final breve que invite a compartir o guardar (máx. 12 palabras). ' +
      'location: lugar concreto si el copy lo menciona (ej. «Valle de Ricote · Murcia»), si no, cadena vacía. ' +
      'brand_sub: palabra o dos que describan el negocio para poner bajo la marca (ej. «Campervans»), o vacío. ' +
      'Responde SOLO JSON: {"scenes": string[], "closing_a": string, "closing_b": string, "cta": string, "location": string, "brand_sub": string}.';
    const user =
      `Marca: ${project.name}\nIdea: ${item.idea || ''}\nCopy del post:\n${item.copy || ''}\nCTA: ${item.cta || ''}\n\n` +
      `Hay ${n} escenas, en este orden:\n${scenesInfo}\n\nDevuelve exactamente ${n} rótulos en "scenes".`;
    try {
      const { data } = await callAI<Suggestion>(system, user, { userId, temperature: 0.7, maxTokens: 1200 });
      const scenes = Array.from({ length: n }, (_, i) => String(data?.scenes?.[i] || '').trim());
      return NextResponse.json({
        scenes,
        closing_a: String(data?.closing_a || '').trim(),
        closing_b: String(data?.closing_b || '').trim(),
        cta: String(data?.cta || '').trim(),
        location: String(data?.location || '').trim(),
        brand_sub: String(data?.brand_sub || '').trim(),
      });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'No se pudieron sugerir los textos' }, { status: 500 });
    }
  }

  if (body.action === 'motions') {
    const ids: string[] = Array.isArray(body.visual_ids) ? body.visual_ids.filter((x: unknown) => typeof x === 'string') : [];
    const { data: visuals } = await service
      .from('content_item_visuals')
      .select('id, visual_index, label, visual_brief, visual_prompt')
      .eq('content_item_id', contentItemId)
      .order('visual_index');
    const list = (visuals || []).filter((v: any) => ids.length === 0 || ids.includes(v.id));
    const fallback = () =>
      'A hand, a piece of fabric or a few leaves move slightly. People, if present, make a small natural gesture. ' +
      LOCKED_GEOMETRY;
    const system =
      'You write image-to-video prompts for Runway Gen-4.5. For each scene, write ONE English prompt (max 45 words) naming ONLY what may move: ' +
      'hands, people, hair, clothes, a bag or loose object, leaves, steam or water, plus one slow push-in. ' +
      'NEVER animate or reshape the vehicle, its doors (open or closed), windows, walls, cabinets, seats, tables or the interior layout. ' +
      'A parked camper stays parked. An open sliding door stays open and rigid; do not say it sways, swings, closes or slides. ' +
      'Do not invent new objects or change the scene. ' +
      'Reply ONLY JSON: {"motions": [{"id": string, "prompt": string}]}.';
    const user = list
      .map((v: any) => `id: ${v.id}\nScene ${v.visual_index + 1}: ${String(v.visual_brief || v.visual_prompt || v.label || '').slice(0, 700)}`)
      .join('\n\n');
    let motions: Record<string, string> = {};
    try {
      const { data } = await callAI<{ motions: { id: string; prompt: string }[] }>(system, `Context: ${item.idea || ''}\n\n${user}`, {
        userId,
        temperature: 0.6,
        maxTokens: 1500,
      });
      for (const m of data?.motions || []) if (m?.id && m?.prompt) motions[m.id] = lockMotionPrompt(String(m.prompt));
    } catch (err) {
      console.error('[reel-assembly] motions:', err);
    }
    for (const v of list) if (!motions[v.id]) motions[v.id] = lockMotionPrompt(fallback());
    return NextResponse.json({ motions });
  }

  if (body.action === 'sign') {
    const ext = body.ext === 'webm' ? 'webm' : 'mp4';
    const path = `${item.project_id}/${item.id}/reel-${Date.now()}.${ext}`;
    const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: `No se pudo preparar la subida: ${error?.message || 'sin URL'}` }, { status: 500 });
    }
    return NextResponse.json({ path, token: data.token, signed_url: data.signedUrl });
  }

  if (body.action === 'save') {
    const path = typeof body.path === 'string' ? body.path : '';
    if (!path.startsWith(`${item.project_id}/${item.id}/reel-`)) {
      return NextResponse.json({ error: 'Ruta de reel no válida' }, { status: 400 });
    }
    const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl;
    if (!url) return NextResponse.json({ error: 'No se pudo obtener la URL del reel' }, { status: 500 });
    const now = new Date().toISOString();
    const { error } = await service
      .from('content_items')
      .update({
        reel_video_url: url,
        reel_video_generated_at: now,
        reel_overlay_json: body.overlay ?? null,
        updated_at: now,
      })
      .eq('id', item.id);
    if (error) {
      return NextResponse.json({ error: `No se pudo guardar el reel: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ reel_video_url: url, reel_video_generated_at: now });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
