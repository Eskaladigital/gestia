import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/auth/roles';
import { ESKALA_MARKETING_DIGITAL } from '@/lib/utils';
import { LogoutButton } from './LogoutButton';

export default async function TrialExpiredPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_freemium')
    .eq('id', user.id)
    .maybeSingle();

  if (isAdminRole(profile?.role) || profile?.is_freemium) {
    redirect('/dashboard');
  }

  const { data: trialSub } = await supabase
    .from('user_subscriptions')
    .select('plan_id, expires_at, subscription_plans(name)')
    .eq('user_id', user.id)
    .eq('status', 'trial')
    .order('created_at', { ascending: false })
    .limit(1);

  const sub = (trialSub as any[])?.[0];
  const planName = sub?.subscription_plans?.name ?? 'tu plan';
  const expiredAt = sub?.expires_at
    ? new Date(sub.expires_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-surface-50 text-surface-900 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto w-full border-b border-surface-200">
        <Link href="/" className="flex items-center">
          <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-9 w-auto" />
        </Link>
      </nav>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Tu periodo de prueba ha terminado
          </h1>
          <p className="text-surface-500 text-base leading-relaxed mb-2">
            Los 30 dias de prueba gratuita del plan <strong className="text-surface-900">{planName}</strong> han finalizado.
          </p>
          {expiredAt && (
            <p className="text-sm text-surface-400 mb-8">
              Expiro el {expiredAt}
            </p>
          )}

          <div className="bg-white border-2 border-surface-200 rounded-2xl p-8 mb-8">
            <p className="text-sm text-surface-600 leading-relaxed mb-6">
              Para seguir usando Gestia, elige un plan y activa tu suscripcion. Todos tus proyectos y contenido siguen guardados.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-600 text-white font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-brand-700 transition-all"
            >
              Ver planes y activar
            </Link>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-surface-400">
              ¿Necesitas ayuda? Contacta con nosotros en{' '}
              <a href={`mailto:contacto@eskaladigital.com`} className="font-semibold text-surface-600 hover:text-brand-600 transition-colors">
                contacto@eskaladigital.com
              </a>
            </p>
            <LogoutButton />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-200 py-6 px-6 sm:px-10">
        <div className="max-w-7xl mx-auto text-center text-xs text-surface-400">
          <a
            href={ESKALA_MARKETING_DIGITAL.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-surface-500 hover:text-brand-600 transition-colors"
          >
            {ESKALA_MARKETING_DIGITAL.name}
          </a>
          <span className="mx-1.5">·</span>
          <span>{ESKALA_MARKETING_DIGITAL.tagline}</span>
        </div>
      </footer>
    </div>
  );
}
