import { createServerSupabase } from '@/lib/supabase/server';
import { AdminUsersClient } from './AdminUsersClient';

export default async function AdministratorUsersPage() {
  const supabase = await createServerSupabase();

  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  return (
    <div className="w-full">
      <div className="mb-10">
        <p className="text-[10px] font-bold text-surface-900 uppercase tracking-[0.25em] mb-2">Administración</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">
          Gestión de usuarios
        </h1>
        <p className="text-surface-500 mt-2 text-sm font-medium">Administra roles, planes y acceso freemium</p>
      </div>
      <AdminUsersClient plans={plans ?? []} />
    </div>
  );
}
