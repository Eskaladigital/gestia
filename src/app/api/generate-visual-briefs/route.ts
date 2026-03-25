import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { buildSingleVisualPrompt, decomposePostIntoVisuals, callAI, type VisualBriefInput } from '@/lib/ai';
import type { SingleVisualAIResponse, ContentItem } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        post: briefInput,
      });
    }
  }

  return queue;
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
    const { project_id, content_item_ids } = body as {
      project_id?: string;
      content_item_ids?: string[];
    };

    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { data: project } = await fetchActiveProjectForUser(supabase, user.id, project_id);
    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    let query = supabase
      .from('content_items')
      .select('*')
      .eq('project_id', project_id)
      .order('scheduled_date', { ascending: true });

    if (Array.isArray(content_item_ids) && content_item_ids.length > 0) {
      query = query.in('id', content_item_ids);
    } else {
      query = query.or('visual_brief.is.null,visual_brief.eq.');
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
          controller.enqueue(encoder.encode(sseMessage('complete', { totalUpdated: 0, totalExpected: 0, totalVisuals: 0, message: 'No hay publicaciones pendientes de brief visual' })));
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

    const visualQueue = buildVisualQueue(posts);
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
          totalVisuals: visualQueue.length,
        });

        let totalUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
        let visualsDone = 0;
        let postsCompleted = 0;
        let aborted = false;

        const postVisualResults = new Map<string, Array<{ index: number; label: string; brief: string; prompt: string }>>();

        try {
          for (const job of visualQueue) {
            if (signal.aborted) { aborted = true; break; }

            send('progress', {
              phase: 'visual_start',
              visualsDone,
              totalVisuals: visualQueue.length,
              postIdea: job.postIdea.slice(0, 80),
              postFormat: job.postFormat,
              label: job.label,
              visualIndex: job.visualIndex,
              totalVisualsForPost: job.totalVisualsForPost,
            });

            const { system, user: userPrompt } = buildSingleVisualPrompt(project, {
              post: job.post,
              visualIndex: job.visualIndex,
              totalVisuals: job.totalVisualsForPost,
              label: job.label,
              slideContext: job.slideContext,
            });

            const aiResponse = await callAI<SingleVisualAIResponse>(system, userPrompt, {
              agentKey: 'generate_visual_briefs',
              userId: user.id,
            });

            if (signal.aborted) { aborted = true; break; }

            if (aiResponse.usage) {
              totalUsage = totalUsage
                ? {
                    prompt_tokens: (totalUsage.prompt_tokens ?? 0) + (aiResponse.usage.prompt_tokens ?? 0),
                    completion_tokens: (totalUsage.completion_tokens ?? 0) + (aiResponse.usage.completion_tokens ?? 0),
                    total_tokens: (totalUsage.total_tokens ?? 0) + (aiResponse.usage.total_tokens ?? 0),
                  }
                : { ...aiResponse.usage };
            }

            const vPrompt = clip(aiResponse.data?.visual_prompt);
            const vBrief = clip(aiResponse.data?.visual_brief);

            if (!vPrompt) {
              console.warn(`[generate-visual-briefs] Empty prompt for ${job.contentItemId} visual ${job.visualIndex}`);
              visualsDone++;
              send('progress', {
                phase: 'visual_done',
                visualsDone,
                totalVisuals: visualQueue.length,
                label: job.label,
                warning: 'La IA devolvió un prompt vacío para este visual',
              });
              continue;
            }

            const { error: upsertError } = await supabase
              .from('content_item_visuals')
              .upsert({
                content_item_id: job.contentItemId,
                visual_index: job.visualIndex,
                label: job.label,
                visual_prompt: vPrompt,
                visual_brief: vBrief || null,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'content_item_id,visual_index' });

            if (upsertError) {
              console.error(`[generate-visual-briefs] upsert error for ${job.contentItemId}[${job.visualIndex}]:`, upsertError);
            }

            if (!postVisualResults.has(job.contentItemId)) {
              postVisualResults.set(job.contentItemId, []);
            }
            postVisualResults.get(job.contentItemId)!.push({
              index: job.visualIndex,
              label: job.label,
              brief: vBrief,
              prompt: vPrompt,
            });

            visualsDone++;

            const isLastVisualForPost = job.visualIndex === job.totalVisualsForPost - 1;
            if (isLastVisualForPost) {
              const results = postVisualResults.get(job.contentItemId) || [];
              results.sort((a, b) => a.index - b.index);

              const combinedBrief = results.map(r => `### ${r.label}\n${r.brief}`).join('\n\n');
              const combinedPrompt = results.map(r => `--- ${r.label} ---\n${r.prompt}`).join('\n\n');

              await supabase
                .from('content_items')
                .update({
                  visual_brief: clip(combinedBrief),
                  visual_prompt: clip(combinedPrompt),
                })
                .eq('id', job.contentItemId);

              postsCompleted++;
            }

            send('progress', {
              phase: 'visual_done',
              visualsDone,
              totalVisuals: visualQueue.length,
              postsCompleted,
              totalPosts: posts.length,
              label: job.label,
              postIdea: job.postIdea.slice(0, 80),
              usage: totalUsage,
            });
          }

          send(aborted ? 'cancelled' : 'complete', {
            totalUpdated: postsCompleted,
            totalExpected: posts.length,
            totalVisuals: visualQueue.length,
            visualsDone,
            usage: totalUsage,
          });

        } catch (error: unknown) {
          console.error('[generate-visual-briefs] Error in stream:', error);
          const message = error instanceof Error ? error.message : 'Error interno';
          send('error', { error: message, totalUpdated: postsCompleted, visualsDone });
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
