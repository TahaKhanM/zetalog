import { err, ok } from '@zetalog/shared';
import { describe, expect, it, vi } from 'vitest';

import type { IdentifierMatch } from '@/lib/auth-modes';
import { sha256Hex } from '@/lib/hash';
import { handleVerifyRequest, type VerifyRequestDeps } from './handler';

const NOW = 1_700_000_000_000;

function request(body: unknown): Request {
  return new Request('http://localhost/api/verify/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function match(partial: Partial<IdentifierMatch> = {}): IdentifierMatch {
  return {
    userId: 'user-1',
    primaryEmail: 'me@ox.ac.uk',
    hasPassword: true,
    providers: ['email'],
    matchedBy: 'primary',
    ...partial,
  };
}

function deps(over: Partial<VerifyRequestDeps> = {}): VerifyRequestDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    listUniversities: vi.fn(async () => Promise.resolve([{ id: 'ox', domains: ['ox.ac.uk'] }])),
    resolveIdentifier: vi.fn(async () => Promise.resolve<IdentifierMatch | null>(null)),
    reserveVerification: vi.fn(async () =>
      Promise.resolve({
        status: 'reserved' as const,
        verificationId: '11111111-1111-4111-8111-111111111111',
      }),
    ),
    recordDelivery: vi.fn(async () => Promise.resolve()),
    sendCode: vi.fn(async () => Promise.resolve(ok({ id: 'email-1' }))),
    random: () => 424242,
    now: () => NOW,
    ...over,
  };
}

describe('POST /api/verify/request', () => {
  it('returns 401 when not signed in', async () => {
    const response = await handleVerifyRequest(
      request({ email: 'a@ox.ac.uk' }),
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for a malformed email', async () => {
    const response = await handleVerifyRequest(request({ email: 'nope' }), deps());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the domain is not a known university', async () => {
    const response = await handleVerifyRequest(request({ email: 'a@gmail.com' }), deps());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'unknown-university' } });
  });

  it('rate-limits after 3 requests to one address in an hour', async () => {
    const response = await handleVerifyRequest(
      request({ email: 'a@ox.ac.uk' }),
      deps({
        reserveVerification: vi.fn(async () =>
          Promise.resolve({ status: 'rate-limited' as const }),
        ),
      }),
    );
    expect(response.status).toBe(429);
  });

  it('refuses with 503 capacity when the daily email cap is reached', async () => {
    const response = await handleVerifyRequest(
      request({ email: 'a@ox.ac.uk' }),
      deps({
        reserveVerification: vi.fn(async () => Promise.resolve({ status: 'capacity' as const })),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'capacity' } });
  });

  it('returns 502 after reserving a durable failed-delivery record when the send fails', async () => {
    const reserveVerification = vi.fn(async () =>
      Promise.resolve({
        status: 'reserved' as const,
        verificationId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    const recordDelivery = vi.fn(async () => Promise.resolve());
    const response = await handleVerifyRequest(
      request({ email: 'a@ox.ac.uk' }),
      deps({
        reserveVerification,
        recordDelivery,
        sendCode: vi.fn(async () =>
          Promise.resolve(err({ code: 'send-failed' as const, message: 'x' })),
        ),
      }),
    );
    expect(response.status).toBe(502);
    expect(reserveVerification).toHaveBeenCalledTimes(1);
    expect(recordDelivery).toHaveBeenCalledWith({
      verificationId: '11111111-1111-4111-8111-111111111111',
      sent: false,
      error: 'x',
    });
  });

  it("returns 409 when the address is another account's primary email", async () => {
    const sendCode = vi.fn(async () => Promise.resolve(ok({ id: 'email-1' })));
    const response = await handleVerifyRequest(
      request({ email: 'taken@ox.ac.uk' }),
      deps({
        sendCode,
        resolveIdentifier: vi.fn(async () => Promise.resolve(match({ userId: 'user-2' }))),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'email-taken' } });
    expect(sendCode).not.toHaveBeenCalled();
  });

  it("returns 409 when the address is another user's verified alias", async () => {
    const response = await handleVerifyRequest(
      request({ email: 'claimed@ox.ac.uk' }),
      deps({
        resolveIdentifier: vi.fn(async () =>
          Promise.resolve(match({ userId: 'user-2', matchedBy: 'alias' })),
        ),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'email-taken' } });
  });

  it("returns 409 already-verified for the requester's own verified alias, sending nothing", async () => {
    const sendCode = vi.fn(async () => Promise.resolve(ok({ id: 'email-1' })));
    const response = await handleVerifyRequest(
      request({ email: 'mine@ox.ac.uk' }),
      deps({
        sendCode,
        resolveIdentifier: vi.fn(async () => Promise.resolve(match({ matchedBy: 'alias' }))),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'already-verified' } });
    expect(sendCode).not.toHaveBeenCalled();
  });

  it("allows verifying the requester's own primary email (badge only)", async () => {
    const response = await handleVerifyRequest(
      request({ email: 'me@ox.ac.uk' }),
      deps({ resolveIdentifier: vi.fn(async () => Promise.resolve(match())) }),
    );
    expect(response.status).toBe(200);
  });

  it('never resolves ownership for an unknown-university domain', async () => {
    const resolveIdentifier = vi.fn(async () => Promise.resolve(null));
    await handleVerifyRequest(request({ email: 'a@gmail.com' }), deps({ resolveIdentifier }));
    expect(resolveIdentifier).not.toHaveBeenCalled();
  });

  it('reserves before sending and persists delivery state on success', async () => {
    const sendCode = vi.fn(async () => Promise.resolve(ok({ id: 'email-1' })));
    const reserveVerification = vi.fn(async () =>
      Promise.resolve({
        status: 'reserved' as const,
        verificationId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    const recordDelivery = vi.fn(async () => Promise.resolve());
    const response = await handleVerifyRequest(
      request({ email: 'Student@OX.AC.UK' }),
      deps({ sendCode, reserveVerification, recordDelivery }),
    );
    expect(response.status).toBe(200);
    // 424242 → zero-padded already; sent to the lowercased address.
    expect(sendCode).toHaveBeenCalledWith('student@ox.ac.uk', '424242');
    expect(reserveVerification).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'student@ox.ac.uk',
      codeHash: sha256Hex('424242'),
      expiresAtMs: NOW + 15 * 60 * 1000,
    });
    expect(recordDelivery).toHaveBeenCalledWith({
      verificationId: '11111111-1111-4111-8111-111111111111',
      sent: true,
    });
  });

  it('does not report a delivered email as failed when the delivery audit write fails', async () => {
    const sendCode = vi.fn(async () => Promise.resolve(ok({ id: 'email-1' })));
    const response = await handleVerifyRequest(
      request({ email: 'student@ox.ac.uk' }),
      deps({
        sendCode,
        recordDelivery: vi.fn(async () => Promise.reject(new Error('database down'))),
      }),
    );
    expect(response.status).toBe(200);
  });
});
