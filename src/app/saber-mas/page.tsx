import Link from 'next/link';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { MarketingNavCenter, MarketingNavActions } from '@/components/layout/MarketingNav';

export default function SaberMasPage() {
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
        <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-3">¿Qué es GestIA?</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
          Tu equipo de <span className="highlight">marketing</span> con IA
        </h1>
        <p className="text-base sm:text-lg text-surface-500 max-w-2xl mx-auto leading-relaxed font-medium">
          GestIA automatiza todo el proceso de crear estrategias de contenido para redes sociales:
          desde el análisis de tu negocio hasta un calendario mensual con copies listos para publicar.
        </p>
      </header>

      {/* Qué hace exactamente */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">El pipeline completo</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            6 agentes de IA trabajando <span className="highlight">en cadena</span>
          </h2>
          <p className="text-surface-500 text-sm max-w-2xl mb-12 leading-relaxed">
            Cuando creas un proyecto, GestIA ejecuta un pipeline de 6 agentes de inteligencia artificial especializados.
            Cada agente resuelve una parte del proceso y pasa su resultado al siguiente, como lo haría un equipo real de marketing.
          </p>

          <div className="space-y-6">
            {[
              {
                step: '01',
                tag: 'Brand Recognition',
                title: 'Reconocimiento de marca',
                desc: 'El primer agente visita tu web y extrae automáticamente los colores de tu marca, tipografías, logo, favicon y personalidad visual. Esto permite que todo el contenido generado después sea coherente con tu identidad.',
                detail: 'Analiza HTML, CSS y metadatos reales — no inventa datos.',
              },
              {
                step: '02',
                tag: 'Analyze Site',
                title: 'Análisis de tu negocio',
                desc: 'Scrapea tu sitio web completo y con IA extrae tu propuesta de valor, público objetivo, posicionamiento, servicios clave, puntos de diferenciación y oportunidades de contenido.',
                detail: 'Toda la ficha estratégica se genera a partir de evidencia real de tu web.',
              },
              {
                step: '03',
                tag: 'Competitors',
                title: 'Análisis de competidores',
                desc: 'Visita las webs de tus competidores, detecta qué tipo de contenido publican, con qué frecuencia, su tono, fortalezas y debilidades. Identifica huecos de mercado donde puedes diferenciarte.',
                detail: 'Genera ideas accionables de diferenciación basadas en datos reales.',
              },
              {
                step: '04',
                tag: 'Strategy',
                title: 'Generación de estrategia',
                desc: 'Con toda la información anterior, crea tu estrategia de contenido completa: pilares de contenido (con porcentaje de distribución), tono de voz con guidelines editoriales, líneas temáticas sostenibles y recomendaciones concretas.',
                detail: 'Entre 3 y 5 pilares de contenido que suman 100% de tu distribución.',
              },
              {
                step: '05',
                tag: 'Calendar',
                title: 'Calendario mensual con copies',
                desc: 'Genera un calendario editorial completo para el mes: cada publicación con su fecha, formato (post, carrusel, reel, story), copy completo, CTA, objetivo, hashtags y plataformas. Todo listo para copiar y publicar.',
                detail: 'Copies reales, no ideas vagas. Con CTAs, hashtags y especificaciones de producción.',
              },
              {
                step: '06',
                tag: 'Visual Briefs',
                title: 'Briefs visuales y prompts IA',
                desc: 'Para cada publicación del calendario, genera un brief creativo completo para tu diseñador (qué se ve exactamente en cada slide, escena o imagen) y un prompt técnico listo para copiar en Midjourney o DALL-E.',
                detail: 'Briefs tan detallados que tu equipo de diseño no necesita hacer preguntas.',
              },
            ].map((s) => (
              <div key={s.step} className="bg-white border-2 border-surface-200 rounded-2xl p-6 sm:p-8 hover:border-surface-900 transition-colors">
                <div className="flex items-start gap-5">
                  <span className="font-mono text-3xl font-bold text-surface-200 leading-none flex-shrink-0 pt-1">{s.step}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-1 uppercase tracking-widest">{s.tag}</span>
                      <h3 className="font-display font-bold text-lg">{s.title}</h3>
                    </div>
                    <p className="text-sm text-surface-600 leading-relaxed mb-2">{s.desc}</p>
                    <p className="text-xs text-surface-400 italic">{s.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modelos de IA */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">Tecnología</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            Compatible con los <span className="highlight">mejores modelos</span>
          </h2>
          <p className="text-surface-500 text-sm max-w-2xl mb-10 leading-relaxed">
            GestIA no te obliga a usar un único proveedor. Conecta tu API key de OpenAI, Anthropic o Google AI
            y elige qué modelo usa cada agente. Tú controlas la calidad y el coste.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                provider: 'OpenAI',
                models: ['GPT-4o', 'GPT-4o Mini', 'GPT-4 Turbo'],
                color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                tagColor: 'bg-emerald-600',
              },
              {
                provider: 'Anthropic',
                models: ['Claude Sonnet 4', 'Claude 3.5 Haiku', 'Claude 3 Opus'],
                color: 'bg-amber-50 border-amber-200 text-amber-800',
                tagColor: 'bg-amber-600',
              },
              {
                provider: 'Google AI',
                models: ['Gemini 2.5 Pro', 'Gemini 2.0 Flash', 'Gemini 2.0 Flash Lite'],
                color: 'bg-blue-50 border-blue-200 text-blue-800',
                tagColor: 'bg-blue-600',
              },
            ].map((p) => (
              <div key={p.provider} className={`border-2 rounded-2xl p-6 ${p.color}`}>
                <span className={`inline-block text-[10px] font-bold text-white px-2.5 py-1 rounded uppercase tracking-widest mb-4 ${p.tagColor}`}>
                  {p.provider}
                </span>
                <ul className="space-y-2">
                  {p.models.map((m) => (
                    <li key={m} className="text-sm font-medium flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué se paga */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">El valor real</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            ¿Por qué <span className="highlight">se paga</span>?
          </h2>
          <p className="text-surface-500 text-sm max-w-2xl mb-12 leading-relaxed">
            GestIA no es un wrapper de ChatGPT con un formulario bonito. Es una plataforma de producción profesional
            que automatiza un proceso que normalmente cuesta semanas de trabajo y miles de euros en agencia.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {[
              {
                icon: '⏱️',
                title: 'Ahorro de tiempo brutal',
                desc: 'Una estrategia de contenido profesional requiere entre 20 y 40 horas de trabajo manual: investigación, análisis de competidores, definición de pilares, escritura de copies, briefing de diseño. GestIA lo hace en minutos.',
              },
              {
                icon: '🧠',
                title: '6 agentes especializados',
                desc: 'No es un solo prompt. Son 6 agentes de IA encadenados, cada uno con su prompt especializado de más de 500 palabras, su temperatura calibrada y su modelo óptimo. El resultado tiene una coherencia imposible de lograr manualmente con ChatGPT.',
              },
              {
                icon: '💰',
                title: 'Coste de agencia vs GestIA',
                desc: 'Una agencia cobra entre 500€ y 3.000€/mes por gestión de contenido. Un community manager freelance, entre 300€ y 800€/mes. Con GestIA generas el mismo output (o mejor) desde 29€/mes. Y lo tienes en minutos, no en semanas.',
              },
              {
                icon: '🔄',
                title: 'Resultados reproducibles',
                desc: 'Cada vez que necesitas contenido nuevo, ejecutas el pipeline. No dependes de la inspiración, de la disponibilidad de un freelance ni de la rotación de equipo. Tu estrategia siempre es coherente y actualizada.',
              },
              {
                icon: '🎯',
                title: 'Datos reales, no genéricos',
                desc: 'GestIA no genera contenido genérico. Scrapea tu web real, analiza a tus competidores reales y crea una estrategia basada en evidencia concreta de tu mercado. Cada output es único para tu negocio.',
              },
              {
                icon: '📋',
                title: 'Listo para producir',
                desc: 'No te da "ideas". Te da copies completos con CTAs, hashtags, fechas reales, especificaciones de producción por formato y briefs visuales detallados slide por slide. Copias, publicas, listo.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white border-2 border-surface-200 rounded-2xl p-6 hover:border-surface-900 transition-colors">
                <span className="text-2xl block mb-3">{item.icon}</span>
                <h3 className="font-display font-bold text-base mb-2">{item.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Comparativa visual */}
          <div className="bg-surface-900 rounded-2xl p-8 sm:p-12 text-white">
            <h3 className="font-display text-xl sm:text-2xl font-bold mb-8 text-center">Comparativa real</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-surface-400">Agencia tradicional</p>
                <p className="font-display text-3xl font-bold text-red-400">500–3.000€<span className="text-sm font-normal text-surface-400">/mes</span></p>
                <p className="text-xs text-surface-400">2–4 semanas de entrega</p>
                <p className="text-xs text-surface-400">Dependencia de personas</p>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-surface-400">Freelance</p>
                <p className="font-display text-3xl font-bold text-amber-400">300–800€<span className="text-sm font-normal text-surface-400">/mes</span></p>
                <p className="text-xs text-surface-400">1–2 semanas de entrega</p>
                <p className="text-xs text-surface-400">Calidad variable</p>
              </div>
              <div className="space-y-3 bg-white/10 rounded-xl p-6 -m-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">GestIA</p>
                <p className="font-display text-3xl font-bold text-brand-400">desde 29€<span className="text-sm font-normal text-surface-400">/mes</span></p>
                <p className="text-xs text-brand-200">Resultado en minutos</p>
                <p className="text-xs text-brand-200">Calidad consistente y escalable</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Para quién */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">¿Para quién es?</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-10">
            Diseñado para <span className="highlight">profesionales</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'Agencias de marketing', desc: 'Escala tu producción de contenido sin contratar más equipo. Gestiona múltiples clientes desde una sola plataforma.' },
              { title: 'Community managers', desc: 'Genera estrategias y calendarios completos en minutos. Más tiempo para la interacción y la creatividad.' },
              { title: 'Freelancers', desc: 'Ofrece un servicio de estrategia de contenido profesional sin necesidad de un equipo detrás.' },
              { title: 'Negocios y marcas', desc: 'Si gestionas tus propias redes, GestIA te da el plan de contenido que necesitas sin ser un experto en marketing.' },
            ].map((t) => (
              <div key={t.title} className="bg-white border-2 border-surface-200 rounded-2xl p-5 hover:border-surface-900 transition-colors">
                <h3 className="font-display font-bold text-sm mb-2">{t.title}</h3>
                <p className="text-xs text-surface-500 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Qué NO es */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 mb-20">
        <div className="border-t border-surface-200 pt-16">
          <p className="text-xs uppercase tracking-[0.2em] text-surface-400 font-semibold mb-2">Transparencia</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-10">
            Qué <span className="highlight">NO</span> es GestIA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { no: 'No es un chatbot genérico', yes: 'Es un pipeline de 6 agentes especializados con prompts de producción profesional.' },
              { no: 'No publica por ti', yes: 'Genera todo el contenido listo para copiar y publicar en tu plataforma favorita.' },
              { no: 'No incluye API keys', yes: 'Tú conectas tu propia key de OpenAI, Anthropic o Google. Así controlas tu gasto de IA.' },
              { no: 'No genera contenido genérico', yes: 'Todo se basa en el análisis real de tu web y tus competidores. Output 100% personalizado.' },
            ].map((item) => (
              <div key={item.no} className="bg-white border-2 border-surface-200 rounded-2xl p-5">
                <p className="text-sm font-bold text-red-600 mb-1">✕ {item.no}</p>
                <p className="text-sm text-surface-600 leading-relaxed">✓ {item.yes}</p>
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
            Pruébalo <span className="highlight text-surface-900">30 días gratis</span>
          </h2>
          <p className="text-surface-400 mb-8 text-sm max-w-lg mx-auto relative">
            Sin tarjeta de crédito. Sin compromiso. Crea tu cuenta, conecta tu API key y genera tu primera estrategia completa en minutos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
            <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-600 text-white font-semibold text-sm uppercase tracking-wider rounded-full border-2 border-brand-500 hover:bg-brand-500 transition-all hover:-translate-y-0.5">
              Empezar gratis →
            </Link>
            <Link href="/pricing" className="text-sm font-semibold text-surface-400 hover:text-white transition-colors uppercase tracking-wider">
              Ver planes →
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
