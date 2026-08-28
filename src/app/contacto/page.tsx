import Link from 'next/link';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { MarketingNavCenter, MarketingNavActions } from '@/components/layout/MarketingNav';

const CONTACT_EMAIL = 'contacto@eskaladigital.com';

export default function ContactoPage() {
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
        <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-3">Soporte</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
          <span className="highlight">Contacto</span>
        </h1>
        <p className="text-base sm:text-lg text-surface-500 max-w-xl mx-auto leading-relaxed font-medium">
          ¿Tienes una incidencia, duda o sugerencia? Estamos aquí para ayudarte.
        </p>
      </header>

      {/* Opciones de contacto */}
      <section className="max-w-4xl mx-auto px-6 sm:px-10 mb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Email */}
          <div className="bg-white border-2 border-surface-200 rounded-2xl p-8 hover:border-surface-900 transition-colors">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-700">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-lg mb-2">Email</h3>
            <p className="text-sm text-surface-500 leading-relaxed mb-4">
              Para incidencias técnicas, dudas sobre tu cuenta, facturación o cualquier consulta general.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900 transition-colors uppercase tracking-wider"
            >
              {CONTACT_EMAIL}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
            </a>
          </div>

          {/* Horario */}
          <div className="bg-white border-2 border-surface-200 rounded-2xl p-8 hover:border-surface-900 transition-colors">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-lg mb-2">Horario de soporte</h3>
            <p className="text-sm text-surface-500 leading-relaxed mb-4">
              Respondemos en un plazo máximo de 24 horas laborables.
            </p>
            <div className="space-y-1 text-sm font-medium text-surface-700">
              <p>Lunes a viernes: <span className="font-bold">9:00 – 18:00</span></p>
              <p className="text-xs text-surface-400">Horario peninsular (CET/CEST)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tipos de consulta */}
      <section className="max-w-4xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">¿Qué necesitas?</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-10">
            Cómo podemos <span className="highlight">ayudarte</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: '🐛',
                title: 'Incidencia técnica',
                desc: 'Algo no funciona como debería: errores en la generación, problemas de carga, fallos en el pipeline de IA.',
                tip: 'Incluye la URL del proyecto y una captura de pantalla si es posible.',
              },
              {
                icon: '🔑',
                title: 'API keys y proveedores',
                desc: 'Problemas conectando tu clave de OpenAI, Anthropic o Google AI. Errores de autenticación con proveedores.',
                tip: 'Nunca compartas tu API key por email — solo dinos el proveedor y el error.',
              },
              {
                icon: '💳',
                title: 'Facturación y planes',
                desc: 'Dudas sobre tu suscripción, cambio de plan, periodo de prueba o pagos.',
                tip: 'Indica el email de tu cuenta para que podamos localizarla.',
              },
              {
                icon: '💡',
                title: 'Sugerencias',
                desc: 'Ideas para mejorar GestIA, funcionalidades que echas en falta o mejoras en la experiencia de uso.',
                tip: 'Nos encanta recibir feedback — todo se lee y se evalúa.',
              },
              {
                icon: '🤝',
                title: 'Colaboraciones',
                desc: 'Propuestas de partnership, integraciones con terceros o acceso para agencias con muchos clientes.',
                tip: 'Cuéntanos tu caso de uso y te respondemos con una propuesta.',
              },
              {
                icon: '📋',
                title: 'Otros',
                desc: 'Cualquier otra consulta que no encaje en las categorías anteriores.',
                tip: 'Escríbenos y te dirigimos al equipo adecuado.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white border-2 border-surface-200 rounded-2xl p-5 hover:border-surface-900 transition-colors">
                <span className="text-xl block mb-3">{item.icon}</span>
                <h3 className="font-display font-bold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-surface-500 leading-relaxed mb-3">{item.desc}</p>
                <p className="text-[11px] text-surface-400 italic leading-relaxed">💬 {item.tip}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA email directo */}
      <section className="max-w-4xl mx-auto px-6 sm:px-10 pb-20">
        <div className="bg-surface-900 rounded-2xl p-10 sm:p-16 text-center text-white relative overflow-hidden">
          <div className="absolute top-4 right-8 w-24 h-24 bg-brand-500/20 rounded-full blur-2xl" />
          <div className="absolute bottom-4 left-8 w-32 h-32 bg-brand-400/10 rounded-full blur-3xl" />
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 relative">
            Escríbenos directamente
          </h2>
          <p className="text-surface-400 mb-8 text-sm max-w-md mx-auto relative">
            Haz clic en el botón para abrir tu cliente de correo con nuestro email ya rellenado.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Consulta%20desde%20GestIA`}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-600 text-white font-semibold text-sm uppercase tracking-wider rounded-full border-2 border-brand-500 hover:bg-brand-500 transition-all hover:-translate-y-0.5 relative"
          >
            Enviar email →
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
