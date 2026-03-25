import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isDeletedAtColumnError, isMonthlyFeeColumnError, isAiRulesColumnError } from '@/lib/supabase/project-queries';
import type {
  ClientType,
  CommercialLevel,
  Complexity,
  PrimaryGoal,
  WeeklyFormatDistribution,
} from '@/types';

const CLIENT_TYPES: ClientType[] = ['premium', 'medio', 'low_cost', 'b2b', 'b2c'];
const PRIMARY_GOALS: PrimaryGoal[] = ['ventas', 'leads', 'branding', 'viralidad', 'comunidad'];
const COMMERCIAL_LEVELS: CommercialLevel[] = ['bajo', 'medio', 'alto'];
const COMPLEXITY_LEVELS: Complexity[] = ['basico', 'medio', 'experto'];

type PatchBody = {
  client_type?: ClientType | null;
  primary_goal?: PrimaryGoal | null;
  secondary_goals?: string[];
  commercial_level?: CommercialLevel;
  complexity?: Complexity;
  tone_formality?: number;
  tone_proximity?: number;
  tone_emotion?: number;
  tone_humor?: number;
  tone_disruption?: number;
  weekly_format_distribution?: WeeklyFormatDistribution;
  description?: string | null;
  /** Cliente puede enviar número o string decimal */
  monthly_fee?: number | null | string;
  ai_rules?: string | null;
};

function clampIntTone(n: unknown): number | undefined {
  if (n === undefined) return undefined;
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function parseMonthlyFee(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 999_999.99) return undefined;
  return Math.round(n * 100) / 100;
}

function validateWeeklyDist(d: unknown): WeeklyFormatDistribution | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const keys = ['story', 'carrusel', 'publicacion', 'reel'] as const;
  let sum = 0;
  const out: WeeklyFormatDistribution = { story: 0, carrusel: 0, publicacion: 0, reel: 0 };
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
    out[k] = n;
    sum += n;
  }
  if (sum < 1 || sum > 21) return null;
  return out;
}

/** Actualización parcial de ajustes del proyecto (propietario). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = (await request.json()) as PatchBody;
    const update: Record<string, unknown> = {};

    if (body.client_type !== undefined) {
      if (body.client_type === null) update.client_type = null;
      else if (CLIENT_TYPES.includes(body.client_type)) update.client_type = body.client_type;
      else return NextResponse.json({ error: 'client_type no válido' }, { status: 400 });
    }

    if (body.primary_goal !== undefined) {
      if (body.primary_goal === null) update.primary_goal = null;
      else if (PRIMARY_GOALS.includes(body.primary_goal)) update.primary_goal = body.primary_goal;
      else return NextResponse.json({ error: 'primary_goal no válido' }, { status: 400 });
    }

    if (body.secondary_goals !== undefined) {
      if (!Array.isArray(body.secondary_goals)) {
        return NextResponse.json({ error: 'secondary_goals debe ser un array' }, { status: 400 });
      }
      let primary: string | null | undefined = body.primary_goal ?? undefined;
      if (primary === undefined) {
        const { data: row } = await supabase
          .from('projects')
          .select('primary_goal')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        primary = row?.primary_goal ?? null;
      }
      const cleaned: string[] = [];
      for (const g of body.secondary_goals) {
        if (typeof g !== 'string' || !PRIMARY_GOALS.includes(g as PrimaryGoal)) {
          return NextResponse.json({ error: 'Objetivo secundario no válido' }, { status: 400 });
        }
        if (primary && g === primary) continue;
        if (!cleaned.includes(g)) cleaned.push(g);
      }
      update.secondary_goals = cleaned;
    }

    if (body.commercial_level !== undefined) {
      if (!COMMERCIAL_LEVELS.includes(body.commercial_level)) {
        return NextResponse.json({ error: 'commercial_level no válido' }, { status: 400 });
      }
      update.commercial_level = body.commercial_level;
    }

    if (body.complexity !== undefined) {
      if (!COMPLEXITY_LEVELS.includes(body.complexity)) {
        return NextResponse.json({ error: 'complexity no válida' }, { status: 400 });
      }
      update.complexity = body.complexity;
    }

    const tf = clampIntTone(body.tone_formality);
    if (tf !== undefined) update.tone_formality = tf;
    const tp = clampIntTone(body.tone_proximity);
    if (tp !== undefined) update.tone_proximity = tp;
    const te = clampIntTone(body.tone_emotion);
    if (te !== undefined) update.tone_emotion = te;
    const th = clampIntTone(body.tone_humor);
    if (th !== undefined) update.tone_humor = th;
    const td = clampIntTone(body.tone_disruption);
    if (td !== undefined) update.tone_disruption = td;

    if (body.weekly_format_distribution !== undefined) {
      const dist = validateWeeklyDist(body.weekly_format_distribution);
      if (!dist) {
        return NextResponse.json(
          { error: 'Distribución semanal inválida (enteros ≥0, suma entre 1 y 21)' },
          { status: 400 }
        );
      }
      update.weekly_format_distribution = dist;
      update.posts_per_week = dist.story + dist.carrusel + dist.publicacion + dist.reel;
    }

    if (body.description !== undefined) {
      update.description = body.description === null || body.description === '' ? null : String(body.description).slice(0, 20000);
    }

    if (body.ai_rules !== undefined) {
      update.ai_rules = body.ai_rules === null || body.ai_rules === '' ? null : String(body.ai_rules).slice(0, 10000);
    }

    if (body.monthly_fee !== undefined) {
      const fee = parseMonthlyFee(body.monthly_fee);
      if (fee === undefined && body.monthly_fee !== null && body.monthly_fee !== '') {
        return NextResponse.json({ error: 'monthly_fee no válido' }, { status: 400 });
      }
      if (fee !== undefined) update.monthly_fee = fee;
      else if (body.monthly_fee === null || body.monthly_fee === '') update.monthly_fee = null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    let payload = update;
    const warnings: string[] = [];

    let { data: project, error: upErr } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (upErr && 'monthly_fee' in payload && isMonthlyFeeColumnError(upErr)) {
      const { monthly_fee: _drop, ...rest } = payload;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json(
          { error: 'Falta la columna monthly_fee. Ejecuta supabase/migrations/009_project_monthly_fee.sql.' },
          { status: 503 }
        );
      }
      warnings.push('Los honorarios mensuales no se guardaron (falta columna monthly_fee — migración 009).');
      payload = rest;
      const retry = await supabase.from('projects').update(payload).eq('id', id).eq('user_id', user.id).select().single();
      project = retry.data;
      upErr = retry.error;
    }

    if (upErr && 'ai_rules' in payload && isAiRulesColumnError(upErr)) {
      const { ai_rules: _drop, ...rest } = payload;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json(
          { error: 'Falta la columna ai_rules. Ejecuta supabase/migrations/010_project_ai_rules.sql.' },
          { status: 503 }
        );
      }
      warnings.push('Las reglas IA no se guardaron (falta columna ai_rules — migración 010).');
      payload = rest;
      const retry = await supabase.from('projects').update(payload).eq('id', id).eq('user_id', user.id).select().single();
      project = retry.data;
      upErr = retry.error;
    }

    if (upErr) {
      if (upErr.code === 'PGRST116' || upErr.message?.includes('0 rows')) {
        return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
      }
      console.error('[PATCH projects/:id]', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      project,
      ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Eliminación definitiva (solo si el proyecto ya está en la papelera, salvo que no exista esa columna en BD). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: row, error: fetchErr } = await supabase
      .from('projects')
      .select('deleted_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr && isDeletedAtColumnError(fetchErr)) {
      const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    if (row.deleted_at == null) {
      return NextResponse.json(
        { error: 'Primero mueve el proyecto a la papelera' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
