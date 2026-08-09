import { describe, expect, it, vi } from 'vitest';

import { handleToken, TOKEN_CORS_HEADERS } from './handler';

const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link';
const EXCHANGE = {
  code: 'zla_one_time_code',
  codeVerifier: 'a'.repeat(43),
  redirectUri: REDIRECT_URI,
};

function tokenRequest(body: unknown): Request {
  return new Request('https://www.zetalog.co.uk/api/extension/link/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('extension token handler', () => {
  it('rejects malformed exchanges without redeeming a code', async () => {
    const redeemAuthorizationCode = vi.fn();
    const response = await handleToken(tokenRequest({ ...EXCHANGE, codeVerifier: 'short' }), {
      allowedRedirectUris: [REDIRECT_URI],
      redeemAuthorizationCode,
      consumeClientRateLimit: () => Promise.resolve(true),
    });
    expect(response.status).toBe(400);
    expect(redeemAuthorizationCode).not.toHaveBeenCalled();
  });

  it('requires the exact same allowlisted redirect at token exchange', async () => {
    const redeemAuthorizationCode = vi.fn();
    const response = await handleToken(
      tokenRequest({ ...EXCHANGE, redirectUri: 'https://attacker.example/zetalog-link' }),
      {
        allowedRedirectUris: [REDIRECT_URI],
        redeemAuthorizationCode,
        consumeClientRateLimit: () => Promise.resolve(true),
      },
    );
    expect(response.status).toBe(400);
    expect(redeemAuthorizationCode).not.toHaveBeenCalled();
  });

  it('returns only the opaque credential and non-secret user metadata after atomic redemption', async () => {
    const redeemAuthorizationCode = vi.fn(() =>
      Promise.resolve({
        credential: 'zlx_opaque_credential',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    const response = await handleToken(tokenRequest(EXCHANGE), {
      allowedRedirectUris: [REDIRECT_URI],
      redeemAuthorizationCode,
      consumeClientRateLimit: () => Promise.resolve(true),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({
      credential: 'zlx_opaque_credential',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    expect(redeemAuthorizationCode).toHaveBeenCalledWith(EXCHANGE);
  });

  it('does not mint a credential for an expired, consumed, or verifier-mismatched code', async () => {
    const response = await handleToken(tokenRequest(EXCHANGE), {
      allowedRedirectUris: [REDIRECT_URI],
      redeemAuthorizationCode: () => Promise.resolve(null),
      consumeClientRateLimit: () => Promise.resolve(true),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'invalid-grant', message: 'Authorization code is invalid or expired.' },
    });
  });

  it('does not redeem a structurally valid code after the shared IP limit is reached', async () => {
    const redeemAuthorizationCode = vi.fn();
    const response = await handleToken(tokenRequest(EXCHANGE), {
      allowedRedirectUris: [REDIRECT_URI],
      redeemAuthorizationCode,
      consumeClientRateLimit: () => Promise.resolve(false),
    });
    expect(response.status).toBe(429);
    expect(redeemAuthorizationCode).not.toHaveBeenCalled();
  });

  it('publishes the expected no-cookie CORS contract', () => {
    expect(TOKEN_CORS_HEADERS).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  });
});
