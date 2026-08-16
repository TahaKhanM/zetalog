import { describe, expect, it } from 'vitest';

import { handleLinkStatus, LINK_STATUS_CORS_HEADERS } from './handler';

const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link';

function request(redirectUri: string | null): Request {
  const url = new URL('https://www.zetalog.co.uk/api/extension/link/status');
  if (redirectUri !== null) url.searchParams.set('redirect_uri', redirectUri);
  return new Request(url);
}

describe('extension link status handler', () => {
  it('confirms an exact allowlisted Chrome Identity callback', async () => {
    const response = handleLinkStatus(request(REDIRECT_URI), [REDIRECT_URI]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ supported: true });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('distinguishes a valid but unconfigured Web Store extension id', async () => {
    const response = handleLinkStatus(request(REDIRECT_URI), [
      'https://ponmlkjihgfedcbaponmlkjihgfedcba.chromiumapp.org/zetalog-link',
    ]);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'extension-not-enabled' },
    });
  });

  it.each([null, 'https://attacker.example/zetalog-link'])(
    'rejects a missing or malformed callback before allowlist comparison',
    async (redirectUri) => {
      const response = handleLinkStatus(request(redirectUri), [REDIRECT_URI]);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'invalid-redirect' } });
    },
  );

  it('exports read-only wildcard CORS headers for the extension worker', () => {
    expect(LINK_STATUS_CORS_HEADERS).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  });
});
