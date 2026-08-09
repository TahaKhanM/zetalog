import { describe, expect, it, vi } from 'vitest';

import type { IdentifierMatch } from '@/lib/auth-modes';

import { handleRecoveryRequest, type RecoveryRequestDeps } from './handler';

const aliasMatch: IdentifierMatch = {
  userId: '11111111-1111-4111-8111-111111111111',
  primaryEmail: 'primary@example.com',
  hasPassword: true,
  providers: ['email'],
  matchedBy: 'alias',
};

function request(identifier: unknown): Request {
  return new Request('http://localhost/api/auth/recovery/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.7',
    },
    body: JSON.stringify({ identifier }),
  });
}

function deps(over: Partial<RecoveryRequestDeps> = {}): RecoveryRequestDeps {
  return {
    allowIp: vi.fn(async () => Promise.resolve(true)),
    resolveIdentifier: vi.fn(async () => Promise.resolve(null)),
    allowRecipient: vi.fn(async () => Promise.resolve(true)),
    send: vi.fn(async () => Promise.resolve({ error: null })),
    ...over,
  };
}

describe('handleRecoveryRequest', () => {
  it('rate-limits by trusted IP before parsing or resolving an address', async () => {
    const resolveIdentifier = vi.fn();
    const response = await handleRecoveryRequest(
      request('student@example.com'),
      deps({ allowIp: vi.fn(async () => Promise.resolve(false)), resolveIdentifier }),
    );
    expect(response.status).toBe(429);
    expect(resolveIdentifier).not.toHaveBeenCalled();
  });

  it('rejects malformed identifiers', async () => {
    const response = await handleRecoveryRequest(request('not-an-email'), deps());
    expect(response.status).toBe(400);
  });

  it('resolves an alias and rate-limits/sends against its primary address', async () => {
    const allowRecipient = vi.fn(async () => Promise.resolve(true));
    const send = vi.fn(async () => Promise.resolve({ error: null }));
    const response = await handleRecoveryRequest(
      request('ALIAS@EXAMPLE.COM'),
      deps({
        resolveIdentifier: vi.fn(async () => Promise.resolve(aliasMatch)),
        allowRecipient,
        send,
      }),
    );
    expect(response.status).toBe(200);
    expect(allowRecipient).toHaveBeenCalledWith('primary@example.com');
    expect(send).toHaveBeenCalledWith('primary@example.com');
  });

  it('blocks a rotating-IP recipient after its shared bucket is exhausted', async () => {
    const send = vi.fn();
    const response = await handleRecoveryRequest(
      request('student@example.com'),
      deps({ allowRecipient: vi.fn(async () => Promise.resolve(false)), send }),
    );
    expect(response.status).toBe(429);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not enumerate unknown addresses or ordinary delivery failures', async () => {
    const response = await handleRecoveryRequest(
      request('unknown@example.com'),
      deps({ send: vi.fn(async () => Promise.resolve({ error: { status: 500 } })) }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('preserves provider rate limits', async () => {
    const response = await handleRecoveryRequest(
      request('student@example.com'),
      deps({ send: vi.fn(async () => Promise.resolve({ error: { status: 429 } })) }),
    );
    expect(response.status).toBe(429);
  });
});
