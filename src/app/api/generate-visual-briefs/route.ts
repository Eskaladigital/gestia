import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { buildVisualBriefsPrompt, callAI } from '@/lib/ai';
import type { VisualBriefGeneration, ContentItem } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;

function clipBrief(text: unknown, max = 4000): string {
  const s = typeof text === 'string' ? text.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
}

function sseMessage(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
      // Respond via SSE since the client expects it now
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseMessage('complete', { totalUpdated: 0, totalExpected: 0, message: 'No hay publicaciones pendientes de brief visual' })));
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

    const signal = request.signal;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(sseMessage(event, data)));
          } catch { /* stream closed */ }
        };

        const totalBatches = Math.ceil(posts.length / BATCH_SIZE);
        send('init', { totalPosts: posts.length, totalBatches, batchSize: BATCH_SIZE });

        let totalUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
        let totalUpdated = 0;
        let aborted = false;

        try {
          for (let i = 0; i < posts.length; i += BATCH_SIZE) {
            if (signal.aborted) {
              aborted = true;
              break;
            }

            const batch = posts.slice(i, i + BATCH_SIZE);
            const currentBatchIdx = Math.floor(i / BATCH_SIZE);

            send('progress', {
              phase: 'batch_start',
              batchIndex: currentBatchIdx,
              totalBatches,
              postsInBatch: batch.length,
            });

            const briefInputs = batch.map(p => ({
              id: p.id,
              scheduled_date: p.scheduled_date,
              format: p.format,
              content_type: p.content_type,
              idea: p.idea,
              copy: p.copy,
              cta: p.cta,
              post_goal: p.post_goal,
              production_specs: p.production_specs,
            }));

            const { system, user: userPrompt } = buildVisualBriefsPrompt(project, briefInputs);

            const aiResponse = await callAI<VisualBriefGeneration>(system, userPrompt, {
              agentKey: 'generate_visual_briefs',
              userId: user.id,
            });

            if (signal.aborted) {
              aborted = true;
              break;
            }

            if (aiResponse.usage) {
              totalUsage = totalUsage
                ? {
                    prompt_tokens: (totalUsage.prompt_tokens ?? 0) + (aiResponse.usage.prompt_tokens ?? 0),
                    completion_tokens: (totalUsage.completion_tokens ?? 0) + (aiResponse.usage.completion_tokens ?? 0),
                    total_tokens: (totalUsage.total_tokens ?? 0) + (aiResponse.usage.total_tokens ?? 0),
                  }
                : { ...aiResponse.usage };
            }

            if (!aiResponse.data?.briefs || !Array.isArray(aiResponse.data.briefs)) {
              console.warn('[generate-visual-briefs] La IA no devolvió briefs válidos para batch', currentBatchIdx);
              send('progress', {
                phase: 'batch_done',
                batchIndex: currentBatchIdx,
                totalBatches,
                updatedInBatch: 0,
                totalUpdated,
                warning: 'La IA no devolvió datos válidos para este lote'
              });
              continue;
            }

            const briefMap = new Map<string, { visual_brief: string; visual_prompt: string }>();
            for (const b of aiResponse.data.briefs) {
              const id = typeof b.content_item_id === 'string' ? b.content_item_id.trim() : '';
              if (!id) continue;
              briefMap.set(id, {
                visual_brief: clipBrief(b.visual_brief),
                visual_prompt: clipBrief(b.visual_prompt, 2000),
              });
            }

            let updatedInBatch = 0;
            for (const post of batch) {
              const brief = briefMap.get(post.id);
              if (!brief) continue;

              const { error: updateError } = await supabase
                .from('content_items')
                .update({
                  visual_brief: brief.visual_brief,
                  visual_prompt: brief.visual_prompt,
                })
                .eq('id', post.id);

              if (updateError) {
                console.error(`[generate-visual-briefs] update error for ${post.id}:`, updateError);
              } else {
                updatedInBatch++;
                totalUpdated++;
              }
            }

            send('progress', {
              phase: 'batch_done',
              batchIndex: currentBatchIdx,
              totalBatches,
              updatedInBatch,
              totalUpdated,
              usage: totalUsage
            });
          }

          send(aborted ? 'cancelled' : 'complete', {
            totalUpdated,
            totalExpected: posts.length,
            usage: totalUsage,
          });

        } catch (error: unknown) {
          console.error('[generate-visual-briefs] Error in stream:', error);
          const message = error instanceof Error ? error.message : 'Error interno';
          send('error', { error: message, totalUpdated });
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
