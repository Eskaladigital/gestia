import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { ImageAesthetic, Project } from '@/types';
import type { ProjectPipelineAggregates, StrategyForPipeline } from '@/lib/projects/pipeline';

function countRowsByProjectId(rows: { project_id: string }[] | null): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows ?? []) {
    m[r.project_id] = (m[r.project_id] ?? 0) + 1;
  }
  return m;
}

type ProjectFetchResult = { data: Project | null; error: PostgrestError | null };

/** PostgREST/Postgres cuando la migración de papelera (deleted_at) no está aplicada. */
export function isDeletedAtColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message || '').toLowerCase();
  const c = String(error.code || '');
  return c === '42703' || m.includes('deleted_at');
}

/** PostgREST cuando la migración 009 (monthly_fee) no está aplicada en el proyecto de Supabase. */
export function isMonthlyFeeColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message || '').toLowerCase();
  return m.includes('monthly_fee') && (m.includes('schema cache') || m.includes('could not find'));
}

/** PostgREST cuando la migración 010 (ai_rules) no está aplicada. */
export function isAiRulesColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message || '').toLowerCase();
  return m.includes('ai_rules') && (m.includes('schema cache') || m.includes('could not find'));
}

/** PostgREST cuando la migración 022 (image_orientation) no está aplicada. */
export function isImageOrientationColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message || '').toLowerCase();
  const c = String(error.code || '');
  return c === '42703' || (m.includes('image_orientation') && (m.includes('schema cache') || m.includes('could not find') || m.includes('column')));
}

/** PostgREST cuando la migración 029 (sells_physical_product) no está aplicada. */
export function isSellsPhysicalProductColumnError(error: { message?: string } | null | undefined): boolean {
  const m = (error?.message || '').toLowerCase();
  return m.includes('sells_physical_product') && (m.includes('schema cache') || m.includes('could not find') || m.includes('column'));
}

/** PostgREST cuando la migración 031 (visual_creative_direction) no está aplicada. */
export function isVisualCreativeDirectionColumnError(error: { message?: string } | null | undefined): boolean {
  const m = (error?.message || '').toLowerCase();
  return m.includes('visual_creative_direction') && (m.includes('schema cache') || m.includes('could not find') || m.includes('column'));
}

/** PostgREST cuando la migración 032 (image_aesthetic) no está aplicada. */
export function isImageAestheticColumnError(error: { message?: string } | null | undefined): boolean {
  const m = (error?.message || '').toLowerCase();
  return m.includes('image_aesthetic') && (m.includes('schema cache') || m.includes('could not find') || m.includes('column'));
}

/** PostgREST cuando la migración 025 (physical_constraints) no está aplicada. */
export function isPhysicalConstraintsColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message || '').toLowerCase();
  return m.includes('physical_constraints') && (m.includes('schema cache') || m.includes('could not find') || m.includes('column'));
}

/** Metadatos de generación de imagen; tolera BD sin migración 029 (sells_physical_product). */
export async function fetchProjectImageGenerationMeta(
  service: SupabaseClient,
  projectId: string
): Promise<{
  sellsPhysicalProduct: boolean | null;
  physicalConstraints: string | null;
  imageAesthetic: ImageAesthetic;
}> {
  let sellsPhysicalProduct: boolean | null = null;
  let physicalConstraints: string | null = null;
  let imageAesthetic: ImageAesthetic = 'profesional';

  const { data, error } = await service
    .from('projects')
    .select('sells_physical_product, physical_constraints, image_aesthetic')
    .eq('id', projectId)
    .maybeSingle();

  if (error && isImageAestheticColumnError(error)) {
    const retry = await service
      .from('projects')
      .select('sells_physical_product, physical_constraints')
      .eq('id', projectId)
      .maybeSingle();
    if (retry.error && isSellsPhysicalProductColumnError(retry.error)) {
      const retry2 = await service
        .from('projects')
        .select('physical_constraints')
        .eq('id', projectId)
        .maybeSingle();
      if (
        retry2.data &&
        typeof retry2.data.physical_constraints === 'string' &&
        retry2.data.physical_constraints.trim()
      ) {
        physicalConstraints = retry2.data.physical_constraints.trim();
      }
      return { sellsPhysicalProduct: null, physicalConstraints, imageAesthetic };
    }
    if (retry.data) {
      if (typeof retry.data.sells_physical_product === 'boolean') {
        sellsPhysicalProduct = retry.data.sells_physical_product;
      }
      if (typeof retry.data.physical_constraints === 'string' && retry.data.physical_constraints.trim()) {
        physicalConstraints = retry.data.physical_constraints.trim();
      }
    }
    return { sellsPhysicalProduct, physicalConstraints, imageAesthetic };
  }

  if (error && isSellsPhysicalProductColumnError(error)) {
    const retry = await service
      .from('projects')
      .select('physical_constraints')
      .eq('id', projectId)
      .maybeSingle();
    if (
      retry.data &&
      typeof retry.data.physical_constraints === 'string' &&
      retry.data.physical_constraints.trim()
    ) {
      physicalConstraints = retry.data.physical_constraints.trim();
    }
    return { sellsPhysicalProduct: null, physicalConstraints, imageAesthetic };
  }

  if (error) {
    console.warn('[fetchProjectImageGenerationMeta]', error.message);
    return { sellsPhysicalProduct: null, physicalConstraints: null, imageAesthetic };
  }

  if (data) {
    if (typeof data.sells_physical_product === 'boolean') {
      sellsPhysicalProduct = data.sells_physical_product;
    }
    if (typeof data.physical_constraints === 'string' && data.physical_constraints.trim()) {
      physicalConstraints = data.physical_constraints.trim();
    }
    const raw = data.image_aesthetic;
    if (raw === 'ugc' || raw === 'lifestyle' || raw === 'profesional') {
      imageAesthetic = raw;
    }
  }

  return { sellsPhysicalProduct, physicalConstraints, imageAesthetic };
}

export async function fetchUserProjectsList(client: SupabaseClient, userId: string) {
  const activeRes = await client
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (activeRes.error && isDeletedAtColumnError(activeRes.error)) {
    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) return { active: [] as Project[], trashed: [] as Project[] };
    return { active: (data ?? []) as Project[], trashed: [] };
  }

  if (activeRes.error) {
    return { active: [] as Project[], trashed: [] as Project[] };
  }

  const trashedRes = await client
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
    .order('updated_at', { ascending: false });

  const trashed =
    trashedRes.error && isDeletedAtColumnError(trashedRes.error) ? [] : (trashedRes.data ?? []);

  return { active: (activeRes.data ?? []) as Project[], trashed: trashed as Project[] };
}

/** Conteos y última estrategia por proyecto (para badge «Listo» en listas alineado con la ficha). */
export async function fetchPipelineAggregatesForProjects(
  client: SupabaseClient,
  projectIds: string[]
): Promise<ProjectPipelineAggregates> {
  const empty: ProjectPipelineAggregates = {
    latestStrategyByProject: {},
    scrapedCountByProject: {},
    competitorCountByProject: {},
    contentCountByProject: {},
  };
  if (projectIds.length === 0) return empty;

  const [strategiesRes, scrapedRes, competitorsRes, contentRes] = await Promise.all([
    client
      .from('strategies')
      .select(
        'project_id, created_at, content_pillars, value_proposition, tone_guidelines, web_site_analysis, competitor_analysis'
      )
      .in('project_id', projectIds)
      .order('created_at', { ascending: false }),
    client.from('scraped_content').select('project_id').in('project_id', projectIds),
    client.from('competitors').select('project_id').in('project_id', projectIds),
    client.from('content_items').select('project_id').in('project_id', projectIds),
  ]);

  const latestStrategyByProject: Record<string, StrategyForPipeline> = {};
  if (strategiesRes.data) {
    for (const row of strategiesRes.data) {
      const pid = row.project_id as string;
      if (latestStrategyByProject[pid] === undefined) {
        latestStrategyByProject[pid] = row as StrategyForPipeline;
      }
    }
  }

  return {
    latestStrategyByProject,
    scrapedCountByProject: countRowsByProjectId(scrapedRes.data),
    competitorCountByProject: countRowsByProjectId(competitorsRes.data),
    contentCountByProject: countRowsByProjectId(contentRes.data),
  };
}

export async function fetchActiveProjectForUser(
  client: SupabaseClient,
  userId: string,
  projectId: string,
  select: string = '*'
): Promise<ProjectFetchResult> {
  let res = await client
    .from('projects')
    .select(select)
    .eq('id', projectId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (res.error && isDeletedAtColumnError(res.error)) {
    res = await client
      .from('projects')
      .select(select)
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
  }

  return {
    data: res.data as Project | null,
    error: res.error,
  };
}

/** Propietario del proyecto o administrador (RLS debe permitir SELECT a admin en `projects`). */
export async function fetchProjectForDashboard(
  client: SupabaseClient,
  userId: string,
  projectId: string,
  isAdmin: boolean,
  select: string = '*'
): Promise<ProjectFetchResult> {
  if (isAdmin) {
    return fetchActiveProjectByIdForSession(client, projectId, select);
  }
  return fetchActiveProjectForUser(client, userId, projectId, select);
}

/** Cliente con RLS: solo id de proyecto (el usuario viene de la sesión). */
export async function fetchActiveProjectByIdForSession(
  client: SupabaseClient,
  projectId: string,
  select: string = '*'
): Promise<ProjectFetchResult> {
  let res = await client
    .from('projects')
    .select(select)
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();

  if (res.error && isDeletedAtColumnError(res.error)) {
    res = await client.from('projects').select(select).eq('id', projectId).maybeSingle();
  }

  return {
    data: res.data as Project | null,
    error: res.error,
  };
}
