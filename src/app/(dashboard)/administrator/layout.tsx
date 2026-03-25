import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import { AdministratorSubnav } from '@/components/layout/AdministratorSubnav';

export default async function AdministratorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  try {
    await requireAdmin(supabase, user.id);
  } catch {
    redirect('/dashboard?admin_denied=1');
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-[10px] font-bold text-red-600 uppercase tracking-[0.25em]">Área de administración</p>
      </div>
      <AdministratorSubnav />
      {children}
    </div>
  );
}
