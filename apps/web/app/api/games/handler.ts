import { gameRecordSchema } from '@zetalog/shared';

import { submitGame, type SubmitPort } from '@/lib/games/submit';
import { apiError, apiJson, readBearerToken, readJsonBody } from '@/lib/http';

/**
 * The testable core of `POST /api/games`. Kept out of `route.ts` because a
 * Next.js route module may only export HTTP-method handlers and route config;
 * tests exercise this directly with faked ports.
 */

/** Extension requests carry a bearer JWT, so the endpoint is CORS-permissive. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/** Generous enough for legitimate telemetry while bounding JSON parse work. */
export const MAX_GAME_BODY_BYTES = 2_000_000;

/** Injected dependencies for the core handler. */
export interface GamesPostDeps {
  authenticateBearer: (token: string) => Promise<string | null>;
  port: SubmitPort;
  now: () => number;
}

/** Injected dependencies for the list handler. */
export interface GamesGetDeps {
  authenticateBearer: (token: string) => Promise<string | null>;
  listGames: (userId: string) => Promise<unknown>;
}

/**
 * The testable core of `GET /api/games`: the caller's own games, for the
 * extension to backfill after linking. Bearer-authenticated, CORS-permissive.
 */
export async function handleGamesGet(request: Request, deps: GamesGetDeps): Promise<Response> {
  const token = readBearerToken(request);
  if (token === null) {
    return apiError(401, 'unauthorized', 'Missing bearer token.', CORS_HEADERS);
  }
  const userId = await deps.authenticateBearer(token);
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Invalid or expired token.', CORS_HEADERS);
  }
  const games = await deps.listGames(userId);
  return apiJson(200, { games }, CORS_HEADERS);
}

export async function handleGamesPost(request: Request, deps: GamesPostDeps): Promise<Response> {
  const token = readBearerToken(request);
  if (token === null) {
    return apiError(401, 'unauthorized', 'Missing bearer token.', CORS_HEADERS);
  }
  const userId = await deps.authenticateBearer(token);
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Invalid or expired token.', CORS_HEADERS);
  }

  const body = await readJsonBody(request, MAX_GAME_BODY_BYTES);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Game record is too large.', CORS_HEADERS);
  }
  if (!body.ok) {
    return apiError(400, 'bad-request', 'Request body must be JSON.', CORS_HEADERS);
  }

  const parsed = gameRecordSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'Body is not a valid game record.', CORS_HEADERS);
  }

  const result = await submitGame(parsed.data, userId, deps.now(), deps.port);
  return apiJson(result.status, result.body, CORS_HEADERS);
}
