import { describe, expect, it, vi } from 'vitest';

import {
  CORS_HEADERS,
  REVOCABLE_STATUSES,
  handleGameDelete,
  handleGameRestore,
  type GameDeleteDeps,
  type GameRestoreDeps,
} from './handler';
import { OPTIONS } from './route';

const GAME_ID = '11111111-1111-4111-8111-111111111111';

function request(): Request {
  return new Request('http://localhost/api/games/abc', { method: 'DELETE' });
}

function deps(over: Partial<GameDeleteDeps> = {}): GameDeleteDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    removeGame: vi.fn(async () => Promise.resolve(true)),
    ...over,
  };
}

function restoreDeps(over: Partial<GameRestoreDeps> = {}): GameRestoreDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    restoreGame: vi.fn(async () =>
      Promise.resolve({ id: GAME_ID, outcome: 'accepted' as const, serverScore: 42 }),
    ),
    ...over,
  };
}

describe('REVOCABLE_STATUSES', () => {
  it('permits revoking only accepted and quarantined games', () => {
    expect([...REVOCABLE_STATUSES].sort()).toEqual(['accepted', 'quarantined']);
  });

  it('never permits revoking rejected or already-removed games', () => {
    expect(REVOCABLE_STATUSES).not.toContain('rejected');
    expect(REVOCABLE_STATUSES).not.toContain('user_removed');
  });
});

describe('DELETE /api/games/[clientGameId]', () => {
  it('returns 401 when the request is not authenticated', async () => {
    const response = await handleGameDelete(
      request(),
      GAME_ID,
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 when no owned game matched', async () => {
    const response = await handleGameDelete(
      request(),
      GAME_ID,
      deps({ removeGame: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('soft-deletes an owned game and returns 200', async () => {
    const removeGame = vi.fn(async () => Promise.resolve(true));
    const response = await handleGameDelete(request(), GAME_ID, deps({ removeGame }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeGame).toHaveBeenCalledWith('user-1', GAME_ID);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('attaches CORS headers to every DELETE response', async () => {
    for (const response of [
      await handleGameDelete(
        request(),
        GAME_ID,
        deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
      ),
      await handleGameDelete(
        request(),
        GAME_ID,
        deps({ removeGame: vi.fn(async () => Promise.resolve(false)) }),
      ),
      await handleGameDelete(request(), GAME_ID, deps()),
    ]) {
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toBe(
        CORS_HEADERS['Access-Control-Allow-Methods'],
      );
      expect(response.headers.get('access-control-allow-headers')).toBe(
        'Authorization, Content-Type',
      );
    }
  });

  it('rejects malformed ids before the database call', async () => {
    const removeGame = vi.fn(async () => Promise.resolve(true));
    const response = await handleGameDelete(request(), 'not-a-uuid', deps({ removeGame }));
    expect(response.status).toBe(400);
    expect(removeGame).not.toHaveBeenCalled();
  });
});

describe('OPTIONS /api/games/[clientGameId]', () => {
  it('answers the CORS preflight with 204 and permissive headers', () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(response.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type',
    );
  });
});

describe('PATCH /api/games/[clientGameId]', () => {
  it('requires authentication', async () => {
    const response = await handleGameRestore(
      request(),
      GAME_ID,
      restoreDeps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('validates the id before attempting a restore', async () => {
    const restoreGame = vi.fn(async () =>
      Promise.resolve({ id: GAME_ID, outcome: 'accepted' as const, serverScore: 42 }),
    );
    const response = await handleGameRestore(request(), 'not-a-uuid', restoreDeps({ restoreGame }));
    expect(response.status).toBe(400);
    expect(restoreGame).not.toHaveBeenCalled();
  });

  it('returns 404 if no owned removed game can be restored', async () => {
    const response = await handleGameRestore(
      request(),
      GAME_ID,
      restoreDeps({ restoreGame: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(404);
  });

  it('restores only the authenticated user game and returns its state', async () => {
    const restoreGame = vi.fn(async () =>
      Promise.resolve({ id: GAME_ID, outcome: 'quarantined' as const, serverScore: 42 }),
    );
    const response = await handleGameRestore(request(), GAME_ID, restoreDeps({ restoreGame }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: GAME_ID,
      outcome: 'quarantined',
      serverScore: 42,
    });
    expect(restoreGame).toHaveBeenCalledWith('user-1', GAME_ID);
  });
});
