import { apiError, apiJson } from '@/lib/http';

/**
 * The testable core of `DELETE /api/games/[clientGameId]`. A user soft-deletes
 * one of their own games; the leaderboard
 * view recomputes the PB naturally.
 */

/**
 * The extension's background service worker has no host_permissions, so its
 * DELETE is preflighted; without permissive CORS the browser blocks revocation
 * in production. Mirrors the POST route's headers (see `../handler.ts`).
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/**
 * The only statuses a user may revoke. Rejected games are kept for audit and
 * are not user-revocable; already-removed games have nothing left to revoke.
 * The route's update filters on this set, so anything else 404s.
 */
export const REVOCABLE_STATUSES = ['accepted', 'quarantined'] as const;

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
    return apiError(401, 'unauthorized', 'Sign in to remove a game.', CORS_HEADERS);
  }
  const removed = await deps.removeGame(userId, clientGameId);
  if (!removed) {
    return apiError(404, 'not-found', 'No such game to remove.', CORS_HEADERS);
  }
  return apiJson(200, { ok: true }, CORS_HEADERS);
}
