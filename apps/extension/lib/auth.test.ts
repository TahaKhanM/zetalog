import { describe, expect, it } from 'vitest';

import {
  SESSION_KEY,
  createAuthController,
  requestRefresh,
  sessionSchema,
  type FetchLike,
  type Session,
} from './auth.js';

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

describe('sessionSchema', () => {
  it('rejects a session missing a token', () => {
    expect(
      sessionSchema.safeParse({ accessToken: '', refreshToken: 'r', userId: 'u' }).success,
    ).toBe(false);
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
    expect(await controller.accessToken()).toBe('access-abc');
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

  it('refresh returns null when the network exchange fails', async () => {
    const area = fakeArea({ [SESSION_KEY]: SESSION });
    const controller = createAuthController(area, {
      fetch: fetchOnce(() => ({ status: 401, body: {} })),
      config: CONFIG,
    });
    expect(await controller.refresh()).toBeNull();
    expect(area.data.get(SESSION_KEY)).toEqual(SESSION);
  });
});
