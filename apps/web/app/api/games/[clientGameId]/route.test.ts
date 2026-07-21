import { describe, expect, it, vi } from 'vitest';

import { handleGameDelete, type GameDeleteDeps } from './handler';

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

describe('DELETE /api/games/[clientGameId]', () => {
  it('returns 401 when the request is not authenticated', async () => {
    const response = await handleGameDelete(
      request(),
      'game-1',
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when no owned game matched', async () => {
    const response = await handleGameDelete(
      request(),
      'game-1',
      deps({ removeGame: vi.fn(async () => Promise.resolve(false)) }),
    );
    expect(response.status).toBe(404);
  });

  it('soft-deletes an owned game and returns 200', async () => {
    const removeGame = vi.fn(async () => Promise.resolve(true));
    const response = await handleGameDelete(request(), 'game-1', deps({ removeGame }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeGame).toHaveBeenCalledWith('user-1', 'game-1');
  });
});
