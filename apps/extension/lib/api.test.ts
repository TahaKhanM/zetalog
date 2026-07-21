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
    expect(calls[0]?.url).toBe('https://zetalog.vercel.app/api/games');
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
