import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { MarketingNavCenter, MarketingNavActions } from '@/components/layout/MarketingNav';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import type { SubscriptionPlan } from '@/types';

export default async function PricingPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  const plans = (data ?? []) as SubscriptionPlan[];
  const userPlans = plans.filter(p => p.role_required === 'user');
  const agencyPlans = plans.filter(p => p.role_required === 'agency');

  return (
    <div className="min-h-screen bg-surface-50 text-surface-900">
      {/* Nav */}
      <nav className="relative z-50 grid grid-cols-[auto_1fr_auto] items-center px-6 sm:px-10 py-5 max-w-7xl mx-auto border-b border-surface-200 bg-surface-50">
        <Link href="/" className="flex items-center">
          <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-9 w-auto" />
        </Link>
        <div className="flex justify-center min-w-0">
          <MarketingNavCenter />
        </div>
        <MarketingNavActions />
      </nav>

      {/* Hero */}
      <header className="max-w-5xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-12 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-3">Planes y precios</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
          Elige tu <span className="highlight">plan</span>
        </h1>
        <p className="text-base sm:text-lg text-surface-500 max-w-xl mx-auto leading-relaxed font-medium">
          Todos los planes incluyen 30 dias de prueba gratuita. Sin tarjeta de credito, sin compromiso.
        </p>
      </header>

      {/* Trial banner */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-12">
        <div className="bg-brand-600 text-white rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="absolute top-2 right-6 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute bottom-2 left-6 w-28 h-28 bg-white/5 rounded-full blur-3xl" />
          <span className="inline-block text-[10px] font-mono font-bold bg-white/20 text-white px-3 py-1 rounded uppercase tracking-widest mb-4 relative">
            30 dias gratis
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 relative">Prueba cualquier plan gratis</h2>
          <p className="text-brand-100 text-sm max-w-md mx-auto mb-6 relative">
            Registrate y disfruta de 30 dias de prueba gratuita con todas las funcionalidades. Sin tarjeta de credito, sin compromiso.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-700 font-bold text-sm uppercase tracking-wider rounded-full hover:bg-brand-50 transition-all hover:-translate-y-0.5 relative"
          >
            Empezar 30 dias gratis →
          </Link>
        </div>
      </section>

      {/* User plans */}
      {userPlans.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-16">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">Para profesionales</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Planes individuales</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {userPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      )}

      {/* Agency plans */}
      {agencyPlans.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-16">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">Para agencias</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Planes de agencia</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {agencyPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      )}

      {/* No plans fallback */}
      {plans.length === 0 && (
        <section className="max-w-3xl mx-auto px-6 sm:px-10 mb-16 text-center">
          <div className="border-2 border-dashed border-surface-300 rounded-2xl p-12">
            <p className="text-surface-500 font-medium">Los planes se publicaran proximamente.</p>
            <p className="text-sm text-surface-400 mt-2">De momento, disfruta de la beta gratuita.</p>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">Preguntas frecuentes</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-10">Dudas sobre los planes</h2>
          <div className="space-y-6">
            {[
              {
                q: '¿Los 30 dias de prueba son realmente gratis?',
                a: 'Si. Al registrarte tienes 30 dias de acceso completo sin introducir datos de pago. Cuando termine el periodo de prueba podras activar tu plan.',
              },
              {
                q: '¿Que incluye cada proyecto?',
                a: 'Cada proyecto incluye analisis web, estrategia de contenido con IA, calendario editorial y generacion de copies listos para publicar.',
              },
              {
                q: '¿Puedo cambiar de plan despues?',
                a: 'Si. Podras subir o bajar de plan en cualquier momento. Los cambios se aplican de forma inmediata.',
              },
              {
                q: '¿Necesito traer mis propias API keys de IA?',
                a: 'Si. Gestia trabaja con tu propia clave de OpenAI, Anthropic o Google AI. Asi controlas tu gasto y no hay costes ocultos.',
              },
            ].map((faq) => (
              <div key={faq.q} className="border border-surface-200 rounded-xl p-6 hover:bg-surface-100 transition-colors">
                <h3 className="font-display font-bold text-surface-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 pb-20">
        <div className="bg-surface-900 rounded-2xl p-10 sm:p-16 text-center text-white relative overflow-hidden">
          <div className="absolute top-4 right-8 w-24 h-24 bg-brand-500/20 rounded-full blur-2xl" />
          <div className="absolute bottom-4 left-8 w-32 h-32 bg-brand-400/10 rounded-full blur-3xl" />
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4 relative">
            ¿Listo para <span className="highlight text-surface-900">empezar</span>?
          </h2>
          <p className="text-surface-400 mb-8 text-sm max-w-md mx-auto relative">
            Crea tu cuenta gratis y genera tu primera estrategia de contenido en minutos.
          </p>
          <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-600 text-white font-semibold text-sm uppercase tracking-wider rounded-full border-2 border-brand-500 hover:bg-brand-500 transition-all hover:-translate-y-0.5 relative">
            Crear cuenta gratis →
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const isPopular = plan.sort_order === 20 || plan.sort_order === 30;

  return (
    <div className={`relative bg-white border-2 rounded-2xl overflow-hidden transition-all hover:-translate-y-1 ${
      isPopular ? 'border-brand-600 shadow-lg' : 'border-surface-200 shadow-sm hover:shadow-md'
    }`}>
      {isPopular && (
        <div className="bg-brand-600 text-white text-[10px] font-bold uppercase tracking-widest text-center py-1.5">
          Popular
        </div>
      )}
      <div className="p-6 sm:p-8">
        <div className="mb-4">
          <span className="text-[10px] font-mono font-bold bg-surface-100 text-surface-500 px-2 py-1 rounded uppercase tracking-widest">
            {plan.role_required === 'agency' ? 'Agencia' : 'Individual'}
          </span>
        </div>
        <h3 className="font-display text-xl font-bold text-surface-900 mb-1">{plan.name}</h3>
        <p className="text-sm text-surface-500 mb-5 leading-relaxed min-h-[40px]">{plan.description}</p>

        <div className="flex items-baseline gap-1 mb-1">
          <span className="font-display text-4xl font-bold text-surface-900">{plan.price_monthly.toFixed(2).replace('.', ',')}€</span>
          <span className="text-sm text-surface-400 font-medium">/mes</span>
        </div>
        <p className="text-xs text-surface-400 mb-6">IVA no incluido</p>

        <ul className="space-y-3 mb-8 text-sm">
          <li className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span className="text-surface-700 font-medium">Hasta <strong>{plan.max_projects}</strong> {plan.max_projects === 1 ? 'proyecto' : 'proyectos'}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span className="text-surface-700 font-medium">Estrategia IA completa</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span className="text-surface-700 font-medium">Calendario con copies</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span className="text-surface-700 font-medium">Analisis web y competidores</span>
          </li>
        </ul>

        <Link
          href={`/register?plan=${plan.id}`}
          className={`block w-full text-center py-3 font-bold text-sm uppercase tracking-wider rounded-lg transition-all ${
            isPopular
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'bg-surface-900 text-white hover:bg-surface-800'
          }`}
        >
          Probar 30 dias gratis →
        </Link>
      </div>
    </div>
  );
}
