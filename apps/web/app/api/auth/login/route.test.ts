import { describe, expect, it, vi } from 'vitest';

import type { IdentifierMatch } from '@/lib/auth-modes';
import { createRateLimiter } from '@/lib/rate-limit';

import { LOGIN_LIMIT_PER_MINUTE, handleAuthLogin, type AuthLoginDeps } from './handler';

const NOW = 1_700_000_000_000;
const SECRET = 'a-test-password-value';

function request(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/api/auth/login', {
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

function deps(over: Partial<AuthLoginDeps> = {}): AuthLoginDeps {
  return {
    resolveIdentifier: vi.fn(async () => Promise.resolve<IdentifierMatch | null>(null)),
    signInWithPassword: vi.fn(async () => Promise.resolve({ ok: true as const })),
    rateLimiter: createRateLimiter({ limit: LOGIN_LIMIT_PER_MINUTE, windowMs: 60_000 }),
    now: () => NOW,
    ...over,
  };
}

describe('POST /api/auth/login', () => {
  it('returns 400 for a malformed body or non-email identifier', async () => {
    expect((await handleAuthLogin(request({ identifier: 'not-an-email' }), deps())).status).toBe(
      400,
    );
    expect(
      (await handleAuthLogin(request({ identifier: 'a@b.com', password: '' }), deps())).status,
    ).toBe(400);
  });

  it('grants with the resolved primary email when the identifier is a verified alias', async () => {
    const signInWithPassword = vi.fn(async () => Promise.resolve({ ok: true as const }));
    const response = await handleAuthLogin(
      request({ identifier: 'alias@uni.ac.uk', password: SECRET }),
      deps({
        resolveIdentifier: vi.fn(async () => Promise.resolve(match({ matchedBy: 'alias' }))),
        signInWithPassword,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith('primary@example.com', SECRET);
  });

  it('lowercases the identifier before resolving', async () => {
    const resolveIdentifier = vi.fn(async () => Promise.resolve(null));
    await handleAuthLogin(
      request({ identifier: 'MiXeD@UNI.AC.UK', password: SECRET }),
      deps({ resolveIdentifier }),
    );
    expect(resolveIdentifier).toHaveBeenCalledWith('mixed@uni.ac.uk');
  });

  it('still attempts the grant with the raw identifier when nothing resolves', async () => {
    // Uniform work for unknown identifiers: same code path, same downstream
    // call shape, so response and timing cannot distinguish "no such account"
    // from "wrong password".
    const signInWithPassword = vi.fn(async () =>
      Promise.resolve({ ok: false as const, status: 400 }),
    );
    const response = await handleAuthLogin(
      request({ identifier: 'ghost@example.com', password: SECRET }),
      deps({ signInWithPassword }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith('ghost@example.com', SECRET);
    expect(response.status).toBe(401);
  });

  it('answers wrong-password and unknown-identifier with byte-identical bodies', async () => {
    const wrongPassword = await handleAuthLogin(
      request({ identifier: 'primary@example.com', password: SECRET }),
      deps({
        resolveIdentifier: vi.fn(async () => Promise.resolve(match())),
        signInWithPassword: vi.fn(async () => Promise.resolve({ ok: false as const, status: 400 })),
      }),
    );
    const unknownIdentifier = await handleAuthLogin(
      request({ identifier: 'ghost@example.com', password: SECRET }),
      deps({
        signInWithPassword: vi.fn(async () => Promise.resolve({ ok: false as const, status: 400 })),
      }),
    );
    expect(wrongPassword.status).toBe(401);
    expect(unknownIdentifier.status).toBe(401);
    expect(await wrongPassword.text()).toBe(await unknownIdentifier.text());
  });

  it('maps an upstream 429 to rate-limited', async () => {
    const response = await handleAuthLogin(
      request({ identifier: 'primary@example.com', password: SECRET }),
      deps({
        signInWithPassword: vi.fn(async () => Promise.resolve({ ok: false as const, status: 429 })),
      }),
    );
    expect(response.status).toBe(429);
  });

  it('rate-limits per IP before doing any work', async () => {
    const resolveIdentifier = vi.fn(async () => Promise.resolve(null));
    const signInWithPassword = vi.fn(async () => Promise.resolve({ ok: true as const }));
    const response = await handleAuthLogin(
      request({ identifier: 'a@b.com', password: SECRET }),
      deps({ resolveIdentifier, signInWithPassword, rateLimiter: { check: () => false } }),
    );
    expect(response.status).toBe(429);
    expect(resolveIdentifier).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rate-limits repeated attempts against one identifier across IPs', async () => {
    const shared = deps({
      signInWithPassword: vi.fn(async () => Promise.resolve({ ok: false as const, status: 400 })),
    });
    for (let i = 0; i < LOGIN_LIMIT_PER_MINUTE; i += 1) {
      const attempt = await handleAuthLogin(
        request({ identifier: 'same@x.com', password: SECRET }, `198.51.100.${String(i)}`),
        shared,
      );
      expect(attempt.status).toBe(401);
    }
    const blocked = await handleAuthLogin(
      request({ identifier: 'same@x.com', password: SECRET }, '198.51.100.99'),
      shared,
    );
    expect(blocked.status).toBe(429);
  });

  it('never echoes the password in any response body', async () => {
    for (const failing of [
      deps({
        signInWithPassword: vi.fn(async () => Promise.resolve({ ok: false as const, status: 400 })),
      }),
      deps({ rateLimiter: { check: () => false } }),
      deps(),
    ]) {
      const response = await handleAuthLogin(
        request({ identifier: 'a@b.com', password: SECRET }),
        failing,
      );
      expect(await response.text()).not.toContain(SECRET);
    }
  });
});
