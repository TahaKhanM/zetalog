import { describe, expect, it, vi } from 'vitest';

import { handleProfilePost, type ProfilePostDeps } from './handler';

function request(body: unknown): Request {
  return new Request('http://localhost/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<ProfilePostDeps> = {}): ProfilePostDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    setDisplayName: vi.fn(async () => Promise.resolve('ok' as const)),
    setIndependent: vi.fn(async () => Promise.resolve()),
    ...over,
  };
}

describe('POST /api/profile', () => {
  it('returns 401 when not signed in', async () => {
    const response = await handleProfilePost(
      request({ displayName: 'ada' }),
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for an invalid display name', async () => {
    const response = await handleProfilePost(request({ displayName: 'no' }), deps());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid-name' } });
  });

  it('returns 409 when the name is already taken', async () => {
    const response = await handleProfilePost(
      request({ displayName: 'ada' }),
      deps({ setDisplayName: vi.fn(async () => Promise.resolve('taken' as const)) }),
    );
    expect(response.status).toBe(409);
  });

  it('sets a valid name and returns 200', async () => {
    const setDisplayName = vi.fn(async () => Promise.resolve('ok' as const));
    const response = await handleProfilePost(
      request({ displayName: 'quant_king' }),
      deps({ setDisplayName }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, displayName: 'quant_king' });
    expect(setDisplayName).toHaveBeenCalledWith('user-1', 'quant_king');
  });

  it('sets the independent flag without touching the name', async () => {
    const setDisplayName = vi.fn(async () => Promise.resolve('ok' as const));
    const setIndependent = vi.fn(async () => Promise.resolve());
    const response = await handleProfilePost(
      request({ independent: true }),
      deps({ setDisplayName, setIndependent }),
    );
    expect(response.status).toBe(200);
    expect(setIndependent).toHaveBeenCalledWith('user-1', true);
    expect(setDisplayName).not.toHaveBeenCalled();
  });

  it('clears the independent flag', async () => {
    const setIndependent = vi.fn(async () => Promise.resolve());
    const response = await handleProfilePost(
      request({ independent: false }),
      deps({ setIndependent }),
    );
    expect(response.status).toBe(200);
    expect(setIndependent).toHaveBeenCalledWith('user-1', false);
  });

  it('rejects a body with nothing to change', async () => {
    const response = await handleProfilePost(request({}), deps());
    expect(response.status).toBe(400);
  });
});
