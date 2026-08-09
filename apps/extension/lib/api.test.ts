import { ZETAMAC_DEFAULT_SETTINGS, type GameRecord } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { type FetchLike } from './auth.js';
import { createApiClient, type ApiAuth } from './api.js';

const RECORD: GameRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  startedAtMs: 1_700_000_000_000,
  playedMs: 120_000,
  settings: ZETAMAC_DEFAULT_SETTINGS,
  events: [],
  claimedScore: 42,
};

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** A fetch stub replaying a queue of responses and recording every request. */
function scriptedFetch(responses: ({ status: number; body?: unknown } | Error)[]): {
  fetch: FetchLike;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: (init.headers as Record<string, string> | undefined) ?? {},
      body: typeof init.body === 'string' ? init.body : undefined,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error('scriptedFetch: no response queued');
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: () =>
        next.body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(next.body),
    });
  };
  return { fetch: fetchFn, calls };
}

/** An auth double: a fixed access token and a scripted refresh outcome. */
function fakeAuth(
  token: string | null,
  refreshTo: string | null = null,
): ApiAuth & { refreshes: number } {
  return {
    refreshes: 0,
    accessToken: () => Promise.resolve(token),
    refresh() {
      this.refreshes += 1;
      return Promise.resolve(refreshTo);
    },
  };
}

const OK_SUBMIT = { status: 201, body: { id: 'server-id', outcome: 'accepted', serverScore: 42 } };

describe('createApiClient.submitGame', () => {
  it('POSTs the record with a bearer token and parses the 201 body', async () => {
    const { fetch, calls } = scriptedFetch([OK_SUBMIT]);
    const client = createApiClient({ fetch, auth: fakeAuth('tok-1'), baseUrl: 'https://app.test' });

    const result = await client.submitGame(RECORD);

    expect(result).toEqual({
      ok: true,
      value: { id: 'server-id', outcome: 'accepted', serverScore: 42 },
    });
    expect(calls[0]?.url).toBe('https://app.test/api/games');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.authorization).toBe('Bearer tok-1');
    expect(JSON.parse(calls[0]?.body ?? '')).toMatchObject({ id: RECORD.id, claimedScore: 42 });
  });

  it('returns an auth error without calling the network when signed out', async () => {
    const { fetch, calls } = scriptedFetch([]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    const result = await client.submitGame(RECORD);
    expect(result).toEqual({ ok: false, error: { kind: 'auth' } });
    expect(calls).toHaveLength(0);
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 401 }, OK_SUBMIT]);
    const auth = fakeAuth('stale', 'fresh');
    const client = createApiClient({ fetch, auth, baseUrl: 'https://app.test' });

    const result = await client.submitGame(RECORD);

    expect(result.ok).toBe(true);
    expect(auth.refreshes).toBe(1);
    expect(calls[0]?.headers.authorization).toBe('Bearer stale');
    expect(calls[1]?.headers.authorization).toBe('Bearer fresh');
  });

  it('returns auth error when the refresh fails', async () => {
    const { fetch } = scriptedFetch([{ status: 401 }]);
    const client = createApiClient({
      fetch,
      auth: fakeAuth('stale', null),
      baseUrl: 'https://app.test',
    });
    const result = await client.submitGame(RECORD);
    expect(result).toEqual({ ok: false, error: { kind: 'auth' } });
  });

  it('propagates a network error thrown on the post-refresh retry', async () => {
    const { fetch } = scriptedFetch([{ status: 401 }, new Error('dropped')]);
    const client = createApiClient({
      fetch,
      auth: fakeAuth('stale', 'fresh'),
      baseUrl: 'https://app.test',
    });
    expect(await client.submitGame(RECORD)).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('returns auth error when the retry also 401s', async () => {
    const { fetch } = scriptedFetch([{ status: 401 }, { status: 401 }]);
    const client = createApiClient({
      fetch,
      auth: fakeAuth('stale', 'fresh'),
      baseUrl: 'https://app.test',
    });
    const result = await client.submitGame(RECORD);
    expect(result).toEqual({ ok: false, error: { kind: 'auth' } });
  });

  it('maps 422 to not-rankable', async () => {
    const { fetch } = scriptedFetch([{ status: 422, body: { error: { code: 'not-rankable' } } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.submitGame(RECORD)).toEqual({ ok: false, error: { kind: 'not-rankable' } });
  });

  it('maps 429 to rate-limited', async () => {
    const { fetch } = scriptedFetch([{ status: 429, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.submitGame(RECORD)).toEqual({ ok: false, error: { kind: 'rate-limited' } });
  });

  it('maps 400 to bad-request', async () => {
    const { fetch } = scriptedFetch([{ status: 400, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.submitGame(RECORD)).toEqual({ ok: false, error: { kind: 'bad-request' } });
  });

  it('maps an unexpected 5xx to a server error carrying the status', async () => {
    const { fetch } = scriptedFetch([{ status: 503, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.submitGame(RECORD)).toEqual({
      ok: false,
      error: { kind: 'server', status: 503 },
    });
  });

  it('reports a network error when fetch throws', async () => {
    const { fetch } = scriptedFetch([new Error('offline')]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.submitGame(RECORD)).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('reports a network error when a 201 body is malformed', async () => {
    const { fetch } = scriptedFetch([{ status: 201, body: { id: 'x' } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.submitGame(RECORD)).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('defaults the base URL to the bundled web app when none is injected', async () => {
    const { fetch, calls } = scriptedFetch([OK_SUBMIT]);
    const client = createApiClient({ fetch, auth: fakeAuth('t') });
    await client.submitGame(RECORD);
    expect(calls[0]?.url).toBe('https://www.zetalog.co.uk/api/games');
  });
});

describe('createApiClient.revokeGame', () => {
  it('DELETEs the game and resolves ok on 200', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: { ok: true } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    const result = await client.revokeGame('game-9');
    expect(result).toEqual({ ok: true, value: null });
    expect(calls[0]?.url).toBe('https://app.test/api/games/game-9');
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.body).toBeUndefined();
  });

  it('maps 404 to not-found', async () => {
    const { fetch } = scriptedFetch([{ status: 404, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.revokeGame('game-9')).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('percent-encodes the client game id in the path', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: { ok: true } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    await client.revokeGame('a/b c?d');
    expect(calls[0]?.url).toBe('https://app.test/api/games/a%2Fb%20c%3Fd');
  });

  it('refreshes and retries on 401', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 401 }, { status: 200, body: { ok: true } }]);
    const client = createApiClient({
      fetch,
      auth: fakeAuth('stale', 'fresh'),
      baseUrl: 'https://app.test',
    });
    expect(await client.revokeGame('g')).toEqual({ ok: true, value: null });
    expect(calls[1]?.headers.authorization).toBe('Bearer fresh');
  });

  it('maps an unexpected status to a server error', async () => {
    const { fetch } = scriptedFetch([{ status: 500, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.revokeGame('g')).toEqual({
      ok: false,
      error: { kind: 'server', status: 500 },
    });
  });

  it('propagates the auth error without a network call when signed out', async () => {
    const { fetch, calls } = scriptedFetch([]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    expect(await client.revokeGame('g')).toEqual({ ok: false, error: { kind: 'auth' } });
    expect(calls).toHaveLength(0);
  });
});

describe('createApiClient.restoreGame', () => {
  it('PATCHes the encoded game id and parses the restored server verdict', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, body: { id: 'server-id', outcome: 'quarantined', serverScore: 41 } },
    ]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });

    expect(await client.restoreGame('a/b c')).toEqual({
      ok: true,
      value: { id: 'server-id', outcome: 'quarantined', serverScore: 41 },
    });
    expect(calls[0]).toMatchObject({
      url: 'https://app.test/api/games/a%2Fb%20c',
      method: 'PATCH',
      body: undefined,
    });
  });

  it('rejects a malformed success body', async () => {
    const { fetch } = scriptedFetch([{ status: 200, body: { id: 'server-id' } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.restoreGame('g')).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('maps 404 and unexpected statuses', async () => {
    const missing = scriptedFetch([{ status: 404, body: {} }]);
    const missingClient = createApiClient({
      fetch: missing.fetch,
      auth: fakeAuth('t'),
      baseUrl: 'https://app.test',
    });
    expect(await missingClient.restoreGame('g')).toEqual({
      ok: false,
      error: { kind: 'not-found' },
    });

    const failed = scriptedFetch([{ status: 503, body: {} }]);
    const failedClient = createApiClient({
      fetch: failed.fetch,
      auth: fakeAuth('t'),
      baseUrl: 'https://app.test',
    });
    expect(await failedClient.restoreGame('g')).toEqual({
      ok: false,
      error: { kind: 'server', status: 503 },
    });
  });

  it('propagates an auth failure', async () => {
    const { fetch, calls } = scriptedFetch([]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    expect(await client.restoreGame('g')).toEqual({ ok: false, error: { kind: 'auth' } });
    expect(calls).toHaveLength(0);
  });
});

describe('createApiClient.startChallenge', () => {
  const challenge = {
    challengeId: '44444444-4444-4444-8444-444444444444',
    nonce: 'zlc_nonce-123456789',
  };

  it('POSTs without a body and parses a challenge', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 201, body: challenge }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.startChallenge()).toEqual({ ok: true, value: challenge });
    expect(calls[0]).toMatchObject({
      url: 'https://app.test/api/games/challenge',
      method: 'POST',
      body: undefined,
    });
  });

  it('rejects a malformed challenge body', async () => {
    const { fetch } = scriptedFetch([
      { status: 201, body: { challengeId: 'bad', nonce: 'short' } },
    ]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.startChallenge()).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('maps a non-201 response and propagates auth failures', async () => {
    const failed = scriptedFetch([{ status: 503, body: {} }]);
    const failedClient = createApiClient({
      fetch: failed.fetch,
      auth: fakeAuth('t'),
      baseUrl: 'https://app.test',
    });
    expect(await failedClient.startChallenge()).toEqual({
      ok: false,
      error: { kind: 'server', status: 503 },
    });

    const signedOut = scriptedFetch([]);
    const signedOutClient = createApiClient({
      fetch: signedOut.fetch,
      auth: fakeAuth(null),
      baseUrl: 'https://app.test',
    });
    expect(await signedOutClient.startChallenge()).toEqual({ ok: false, error: { kind: 'auth' } });
  });
});

describe('createApiClient.revokeCredential', () => {
  it.each([200, 401, 404])('treats status %s as a terminal success', async (status) => {
    const { fetch, calls } = scriptedFetch([{ status, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    expect(await client.revokeCredential('zlx_pending')).toEqual({ ok: true, value: null });
    expect(calls[0]).toMatchObject({
      url: 'https://app.test/api/extension/session',
      method: 'DELETE',
      body: undefined,
    });
  });

  it('revokes a retained credential without reading or refreshing the active session', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: {} }]);
    const auth: ApiAuth = {
      accessToken: () => Promise.reject(new Error('must not read active auth')),
      refresh: () => Promise.reject(new Error('must not refresh active auth')),
    };
    const client = createApiClient({ fetch, auth, baseUrl: 'https://app.test' });

    expect(await client.revokeCredential('zlx_pending')).toEqual({ ok: true, value: null });
    expect(calls[0]?.headers).toMatchObject({ authorization: 'Bearer zlx_pending' });
  });

  it('retains a credential when its direct revocation request cannot reach the server', async () => {
    const { fetch } = scriptedFetch([new Error('offline')]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    expect(await client.revokeCredential('zlx_pending')).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('maps an unexpected status to a retryable server failure', async () => {
    const failed = scriptedFetch([{ status: 500, body: {} }]);
    const failedClient = createApiClient({
      fetch: failed.fetch,
      auth: fakeAuth('t'),
      baseUrl: 'https://app.test',
    });
    expect(await failedClient.revokeCredential('zlx_pending')).toEqual({
      ok: false,
      error: { kind: 'server', status: 500 },
    });
  });

  it('can revoke the active credential and fails closed when none is stored', async () => {
    const active = scriptedFetch([{ status: 200, body: {} }]);
    const activeClient = createApiClient({
      fetch: active.fetch,
      auth: fakeAuth('zlx_active'),
      baseUrl: 'https://app.test',
    });
    expect(await activeClient.revokeSession()).toEqual({ ok: true, value: null });

    const signedOut = scriptedFetch([]);
    const signedOutClient = createApiClient({
      fetch: signedOut.fetch,
      auth: fakeAuth(null),
      baseUrl: 'https://app.test',
    });
    expect(await signedOutClient.revokeSession()).toEqual({ ok: false, error: { kind: 'auth' } });
    expect(signedOut.calls).toHaveLength(0);
  });
});

describe('createApiClient.getProfile', () => {
  it('GETs the profile and parses the opt-out flag', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, body: { displayName: 'ada', independent: false, leaderboardOptOut: true } },
    ]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.getProfile()).toEqual({ ok: true, value: { leaderboardOptOut: true } });
    expect(calls[0]?.url).toBe('https://app.test/api/profile');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.body).toBeUndefined();
  });

  it('treats a 404 (no profile row yet) as visible', async () => {
    const { fetch } = scriptedFetch([{ status: 404, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.getProfile()).toEqual({ ok: true, value: { leaderboardOptOut: false } });
  });

  it('reports a network error when the 200 body is malformed', async () => {
    const { fetch } = scriptedFetch([{ status: 200, body: { displayName: 'ada' } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.getProfile()).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('maps an unexpected status to a server error', async () => {
    const { fetch } = scriptedFetch([{ status: 500, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.getProfile()).toEqual({
      ok: false,
      error: { kind: 'server', status: 500 },
    });
  });

  it('reports a network error when fetch throws', async () => {
    const { fetch } = scriptedFetch([new Error('offline')]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.getProfile()).toEqual({ ok: false, error: { kind: 'network' } });
  });
});

describe('createApiClient.setLeaderboardOptOut', () => {
  it('POSTs the opt-out to /api/profile and resolves ok on 200', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: { ok: true } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.setLeaderboardOptOut(true)).toEqual({ ok: true, value: null });
    expect(calls[0]?.url).toBe('https://app.test/api/profile');
    expect(calls[0]?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ leaderboardOptOut: true });
  });

  it('maps 400 to bad-request', async () => {
    const { fetch } = scriptedFetch([{ status: 400, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.setLeaderboardOptOut(false)).toEqual({
      ok: false,
      error: { kind: 'bad-request' },
    });
  });

  it('maps an unexpected status to a server error', async () => {
    const { fetch } = scriptedFetch([{ status: 500, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.setLeaderboardOptOut(true)).toEqual({
      ok: false,
      error: { kind: 'server', status: 500 },
    });
  });

  it('propagates the auth error without a network call when signed out', async () => {
    const { fetch, calls } = scriptedFetch([]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    expect(await client.setLeaderboardOptOut(true)).toEqual({ ok: false, error: { kind: 'auth' } });
    expect(calls).toHaveLength(0);
  });
});

describe('createApiClient.listGames', () => {
  const remote = {
    clientGameId: '11111111-1111-4111-8111-111111111111',
    playedAt: '2026-07-01T00:00:00.000Z',
    settingsFingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
    rankableDuration: 120 as const,
    claimedScore: 40,
    serverScore: 42,
    status: 'accepted' as const,
  };

  it('GETs and parses the games array', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: { games: [remote] } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.listGames()).toEqual({ ok: true, value: [remote] });
    expect(calls[0]?.url).toBe('https://app.test/api/games');
    expect(calls[0]?.method).toBe('GET');
  });

  it('reports a network error when the body is malformed', async () => {
    const { fetch } = scriptedFetch([{ status: 200, body: { games: [{ clientGameId: 'x' }] } }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.listGames()).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('maps an unexpected status to a server error', async () => {
    const { fetch } = scriptedFetch([{ status: 500, body: {} }]);
    const client = createApiClient({ fetch, auth: fakeAuth('t'), baseUrl: 'https://app.test' });
    expect(await client.listGames()).toEqual({ ok: false, error: { kind: 'server', status: 500 } });
  });

  it('propagates the auth error without a network call when signed out', async () => {
    const { fetch, calls } = scriptedFetch([]);
    const client = createApiClient({ fetch, auth: fakeAuth(null), baseUrl: 'https://app.test' });
    expect(await client.listGames()).toEqual({ ok: false, error: { kind: 'auth' } });
    expect(calls).toHaveLength(0);
  });
});
