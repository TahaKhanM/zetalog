import { describe, expect, it, vi } from 'vitest';

import { handleMigrate } from './handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(bearer?: string): Request {
  return new Request('https://www.zetalog.co.uk/api/extension/migrate', {
    method: 'POST',
    headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
  });
}

describe('extension migration handler', () => {
  it('does not spend migration quota for missing or invalid legacy bearers', async () => {
    const resolveLegacyUserId = vi.fn(() => Promise.resolve(null));
    const consumeUserRateLimit = vi.fn();
    const createCredential = vi.fn();
    expect(
      (
        await handleMigrate(request(), {
          resolveLegacyUserId,
          consumeUserRateLimit,
          createCredential,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await handleMigrate(request('invalid'), {
          resolveLegacyUserId,
          consumeUserRateLimit,
          createCredential,
        })
      ).status,
    ).toBe(401);
    expect(consumeUserRateLimit).not.toHaveBeenCalled();
    expect(createCredential).not.toHaveBeenCalled();
  });

  it('limits a verified legacy user before issuing another independent credential', async () => {
    const createCredential = vi.fn();
    const response = await handleMigrate(request('legacy'), {
      resolveLegacyUserId: () => Promise.resolve(USER_ID),
      consumeUserRateLimit: () => Promise.resolve(false),
      createCredential,
    });
    expect(response.status).toBe(429);
    expect(createCredential).not.toHaveBeenCalled();
  });

  it('returns an opaque credential with only non-secret user metadata', async () => {
    const response = await handleMigrate(request('legacy'), {
      resolveLegacyUserId: () => Promise.resolve(USER_ID),
      consumeUserRateLimit: () => Promise.resolve(true),
      createCredential: () => Promise.resolve('zlx_independent_credential'),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'zlx_independent_credential', userId: USER_ID });
  });
});
