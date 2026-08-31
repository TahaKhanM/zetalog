import { describe, expect, it } from 'vitest';

import {
  AUTH_STATE_KEY,
  SESSION_KEY,
  classifyIdentityFailure,
  createAuthController,
  decodeUserId,
  requestRefresh,
  sessionFromTokens,
  sessionSchema,
  type FetchLike,
  type IdentityApi,
  type Session,
} from './auth.js';
import { SUPABASE_URL } from './endpoints.js';

/** Build a JWT-shaped token whose payload is the given claims (unsigned; ok for decode tests). */
function jwt(claims: Record<string, unknown>): string {
  const seg = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${seg({ alg: 'HS256', typ: 'JWT' })}.${seg(claims)}.signature`;
}

const CONFIG = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon-key-123' };

const SESSION: Session = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  userId: 'user-1',
};

/** A minimal in-memory storage area with the get/set/remove surface auth needs. */
function fakeArea(initial: Record<string, unknown> = {}): {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    get: (key) => Promise.resolve(data.has(key) ? { [key]: data.get(key) } : {}),
    set: (items) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

/** A single-shot fetch stub returning one JSON response (or rejecting). */
function fetchOnce(
  impl: (url: string, init: RequestInit) => { status: number; body: unknown } | Error,
): FetchLike {
  return (url, init) => {
    const result = impl(url, init);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve({
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: () => Promise.resolve(result.body),
    });
  };
}

/** A fetch stub whose body rejects — a malformed (non-JSON) response. */
const malformedJsonFetch: FetchLike = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.reject(new Error('not json')),
  });

const tokenBody = {
  access_token: 'access-NEW',
  refresh_token: 'refresh-NEW',
  user: { id: 'user-1' },
};

type FetchStep = { status: number; body?: unknown; malformed?: boolean } | Error;

/** A multi-request fetch stub for legacy migration/refresh sequences. */
function fetchSequence(steps: readonly FetchStep[]): FetchLike & {
  calls: string[];
  inits: RequestInit[];
} {
  const queue = [...steps];
  const calls: string[] = [];
  const inits: RequestInit[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push(url);
    inits.push(init);
    const next = queue.shift();
    if (next === undefined) return Promise.reject(new Error('no response queued'));
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: () =>
        next.malformed ? Promise.reject(new Error('not json')) : Promise.resolve(next.body ?? {}),
    });
  };
  return Object.assign(fetchFn, { calls, inits });
}

function fakeIdentity(
  complete: (authorizeUrl: string) => string | undefined | Promise<string | undefined>,
): IdentityApi & { authorizeUrls: string[] } {
  const authorizeUrls: string[] = [];
  return {
    authorizeUrls,
    getRedirectURL: (path = '') => `https://extension-id.chromiumapp.org/${path}`,
    launchWebAuthFlow: ({ url }) => {
      authorizeUrls.push(url);
      return Promise.resolve(complete(url));
    },
  };
}

describe('sessionSchema', () => {
  it('rejects a session missing a token', () => {
    expect(
      sessionSchema.safeParse({ accessToken: '', refreshToken: 'r', userId: 'u' }).success,
    ).toBe(false);
  });
});

describe('classifyIdentityFailure', () => {
  it.each([
    ['The user did not approve access.', 'cancelled'],
    ['Authorization page could not be loaded.', 'network'],
    ['Did not redirect to the right URL.', 'invalid-callback'],
    ['Identity API is disabled in incognito windows.', 'identity-unavailable'],
    ['An unexpected browser failure occurred.', 'identity-failed'],
  ] as const)('maps Chrome Identity %s safely', (message, expected) => {
    expect(classifyIdentityFailure(new Error(message))).toBe(expected);
  });

  it('does not mistake an untyped rejection for a user cancellation', () => {
    expect(classifyIdentityFailure({ message: 'The user did not approve access.' })).toBe(
      'identity-failed',
    );
  });
});

describe('requestRefresh', () => {
  it('POSTs to the token endpoint with the anon apikey and refresh token', async () => {
    let seenUrl = '';
    let seenInit: RequestInit = {};
    const fetchFn = fetchOnce((url, init) => {
      seenUrl = url;
      seenInit = init;
      return { status: 200, body: tokenBody };
    });

    const result = await requestRefresh('refresh-xyz', fetchFn, CONFIG);

    expect(result.ok).toBe(true);
    expect(seenUrl).toBe('https://proj.supabase.co/auth/v1/token?grant_type=refresh_token');
    expect(seenInit.method).toBe('POST');
    const headers = seenInit.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-key-123');
    expect(JSON.parse(seenInit.body as string)).toEqual({ refresh_token: 'refresh-xyz' });
  });

  it('maps a successful response to a Session', async () => {
    const result = await requestRefresh(
      'r',
      fetchOnce(() => ({ status: 200, body: tokenBody })),
      CONFIG,
    );
    expect(result).toEqual({
      ok: true,
      value: { accessToken: 'access-NEW', refreshToken: 'refresh-NEW', userId: 'user-1' },
    });
  });

  it('uses the bundled config when no override is supplied', async () => {
    let seenUrl = '';
    const result = await requestRefresh(
      'r',
      fetchOnce((url) => {
        seenUrl = url;
        return { status: 200, body: tokenBody };
      }),
    );
    expect(result.ok).toBe(true);
    expect(seenUrl).toBe(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`);
  });

  it('never includes the token in the error detail on a network failure', async () => {
    const result = await requestRefresh(
      'secret-refresh',
      fetchOnce(() => new Error('boom')),
      CONFIG,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('refresh-failed');
      expect(result.error.detail).not.toContain('secret-refresh');
    }
  });

  it('fails on a non-2xx status', async () => {
    const result = await requestRefresh(
      'r',
      fetchOnce(() => ({ status: 400, body: {} })),
      CONFIG,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('400');
  });

  it('fails when the body is not JSON', async () => {
    const result = await requestRefresh('r', malformedJsonFetch, CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('malformed');
  });

  it('fails when the response shape is unexpected', async () => {
    const result = await requestRefresh(
      'r',
      fetchOnce(() => ({ status: 200, body: { access_token: 'a' } })),
      CONFIG,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('shape');
  });
});

describe('decodeUserId', () => {
  it('reads the sub claim from a well-formed JWT', () => {
    expect(decodeUserId(jwt({ sub: 'user-42', role: 'authenticated' }))).toBe('user-42');
  });

  it('returns null for a token without three segments', () => {
    expect(decodeUserId('not-a-jwt')).toBeNull();
  });

  it('returns null when the payload is not valid base64/JSON', () => {
    expect(decodeUserId('aaa.@@@.ccc')).toBeNull();
  });

  it('returns null when there is no string sub', () => {
    expect(decodeUserId(jwt({ role: 'authenticated' }))).toBeNull();
    expect(decodeUserId(jwt({ sub: 123 }))).toBeNull();
    expect(decodeUserId(jwt({ sub: '' }))).toBeNull();
  });

  it('returns null when the payload is a JSON primitive, not an object', () => {
    const seg = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(decodeUserId(`${seg('h')}.${seg('just-a-string')}.sig`)).toBeNull();
  });
});

describe('sessionFromTokens', () => {
  it('derives userId from the access token', () => {
    expect(sessionFromTokens(jwt({ sub: 'u1' }), 'r1')).toEqual({
      accessToken: jwt({ sub: 'u1' }),
      refreshToken: 'r1',
      userId: 'u1',
    });
  });

  it('returns null for a malformed access token', () => {
    expect(sessionFromTokens('garbage', 'r1')).toBeNull();
  });
});

describe('createAuthController', () => {
  it('reads null when no session is stored', async () => {
    const controller = createAuthController(fakeArea(), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await controller.read()).toEqual({ ok: true, value: null });
  });

  it('falls back to the bundled Supabase config when none is injected', async () => {
    const controller = createAuthController(fakeArea(), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
    });
    expect(await controller.read()).toEqual({ ok: true, value: null });
  });

  it('reads a stored session', async () => {
    const controller = createAuthController(fakeArea({ [SESSION_KEY]: SESSION }), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await controller.read()).toEqual({ ok: true, value: SESSION });
  });

  it('surfaces corruption rather than crashing', async () => {
    const controller = createAuthController(fakeArea({ [SESSION_KEY]: { accessToken: 123 } }), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    const result = await controller.read();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('corrupt-session');
  });

  it('save persists and accessToken reads it back', async () => {
    const area = fakeArea();
    const controller = createAuthController(area, {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    await controller.save(SESSION);
    expect(area.data.get(SESSION_KEY)).toEqual(SESSION);
    expect(await controller.needsRelink()).toBe(false);
    expect(await controller.accessToken()).toBe('access-abc');
  });

  it('reads an independent extension credential without refreshing or migrating it', async () => {
    const extensionSession = { kind: 'extension' as const, token: 'zlx_token', userId: 'user-7' };
    const fetchFn = fetchSequence([]);
    const controller = createAuthController(fakeArea({ [SESSION_KEY]: extensionSession }), {
      fetch: fetchFn,
      config: CONFIG,
    });

    expect(await controller.accessToken()).toBe('zlx_token');
    expect(await controller.storedUserId()).toBe('user-7');
    expect(await controller.userId()).toBe('user-7');
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('reads a legacy owner id without waiting for migration on the capture path', async () => {
    const fetchFn = fetchSequence([new Error('capture must not make a request')]);
    const controller = createAuthController(fakeArea({ [SESSION_KEY]: SESSION }), {
      fetch: fetchFn,
      config: CONFIG,
    });

    expect(await controller.storedUserId()).toBe('user-1');
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('silently migrates a valid legacy session to an independent credential', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const fetchFn = fetchSequence([
      { status: 200, body: { token: 'zlx_migrated', userId: 'user-1' } },
    ]);
    const controller = createAuthController(area, {
      fetch: fetchFn,
      config: CONFIG,
      apiBaseUrl: 'https://app.test',
    });

    expect(await controller.accessToken()).toBe('zlx_migrated');
    expect(area.data.get(SESSION_KEY)).toEqual({
      kind: 'extension',
      token: 'zlx_migrated',
      userId: 'user-1',
    });
    expect(await controller.needsRelink()).toBe(false);
    expect(fetchFn.calls).toEqual(['https://app.test/api/extension/migrate']);
  });

  it.each([
    ['network failure', new Error('offline')],
    ['server failure', { status: 503, body: {} }],
    ['malformed JSON', { status: 200, malformed: true }],
    ['unexpected body', { status: 200, body: { token: '' } }],
  ] as const)(
    'keeps normal uploads working through a temporary migration %s',
    async (_name, step) => {
      const area = fakeArea({ [SESSION_KEY]: SESSION });
      const controller = createAuthController(area, {
        fetch: fetchSequence([step]),
        config: CONFIG,
      });

      expect(await controller.accessToken()).toBe('access-abc');
      expect(area.data.get(SESSION_KEY)).toEqual(SESSION);
    },
  );

  it('keeps a legacy session usable when a migration endpoint rejects it non-terminally', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchSequence([{ status: 403, body: {} }]),
      config: CONFIG,
    });

    expect(await controller.accessToken()).toBe('access-abc');
    expect(area.data.get(SESSION_KEY)).toEqual(SESSION);
  });

  it('refreshes once then migrates when the legacy access token has expired', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const fetchFn = fetchSequence([
      { status: 401, body: {} },
      { status: 200, body: tokenBody },
      { status: 200, body: { token: 'zlx_after-refresh', userId: 'user-1' } },
    ]);
    const controller = createAuthController(area, {
      fetch: fetchFn,
      config: CONFIG,
      apiBaseUrl: 'https://app.test',
    });

    expect(await controller.accessToken()).toBe('zlx_after-refresh');
    expect(area.data.get(SESSION_KEY)).toEqual({
      kind: 'extension',
      token: 'zlx_after-refresh',
      userId: 'user-1',
    });
  });

  it('falls back to the refreshed JWT when retry migration is temporarily unavailable', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchSequence([
        { status: 401, body: {} },
        { status: 200, body: tokenBody },
        { status: 503, body: {} },
      ]),
      config: CONFIG,
    });

    expect(await controller.accessToken()).toBe('access-NEW');
    expect(area.data.get(SESSION_KEY)).toEqual({
      accessToken: 'access-NEW',
      refreshToken: 'refresh-NEW',
      userId: 'user-1',
    });
  });

  it('requests the one-time relink when both the access and refreshed JWT are invalid', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchSequence([
        { status: 401, body: {} },
        { status: 200, body: tokenBody },
        { status: 401, body: {} },
      ]),
      config: CONFIG,
    });

    expect(await controller.accessToken()).toBeNull();
    expect(area.data.has(SESSION_KEY)).toBe(false);
    expect(await controller.needsRelink()).toBe(true);
  });

  it('keeps a legacy session during a non-terminal refresh outage', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchSequence([
        { status: 401, body: {} },
        { status: 503, body: {} },
      ]),
      config: CONFIG,
    });

    expect(await controller.accessToken()).toBeNull();
    expect(area.data.get(SESSION_KEY)).toEqual(SESSION);
    expect(await controller.needsRelink()).toBe(false);
  });

  it('requests relink when the legacy refresh token is terminally invalid', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchSequence([
        { status: 401, body: {} },
        { status: 400, body: {} },
      ]),
      config: CONFIG,
    });

    expect(await controller.accessToken()).toBeNull();
    expect(area.data.has(SESSION_KEY)).toBe(false);
    expect(await controller.needsRelink()).toBe(true);
  });

  it('accessToken is null when signed out or corrupt', async () => {
    const out = createAuthController(fakeArea(), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await out.accessToken()).toBeNull();
    const corrupt = createAuthController(fakeArea({ [SESSION_KEY]: 5 }), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await corrupt.accessToken()).toBeNull();
  });

  it('isLinked reflects whether a readable session is stored', async () => {
    const out = createAuthController(fakeArea(), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await out.isLinked()).toBe(false);
    const linkedIn = createAuthController(fakeArea({ [SESSION_KEY]: SESSION }), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await linkedIn.isLinked()).toBe(true);
  });

  it('clears a corrupt session and exposes the agreed one-time relink state', async () => {
    const area = fakeArea({ [SESSION_KEY]: { bad: true } });
    const controller = createAuthController(area, {
      fetch: fetchSequence([]),
      config: CONFIG,
    });

    expect(await controller.isLinked()).toBe(false);
    expect(area.data.has(SESSION_KEY)).toBe(false);
    expect(await controller.needsRelink()).toBe(true);
  });

  it('uses an explicit Chrome identity PKCE redirect and stores only the returned credential', async () => {
    const area = fakeArea();
    const identity = fakeIdentity((authorizeUrl) => {
      const url = new URL(authorizeUrl);
      expect(url.pathname).toBe('/api/extension/link/authorize');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://extension-id.chromiumapp.org/zetalog-link',
      );
      expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      const state = url.searchParams.get('state');
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return `https://extension-id.chromiumapp.org/zetalog-link?code=one-time-code&state=${state ?? ''}`;
    });
    const fetchFn = fetchSequence([
      { status: 200, body: { supported: true } },
      { status: 200, body: { credential: 'zlx_opaque', userId: 'user-7' } },
    ]);
    const controller = createAuthController(area, {
      fetch: fetchFn,
      config: CONFIG,
      apiBaseUrl: 'https://app.test',
      identity,
    });

    expect(await controller.beginLink()).toEqual({ ok: true });
    expect(identity.authorizeUrls).toHaveLength(1);
    expect(fetchFn.calls).toEqual([
      'https://app.test/api/extension/link/status?redirect_uri=https%3A%2F%2Fextension-id.chromiumapp.org%2Fzetalog-link',
      'https://app.test/api/extension/link/token',
    ]);
    const exchangeBody: unknown = JSON.parse(fetchFn.inits[1]?.body as string);
    expect(exchangeBody).toMatchObject({
      code: 'one-time-code',
      redirectUri: 'https://extension-id.chromiumapp.org/zetalog-link',
    });
    const codeVerifier =
      typeof exchangeBody === 'object' && exchangeBody !== null && 'codeVerifier' in exchangeBody
        ? exchangeBody.codeVerifier
        : undefined;
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(area.data.get(SESSION_KEY)).toEqual({
      kind: 'extension',
      token: 'zlx_opaque',
      userId: 'user-7',
    });
  });

  it('rejects a mismatched identity callback before a code exchange', async () => {
    const fetchFn = fetchSequence([{ status: 200, body: { supported: true } }]);
    const controller = createAuthController(fakeArea(), {
      fetch: fetchFn,
      config: CONFIG,
      identity: fakeIdentity(
        () => 'https://extension-id.chromiumapp.org/not-our-redirect?code=x&state=y',
      ),
    });

    expect(await controller.beginLink()).toEqual({ ok: false, error: 'invalid-callback' });
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('fails closed when Chrome cancels the interactive identity window', async () => {
    const fetchFn = fetchSequence([{ status: 200, body: { supported: true } }]);
    const identity: IdentityApi = {
      getRedirectURL: () => 'https://extension-id.chromiumapp.org/zetalog-link',
      launchWebAuthFlow: () => Promise.reject(new Error('The user did not approve access.')),
    };
    const controller = createAuthController(fakeArea(), {
      fetch: fetchFn,
      config: CONFIG,
      identity,
    });

    expect(await controller.beginLink()).toEqual({ ok: false, error: 'cancelled' });
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('fails closed when link initiation lacks the service-worker identity API', async () => {
    const fetchFn = fetchSequence([]);
    const controller = createAuthController(fakeArea(), { fetch: fetchFn, config: CONFIG });

    expect(await controller.beginLink()).toEqual({ ok: false, error: 'identity-unavailable' });
    expect(fetchFn.calls).toEqual([]);
  });

  it.each([
    ['network failure', new Error('offline'), 'network'],
    ['unconfigured extension id', { status: 409, body: {} }, 'extension-not-enabled'],
    ['server failure', { status: 503, body: {} }, 'server'],
  ] as const)(
    'stops before Chrome Identity when the link preflight has a %s',
    async (_name, step, error) => {
      const identity = fakeIdentity(() => undefined);
      const controller = createAuthController(fakeArea(), {
        fetch: fetchSequence([step]),
        config: CONFIG,
        identity,
      });

      expect(await controller.beginLink()).toEqual({ ok: false, error });
      expect(identity.authorizeUrls).toEqual([]);
    },
  );

  it.each([
    ['network failure', new Error('offline')],
    ['non-success response', { status: 429, body: {} }],
    ['malformed JSON', { status: 200, malformed: true }],
    ['unexpected response', { status: 200, body: { credential: 'missing-user' } }],
  ] as const)('keeps no credential when the token exchange has %s', async (_name, step) => {
    const identity = fakeIdentity((authorizeUrl) => {
      const state = new URL(authorizeUrl).searchParams.get('state');
      return `https://extension-id.chromiumapp.org/zetalog-link?code=one-time-code&state=${state ?? ''}`;
    });
    const area = fakeArea();
    const controller = createAuthController(area, {
      fetch: fetchSequence([{ status: 200, body: { supported: true } }, step]),
      config: CONFIG,
      identity,
    });

    expect(await controller.beginLink()).toEqual({ ok: false, error: 'exchange-failed' });
    expect(area.data.has(SESSION_KEY)).toBe(false);
  });

  it('clear removes the stored session', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    await controller.clear();
    expect(area.data.has(SESSION_KEY)).toBe(false);
  });

  it('refresh exchanges the stored refresh token, persists, and returns the new access token', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchOnce(() => ({ status: 200, body: tokenBody })),
      config: CONFIG,
    });
    const token = await controller.refresh();
    expect(token).toBe('access-NEW');
    expect(area.data.get(SESSION_KEY)).toEqual({
      accessToken: 'access-NEW',
      refreshToken: 'refresh-NEW',
      userId: 'user-1',
    });
  });

  it('refresh returns null and leaves the session untouched when there is none', async () => {
    const controller = createAuthController(fakeArea(), {
      fetch: fetchOnce(() => ({ status: 200, body: {} })),
      config: CONFIG,
    });
    expect(await controller.refresh()).toBeNull();
  });

  it('refresh returns null on a corrupt stored session', async () => {
    const controller = createAuthController(fakeArea({ [SESSION_KEY]: { nope: true } }), {
      fetch: fetchOnce(() => ({ status: 200, body: tokenBody })),
      config: CONFIG,
    });
    expect(await controller.refresh()).toBeNull();
  });

  it('refresh invalidates an opaque credential so the popup asks for one relink', async () => {
    const area = fakeArea({
      [SESSION_KEY]: { kind: 'extension', token: 'zlx_invalid', userId: 'user-1' },
    });
    const controller = createAuthController(area, {
      fetch: fetchSequence([]),
      config: CONFIG,
    });

    expect(await controller.refresh()).toBeNull();
    expect(area.data.has(SESSION_KEY)).toBe(false);
    expect(await controller.needsRelink()).toBe(true);
  });

  it('refresh is single-flight: concurrent callers share one token exchange', async () => {
    let fetches = 0;
    const counting: FetchLike = () => {
      fetches += 1;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(tokenBody) });
    };
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, { fetch: counting, config: CONFIG });

    const tokens = await Promise.all([controller.refresh(), controller.refresh()]);

    expect(fetches).toBe(1); // one exchange, not two
    expect(tokens).toEqual(['access-NEW', 'access-NEW']);
    expect(area.data.get(SESSION_KEY)).toEqual({
      accessToken: 'access-NEW',
      refreshToken: 'refresh-NEW',
      userId: 'user-1',
    });
  });

  it('refresh returns null when the network exchange fails', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchOnce(() => ({ status: 401, body: {} })),
      config: CONFIG,
    });
    expect(await controller.refresh()).toBeNull();
    expect(area.data.has(SESSION_KEY)).toBe(false);
    expect(await controller.needsRelink()).toBe(true);
  });

  it('refresh keeps the legacy session and does not request relink on a temporary failure', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchSequence([new Error('offline')]),
      config: CONFIG,
    });
    expect(await controller.refresh()).toBeNull();
    expect(area.data.get(SESSION_KEY)).toEqual(SESSION);
    expect(await controller.needsRelink()).toBe(false);
  });

  it('userId returns null when no readable or migratable session exists', async () => {
    const controller = createAuthController(fakeArea(), {
      fetch: fetchSequence([]),
      config: CONFIG,
    });
    expect(await controller.userId()).toBeNull();
  });

  it('userId fails closed if storage disappears between token and owner reads', async () => {
    const extensionSession = { kind: 'extension' as const, token: 'zlx_token', userId: 'user-7' };
    let reads = 0;
    const area = fakeArea({ [SESSION_KEY]: extensionSession });
    const controller = createAuthController(
      {
        ...area,
        get: (key) => {
          reads += 1;
          return Promise.resolve(reads === 1 ? { [key]: extensionSession } : {});
        },
      },
      { fetch: fetchSequence([]), config: CONFIG },
    );
    expect(await controller.userId()).toBeNull();
  });

  it('needsRelink defaults to false for a missing or corrupt auth-state record', async () => {
    const missing = createAuthController(fakeArea(), { fetch: fetchSequence([]), config: CONFIG });
    const corrupt = createAuthController(fakeArea({ [AUTH_STATE_KEY]: { needsRelink: 'yes' } }), {
      fetch: fetchSequence([]),
      config: CONFIG,
    });
    expect(await missing.needsRelink()).toBe(false);
    expect(await corrupt.needsRelink()).toBe(false);
  });

  it('reads an opaque credential without migration or network traffic', async () => {
    const area = fakeArea({
      [SESSION_KEY]: { kind: 'extension', token: 'zlx_stored', userId: 'user-1' },
    });
    const fetchFn = fetchSequence([]);
    const controller = createAuthController(area, { fetch: fetchFn, config: CONFIG });

    expect(await controller.extensionCredential()).toBe('zlx_stored');
    expect(fetchFn.calls).toEqual([]);
  });

  it('never exposes a legacy, missing, or corrupt session as an opaque credential', async () => {
    const legacy = createAuthController(fakeArea({ [SESSION_KEY]: SESSION }), {
      fetch: fetchSequence([]),
      config: CONFIG,
    });
    const missing = createAuthController(fakeArea(), { fetch: fetchSequence([]), config: CONFIG });
    const corrupt = createAuthController(fakeArea({ [SESSION_KEY]: { token: 9 } }), {
      fetch: fetchSequence([]),
      config: CONFIG,
    });

    expect(await legacy.extensionCredential()).toBeNull();
    expect(await missing.extensionCredential()).toBeNull();
    expect(await corrupt.extensionCredential()).toBeNull();
  });

  it('returns no stored owner for a missing or corrupt session without attempting migration', async () => {
    const missing = createAuthController(fakeArea(), { fetch: fetchSequence([]), config: CONFIG });
    const corrupt = createAuthController(fakeArea({ [SESSION_KEY]: { userId: 9 } }), {
      fetch: fetchSequence([]),
      config: CONFIG,
    });

    expect(await missing.storedUserId()).toBeNull();
    expect(await corrupt.storedUserId()).toBeNull();
  });
});
