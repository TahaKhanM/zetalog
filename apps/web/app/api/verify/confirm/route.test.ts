import { describe, expect, it, vi } from 'vitest';

import { hashCode } from '@/lib/verification';
import { handleVerifyConfirm, type PendingVerification, type VerifyConfirmDeps } from './handler';

const NOW = 1_700_000_000_000;
const CODE = '135790';

const pending: PendingVerification = {
  id: 'ver-1',
  email: 'student@ox.ac.uk',
  codeHash: hashCode(CODE),
  expiresAtMs: NOW + 60_000,
  attempts: 0,
};

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
    getLatestPending: vi.fn(async () => Promise.resolve(pending)),
    listUniversities: vi.fn(async () =>
      Promise.resolve([
        {
          id: 'ox',
          name: 'University of Oxford',
          slug: 'university-of-oxford',
          domains: ['ox.ac.uk'],
        },
      ]),
    ),
    incrementAttempts: vi.fn(async () => Promise.resolve()),
    applyVerification: vi.fn(async () => Promise.resolve()),
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
      deps({ getLatestPending: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(404);
  });

  it('grants the badge and stamps the profile on the correct code', async () => {
    const applyVerification = vi.fn(async () => Promise.resolve());
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({ applyVerification }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      university: { name: 'University of Oxford', slug: 'university-of-oxford' },
    });
    expect(applyVerification).toHaveBeenCalledWith({
      userId: 'user-1',
      universityId: 'ox',
      verificationId: 'ver-1',
      nowIso: new Date(NOW).toISOString(),
    });
  });

  it('increments attempts and reports remaining on a wrong code', async () => {
    const incrementAttempts = vi.fn(async () => Promise.resolve());
    const response = await handleVerifyConfirm(
      request({ code: '000000' }),
      deps({ incrementAttempts }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'incorrect-code' },
      attemptsRemaining: 4,
    });
    expect(incrementAttempts).toHaveBeenCalledWith('ver-1');
  });

  it('reports expiry (410) once the code has expired', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({ now: () => pending.expiresAtMs + 1 }),
    );
    expect(response.status).toBe(410);
  });

  it('locks out (429) once the attempt cap is reached', async () => {
    const response = await handleVerifyConfirm(
      request({ code: CODE }),
      deps({ getLatestPending: vi.fn(async () => Promise.resolve({ ...pending, attempts: 5 })) }),
    );
    expect(response.status).toBe(429);
  });
});
