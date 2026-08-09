import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

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
});
