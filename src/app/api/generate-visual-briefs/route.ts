import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchAccessibleProject } from '@/lib/auth/roles';
import { buildSingleVisualPrompt, buildFeedNeighborDigest, decomposePostIntoVisuals, lockedSpacePromptSuffix, callAI, type VisualBriefInput, type FeedNeighborSource } from '@/lib/ai';
import {
  countProductReferenceImages,
  countStyleReferenceImages,
  type ReferenceGuidanceInput,
} from '@/lib/projects/reference-images-shared';
import { listProjectReferenceImages } from '@/lib/projects/reference-images';
import type { SingleVisualAIResponse, ContentItem } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;
/** Reintentos por visual ante fallos transitorios de la IA (timeout, rate limit, JSON vacío). */
const MAX_VISUAL_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function clip(text: unknown, max = 6000): string {
  const s = typeof text === 'string' ? text.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
}

function sseMessage(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface VisualJob {
  contentItemId: string;
  postIdea: string;
  postFormat: string | null;
  visualIndex: number;
  totalVisualsForPost: number;
  label: string;
  slideContext?: string;
  globalCarouselSummary?: string;
  previousSlideContext?: string;
  nextSlideContext?: string;
  siblingShotCards?: string[];
  lockedSpace?: string;
  post: VisualBriefInput;
}

function buildVisualQueue(posts: ContentItem[]): VisualJob[] {
  const queue: VisualJob[] = [];

  for (const post of posts) {
    const briefInput: VisualBriefInput = {
      id: post.id,
      scheduled_date: post.scheduled_date,
      format: post.format,
      content_type: post.content_type,
      idea: post.idea,
      copy: post.copy,
      cta: post.cta,
      post_goal: post.post_goal,
      production_specs: post.production_specs,
    };

    const visuals = decomposePostIntoVisuals(briefInput);

    for (let i = 0; i < visuals.length; i++) {
      queue.push({
        contentItemId: post.id,
        postIdea: post.idea,
        postFormat: post.format,
        visualIndex: i,
        totalVisualsForPost: visuals.length,
        label: visuals[i].label,
        slideContext: visuals[i].slideContext,
        globalCarouselSummary: visuals[i].globalCarouselSummary,
        previousSlideContext: visuals[i].previousSlideContext,
        nextSlideContext: visuals[i].nextSlideContext,
        siblingShotCards: visuals[i].siblingShotCards,
        lockedSpace: visuals[i].lockedSpace,
        post: briefInput,
      });
    }
  }

  return queue;
}

interface VisualResult {
  contentItemId: string;
  visualIndex: number;
  label: string;
  totalVisualsForPost: number;
  prompt: string;
  brief: string | null;
}

function buildReferenceCaptionCatalog(
  images: Array<{ reference_role?: string | null; caption?: string | null; product_identity?: string | null }>
): string {
  if (!images.length) return '';
  const lines = images.map((image, idx) => {
    const role = image.reference_role && image.reference_role !== 'pending' ? image.reference_role : 'ref';
    const identity = (image.product_identity || '').trim();
    const caption = (image.caption || '').trim().slice(0, 220);
    return `${idx + 1}. [${role}]${identity ? ` ${identity}.` : ''}${caption ? ` ${caption}` : ''}`;
  });
  return [
    '## FICHAS DE LAS FOTOS DE REFERENCIA (texto; no adjuntamos las fotos aquí)',
    `Lee las ${images.length}. Extrae forma del producto o licencia de estilo según el rol. NO copies el gesto de una foto (mano presentando, carro, bancada) salvo que ESTE slide lo pida.`,
    ...lines,
  ].join('\n');
}

async function processOneVisual(
  job: VisualJob,
  project: any,
  userId: string,
  referenceGuidance: ReferenceGuidanceInput,
  referenceCatalog: string,
  supabase: any,
  feedNeighbors: ReturnType<typeof buildFeedNeighborDigest> | null,
): Promise<VisualResult | null> {
  const built = buildSingleVisualPrompt(project, {
    post: job.post,
    visualIndex: job.visualIndex,
    totalVisuals: job.totalVisualsForPost,
    label: job.label,
    slideContext: job.slideContext,
    globalCarouselSummary: job.globalCarouselSummary,
    previousSlideContext: job.previousSlideContext,
    nextSlideContext: job.nextSlideContext,
    siblingShotCards: job.siblingShotCards,
    feedNeighbors,
    lockedSpace: job.lockedSpace,
  }, referenceGuidance);
  const { system, agentKey } = built;
  const userPrompt = referenceCatalog
    ? `${built.user}\n\n${referenceCatalog}`
    : built.user;

  // Reintento automático: ante un fallo transitorio de la IA o un prompt vacío,
  // se reintenta con pequeña espera creciente, en vez de descartar el visual.
  let vPrompt = '';
  for (let attempt = 1; attempt <= MAX_VISUAL_ATTEMPTS; attempt++) {
    try {
      const aiResponse = await callAI<SingleVisualAIResponse>(system, userPrompt, {
        agentKey,
        userId,
        maxTokens: 4096,
      });

      const rawData = aiResponse.data as unknown as Record<string, unknown> | null;
      vPrompt = clip(rawData?.visual_prompt);

      if (!vPrompt && rawData) {
        const firstStringValue = Object.values(rawData).find(v => typeof v === 'string' && v.length > 50);
        if (firstStringValue) {
          console.warn(`[generate-visual-briefs] visual_prompt not found, using first long string field. Keys: ${Object.keys(rawData).join(',')}`);
          vPrompt = clip(firstStringValue);
        }
      }

      if (vPrompt) break;
      console.warn(`[generate-visual-briefs] Empty prompt for ${job.contentItemId}[${job.visualIndex}] (intento ${attempt}/${MAX_VISUAL_ATTEMPTS}).`);
    } catch (err) {
      console.warn(`[generate-visual-briefs] AI error ${job.contentItemId}[${job.visualIndex}] (intento ${attempt}/${MAX_VISUAL_ATTEMPTS}):`, err instanceof Error ? err.message : err);
    }
    if (attempt < MAX_VISUAL_ATTEMPTS) await sleep(700 * attempt);
  }

  if (!vPrompt) {
    console.warn(`[generate-visual-briefs] Visual descartado tras ${MAX_VISUAL_ATTEMPTS} intentos: ${job.contentItemId}[${job.visualIndex}].`);
    return null;
  }

  vPrompt = `${vPrompt}${lockedSpacePromptSuffix(job.lockedSpace || '')}`;

  const { error: upsertErr } = await supabase
    .from('content_item_visuals')
    .upsert({
      content_item_id: job.contentItemId,
      visual_index: job.visualIndex,
      label: job.label,
      visual_prompt: vPrompt,
      visual_brief: null,
      image_status: 'pending',
      image_url: null,
      image_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'content_item_id,visual_index' });
  if (upsertErr) {
    console.error('[generate-visual-briefs] upsert to content_item_visuals failed:', upsertErr);
    return null;
  }

  return {
    contentItemId: job.contentItemId,
    visualIndex: job.visualIndex,
    label: job.label,
    totalVisualsForPost: job.totalVisualsForPost,
    prompt: vPrompt,
    brief: null,
  };
}

async function finalizeCompletedPosts(
  batchJobs: VisualJob[],
  postVisualResults: Map<string, Array<{ index: number; label: string; prompt: string }>>,
  postVisualsAttempted: Map<string, number>,
  completedPostIds: Set<string>,
  fullQueue: VisualJob[],
  supabase: any,
): Promise<string[]> {
  const newlyCompleted: string[] = [];

  const postIds = new Set(batchJobs.map(j => j.contentItemId));
  for (const postId of postIds) {
    if (completedPostIds.has(postId)) continue;

    const totalVisualsForPost = fullQueue.filter(v => v.contentItemId === postId).length;
    const attemptedForPost = postVisualsAttempted.get(postId) || 0;

    if (attemptedForPost >= totalVisualsForPost) {
      const postResults = postVisualResults.get(postId) || [];
      postResults.sort((a, b) => a.index - b.index);

      if (postResults.length > 0) {
        const combinedPrompt = postResults.map(r => `--- ${r.label} ---\n${r.prompt}`).join('\n\n');
        const { error: updateErr } = await supabase
          .from('content_items')
          .update({ visual_brief: null, visual_prompt: clip(combinedPrompt) })
          .eq('id', postId);
        if (updateErr) {
          console.error(`[generate-visual-briefs] update content_items error for ${postId}:`, updateErr);
        }
      }

      completedPostIds.add(postId);
      newlyCompleted.push(postId);
    }
  }

  return newlyCompleted;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { project_id, content_item_ids, batch_offset, batch_size } = body as {
      project_id?: string;
      content_item_ids?: string[];
      batch_offset?: number;
      batch_size?: number;
    };

    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { project } = await fetchAccessibleProject(supabase, user.id, project_id);
    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const referenceImages = await listProjectReferenceImages(supabase, project_id);
    const referenceCatalog = buildReferenceCaptionCatalog(referenceImages);
    const referenceGuidance: ReferenceGuidanceInput = {
      sellsPhysicalProduct: project.sells_physical_product ?? null,
      productReferenceCount: countProductReferenceImages(referenceImages),
      styleReferenceCount: countStyleReferenceImages(referenceImages),
    };

    let query = supabase
      .from('content_items')
      .select('*')
      .eq('project_id', project_id)
      .order('scheduled_date', { ascending: true });

    if (Array.isArray(content_item_ids) && content_item_ids.length > 0) {
      query = query.in('id', content_item_ids);
    } else {
      query = query.or('visual_prompt.is.null,visual_prompt.eq.');
    }

    const { data: items, error: fetchError } = await query;
    if (fetchError) {
      console.error('[generate-visual-briefs] fetch error:', fetchError);
      return NextResponse.json({ error: 'Error al cargar publicaciones' }, { status: 500 });
    }

    const posts = (items as ContentItem[]) || [];
    if (posts.length === 0) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseMessage('complete', { totalUpdated: 0, totalExpected: 0, totalVisuals: 0, visualsDone: 0, message: 'No hay publicaciones pendientes de brief visual' })));
          controller.close();
        }
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const dates = posts.map(p => p.scheduled_date).filter(Boolean).sort();
    const firstMonth = dates[0]?.slice(0, 7);
    const lastMonth = dates[dates.length - 1]?.slice(0, 7);
    const from = firstMonth ? `${firstMonth}-01` : dates[0];
    const to = lastMonth
      ? (() => {
          const [y, m] = lastMonth.split('-').map(Number);
          const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return `${lastMonth}-${String(lastDay).padStart(2, '0')}`;
        })()
      : undefined;
    let neighborSources: FeedNeighborSource[] = posts.map(p => ({
      id: p.id,
      scheduled_date: p.scheduled_date,
      format: p.format,
      idea: p.idea,
      production_specs: p.production_specs,
    }));
    try {
      let neighborQuery = supabase
        .from('content_items')
        .select('id, scheduled_date, format, idea, production_specs')
        .eq('project_id', project_id)
        .not('scheduled_date', 'is', null)
        .order('scheduled_date', { ascending: true });
      if (from) neighborQuery = neighborQuery.gte('scheduled_date', from);
      if (to) neighborQuery = neighborQuery.lte('scheduled_date', to);
      const { data: monthItems } = await neighborQuery;
      if (monthItems && monthItems.length > 0) {
        neighborSources = monthItems as FeedNeighborSource[];
      }
    } catch {
      /* usamos el lote actual */
    }

    const fullQueue = buildVisualQueue(posts);
    const offset = batch_offset ?? 0;
    const size = batch_size ?? BATCH_SIZE;
    const batchQueue = fullQueue.slice(offset, offset + size);

    const signal = request.signal;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(sseMessage(event, data)));
          } catch { /* stream closed */ }
        };

        send('init', {
          totalPosts: posts.length,
          totalVisuals: fullQueue.length,
          batchOffset: offset,
          batchSize: batchQueue.length,
        });

        let visualsDone = 0;
        let visualsSaved = 0;
        let postsCompleted = 0;
        let globalPostsCompleted = 0;
        let aborted = false;

        const postVisualResults = new Map<string, Array<{ index: number; label: string; prompt: string }>>();
        const postVisualsAttempted = new Map<string, number>();
        const completedPostIds = new Set<string>();

        // Load existing results from previous batches for posts that span batches
        const postIdsInBatch = new Set(batchQueue.map(j => j.contentItemId));
        for (const postId of postIdsInBatch) {
          try {
            const { data: existingVisuals } = await supabase
              .from('content_item_visuals')
              .select('visual_index, label, visual_prompt')
              .eq('content_item_id', postId)
              .not('visual_prompt', 'is', null);

            if (existingVisuals && existingVisuals.length > 0) {
              const results = existingVisuals.map((v: any) => ({
                index: v.visual_index,
                label: v.label || `Visual ${v.visual_index + 1}`,
                prompt: v.visual_prompt,
              }));
              postVisualResults.set(postId, results);
              postVisualsAttempted.set(postId, results.length);
            }
          } catch { /* ignore */ }
        }

        try {
          for (let i = 0; i < batchQueue.length; i++) {
            if (signal.aborted) { aborted = true; break; }

            const job = batchQueue[i];
            const globalIndex = offset + i;

            send('progress', {
              phase: 'visual_start',
              visualsDone: offset + visualsDone,
              totalVisuals: fullQueue.length,
              postIdea: job.postIdea.slice(0, 80),
              postFormat: job.postFormat,
              label: job.label,
              current: globalIndex + 1,
            });

            let result: VisualResult | null = null;
            try {
              result = await processOneVisual(
                job,
                project,
                user.id,
                referenceGuidance,
                referenceCatalog,
                supabase,
                neighborSources.length
                  ? buildFeedNeighborDigest(neighborSources, job.contentItemId)
                  : null
              );
            } catch (err) {
              console.error(`[generate-visual-briefs] Failed visual ${job.contentItemId}[${job.visualIndex}]:`, err);
            }

            visualsDone++;
            postVisualsAttempted.set(job.contentItemId, (postVisualsAttempted.get(job.contentItemId) || 0) + 1);

            if (signal.aborted) { aborted = true; break; }

            if (result) {
              visualsSaved++;
              if (!postVisualResults.has(result.contentItemId)) {
                postVisualResults.set(result.contentItemId, []);
              }
              const arr = postVisualResults.get(result.contentItemId)!;
              const existingIdx = arr.findIndex(r => r.index === result.visualIndex);
              const next = {
                index: result.visualIndex,
                label: result.label,
                prompt: result.prompt,
              };
              if (existingIdx >= 0) arr[existingIdx] = next;
              else arr.push(next);
            }

            const newlyCompleted = await finalizeCompletedPosts(
              [job], postVisualResults, postVisualsAttempted, completedPostIds, fullQueue, supabase
            );
            postsCompleted += newlyCompleted.length;

            if (newlyCompleted.length > 0) {
              try {
                const { count } = await supabase
                  .from('content_items')
                  .select('*', { count: 'exact', head: true })
                  .eq('project_id', posts[0]?.project_id)
                  .not('visual_prompt', 'is', null)
                  .neq('visual_prompt', '');
                if (count !== null) globalPostsCompleted = count;
              } catch { globalPostsCompleted = postsCompleted; }
            }

            send('progress', {
              phase: 'visual_done',
              visualsDone: offset + visualsDone,
              totalVisuals: fullQueue.length,
              postsCompleted: globalPostsCompleted || postsCompleted,
              totalPosts: posts.length,
              label: job.label,
              postIdea: job.postIdea.slice(0, 80),
            });
          }

          const nextOffset = offset + visualsDone;
          const hasMore = nextOffset < fullQueue.length;

          if (!aborted && batchQueue.length > 0 && visualsSaved === 0) {
            send('error', {
              error: 'La IA no ha podido guardar ningún prompt de este lote. Revisa Config IA o reinténtalo; no se ha escrito nada.',
              totalUpdated: postsCompleted,
              visualsDone: offset + visualsDone,
            });
            try { controller.close(); } catch { /* ignore */ }
            return;
          }

          globalPostsCompleted = postsCompleted;
          try {
            const { count } = await supabase
              .from('content_items')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', posts[0]?.project_id)
              .not('visual_prompt', 'is', null)
              .neq('visual_prompt', '');
            if (count !== null) globalPostsCompleted = count;
          } catch { /* fallback: se mantiene postsCompleted */ }

          send(aborted ? 'cancelled' : 'batch_complete', {
            totalUpdated: globalPostsCompleted,
            totalExpected: posts.length,
            totalVisuals: fullQueue.length,
            batchVisualsDone: visualsDone,
            visualsDone: offset + visualsDone,
            hasMore,
            nextOffset: hasMore ? nextOffset : null,
          });

        } catch (error: unknown) {
          console.error('[generate-visual-briefs] Error in stream:', error);
          const message = error instanceof Error ? error.message : 'Error interno';
          send('error', { error: message, totalUpdated: postsCompleted, visualsDone: offset + visualsDone });
        }

        try { controller.close(); } catch { /* ignore */ }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    console.error('[generate-visual-briefs] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
