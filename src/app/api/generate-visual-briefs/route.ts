import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchActiveProjectForUser } from '@/lib/supabase/project-queries';
import { buildVisualBriefsPrompt, callAI } from '@/lib/ai';
import type { VisualBriefGeneration, ContentItem } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';

const BATCH_SIZE = 10;

function clipBrief(text: unknown, max = 4000): string {
  const s = typeof text === 'string' ? text.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
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
      return NextResponse.json({
        success: true,
        message: 'No hay publicaciones pendientes de brief visual',
        updated: 0,
      });
    }

    let totalUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    let totalUpdated = 0;

    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);

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

      if (aiResponse.usage) {
        totalUsage = totalUsage
          ? {
              prompt_tokens: (totalUsage.prompt_tokens ?? 0) + (aiResponse.usage.prompt_tokens ?? 0),
              completion_tokens: (totalUsage.completion_tokens ?? 0) + (aiResponse.usage.completion_tokens ?? 0),
              total_tokens: (totalUsage.total_tokens ?? 0) + (aiResponse.usage.total_tokens ?? 0),
            }
          : aiResponse.usage;
      }

      if (!aiResponse.data?.briefs || !Array.isArray(aiResponse.data.briefs)) {
        console.warn('[generate-visual-briefs] La IA no devolvió briefs válidos para batch', i);
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
          totalUpdated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated: totalUpdated,
      total: posts.length,
      usage: totalUsage,
    });
  } catch (error: unknown) {
    console.error('[generate-visual-briefs] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
