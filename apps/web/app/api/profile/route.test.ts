import { describe, expect, it, vi } from 'vitest';

import {
  handleProfileGet,
  handleProfilePost,
  type ProfileGetDeps,
  type ProfilePostDeps,
} from './handler';

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
    updateProfile: vi.fn(async () => Promise.resolve('ok' as const)),
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
      deps({ updateProfile: vi.fn(async () => Promise.resolve('taken' as const)) }),
    );
    expect(response.status).toBe(409);
  });

  it('sets a valid name and returns 200', async () => {
    const updateProfile = vi.fn(async () => Promise.resolve('ok' as const));
    const response = await handleProfilePost(
      request({ displayName: 'quant_king' }),
      deps({ updateProfile }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, displayName: 'quant_king' });
    expect(updateProfile).toHaveBeenCalledWith('user-1', { displayName: 'quant_king' });
  });

  it('sets the independent flag without touching the name', async () => {
    const updateProfile = vi.fn(async () => Promise.resolve('ok' as const));
    const response = await handleProfilePost(
      request({ independent: true }),
      deps({ updateProfile }),
    );
    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith('user-1', { independent: true });
  });

  it('clears the independent flag', async () => {
    const updateProfile = vi.fn(async () => Promise.resolve('ok' as const));
    const response = await handleProfilePost(
      request({ independent: false }),
      deps({ updateProfile }),
    );
    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith('user-1', { independent: false });
  });

  it('sets the leaderboard opt-out without touching the name', async () => {
    const updateProfile = vi.fn(async () => Promise.resolve('ok' as const));
    const response = await handleProfilePost(
      request({ leaderboardOptOut: true }),
      deps({ updateProfile }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, leaderboardOptOut: true });
    expect(updateProfile).toHaveBeenCalledWith('user-1', { leaderboardOptOut: true });
  });

  it('passes combined changes as one atomic update request', async () => {
    const updateProfile = vi.fn(async () => Promise.resolve('ok' as const));
    const response = await handleProfilePost(
      request({ displayName: 'quant_king', independent: true, leaderboardOptOut: true }),
      deps({ updateProfile }),
    );
    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'quant_king',
      independent: true,
      leaderboardOptOut: true,
    });
  });

  it('rejects a body with nothing to change', async () => {
    const response = await handleProfilePost(request({}), deps());
    expect(response.status).toBe(400);
  });
});

describe('GET /api/profile', () => {
  function getDeps(over: Partial<ProfileGetDeps> = {}): ProfileGetDeps {
    return {
      authenticate: vi.fn(async () => Promise.resolve('user-1')),
      readProfile: vi.fn(async () =>
        Promise.resolve({ displayName: 'ada', independent: false, leaderboardOptOut: false }),
      ),
      ...over,
    };
  }

  it('returns 401 when not signed in', async () => {
    const response = await handleProfileGet(
      getDeps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns the profile flags', async () => {
    const response = await handleProfileGet(
      getDeps({
        readProfile: vi.fn(async () =>
          Promise.resolve({ displayName: 'ada', independent: true, leaderboardOptOut: true }),
        ),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      displayName: 'ada',
      independent: true,
      leaderboardOptOut: true,
    });
  });

  it('returns 404 when there is no profile row yet', async () => {
    const response = await handleProfileGet(
      getDeps({ readProfile: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(404);
  });
});
