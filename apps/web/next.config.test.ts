import { describe, expect, it } from 'vitest';

import nextConfig, { supabaseProxyDestination } from './next.config';

describe('security and canonical-host config', () => {
  it('sends baseline browser security headers on every path', async () => {
    if (nextConfig.headers === undefined) throw new Error('headers config is missing');
    const rules = await nextConfig.headers();
    const headers = new Map(rules[0]?.headers.map((header) => [header.key, header.value]));

    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(headers.get('Content-Security-Policy')).not.toContain('localhost');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('permanently canonicalises the apex host to www', async () => {
    if (nextConfig.redirects === undefined) throw new Error('redirect config is missing');
    const rules = await nextConfig.redirects();
    expect(rules).toContainEqual(
      expect.objectContaining({
        destination: 'https://www.zetalog.co.uk/:path*',
        permanent: true,
      }),
    );
  });

  it('routes browser Supabase calls through the ZetaLog origin', async () => {
    if (nextConfig.rewrites === undefined) throw new Error('rewrites config is missing');
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/';
    try {
      await expect(nextConfig.rewrites()).resolves.toContainEqual({
        source: '/supabase/:path*',
        destination: 'https://project.supabase.co/:path*',
      });
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  });

  it('keeps zero-env builds valid and rejects unsafe proxy destinations', () => {
    expect(supabaseProxyDestination(undefined)).toBeNull();
    expect(supabaseProxyDestination('')).toBeNull();
    expect(supabaseProxyDestination('javascript:alert(1)')).toBeNull();
    expect(supabaseProxyDestination('not a URL')).toBeNull();
  });
});
