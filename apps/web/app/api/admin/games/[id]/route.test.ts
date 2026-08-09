import { describe, expect, it, vi } from 'vitest';

import { handleAdminAction, type AdminActionDeps } from './handler';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const REVIEW_REASON = 'Evidence reviewed';

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
      request({ action: 'approve', reason: REVIEW_REASON }),
      GAME_ID,
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const response = await handleAdminAction(
      request({ action: 'approve', reason: REVIEW_REASON }),
      GAME_ID,
      deps({ isAdmin: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(403);
  });

  it('returns 400 for an unknown action', async () => {
    const response = await handleAdminAction(
      request({ action: 'nuke', reason: REVIEW_REASON }),
      GAME_ID,
      deps(),
    );
    expect(response.status).toBe(400);
  });

  it('requires a meaningful review reason before writing', async () => {
    const setGameStatus = vi.fn(async () => Promise.resolve(true));
    for (const body of [
      { action: 'approve' },
      { action: 'approve', reason: '  ' },
      { action: 'approve', reason: 'ok' },
      { action: 'approve', reason: 'x'.repeat(501) },
    ]) {
      const response = await handleAdminAction(request(body), GAME_ID, deps({ setGameStatus }));
      expect(response.status).toBe(400);
    }
    expect(setGameStatus).not.toHaveBeenCalled();
  });

  it('approves a quarantined game to accepted', async () => {
    const setGameStatus = vi.fn(async () => Promise.resolve(true));
    const response = await handleAdminAction(
      request({ action: 'approve', reason: REVIEW_REASON }),
      GAME_ID,
      deps({ setGameStatus }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'accepted' });
    expect(setGameStatus).toHaveBeenCalledWith(GAME_ID, 'admin-1', 'accepted', REVIEW_REASON);
  });

  it('rejects a quarantined game to rejected', async () => {
    const response = await handleAdminAction(
      request({ action: 'reject', reason: REVIEW_REASON }),
      GAME_ID,
      deps(),
    );
    expect(await response.json()).toEqual({ ok: true, status: 'rejected' });
  });

  it('returns 404 when no quarantined game matched', async () => {
    const response = await handleAdminAction(
      request({ action: 'approve', reason: REVIEW_REASON }),
      GAME_ID,
      deps({ setGameStatus: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 for a malformed UUID before review writes', async () => {
    const setGameStatus = vi.fn(async () => Promise.resolve(true));
    const response = await handleAdminAction(
      request({ action: 'approve', reason: REVIEW_REASON }),
      'not-a-uuid',
      deps({ setGameStatus }),
    );
    expect(response.status).toBe(400);
    expect(setGameStatus).not.toHaveBeenCalled();
  });
});
