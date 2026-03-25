/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
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
