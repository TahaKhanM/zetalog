import { join } from 'node:path';

import type { NextConfig } from 'next';

const connectSources =
  process.env.NODE_ENV === 'development'
    ? "'self' https://*.supabase.co http://localhost:* http://127.0.0.1:*"
    : "'self' https://*.supabase.co";

const nextConfig: NextConfig = {
  transpilePackages: ['@zetalog/shared'],
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          {
            // The app currently needs inline Next/theme bootstrap code, so this
            // cannot yet be a nonce-only policy. It still prevents unapproved
            // third-party resources, framing, plugins, and base-tag injection.
            key: 'Content-Security-Policy',
            value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; font-src 'self'; connect-src ${connectSources}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`,
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]);
  },
  redirects() {
    return Promise.resolve([
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'zetalog.co.uk' }],
        destination: 'https://www.zetalog.co.uk/:path*',
        permanent: true,
      },
    ]);
  },
  // Pin the workspace root so Turbopack does not warn when several lockfiles
  // are visible (e.g. inside a git worktree). Resolves to the monorepo root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
};

export default nextConfig;
