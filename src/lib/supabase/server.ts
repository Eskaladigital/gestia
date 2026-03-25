import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Cookie set in Server Component — ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Cookie remove in Server Component — ignore
          }
        },
      },
    }
  );
}

export function createServiceSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    }
  );
}

/** Marca el proyecto en error cuando falla un paso del pipeline de IA (RLS: mismo cliente de sesión). */
export async function markProjectPipelineError(
  supabase: SupabaseClient,
  projectId: string | undefined | null
): Promise<void> {
  if (!projectId) return;
  const { error } = await supabase.from('projects').update({ status: 'error' }).eq('id', projectId);
  if (error) console.error('[markProjectPipelineError]', error.message);
}
