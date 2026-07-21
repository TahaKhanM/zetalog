import { describe, expect, it, vi } from 'vitest';

import { handleAdminAction, type AdminActionDeps } from './handler';

function request(body: unknown): Request {
  return new Request('http://localhost/api/admin/games/g1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<AdminActionDeps> = {}): AdminActionDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('admin-1')),
    isAdmin: vi.fn(async () => Promise.resolve(true)),
    setGameStatus: vi.fn(async () => Promise.resolve(true)),
    ...over,
  };
}

describe('POST /api/admin/games/[id]', () => {
  it('returns 401 when not signed in', async () => {
    const response = await handleAdminAction(
      request({ action: 'approve' }),
      'g1',
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const response = await handleAdminAction(
      request({ action: 'approve' }),
      'g1',
      deps({ isAdmin: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(403);
  });

  it('returns 400 for an unknown action', async () => {
    const response = await handleAdminAction(request({ action: 'nuke' }), 'g1', deps());
    expect(response.status).toBe(400);
  });

  it('approves a quarantined game to accepted', async () => {
    const setGameStatus = vi.fn(async () => Promise.resolve(true));
    const response = await handleAdminAction(
      request({ action: 'approve' }),
      'g1',
      deps({ setGameStatus }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'accepted' });
    expect(setGameStatus).toHaveBeenCalledWith('g1', 'accepted');
  });

  it('rejects a quarantined game to rejected', async () => {
    const response = await handleAdminAction(request({ action: 'reject' }), 'g1', deps());
    expect(await response.json()).toEqual({ ok: true, status: 'rejected' });
  });

  it('returns 404 when no quarantined game matched', async () => {
    const response = await handleAdminAction(
      request({ action: 'approve' }),
      'g1',
      deps({ setGameStatus: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(404);
  });
});
