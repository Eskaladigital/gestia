import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Project, UserRole } from '@/types';
import { fetchProjectForDashboard, isDeletedAtColumnError } from '@/lib/supabase/project-queries';

const DEFAULT_MAX_PROJECTS = 1;

/** Normaliza el rol guardado en BD (mayúsculas, espacios, etc.) */
export function normalizeUserRole(role: unknown): UserRole | null {
  if (typeof role !== 'string') return null;
  const r = role.trim().toLowerCase();
  if (r === 'admin' || r === 'agency' || r === 'user') return r as UserRole;
  return null;
}

export function isAdminRole(role: unknown): boolean {
  return normalizeUserRole(role) === 'admin';
}

/** Tras login/registro: usuarios normales → app; administradores → área /administrator */
export const POST_LOGIN_PATH_USER = '/dashboard';
export const POST_LOGIN_PATH_ADMIN = '/administrator/dashboard';

export function postLoginPathForRole(isAdminUser: boolean): string {
  return isAdminUser ? POST_LOGIN_PATH_ADMIN : POST_LOGIN_PATH_USER;
}

export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error && process.env.NODE_ENV === 'development') {
    console.warn('[getUserProfile]', error.message, userId);
  }
  return (data as Profile | null) ?? null;
}

export async function isAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const profile = await getUserProfile(supabase, userId);
  return isAdminRole(profile?.role);
}

export async function requireAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile> {
  const profile = await getUserProfile(supabase, userId);
  if (!profile || !isAdminRole(profile.role)) {
    throw new Error('FORBIDDEN');
  }
  return profile;
}

/** Dueño del proyecto o administrador: puede operar sobre cualquier ficha. */
export function canActOnOwnedProject(
  userId: string,
  ownerId: string | null | undefined,
  userIsAdmin: boolean
): boolean {
  return userIsAdmin || (!!ownerId && ownerId === userId);
}

/** Carga un proyecto activo si el usuario es dueño o admin. */
export async function fetchAccessibleProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  select: string = '*'
): Promise<{ project: Project | null; error: PostgrestError | null; userIsAdmin: boolean }> {
  const userIsAdmin = await isAdmin(supabase, userId);
  const { data, error } = await fetchProjectForDashboard(
    supabase,
    userId,
    projectId,
    userIsAdmin,
    select
  );
  return { project: data, error, userIsAdmin };
}

export interface UserLimits {
  maxProjects: number;
  currentProjects: number;
  canCreateProject: boolean;
  planName: string | null;
  isFreemium: boolean;
  isAdmin: boolean;
  trialActive: boolean;
  trialExpiresAt: string | null;
  trialExpired: boolean;
}

export async function getUserLimits(
  supabase: SupabaseClient,
  userId: string,
  opts?: { profile?: Profile | null }
): Promise<UserLimits> {
  const [profile, projectCountRes, subRes] = await Promise.all([
    opts?.profile !== undefined
      ? Promise.resolve(opts.profile)
      : getUserProfile(supabase, userId),
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null),
    supabase
      .from('user_subscriptions')
      .select('plan_id, status, expires_at, subscription_plans(name, max_projects)')
      .eq('user_id', userId)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  let currentProjects = projectCountRes.count ?? 0;
  if (projectCountRes.error && isDeletedAtColumnError(projectCountRes.error)) {
    const fallback = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    currentProjects = fallback.count ?? 0;
  }

  const admin = isAdminRole(profile?.role);
  const freemium = Boolean(profile?.is_freemium);

  if (admin || freemium) {
    return {
      maxProjects: 999,
      currentProjects,
      canCreateProject: true,
      planName: admin ? 'Admin' : 'Freemium',
      isFreemium: freemium,
      isAdmin: admin,
      trialActive: false,
      trialExpiresAt: null,
      trialExpired: false,
    };
  }

  const sub = (subRes.data as any[])?.[0];
  const plan = sub?.subscription_plans;
  const maxProjects = plan?.max_projects ?? DEFAULT_MAX_PROJECTS;

  const isTrial = sub?.status === 'trial';
  const trialExpiresAt: string | null = isTrial ? (sub?.expires_at ?? null) : null;
  const trialExpired = isTrial && trialExpiresAt ? new Date(trialExpiresAt) < new Date() : false;

  const isActive = sub?.status === 'active';

  return {
    maxProjects,
    currentProjects,
    canCreateProject: !trialExpired && (isActive || isTrial) && currentProjects < maxProjects,
    planName: plan?.name ?? null,
    isFreemium: false,
    isAdmin: false,
    trialActive: isTrial && !trialExpired,
    trialExpiresAt,
    trialExpired,
  };
}

/** Lightweight check for middleware: does this user have only an expired trial? */
export async function isTrialExpired(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_freemium')
    .eq('id', userId)
    .maybeSingle();

  if (isAdminRole(profile?.role) || profile?.is_freemium) return false;

  const { data: activeSub } = await supabase
    .from('user_subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);

  if (activeSub && activeSub.length > 0) return false;

  const { data: trialSub } = await supabase
    .from('user_subscriptions')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'trial')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!trialSub || trialSub.length === 0) return false;

  const expires = trialSub[0].expires_at;
  if (!expires) return false;

  return new Date(expires) < new Date();
}
