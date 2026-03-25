import Link from 'next/link';
import { ESKALA_MARKETING_DIGITAL } from '@/lib/utils';
import { MarketingNavCenter, MarketingNavActions } from '@/components/layout/MarketingNav';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-50 text-surface-900 relative overflow-hidden">
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
      <main className="relative z-0 max-w-5xl mx-auto px-6 sm:px-10 pt-20 sm:pt-32 pb-20 text-center">
        {/* Floating shapes — no capturan clics (evitan bloquear menús superpuestos) */}
        <div className="absolute top-32 left-[10%] w-16 h-16 bg-brand-200/60 rounded rotate-12 animate-float hidden md:block pointer-events-none" />
        <div className="absolute top-48 right-[12%] w-20 h-20 bg-brand-300/40 rounded-full animate-float-slow hidden md:block pointer-events-none" />
        <div className="absolute bottom-40 left-[15%] w-10 h-10 border-2 border-surface-300 rounded-full animate-float-slow hidden md:block pointer-events-none" />
        <div className="absolute bottom-60 right-[18%] w-14 h-14 bg-amber-200/50 rounded rotate-45 animate-float hidden md:block pointer-events-none" />
        
        <h1 className="font-display text-hero uppercase tracking-tight leading-[0.95] mb-8">
          Estrategia de
          <br />
          <span className="highlight">contenido</span>
          <br />
          con IA
        </h1>
        
        <p className="text-base sm:text-lg text-surface-500 max-w-xl mx-auto mb-4 leading-relaxed font-medium">
          Analiza tu negocio, tus competidores y genera calendarios de contenido completos con copies listos para publicar.
        </p>
        <p className="text-sm text-surface-400 max-w-md mx-auto mb-10 font-medium">
          Estrategia, pilares, tono, calendario — generado por IA.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          <Link href="/register" className="btn-primary text-sm py-3.5 px-8">
            Empezar gratis →
          </Link>
          <Link href="/pricing" className="text-sm font-semibold text-surface-500 hover:text-surface-900 transition-colors uppercase tracking-wider">
            Ver planes →
          </Link>
        </div>
        <p className="text-xs text-surface-400 uppercase tracking-widest font-medium">
          30 dias gratis. Sin tarjeta de credito.
        </p>
      </main>

      {/* Why Section */}
      <section className="relative z-0 max-w-7xl mx-auto px-6 sm:px-10 pb-24">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">¿Por qué Gestia?</p>
          <h2 className="font-display text-hero-sub mb-16">
            Hecho para <span className="highlight">marketers</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-surface-200 rounded-2xl overflow-hidden">
            {[
              { title: 'Análisis web', desc: 'Analiza tu web y la de tus competidores automáticamente con scraping inteligente.', tag: 'Scraping' },
              { title: 'Estrategia IA', desc: 'Genera pilares de contenido, tono de voz y líneas temáticas con GPT-4o.', tag: 'GPT-4o' },
              { title: 'Calendario listo', desc: 'Copies completos con CTAs, hashtags y fechas reales en un calendario visual.', tag: 'Calendar' },
            ].map((f, i) => (
              <div key={f.title} className={`p-8 sm:p-10 ${i < 2 ? 'md:border-r border-b md:border-b-0 border-surface-200' : ''} hover:bg-surface-100 transition-colors`}>
                <span className="inline-block text-[10px] font-mono font-medium bg-surface-900 text-white px-2 py-1 rounded uppercase tracking-widest mb-5">
                  {f.tag}
                </span>
                <h3 className="font-display font-bold text-xl mb-3">{f.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-0 max-w-7xl mx-auto px-6 sm:px-10 pb-24">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">Cómo funciona</p>
          <h2 className="font-display text-hero-sub mb-16">
            En <span className="highlight">3 pasos</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Cuéntanos sobre tu negocio', desc: 'Web, sector, público objetivo y competidores. Nosotros analizamos todo.' },
              { step: '02', title: 'Generamos tu estrategia', desc: 'Pilares de contenido, tono de voz, formatos y distribución semanal personalizada.' },
              { step: '03', title: 'Calendario completo', desc: 'Posts con copies, hashtags, CTAs y fechas reales listos para publicar.' },
            ].map((s) => (
              <div key={s.step} className="group">
                <span className="font-mono text-5xl font-bold text-surface-200 group-hover:text-brand-300 transition-colors block mb-4">{s.step}</span>
                <h3 className="font-display font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-0 max-w-7xl mx-auto px-6 sm:px-10 pb-20">
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

      {/* Footer */}
      <footer className="border-t border-surface-200 py-8 px-6 sm:px-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
          <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-6 w-auto" />
          <div className="text-xs text-surface-400 space-y-1 sm:text-right">
            <p>Gestia RRSS — Estrategia de contenido con IA</p>
            <p>
              <a
                href={ESKALA_MARKETING_DIGITAL.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-surface-600 hover:text-brand-600 transition-colors"
              >
                {ESKALA_MARKETING_DIGITAL.name}
              </a>
              <span className="mx-1.5 text-surface-300">·</span>
              <span>{ESKALA_MARKETING_DIGITAL.tagline}</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
