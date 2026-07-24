import { ZETAMAC_DEFAULT_SETTINGS, type GameRecord } from '@zetalog/shared';
import { describe, expect, it, vi } from 'vitest';

import type { GameToInsert, SubmitPort } from '@/lib/games/submit';
import { handleGamesGet, handleGamesPost, type GamesPostDeps } from './handler';
import { OPTIONS } from './route';

const record: GameRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  startedAtMs: 0,
  playedMs: 118_000,
  settings: ZETAMAC_DEFAULT_SETTINGS,
  events: [
    { kind: 'problem', at: 0, text: '2 + 3' },
    { kind: 'input', at: 1400, value: '5' },
    { kind: 'accepted', at: 1420, answer: 5 },
  ],
  claimedScore: 1,
};

function port(): SubmitPort {
  return {
    countGamesReceivedSince: vi.fn(async () => Promise.resolve(0)),
    getAcceptedScores: vi.fn(async () => Promise.resolve([])),
    insertGame: vi.fn(async (game: GameToInsert) =>
      Promise.resolve({ id: 'row-1', outcome: game.status, serverScore: game.serverScore }),
    ),
  };
}

function deps(over: Partial<GamesPostDeps> = {}): GamesPostDeps {
  return {
    authenticateBearer: vi.fn(async () => Promise.resolve('user-1')),
    port: port(),
    now: () => 1_700_000_000_000,
    ...over,
  };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/games', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const response = await handleGamesPost(request(record), deps());
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 401 when the bearer token does not resolve to a user', async () => {
    const response = await handleGamesPost(
      request(record, { authorization: 'Bearer bad' }),
      deps({ authenticateBearer: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when the body is not a valid game record', async () => {
    const response = await handleGamesPost(
      request({ nope: true }, { authorization: 'Bearer good' }),
      deps(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'bad-request' } });
  });

  it('accepts a valid submission and returns 201 with the outcome', async () => {
    const response = await handleGamesPost(
      request(record, { authorization: 'Bearer good' }),
      deps(),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'row-1', outcome: 'accepted', serverScore: 1 });
  });

  it('answers CORS preflight with 204 and permissive headers', () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
  });
});

describe('GET /api/games', () => {
  function getRequest(token?: string): Request {
    return new Request('http://localhost/api/games', {
      method: 'GET',
      headers: token !== undefined ? { authorization: `Bearer ${token}` } : {},
    });
  }

  const sample = {
    clientGameId: '44444444-4444-4444-8444-444444444444',
    playedAt: '2026-07-01T00:00:00.000Z',
    settingsFingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
    rankableDuration: 120,
    claimedScore: 40,
    serverScore: 40,
    status: 'accepted',
  };

  it('401s without a bearer token', async () => {
    const response = await handleGamesGet(getRequest(), {
      authenticateBearer: vi.fn(async () => Promise.resolve('u1')),
      listGames: vi.fn(async () => Promise.resolve([])),
    });
    expect(response.status).toBe(401);
  });

  it('401s for an invalid token', async () => {
    const response = await handleGamesGet(getRequest('bad'), {
      authenticateBearer: vi.fn(async () => Promise.resolve(null)),
      listGames: vi.fn(async () => Promise.resolve([])),
    });
    expect(response.status).toBe(401);
  });

  it("returns the caller's games", async () => {
    const listGames = vi.fn(async () => Promise.resolve([sample]));
    const response = await handleGamesGet(getRequest('tok'), {
      authenticateBearer: vi.fn(async () => Promise.resolve('u1')),
      listGames,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ games: [sample] });
    expect(listGames).toHaveBeenCalledWith('u1');
  });
});
