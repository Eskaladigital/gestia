import { ESKALA_MARKETING_DIGITAL } from '@/lib/utils';

const ESKALA = 'https://www.eskaladigital.com';

const LEGAL = [
  { href: `${ESKALA}/aviso-legal`, label: 'Aviso legal' },
  { href: `${ESKALA}/politica-privacidad`, label: 'Política de privacidad' },
  { href: `${ESKALA}/politica-cookies`, label: 'Política de cookies' },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-surface-200 py-8 px-6 sm:px-10">
      <div className="max-w-7xl mx-auto grid gap-8 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-2">
          <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-6 w-auto" />
          <p className="text-xs text-surface-400">Gestia RRSS — Estrategia de contenido con IA</p>
          <p className="text-xs text-surface-400 leading-relaxed">
            <span className="block sm:inline">Hecho con <span className="text-red-500 inline-block animate-pulse">❤️</span> en Murcia</span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline mt-1 sm:mt-0">
              Web desarrollada por{' '}
              <a
                href={ESKALA_MARKETING_DIGITAL.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-surface-600 hover:text-brand-600 whitespace-nowrap"
              >
                ESKALA Agencia de Marketing Digital
              </a>
            </span>
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3">Legal</h2>
          <ul className="space-y-2">
            {LEGAL.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-surface-500 hover:text-brand-600 transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
