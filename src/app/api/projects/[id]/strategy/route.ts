import { NextRequest, NextResponse } from 'next/server';
import { fetchAccessibleProject } from '@/lib/auth/roles';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Json } from '@/types';

type PatchBody = {
  value_proposition?: string | null;
  target_audience?: string | null;
  positioning?: string | null;
  tone_guidelines?: string | null;
  recommendations?: string | null;
  content_pillars?: Json;
  thematic_lines?: Json;
  competitor_analysis?: Json;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = (await request.json()) as PatchBody;

    const { project, error: projErr } = await fetchAccessibleProject(
      supabase,
      user.id,
      projectId,
      'id'
    );

    if (projErr || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const { data: strategy, error: stratErr } = await supabase
      .from('strategies')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stratErr || !strategy) {
      return NextResponse.json({ error: 'No hay estrategia para este proyecto' }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    const str = (k: keyof PatchBody) => {
      if (body[k] !== undefined) update[k as string] = body[k];
    };
    str('value_proposition');
    str('target_audience');
    str('positioning');
    str('tone_guidelines');
    str('recommendations');

    if (body.content_pillars !== undefined) {
      if (!Array.isArray(body.content_pillars)) {
        return NextResponse.json({ error: 'content_pillars debe ser un array' }, { status: 400 });
      }
      update.content_pillars = body.content_pillars;
    }
    if (body.thematic_lines !== undefined) {
      if (!Array.isArray(body.thematic_lines)) {
        return NextResponse.json({ error: 'thematic_lines debe ser un array' }, { status: 400 });
      }
      update.thematic_lines = body.thematic_lines;
    }
    if (body.competitor_analysis !== undefined) {
      if (body.competitor_analysis !== null && typeof body.competitor_analysis !== 'object') {
        return NextResponse.json({ error: 'competitor_analysis debe ser un objeto JSON' }, { status: 400 });
      }
      update.competitor_analysis = body.competitor_analysis;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const { data: updated, error: upErr } = await supabase
      .from('strategies')
      .update(update)
      .eq('id', strategy.id)
      .select()
      .single();

    if (upErr) {
      console.error('[PATCH strategy]', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, strategy: updated });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
