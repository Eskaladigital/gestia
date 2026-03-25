/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
  /**
   * En Vercel/serverless, el trace de archivos no incluye por defecto la carpeta `bin` de
   * @sparticuz/chromium (y con require vía eval el analizador no la ve). Sin esto:
   * "The input directory .../node_modules/@sparticuz/chromium/bin does not exist"
   */
  outputFileTracingIncludes: {
    '/api/analyze-site': ['./node_modules/@sparticuz/chromium/**/*'],
    '/api/debug-screenshots': ['./node_modules/@sparticuz/chromium/**/*'],
  },
  async rewrites() {
    return [
      {
        source: '/administrator/projects/:id/:path*',
        destination: '/projects/:id/:path*',
      },
      {
        source: '/administrator/projects/:id',
        destination: '/projects/:id',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
