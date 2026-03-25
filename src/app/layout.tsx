import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ESKALA_MARKETING_DIGITAL } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Gestia RRSS — Estrategia con IA · ${ESKALA_MARKETING_DIGITAL.name}`,
  description: `Crea estrategias y calendarios de contenido para redes sociales con inteligencia artificial. Producto de ${ESKALA_MARKETING_DIGITAL.name}. ${ESKALA_MARKETING_DIGITAL.tagline}.`,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Gestia',
  },
  icons: {
    icon: '/images/logo/favicon.png',
    apple: '/images/logo/favicon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1c1917',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-surface-50 text-surface-900 antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
