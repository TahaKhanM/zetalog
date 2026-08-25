import { describe, expect, it, vi } from 'vitest';

import { hashCode } from '@/lib/verification';
import { handleVerifyConfirm, type VerifyConfirmDeps } from './handler';

const NOW = 1_700_000_000_000;
const CODE = '135790';

function request(body: unknown): Request {
  return new Request('http://localhost/api/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<VerifyConfirmDeps> = {}): VerifyConfirmDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    confirmVerification: vi.fn(async () =>
      Promise.resolve({
        status: 'ok' as const,
        university: { name: 'University of Oxford', slug: 'university-of-oxford' },
      }),
    ),
    now: () => NOW,
    ...over,
  };
}

describe('POST /api/verify/confirm', () => {
  it('returns 401 when not signed in', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for a non 6-digit code', async () => {
    expect((await handleVerifyConfirm(request({ code: '12' }), deps())).status).toBe(400);
  });

  it('returns 404 when there is no pending verification', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({
        confirmVerification: vi.fn(async () => Promise.resolve({ status: 'no-pending' as const })),
      }),
    );
    expect(response.status).toBe(404);
  });

  it('grants the badge and stamps the profile on the correct code', async () => {
    const confirmVerification = vi.fn(async () =>
      Promise.resolve({
        status: 'ok' as const,
        university: { name: 'University of Oxford', slug: 'university-of-oxford' },
      }),
    );
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({ confirmVerification }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      university: { name: 'University of Oxford', slug: 'university-of-oxford' },
    });
    expect(confirmVerification).toHaveBeenCalledWith({
      userId: 'user-1',
      codeHash: hashCode(CODE),
      nowIso: new Date(NOW).toISOString(),
    });
  });

  it('increments attempts and reports remaining on a wrong code', async () => {
    const confirmVerification = vi.fn(async () =>
      Promise.resolve({ status: 'incorrect' as const, attemptsRemaining: 4 }),
    );
    const response = await handleVerifyConfirm(
      request({ code: '000000' }),
      deps({ confirmVerification }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'incorrect-code' },
      attemptsRemaining: 4,
    });
    expect(confirmVerification).toHaveBeenCalledWith({
      userId: 'user-1',
      codeHash: hashCode('000000'),
      nowIso: new Date(NOW).toISOString(),
    });
  });

  it('reports expiry (410) once the code has expired', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({
        confirmVerification: vi.fn(async () => Promise.resolve({ status: 'expired' as const })),
      }),
    );
    expect(response.status).toBe(410);
  });

  it('locks out (429) once the attempt cap is reached', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({
        confirmVerification: vi.fn(async () => Promise.resolve({ status: 'locked' as const })),
      }),
    );
    expect(response.status).toBe(429);
  });

  it('maps a lost verified-alias race to 409 email-taken', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({
        confirmVerification: vi.fn(async () =>
          Promise.resolve({ status: 'alias-conflict' as const }),
        ),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'email-taken' } });
  });
});
