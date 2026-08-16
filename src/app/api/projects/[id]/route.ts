import { NextRequest, NextResponse } from 'next/server';
import { fetchAccessibleProject, isAdmin } from '@/lib/auth/roles';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { listProjectReferenceImages } from '@/lib/projects/reference-images';
import { projectHasManagedProductFidelity } from '@/lib/projects/product-fidelity';
import {
  isDeletedAtColumnError,
  isMonthlyFeeColumnError,
  isAiRulesColumnError,
  isImageOrientationColumnError,
  isPhysicalConstraintsColumnError,
  isSellsPhysicalProductColumnError,
  isVisualCreativeDirectionColumnError,
} from '@/lib/supabase/project-queries';
import type {
  ClientType,
  CommercialLevel,
  Complexity,
  ImageOrientation,
  PrimaryGoal,
  VisualCreativeDirection,
  WeeklyFormatDistribution,
} from '@/types';

const CLIENT_TYPES: ClientType[] = ['premium', 'medio', 'low_cost', 'b2b', 'b2c'];
const PRIMARY_GOALS: PrimaryGoal[] = ['ventas', 'leads', 'branding', 'viralidad', 'comunidad'];
const COMMERCIAL_LEVELS: CommercialLevel[] = ['bajo', 'medio', 'alto'];
const COMPLEXITY_LEVELS: Complexity[] = ['basico', 'medio', 'experto'];
const IMAGE_ORIENTATIONS: ImageOrientation[] = ['vertical', 'cuadrado', 'horizontal'];
const CREATIVE_DIRECTIONS: VisualCreativeDirection[] = ['literal', 'equilibrado', 'disruptivo'];

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
  image_orientation?: ImageOrientation;
  physical_constraints?: string | null;
  /** true = producto físico; false = servicio/agencia; null = auto (IA en estrategia) */
  sells_physical_product?: boolean | null;
  /** Dirección creativa de imágenes IA: literal | equilibrado | disruptivo (null = literal) */
  visual_creative_direction?: VisualCreativeDirection | null;
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

/** Actualización parcial de ajustes del proyecto (propietario o admin). */
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

    const { project: accessible } = await fetchAccessibleProject(supabase, user.id, id, 'id');
    if (!accessible) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const body = (await request.json()) as PatchBody;
    const update: Record<string, unknown> = {};
    const warnings: string[] = [];

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

    if (body.image_orientation !== undefined) {
      if (!IMAGE_ORIENTATIONS.includes(body.image_orientation)) {
        return NextResponse.json(
          { error: 'image_orientation no válida (vertical | cuadrado | horizontal)' },
          { status: 400 }
        );
      }
      update.image_orientation = body.image_orientation;
    }

    if (body.sells_physical_product !== undefined) {
      if (body.sells_physical_product === null) {
        update.sells_physical_product = null;
      } else if (typeof body.sells_physical_product === 'boolean') {
        update.sells_physical_product = body.sells_physical_product;
      } else {
        return NextResponse.json({ error: 'sells_physical_product debe ser boolean o null' }, { status: 400 });
      }
    }

    if (body.visual_creative_direction !== undefined) {
      if (body.visual_creative_direction === null) {
        update.visual_creative_direction = null;
      } else if (CREATIVE_DIRECTIONS.includes(body.visual_creative_direction)) {
        update.visual_creative_direction = body.visual_creative_direction;
      } else {
        return NextResponse.json(
          { error: 'visual_creative_direction no válida (literal | equilibrado | disruptivo)' },
          { status: 400 }
        );
      }
    }

    if (body.physical_constraints !== undefined) {
      const service = createServiceSupabase();
      const referenceImages = await listProjectReferenceImages(service, id);
      let sellsPhysical: boolean | null = null;
      if (body.sells_physical_product !== undefined) {
        sellsPhysical = body.sells_physical_product;
      } else {
        const { data: row, error: sellsErr } = await supabase
          .from('projects')
          .select('sells_physical_product')
          .eq('id', id)
          .maybeSingle();
        if (!sellsErr && row && typeof row.sells_physical_product === 'boolean') {
          sellsPhysical = row.sells_physical_product;
        }
      }
      if (projectHasManagedProductFidelity({ sells_physical_product: sellsPhysical }, referenceImages)) {
        warnings.push(
          'Las reglas físicas del producto las genera y actualiza la app desde las fotos de producto; no se pueden editar manualmente. Usa «Reglas IA» para deseos creativos (p. ej. piscina, atardecer).'
        );
      } else if (body.physical_constraints === null || body.physical_constraints === '') {
        update.physical_constraints = null;
        update.physical_constraints_at = null;
      } else {
        update.physical_constraints = String(body.physical_constraints).slice(0, 20000);
        update.physical_constraints_at = new Date().toISOString();
      }
    }

    if (Object.keys(update).length === 0) {
      if (warnings.length === 0) {
        return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
      }
      const { data: current } = await supabase
        .from('projects')
        .select()
        .eq('id', id)
        .maybeSingle();
      if (!current) {
        return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        project: current,
        warning: warnings.join(' '),
      });
    }

    let payload = update;

    let { data: project, error: upErr } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', id)
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
      const retry = await supabase.from('projects').update(payload).eq('id', id).select().single();
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
      const retry = await supabase.from('projects').update(payload).eq('id', id).select().single();
      project = retry.data;
      upErr = retry.error;
    }

    if (
      upErr &&
      ('physical_constraints' in payload || 'physical_constraints_at' in payload) &&
      isPhysicalConstraintsColumnError(upErr)
    ) {
      const { physical_constraints: _drop1, physical_constraints_at: _drop2, ...rest } = payload;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json(
          {
            error:
              'Falta la columna physical_constraints. Ejecuta supabase/migrations/025_projects_physical_constraints.sql.',
          },
          { status: 503 }
        );
      }
      warnings.push(
        'Las reglas físicas no se guardaron (falta columna physical_constraints — migración 025).'
      );
      payload = rest;
      const retry = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      project = retry.data;
      upErr = retry.error;
    }

    if (upErr && 'image_orientation' in payload && isImageOrientationColumnError(upErr)) {
      const { image_orientation: _drop, ...rest } = payload;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json(
          {
            error:
              'Falta la columna image_orientation. Ejecuta supabase/migrations/022_project_image_orientation.sql.',
          },
          { status: 503 }
        );
      }
      warnings.push(
        'La orientación de imagen no se guardó (falta columna image_orientation — migración 022).'
      );
      payload = rest;
      const retry = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      project = retry.data;
      upErr = retry.error;
    }

    if (upErr && 'visual_creative_direction' in payload && isVisualCreativeDirectionColumnError(upErr)) {
      const { visual_creative_direction: _drop, ...rest } = payload;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json(
          {
            error:
              'Falta la columna visual_creative_direction. Ejecuta supabase/migrations/031_projects_visual_creative_direction.sql.',
          },
          { status: 503 }
        );
      }
      warnings.push(
        'La dirección creativa no se guardó (falta columna visual_creative_direction — migración 031).'
      );
      payload = rest;
      const retry = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      project = retry.data;
      upErr = retry.error;
    }

    if (upErr && 'sells_physical_product' in payload && isSellsPhysicalProductColumnError(upErr)) {
      const { sells_physical_product: _drop, ...rest } = payload;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json(
          {
            error:
              'Falta la columna sells_physical_product. Ejecuta supabase/migrations/029_projects_sells_physical_product.sql.',
          },
          { status: 503 }
        );
      }
      warnings.push(
        'El tipo de negocio (producto vs servicio) no se guardó (falta columna sells_physical_product — migración 029).'
      );
      payload = rest;
      const retry = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
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

    const userIsAdmin = await isAdmin(supabase, user.id);
    let fetchQ = supabase.from('projects').select('deleted_at').eq('id', id);
    if (!userIsAdmin) fetchQ = fetchQ.eq('user_id', user.id);
    const { data: row, error: fetchErr } = await fetchQ.maybeSingle();

    if (fetchErr && isDeletedAtColumnError(fetchErr)) {
      let delQ = supabase.from('projects').delete().eq('id', id);
      if (!userIsAdmin) delQ = delQ.eq('user_id', user.id);
      const { error } = await delQ;
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

    let delQ = supabase.from('projects').delete().eq('id', id);
    if (!userIsAdmin) delQ = delQ.eq('user_id', user.id);
    const { error } = await delQ;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
