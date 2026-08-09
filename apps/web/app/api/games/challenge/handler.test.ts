import { describe, expect, it, vi } from 'vitest';

import {
  GAME_CHALLENGE_LIMIT_PER_HOUR,
  handleGameChallengePost,
  type GameChallengeDeps,
} from './handler';

const TOKEN = 'zlx_test-token';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(token: string | null = TOKEN): Request {
  return new Request('https://www.zetalog.co.uk/api/games/challenge', {
    method: 'POST',
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

function deps(over: Partial<GameChallengeDeps> = {}) {
  return {
    authenticate: vi.fn(async () => Promise.resolve(USER_ID)),
    consumeLimit: vi.fn(async () => Promise.resolve(true)),
    createChallenge: vi.fn(async () =>
      Promise.resolve({
        challengeId: '22222222-2222-4222-8222-222222222222',
        nonce: 'zlc_example',
      }),
    ),
    ...over,
  };
}

describe('game challenge admission', () => {
  it('requires a valid extension credential before spending quota', async () => {
    const missing = deps();
    expect((await handleGameChallengePost(request(null), missing)).status).toBe(401);
    expect(missing.consumeLimit).not.toHaveBeenCalled();

    const invalid = deps({ authenticate: vi.fn(async () => Promise.resolve(null)) });
    expect((await handleGameChallengePost(request(), invalid)).status).toBe(401);
    expect(invalid.consumeLimit).not.toHaveBeenCalled();
  });

  it('issues evidence below the generous limit', async () => {
    const dependencies = deps();
    const response = await handleGameChallengePost(request(), dependencies);
    expect(response.status).toBe(201);
    expect(dependencies.consumeLimit).toHaveBeenCalledWith(USER_ID);
    expect(dependencies.createChallenge).toHaveBeenCalledWith(USER_ID);
    expect(GAME_CHALLENGE_LIMIT_PER_HOUR).toBe(120);
  });

  it('returns a friction-free fallback when the limit is exhausted', async () => {
    const dependencies = deps({ consumeLimit: vi.fn(async () => Promise.resolve(false)) });
    const response = await handleGameChallengePost(request(), dependencies);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'rate-limited',
        message: 'Challenge limit reached; this game can still sync normally.',
      },
    });
    expect(dependencies.createChallenge).not.toHaveBeenCalled();
  });
});
