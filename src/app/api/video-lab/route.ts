import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/openai-client';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { requireLabAdmin } from '@/lib/video/lab-auth';
import { aiMean, type AiJudgment } from '@/lib/video/lab-score';
import { assertLabVariant, getRunwayCreditBalance, labModel, resolveProviderKey } from '@/lib/video/runway';
import type { RunwayVideoModel } from '@/lib/ai/constants';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HUMAN_TAGS = ['deforma caras', 'deforma vehículo', 'cámara loca', 'demasiado quieto', 'perfecto'];

async function recipePayload() {
  const service = createServiceSupabase();
  const { data, error } = await service
    .from('video_lab_settings')
    .select('template_id, model, duration, previous, video_prompt_templates(name, slug)')
    .eq('id', 1)
    .maybeSingle();
  if (error) return { model: null as string | null, duration: null as number | null, active: false };
  const tpl = (data as { video_prompt_templates?: { name?: string; slug?: string } | { name?: string; slug?: string }[] | null } | null)
    ?.video_prompt_templates;
  const row = Array.isArray(tpl) ? tpl[0] : tpl;
  return {
    model: (data?.model as string | null) ?? null,
    duration: (data?.duration as number | null) ?? null,
    template_id: data?.template_id ?? null,
    template_name: row?.name ?? null,
    active: Boolean(data?.template_id),
    previous: data?.previous ?? null,
  };
}

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get('view');
  if (view === 'recipe') {
    const auth = await createServerSupabase();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    return NextResponse.json(await recipePayload());
  }

  const gate = await requireLabAdmin();
  if ('error' in gate && gate.error) return gate.error;
  const { user, service } = gate as { user: { id: string }; service: ReturnType<typeof createServiceSupabase> };

  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q) {
    const { data, error } = await service
      .from('content_item_visuals')
      .select('id, label, visual_brief, image_url, edited_image_url, updated_at, content_items!inner(scheduled_date, idea, projects!inner(name))')
      .eq('image_status', 'ready')
      .not('image_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(80);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const needle = q.toLowerCase();
    const visuals = (data || [])
      .map((v: any) => {
        const item = Array.isArray(v.content_items) ? v.content_items[0] : v.content_items;
        const project = Array.isArray(item?.projects) ? item.projects[0] : item?.projects;
        return {
          id: v.id,
          label: v.label,
          brief: v.visual_brief,
          image_url: v.edited_image_url || v.image_url,
          date: item?.scheduled_date,
          idea: item?.idea,
          project: project?.name,
        };
      })
      .filter(v => `${v.project || ''} ${v.idea || ''} ${v.label || ''} ${v.date || ''}`.toLowerCase().includes(needle))
      .slice(0, 24);
    return NextResponse.json({ visuals });
  }

  const [sets, items, templates, runs, clips, settings] = await Promise.all([
    service.from('video_lab_sets').select('*').order('created_at', { ascending: false }),
    service.from('video_lab_set_items').select('*').order('sort_order'),
    service.from('video_prompt_templates').select('*').order('created_at'),
    service.from('video_lab_runs').select('*').order('created_at', { ascending: false }).limit(30),
    service.from('video_lab_clips').select('*').order('created_at', { ascending: false }).limit(200),
    service.from('video_lab_settings').select('*, video_prompt_templates(name, slug, system_prompt)').eq('id', 1).maybeSingle(),
  ]);
  const missing = [sets.error, items.error, templates.error, runs.error, clips.error, settings.error].find(Boolean);
  if (missing) {
    return NextResponse.json(
      { error: `Falta la migración 036 o no se puede leer el laboratorio: ${missing.message}` },
      { status: 500 },
    );
  }

  const apiKey = await resolveProviderKey(user.id, 'runway', process.env.RUNWAYML_API_SECRET);
  const balance = apiKey ? await getRunwayCreditBalance(apiKey) : null;
  const sessionId = request.nextUrl.searchParams.get('session') || '';
  let session_spent = 0;
  if (sessionId) {
    const ids = (runs.data || []).filter(r => r.session_id === sessionId).map(r => r.id);
    session_spent = (clips.data || [])
      .filter(c => ids.includes(c.run_id) && (c.status === 'generating' || c.status === 'ready'))
      .reduce((s, c) => s + (c.cost_credits || 0), 0);
  }

  return NextResponse.json({
    sets: sets.data,
    items: items.data,
    templates: templates.data,
    runs: runs.data,
    clips: clips.data,
    settings: settings.data,
    balance,
    session_spent,
    models: ['gen4.5', 'gen4_turbo'],
    tags: HUMAN_TAGS,
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireLabAdmin();
  if ('error' in gate && gate.error) return gate.error;
  const { user, service } = gate as { user: { id: string }; service: ReturnType<typeof createServiceSupabase> };
  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  if (body.action === 'create_set') {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: 'Ponle un nombre al set' }, { status: 400 });
    const { data, error } = await service.from('video_lab_sets').insert({ name, created_by: user.id }).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ set: data });
  }

  if (body.action === 'delete_set') {
    const { error } = await service.from('video_lab_sets').delete().eq('id', body.set_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'add_item') {
    const setId = String(body.set_id || '');
    const { count } = await service.from('video_lab_set_items').select('id', { count: 'exact', head: true }).eq('set_id', setId);
    if ((count || 0) >= 6) return NextResponse.json({ error: 'Un set admite como máximo 6 imágenes' }, { status: 400 });
    const image = String(body.image_url || '').trim();
    if (!/^https:\/\//i.test(image)) return NextResponse.json({ error: 'La imagen tiene que ser una URL https' }, { status: 400 });
    const { data, error } = await service
      .from('video_lab_set_items')
      .insert({
        set_id: setId,
        sort_order: count || 0,
        image_url: image,
        visual_brief: String(body.visual_brief || '').slice(0, 2000),
        expectation: String(body.expectation || '').slice(0, 400),
        source_visual_id: body.source_visual_id || null,
        label: String(body.label || '').slice(0, 120),
      })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  if (body.action === 'update_item') {
    const patch: Record<string, string> = {};
    if (typeof body.expectation === 'string') patch.expectation = body.expectation.slice(0, 400);
    if (typeof body.visual_brief === 'string') patch.visual_brief = body.visual_brief.slice(0, 2000);
    if (typeof body.label === 'string') patch.label = body.label.slice(0, 120);
    const { error } = await service.from('video_lab_set_items').update(patch).eq('id', body.item_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove_item') {
    const { error } = await service.from('video_lab_set_items').delete().eq('id', body.item_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'launch') {
    const setId = String(body.set_id || '');
    const models = (Array.isArray(body.models) ? body.models : []).filter((m: string) => labModel(m)) as RunwayVideoModel[];
    const durations = (Array.isArray(body.durations) ? body.durations : [5]).map(Number).filter((d: number) => d === 5 || d === 10);
    const templateIds = (Array.isArray(body.template_ids) ? body.template_ids : []).filter((id: unknown) => typeof id === 'string');
    const ratio = body.ratio === '1280:720' ? '1280:720' : '720:1280';
    const budget = Math.max(1, Math.min(10000, Number(body.budget_credits) || 600));
    const sessionBudget = Math.max(budget, Math.min(10000, Number(body.session_budget_credits) || 600));
    const sessionId = String(body.session_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: 'Sesión no válida' }, { status: 400 });
    const kind = body.kind === 'optimize' ? 'optimize' : 'matrix';
    const maxRounds = kind === 'optimize' ? Math.max(1, Math.min(5, Number(body.max_rounds) || 3)) : 1;
    if (!models.length || !durations.length || !templateIds.length) {
      return NextResponse.json({ error: 'Elige modelo, duración y al menos una plantilla' }, { status: 400 });
    }
    const { data: items } = await service.from('video_lab_set_items').select('id').eq('set_id', setId);
    if (!items?.length) return NextResponse.json({ error: 'El set no tiene imágenes' }, { status: 400 });
    if (items.length > 6) return NextResponse.json({ error: 'Máximo 6 imágenes por set' }, { status: 400 });
    for (const model of models) for (const duration of durations) assertLabVariant(model, duration, ratio);

    let credits = 0;
    for (const model of models) {
      const cps = labModel(model)!.creditsPerSecond;
      for (const duration of durations) credits += cps * duration * items.length * templateIds.length;
    }
    if (credits > budget) {
      return NextResponse.json(
        { error: `Esta matriz son ${credits} créditos ($${(credits * 0.01).toFixed(2)}) y el tope de la ronda es ${budget}.` },
        { status: 400 },
      );
    }
    const { data: prevRuns } = await service.from('video_lab_runs').select('id').eq('session_id', sessionId);
    const prevIds = (prevRuns || []).map(r => r.id);
    let already = 0;
    if (prevIds.length) {
      const { data: prevClips } = await service.from('video_lab_clips').select('cost_credits, status').in('run_id', prevIds);
      already = (prevClips || [])
        .filter(c => c.status === 'generating' || c.status === 'ready')
        .reduce((s, c) => s + (c.cost_credits || 0), 0);
    }
    if (already + credits > sessionBudget) {
      return NextResponse.json(
        { error: `La sesión lleva ${already} créditos. Con esta ronda se pasaría del tope (${sessionBudget}).` },
        { status: 400 },
      );
    }

    const seed = body.seed === '' || body.seed == null ? null : Number(body.seed);
    const { data: run, error } = await service
      .from('video_lab_runs')
      .insert({
        set_id: setId,
        session_id: sessionId,
        round: 1,
        kind,
        budget_credits: budget,
        session_budget_credits: sessionBudget,
        max_rounds: maxRounds,
        status: 'queued',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error || !run) return NextResponse.json({ error: error?.message || 'No se pudo crear la ronda' }, { status: 500 });
    const rows = [];
    for (const item of items) {
      for (const model of models) {
        for (const duration of durations) {
          for (const templateId of templateIds) {
            rows.push({
              run_id: run.id,
              set_item_id: item.id,
              model,
              duration,
              ratio,
              seed: Number.isFinite(seed) ? seed : null,
              seed_sent: false,
              template_id: templateId,
              status: 'queued',
            });
          }
        }
      }
    }
    const { error: clipErr } = await service.from('video_lab_clips').insert(rows);
    if (clipErr) return NextResponse.json({ error: clipErr.message }, { status: 500 });
    return NextResponse.json({ run_id: run.id, clips: rows.length, credits });
  }

  if (body.action === 'rate') {
    const score = Number(body.score);
    if (!(score >= 1 && score <= 5)) return NextResponse.json({ error: 'La nota es de 1 a 5' }, { status: 400 });
    const tags = (Array.isArray(body.tags) ? body.tags : []).filter((t: string) => HUMAN_TAGS.includes(t));
    const { error } = await service
      .from('video_lab_clips')
      .update({
        human_score: score,
        human_tags: tags,
        human_comment: String(body.comment || '').slice(0, 400),
      })
      .eq('id', body.clip_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'metrics') {
    const metrics = body.metrics;
    if (!metrics || typeof metrics.movimiento !== 'number') {
      return NextResponse.json({ error: 'Métricas no válidas' }, { status: 400 });
    }
    const { error } = await service
      .from('video_lab_clips')
      .update({
        metrics: {
          movimiento: metrics.movimiento,
          fidelidad: metrics.fidelidad,
          estabilidad: metrics.estabilidad,
        },
      })
      .eq('id', body.clip_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'judge') {
    const frames = (Array.isArray(body.frames) ? body.frames : []).filter((f: string) => typeof f === 'string' && f.startsWith('data:image')).slice(0, 6);
    if (frames.length < 3) return NextResponse.json({ error: 'Hacen falta fotogramas del clip' }, { status: 400 });
    const { data: clip } = await service
      .from('video_lab_clips')
      .select('id, prompt_final, set_item_id')
      .eq('id', body.clip_id)
      .maybeSingle();
    if (!clip) return NextResponse.json({ error: 'Clip no encontrado' }, { status: 404 });
    const { data: item } = await service
      .from('video_lab_set_items')
      .select('image_url, expectation, visual_brief')
      .eq('id', clip.set_item_id)
      .maybeSingle();
    const images = [item?.image_url, ...frames].filter(Boolean) as string[];
    const { data } = await callAI<AiJudgment>(
      'Eres supervisor de clips imagen-a-vídeo para reels. La primera imagen es el fotograma original. Las siguientes son fotogramas del clip, en orden. ' +
        'Puntúa del 1 al 10: movimiento_real (no un zoom muerto), coherencia_fisica (manos, caras, ruedas, objetos que no se deforman), fidelidad_marca (logos, texto y producto intactos), cumple_prompt, calidad_cinematografica. ' +
        'fallos: lista corta en español. sugerencia: una frase para mejorar el prompt de movimiento. ' +
        'Responde SOLO JSON con esas claves.',
      `Qué debería pasar: ${item?.expectation || 'movimiento natural sin deformar el producto'}\nBrief: ${(item?.visual_brief || '').slice(0, 500)}\nPrompt enviado: ${clip.prompt_final || ''}`,
      { userId: user.id, temperature: 0.2, maxTokens: 700, inputImages: images },
    );
    const judgment = {
      movimiento_real: Number(data?.movimiento_real) || 0,
      coherencia_fisica: Number(data?.coherencia_fisica) || 0,
      fidelidad_marca: Number(data?.fidelidad_marca) || 0,
      cumple_prompt: Number(data?.cumple_prompt) || 0,
      calidad_cinematografica: Number(data?.calidad_cinematografica) || 0,
      fallos: Array.isArray(data?.fallos) ? data.fallos.map(String).slice(0, 6) : [],
      sugerencia: String(data?.sugerencia || '').slice(0, 400),
    };
    await service.from('video_lab_clips').update({ ai_judgment: judgment }).eq('id', clip.id);
    return NextResponse.json({ judgment, media: aiMean(judgment) });
  }

  if (body.action === 'apply') {
    const templateId = String(body.template_id || '');
    const model = labModel(String(body.model || '')) ? String(body.model) : null;
    const duration = Number(body.duration) === 10 ? 10 : 5;
    const { data: current } = await service.from('video_lab_settings').select('*').eq('id', 1).maybeSingle();
    const { error } = await service.from('video_lab_settings').upsert({
      id: 1,
      template_id: templateId || null,
      model,
      duration,
      previous: current
        ? { template_id: current.template_id, model: current.model, duration: current.duration }
        : null,
      updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'revert') {
    const { data: current } = await service.from('video_lab_settings').select('previous').eq('id', 1).maybeSingle();
    const prev = (current?.previous || null) as { template_id?: string | null; model?: string | null; duration?: number | null } | null;
    const { error } = await service
      .from('video_lab_settings')
      .update({
        template_id: prev?.template_id ?? null,
        model: prev?.model ?? null,
        duration: prev?.duration ?? null,
        previous: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
