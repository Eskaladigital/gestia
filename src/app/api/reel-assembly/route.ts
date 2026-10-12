import { NextRequest, NextResponse } from 'next/server';
import { canActOnOwnedProject, isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAI } from '@/lib/ai/openai-client';
import { acceptCaption, suggestSceneTexts } from '@/lib/reel-assembler';
import { LOCKED_GEOMETRY, lockMotionPrompt } from '@/lib/video/motion';

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

async function productionMotionSystem(service: ReturnType<typeof createServiceSupabase>): Promise<string | null> {
  const { data, error } = await service
    .from('video_lab_settings')
    .select('template_id, video_prompt_templates(system_prompt)')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data?.template_id) return null;
  const tpl = (data as { video_prompt_templates?: { system_prompt?: string } | { system_prompt?: string }[] | null })
    .video_prompt_templates;
  const row = Array.isArray(tpl) ? tpl[0] : tpl;
  const text = row?.system_prompt?.trim();
  if (!text) return null;
  return (
    text +
    '\n\nYou will receive several scenes. Reply ONLY JSON: {"motions":[{"id": string, "prompt": string}]}. Each prompt follows the rules above.'
  );
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
      'Eres editor de reels de Instagram en español de España. Escribes los rótulos que se leen SOBRE el vídeo. ' +
      'Quien mira no lee el copy: si una frase se corta, el reel no dice nada. ' +
      'Cada rótulo de escena es UNA frase completa, de 4 a 14 palabras, que se entiende sola, y termina en punto, interrogación o exclamación. ' +
      'Prohibido: puntos suspensivos, copiar el inicio del párrafo, dejar un verbo colgando («deja de ser», «lo que te hace», «el navegador»). ' +
      'Reescribe la idea para que quepa entera. No la recortes. ' +
      'Los rótulos, en orden, cuentan el copy de principio a fin: gancho, giro, promesa y remate. No repitas la misma idea. ' +
      'Si el copy tiene una pregunta o una frase entre comillas, esa frase va entera en su propio rótulo. ' +
      'closing_a: la consecuencia, frase completa, máximo 16 palabras. ' +
      'closing_b: el remate, frase completa, máximo 12 palabras. No lo dejes vacío. ' +
      'cta: la llamada del post, acortada a una frase completa (máximo 14 palabras). Si hay CTA, no la dejes vacía. ' +
      'location: lugar concreto si el copy lo nombra, si no cadena vacía. ' +
      'brand_sub: una o dos palabras del negocio bajo la marca, o vacío. ' +
      'El contenido sale SIEMPRE de este copy, nunca del ejemplo. Ejemplo de FORMA, no de tema: mal «Lo que de verdad importa es que…»; bien «Lo que importa es parar cuando apetece.» ' +
      'Responde SOLO JSON: {"scenes": string[], "closing_a": string, "closing_b": string, "cta": string, "location": string, "brand_sub": string}.';
    const user =
      `Marca: ${project.name}\nIdea: ${item.idea || ''}\nCopy del post:\n${item.copy || ''}\nCTA: ${item.cta || ''}\n\n` +
      `Hay ${n} escenas, en este orden:\n${scenesInfo}\n\nDevuelve exactamente ${n} rótulos en "scenes". Cada uno se lee entero, sin puntos suspensivos.`;
    const local = suggestSceneTexts(item.copy || '', n, item.cta || '');
    const pick = (ai: unknown, fallback: string, max: number) => acceptCaption(String(ai || ''), max) || fallback;
    try {
      let { data } = await callAI<Suggestion>(system, user, { userId, temperature: 0.4, maxTokens: 1200 });
      let scenes = Array.from({ length: n }, (_, i) => acceptCaption(String(data?.scenes?.[i] || ''), 16));
      const broken = scenes.some(s => !s) || !acceptCaption(String(data?.closing_a || ''), 18) || !acceptCaption(String(data?.closing_b || ''), 14);
      if (broken) {
        const retry = await callAI<Suggestion>(
          system,
          `${user}\n\nLa respuesta anterior no vale: hay frases cortadas o vacías (${JSON.stringify(data)}). ` +
            'Vuelve a escribirlas COMPLETAS. Cada rótulo termina en punto o interrogación y se entiende sin leer el resto.',
          { userId, temperature: 0.3, maxTokens: 1200 },
        );
        data = retry.data;
        scenes = Array.from({ length: n }, (_, i) => acceptCaption(String(data?.scenes?.[i] || ''), 16));
      }
      return NextResponse.json({
        scenes: scenes.map((s, i) => s || local.scenes[i] || ''),
        closing_a: pick(data?.closing_a, local.closingA, 18),
        closing_b: pick(data?.closing_b, local.closingB, 14),
        cta: pick(data?.cta, local.cta, 16),
        location: String(data?.location || '').trim(),
        brand_sub: String(data?.brand_sub || '').trim(),
      });
    } catch (err: any) {
      return NextResponse.json({
        scenes: local.scenes,
        closing_a: local.closingA,
        closing_b: local.closingB,
        cta: local.cta,
        location: '',
        brand_sub: '',
      });
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
    const recipe = await productionMotionSystem(service);
    const system =
      recipe ||
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
