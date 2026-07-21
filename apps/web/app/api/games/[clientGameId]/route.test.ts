import { describe, expect, it, vi } from 'vitest';

import { CORS_HEADERS, REVOCABLE_STATUSES, handleGameDelete, type GameDeleteDeps } from './handler';
import { OPTIONS } from './route';

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
      'game-1',
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 when no owned game matched', async () => {
    const response = await handleGameDelete(
      request(),
      'game-1',
      deps({ removeGame: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('soft-deletes an owned game and returns 200', async () => {
    const removeGame = vi.fn(async () => Promise.resolve(true));
    const response = await handleGameDelete(request(), 'game-1', deps({ removeGame }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeGame).toHaveBeenCalledWith('user-1', 'game-1');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('attaches CORS headers to every DELETE response', async () => {
    for (const response of [
      await handleGameDelete(
        request(),
        'game-1',
        deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
      ),
      await handleGameDelete(
        request(),
        'game-1',
        deps({ removeGame: vi.fn(async () => Promise.resolve(false)) }),
      ),
      await handleGameDelete(request(), 'game-1', deps()),
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
});

describe('OPTIONS /api/games/[clientGameId]', () => {
  it('answers the CORS preflight with 204 and permissive headers', () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(response.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type',
    );
  });
});
