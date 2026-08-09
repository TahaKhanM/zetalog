import { describe, expect, it, vi } from 'vitest';

import type { IdentifierMatch } from '@/lib/auth-modes';

import { handleRecoveryVerify, type RecoveryVerifyDeps } from './handler';

const aliasMatch: IdentifierMatch = {
  userId: '11111111-1111-4111-8111-111111111111',
  primaryEmail: 'primary@example.com',
  hasPassword: true,
  providers: ['email'],
  matchedBy: 'alias',
};

function request(identifier: unknown, code: unknown): Request {
  return new Request('http://localhost/api/auth/recovery/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.7',
    },
    body: JSON.stringify({ identifier, code }),
  });
}

function deps(over: Partial<RecoveryVerifyDeps> = {}): RecoveryVerifyDeps {
  return {
    allowIp: vi.fn(async () => Promise.resolve(true)),
    resolveIdentifier: vi.fn(async () => Promise.resolve(null)),
    allowRecipient: vi.fn(async () => Promise.resolve(true)),
    verify: vi.fn(async () => Promise.resolve({ error: null })),
    ...over,
  };
}

describe('handleRecoveryVerify', () => {
  it('rate-limits by trusted IP before checking a code', async () => {
    const verify = vi.fn();
    const response = await handleRecoveryVerify(
      request('student@example.com', '123456'),
      deps({ allowIp: vi.fn(async () => Promise.resolve(false)), verify }),
    );
    expect(response.status).toBe(429);
    expect(verify).not.toHaveBeenCalled();
  });

  it('requires a valid email and exactly six digits', async () => {
    expect((await handleRecoveryVerify(request('bad', '123456'), deps())).status).toBe(400);
    expect(
      (await handleRecoveryVerify(request('student@example.com', '12345'), deps())).status,
    ).toBe(400);
  });

  it('verifies an alias code against the primary email and cookie-owning client', async () => {
    const allowRecipient = vi.fn(async () => Promise.resolve(true));
    const verify = vi.fn(async () => Promise.resolve({ error: null }));
    const response = await handleRecoveryVerify(
      request('ALIAS@EXAMPLE.COM', '123456'),
      deps({
        resolveIdentifier: vi.fn(async () => Promise.resolve(aliasMatch)),
        allowRecipient,
        verify,
      }),
    );
    expect(response.status).toBe(200);
    expect(allowRecipient).toHaveBeenCalledWith('primary@example.com');
    expect(verify).toHaveBeenCalledWith('primary@example.com', '123456');
  });

  it('blocks recipient-wide brute force across rotating IPs', async () => {
    const verify = vi.fn();
    const response = await handleRecoveryVerify(
      request('student@example.com', '123456'),
      deps({ allowRecipient: vi.fn(async () => Promise.resolve(false)), verify }),
    );
    expect(response.status).toBe(429);
    expect(verify).not.toHaveBeenCalled();
  });

  it('maps rejected or expired OTPs without leaking account details', async () => {
    const response = await handleRecoveryVerify(
      request('student@example.com', '123456'),
      deps({ verify: vi.fn(async () => Promise.resolve({ error: new Error('expired') })) }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid-code' } });
  });
});
