import { gameRecordSchema } from '@zetalog/shared';

import { submitGame, type SubmitPort } from '@/lib/games/submit';
import { apiError, apiJson, readBearerToken } from '@/lib/http';

/**
 * The testable core of `POST /api/games`. Kept out of `route.ts` because a
 * Next.js route module may only export HTTP-method handlers and route config;
 * tests exercise this directly with faked ports.
 */

/** Extension requests carry a bearer JWT, so the endpoint is CORS-permissive. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/** Injected dependencies for the core handler. */
export interface GamesPostDeps {
  authenticateBearer: (token: string) => Promise<string | null>;
  port: SubmitPort;
  now: () => number;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.', CORS_HEADERS);
  }

  const parsed = gameRecordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'Body is not a valid game record.', CORS_HEADERS);
  }

  const result = await submitGame(parsed.data, userId, deps.now(), deps.port);
  return apiJson(result.status, result.body, CORS_HEADERS);
}
