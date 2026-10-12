import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/openai-client';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/roles';
import { clipFinal, type AiJudgment } from '@/lib/video/lab-score';
import { renderMotionPrompt } from '@/lib/video/motion';
import {
  assertLabVariant,
  checkRunwayTask,
  createRunwayTask,
  ensureVisualAssetsBucket,
  labModel,
  resolveProviderKey,
} from '@/lib/video/runway';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'visual-assets';

async function authorize(request: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') || '';
  if (cron && header === `Bearer ${cron}`) return { cron: true as const, userId: null as string | null };
  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user || !(await isAdmin(auth, user.id))) return null;
  return { cron: false as const, userId: user.id };
}

type ClipRow = {
  id: string;
  run_id: string;
  set_item_id: string;
  model: string;
  duration: number;
  ratio: string;
  seed: number | null;
  template_id: string | null;
  prompt_final: string | null;
  task_id: string | null;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  cost_credits: number;
  ai_judgment: AiJudgment | null;
  human_score: number | null;
  started_at: string | null;
};

type RunRow = {
  id: string;
  set_id: string;
  session_id: string;
  round: number;
  parent_run_id: string | null;
  kind: string;
  budget_credits: number;
  session_budget_credits: number;
  spent_credits: number;
  max_rounds: number;
  status: string;
  best_score: number | null;
  model_lock: string | null;
  created_by: string | null;
};

async function sessionSpent(service: ReturnType<typeof createServiceSupabase>, sessionId: string) {
  const { data: runs } = await service.from('video_lab_runs').select('id').eq('session_id', sessionId);
  const ids = (runs || []).map(r => r.id);
  if (!ids.length) return 0;
  const { data: clips } = await service.from('video_lab_clips').select('cost_credits, status').in('run_id', ids);
  return (clips || [])
    .filter(c => c.status === 'generating' || c.status === 'ready' || (c.status === 'error' && (c.cost_credits || 0) > 0))
    .reduce((s, c) => s + (c.cost_credits || 0), 0);
}

async function finishRun(service: ReturnType<typeof createServiceSupabase>, run: RunRow) {
  const { data: clips } = await service.from('video_lab_clips').select('*').eq('run_id', run.id);
  const list = (clips || []) as ClipRow[];
  if (list.some(c => c.status === 'queued' || c.status === 'generating')) return;
  const waiting = list.filter(c => c.status === 'ready' && !c.ai_judgment && c.human_score == null);
  if (waiting.length && run.kind === 'optimize') return;

  const scores = list.map(c => clipFinal(c)).filter((n): n is number => n != null);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const byModel = new Map<string, number[]>();
  const byTemplate = new Map<string, number[]>();
  for (const c of list) {
    const s = clipFinal(c);
    if (s == null) continue;
    byModel.set(c.model, [...(byModel.get(c.model) || []), s]);
    if (c.template_id) byTemplate.set(c.template_id, [...(byTemplate.get(c.template_id) || []), s]);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const bestModel = [...byModel.entries()].sort((a, b) => avg(b[1]) - avg(a[1]))[0]?.[0] || list[0]?.model;
  const bestTemplate = [...byTemplate.entries()].sort((a, b) => avg(b[1]) - avg(a[1]))[0]?.[0] || null;

  if (run.kind !== 'optimize' || run.round >= run.max_rounds) {
    await service
      .from('video_lab_runs')
      .update({ status: 'done', best_score: mean, stop_reason: 'Ronda terminada', updated_at: new Date().toISOString() })
      .eq('id', run.id);
    return;
  }

  let prevBest: number | null = null;
  if (run.parent_run_id) {
    const { data: prev } = await service.from('video_lab_runs').select('best_score').eq('id', run.parent_run_id).maybeSingle();
    prevBest = prev?.best_score != null ? Number(prev.best_score) : null;
  }
  if (prevBest != null && mean != null && mean - prevBest < 0.3) {
    await service
      .from('video_lab_runs')
      .update({
        status: 'stopped',
        best_score: mean,
        stop_reason: 'La mejora es menor de 0,3 puntos',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return;
  }

  const spent = await sessionSpent(service, run.session_id);
  const remain = run.session_budget_credits - spent;
  const duration = list[0]?.duration || 5;
  const ratio = list[0]?.ratio || '720:1280';
  const unit = (labModel(bestModel)?.creditsPerSecond || 5) * duration;
  if (remain < unit) {
    await service
      .from('video_lab_runs')
      .update({
        status: 'stopped',
        best_score: mean,
        stop_reason: 'Presupuesto de la sesión agotado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return;
  }

  const { data: items } = await service.from('video_lab_set_items').select('id').eq('set_id', run.set_id);
  const itemIds = (items || []).map(i => i.id);
  const slots = Math.max(1, Math.floor(remain / unit));
  const maxTemplates = Math.max(1, Math.floor(slots / Math.max(1, itemIds.length)) - 1);

  const digest = list
    .map(c => {
      const j = c.ai_judgment;
      return `modelo ${c.model} plantilla ${c.template_id} nota ${clipFinal(c)?.toFixed(1) ?? 's/n'} fallos ${(j?.fallos || []).join('; ')} sugerencia ${j?.sugerencia || ''}`;
    })
    .join('\n')
    .slice(0, 4000);

  let born: { name: string; system_prompt: string; notes?: string }[] = [];
  try {
    const { data } = await callAI<{ templates: { name: string; system_prompt: string; notes?: string }[] }>(
      'Eres editor de prompts de imagen-a-vídeo. Lees puntuaciones y fallos y propones plantillas mejores. ' +
        'Cada system_prompt es en inglés, pide UN prompt corto, prohíbe deformar vehículo, logos y manos, y acaba pidiendo JSON {"prompt": string}. ' +
        'Responde SOLO JSON: {"templates":[{"name":string,"system_prompt":string,"notes":string}]}.',
      `Mejor plantilla hasta ahora: ${bestTemplate || 'n/d'}.\nResultados:\n${digest}\n\nPropón ${Math.min(3, Math.max(1, maxTemplates))} plantillas nuevas, mutaciones de lo que mejor ha funcionado.`,
      { userId: run.created_by || undefined, temperature: 0.5, maxTokens: 1200 },
    );
    born = (data?.templates || []).filter(t => t?.system_prompt && t?.name).slice(0, 3);
  } catch (err) {
    console.error('[video-lab] mutación:', err);
  }

  const newIds: string[] = [];
  for (let i = 0; i < born.length && newIds.length < maxTemplates; i++) {
    const t = born[i];
    const { data: row } = await service
      .from('video_prompt_templates')
      .insert({
        slug: `opt-${run.id.slice(0, 8)}-${run.round}-${i}`,
        name: t.name.slice(0, 80),
        version: run.round + 1,
        system_prompt: t.system_prompt,
        notes: t.notes || 'Mutación del optimizador',
        parent_id: bestTemplate,
        is_seed: false,
      })
      .select('id')
      .single();
    if (row?.id) newIds.push(row.id);
  }
  const templateIds = [...new Set([...(bestTemplate ? [bestTemplate] : []), ...newIds])];
  const planned = itemIds.length * templateIds.length;
  if (!planned || planned * unit > remain) {
    await service
      .from('video_lab_runs')
      .update({
        status: 'stopped',
        best_score: mean,
        stop_reason: 'No cabe otra ronda en el presupuesto',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return;
  }

  const { data: next } = await service
    .from('video_lab_runs')
    .insert({
      set_id: run.set_id,
      session_id: run.session_id,
      round: run.round + 1,
      parent_run_id: run.id,
      kind: 'optimize',
      budget_credits: planned * unit,
      session_budget_credits: run.session_budget_credits,
      max_rounds: run.max_rounds,
      status: 'queued',
      model_lock: bestModel,
      created_by: run.created_by,
    })
    .select('id')
    .single();
  if (!next?.id) return;
  const rows = [];
  for (const setItemId of itemIds) {
    for (const templateId of templateIds) {
      rows.push({
        run_id: next.id,
        set_item_id: setItemId,
        model: bestModel,
        duration,
        ratio,
        template_id: templateId,
        status: 'queued',
        seed_sent: false,
      });
    }
  }
  await service.from('video_lab_clips').insert(rows);
  await service
    .from('video_lab_runs')
    .update({ status: 'done', best_score: mean, stop_reason: 'Pasó a la ronda siguiente', updated_at: new Date().toISOString() })
    .eq('id', run.id);
}

export async function GET(request: NextRequest) {
  const who = await authorize(request);
  if (!who) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const service = createServiceSupabase();

  const { data: generating } = await service
    .from('video_lab_clips')
    .select('*')
    .eq('status', 'generating')
    .limit(8);
  let saved = 0;
  for (const clip of (generating || []) as ClipRow[]) {
    if (!clip.task_id) continue;
    const { data: run } = await service.from('video_lab_runs').select('created_by').eq('id', clip.run_id).maybeSingle();
    const userId = run?.created_by || who.userId || '';
    const apiKey = await resolveProviderKey(userId, 'runway', process.env.RUNWAYML_API_SECRET);
    if (!apiKey) continue;
    try {
      const check = await checkRunwayTask(apiKey, clip.task_id);
      if (check.state === 'running') continue;
      if (check.state === 'failed') {
        await service
          .from('video_lab_clips')
          .update({ status: 'error', failure: check.reason.slice(0, 500), finished_at: new Date().toISOString() })
          .eq('id', clip.id);
        continue;
      }
      if (saved >= 2) continue;
      const dl = await fetch(check.outputUrl);
      if (!dl.ok) throw new Error(`Descarga ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      await ensureVisualAssetsBucket();
      const path = `video-lab/${clip.id}.mp4`;
      const { error: upErr } = await service.storage.from(BUCKET).upload(path, buf, { contentType: 'video/mp4', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
      await service
        .from('video_lab_clips')
        .update({
          status: 'ready',
          video_url: pub.publicUrl,
          failure: null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', clip.id);
      saved += 1;
    } catch (err: any) {
      const status = err?.status;
      if (status === 429 || status >= 500) continue;
      console.error('[video-lab] check', clip.id, err?.message || err);
    }
  }

  const busyModels = new Set(
    ((await service.from('video_lab_clips').select('model').eq('status', 'generating')).data || []).map(c => c.model as string),
  );

  const { data: queued } = await service
    .from('video_lab_clips')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(20);

  const startedModels = new Set<string>();
  for (const clip of (queued || []) as ClipRow[]) {
    if (busyModels.has(clip.model) || startedModels.has(clip.model)) continue;
    if (clip.next_attempt_at && Date.parse(clip.next_attempt_at) > Date.now()) continue;
    const { data: run } = await service.from('video_lab_runs').select('*').eq('id', clip.run_id).maybeSingle();
    if (!run || run.status === 'stopped' || run.status === 'done') continue;
    const row = run as RunRow;
    const modelInfo = labModel(clip.model);
    if (!modelInfo) {
      await service.from('video_lab_clips').update({ status: 'error', failure: 'Modelo no admitido' }).eq('id', clip.id);
      continue;
    }
    const cost = modelInfo.creditsPerSecond * clip.duration;
    const spentSession = await sessionSpent(service, row.session_id);
    const spentRun = row.spent_credits || 0;
    if (spentSession + cost > row.session_budget_credits || spentRun + cost > row.budget_credits) {
      await service
        .from('video_lab_runs')
        .update({ status: 'stopped', stop_reason: 'Presupuesto alcanzado', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      await service
        .from('video_lab_clips')
        .update({ status: 'error', failure: 'Fuera de presupuesto: no se ha lanzado' })
        .eq('run_id', row.id)
        .eq('status', 'queued');
      continue;
    }

    const { data: item } = await service
      .from('video_lab_set_items')
      .select('image_url, visual_brief, expectation')
      .eq('id', clip.set_item_id)
      .maybeSingle();
    const { data: tpl } = clip.template_id
      ? await service.from('video_prompt_templates').select('system_prompt').eq('id', clip.template_id).maybeSingle()
      : { data: null };
    if (!item?.image_url || !tpl?.system_prompt) {
      await service.from('video_lab_clips').update({ status: 'error', failure: 'Falta imagen o plantilla' }).eq('id', clip.id);
      continue;
    }

    let prompt = clip.prompt_final;
    if (!prompt) {
      prompt = await renderMotionPrompt({
        systemPrompt: tpl.system_prompt,
        brief: item.visual_brief || '',
        expectation: item.expectation,
        userId: row.created_by || who.userId || undefined,
      });
      await service.from('video_lab_clips').update({ prompt_final: prompt }).eq('id', clip.id);
    }

    const apiKey = await resolveProviderKey(row.created_by || who.userId || '', 'runway', process.env.RUNWAYML_API_SECRET);
    if (!apiKey) {
      await service.from('video_lab_clips').update({ status: 'error', failure: 'No hay API key de Runway' }).eq('id', clip.id);
      continue;
    }
    try {
      assertLabVariant(clip.model, clip.duration, clip.ratio);
      const taskId = await createRunwayTask({
        apiKey,
        prompt,
        imageUrl: item.image_url,
        ratio: clip.ratio,
        model: clip.model as 'gen4.5' | 'gen4_turbo',
        duration: clip.duration,
        seed: clip.seed,
        allowSeed: modelInfo.supportsSeed,
      });
      await service
        .from('video_lab_clips')
        .update({
          status: 'generating',
          task_id: taskId,
          prompt_final: prompt,
          seed_sent: modelInfo.supportsSeed && clip.seed != null,
          cost_credits: cost,
          started_at: new Date().toISOString(),
          failure: null,
        })
        .eq('id', clip.id);
      await service
        .from('video_lab_runs')
        .update({
          status: 'running',
          spent_credits: spentRun + cost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      startedModels.add(clip.model);
      busyModels.add(clip.model);
    } catch (err: any) {
      const status = Number(err?.status || 0);
      const attempts = (clip.attempts || 0) + 1;
      if ((status === 429 || status >= 500) && attempts < 4) {
        await service
          .from('video_lab_clips')
          .update({
            attempts,
            failure: String(err?.message || 'Reintento').slice(0, 300),
            next_attempt_at: new Date(Date.now() + 20_000).toISOString(),
          })
          .eq('id', clip.id);
      } else {
        await service
          .from('video_lab_clips')
          .update({
            status: 'error',
            attempts,
            failure: String(err?.message || 'Error').slice(0, 500),
            finished_at: new Date().toISOString(),
          })
          .eq('id', clip.id);
      }
    }
  }

  const { data: openRuns } = await service.from('video_lab_runs').select('*').in('status', ['queued', 'running']).limit(6);
  for (const run of (openRuns || []) as RunRow[]) {
    await finishRun(service, run);
  }

  return NextResponse.json({ ok: true, started: startedModels.size, saved });
}
