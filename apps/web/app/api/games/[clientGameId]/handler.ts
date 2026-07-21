import { apiError, apiJson } from '@/lib/http';

/**
 * The testable core of `DELETE /api/games/[clientGameId]`. A user soft-deletes
 * one of their own games (spec §3.2 — never a hard delete); the leaderboard
 * view recomputes the PB naturally.
 */

/** Injected dependencies for the core handler. */
export interface GameDeleteDeps {
  authenticate: (request: Request) => Promise<string | null>;
  /** Soft-delete the game; resolves true iff a matching owned row was updated. */
  removeGame: (userId: string, clientGameId: string) => Promise<boolean>;
}

export async function handleGameDelete(
  request: Request,
  clientGameId: string,
  deps: GameDeleteDeps,
): Promise<Response> {
  const userId = await deps.authenticate(request);
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to remove a game.');
  }
  const removed = await deps.removeGame(userId, clientGameId);
  if (!removed) {
    return apiError(404, 'not-found', 'No such game to remove.');
  }
  return apiJson(200, { ok: true });
}
