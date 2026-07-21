import { describe, expect, it, vi } from 'vitest';

import type { IdentifierMatch } from '@/lib/auth-modes';
import { createRateLimiter } from '@/lib/rate-limit';

import { LOOKUP_LIMIT_PER_MINUTE, handleAuthLookup, type AuthLookupDeps } from './handler';

const NOW = 1_700_000_000_000;

function request(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/api/auth/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function match(partial: Partial<IdentifierMatch> = {}): IdentifierMatch {
  return {
    userId: 'user-1',
    primaryEmail: 'primary@example.com',
    hasPassword: true,
    providers: ['email'],
    matchedBy: 'primary',
    ...partial,
  };
}

function deps(over: Partial<AuthLookupDeps> = {}): AuthLookupDeps {
  return {
    resolveIdentifier: vi.fn(async () => Promise.resolve<IdentifierMatch | null>(null)),
    rateLimiter: createRateLimiter({ limit: LOOKUP_LIMIT_PER_MINUTE, windowMs: 60_000 }),
    now: () => NOW,
    ...over,
  };
}

describe('POST /api/auth/lookup', () => {
  it('returns 400 for a body that is not JSON', async () => {
    const bad = new Request('http://localhost/api/auth/lookup', { method: 'POST', body: 'x' });
    const response = await handleAuthLookup(bad, deps());
    expect(response.status).toBe(400);
  });

  it('returns 400 for a malformed email', async () => {
    const response = await handleAuthLookup(request({ email: 'not-an-email' }), deps());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'bad-request' } });
  });

  it('classifies an unknown address as signup', async () => {
    const response = await handleAuthLookup(request({ email: 'new@example.com' }), deps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: 'signup' });
  });

  it('classifies a password account as signin and leaks nothing else', async () => {
    const response = await handleAuthLookup(
      request({ email: 'primary@example.com' }),
      deps({ resolveIdentifier: vi.fn(async () => Promise.resolve(match())) }),
    );
    expect(response.status).toBe(200);
    // Exactly the mode — no user id, no primary email, no providers.
    expect(await response.json()).toEqual({ mode: 'signin' });
  });

  it('classifies a passwordless OAuth account with the provider hint', async () => {
    const response = await handleAuthLookup(
      request({ email: 'o@example.com' }),
      deps({
        resolveIdentifier: vi.fn(async () =>
          Promise.resolve(match({ hasPassword: false, providers: ['github'] })),
        ),
      }),
    );
    expect(await response.json()).toEqual({ mode: 'oauth', provider: 'github' });
  });

  it('classifies a passwordless OTP-era account as set-password', async () => {
    const response = await handleAuthLookup(
      request({ email: 'otp@example.com' }),
      deps({
        resolveIdentifier: vi.fn(async () => Promise.resolve(match({ hasPassword: false }))),
      }),
    );
    expect(await response.json()).toEqual({ mode: 'set-password' });
  });

  it('lowercases the address before resolving', async () => {
    const resolveIdentifier = vi.fn(async () => Promise.resolve(null));
    await handleAuthLookup(request({ email: 'MiXeD@ExAmPlE.CoM' }), deps({ resolveIdentifier }));
    expect(resolveIdentifier).toHaveBeenCalledWith('mixed@example.com');
  });

  it('rate-limits the 11th request from one IP inside a minute', async () => {
    const shared = deps();
    for (let i = 0; i < LOOKUP_LIMIT_PER_MINUTE; i += 1) {
      const okResponse = await handleAuthLookup(request({ email: `a${String(i)}@x.com` }), shared);
      expect(okResponse.status).toBe(200);
    }
    const blocked = await handleAuthLookup(request({ email: 'a99@x.com' }), shared);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: 'rate-limited' } });
  });

  it('rate-limits the 11th request for one address across IPs inside a minute', async () => {
    const shared = deps();
    for (let i = 0; i < LOOKUP_LIMIT_PER_MINUTE; i += 1) {
      const okResponse = await handleAuthLookup(
        request({ email: 'same@x.com' }, `203.0.113.${String(i)}`),
        shared,
      );
      expect(okResponse.status).toBe(200);
    }
    const blocked = await handleAuthLookup(
      request({ email: 'same@x.com' }, '203.0.113.99'),
      shared,
    );
    expect(blocked.status).toBe(429);
  });

  it('never calls the resolver for a rate-limited request', async () => {
    const resolveIdentifier = vi.fn(async () => Promise.resolve(null));
    const limiter = { check: () => false };
    const response = await handleAuthLookup(
      request({ email: 'a@x.com' }),
      deps({ resolveIdentifier, rateLimiter: limiter }),
    );
    expect(response.status).toBe(429);
    expect(resolveIdentifier).not.toHaveBeenCalled();
  });
});
