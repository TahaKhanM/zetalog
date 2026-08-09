import { apiError, apiJson, readBearerToken } from '@/lib/http';

export const GAME_CHALLENGE_LIMIT_PER_HOUR = 120;
export const GAME_CHALLENGE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export const CHALLENGE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export interface GameChallengeDeps {
  authenticate: (token: string) => Promise<string | null>;
  consumeLimit: (userId: string) => Promise<boolean>;
  createChallenge: (userId: string) => Promise<unknown>;
}

/**
 * Issue optional start evidence without permitting an authenticated client to
 * grow the challenge table without bound. Hitting the generous limit never
 * blocks recording: the extension falls back to its normal offline-eligible
 * upload path.
 */
export async function handleGameChallengePost(
  request: Request,
  deps: GameChallengeDeps,
): Promise<Response> {
  const token = readBearerToken(request);
  if (token === null) {
    return apiError(401, 'unauthorized', 'Missing bearer token.', CHALLENGE_CORS_HEADERS);
  }
  const userId = await deps.authenticate(token);
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Invalid extension session.', CHALLENGE_CORS_HEADERS);
  }
  if (!(await deps.consumeLimit(userId))) {
    return apiError(
      429,
      'rate-limited',
      'Challenge limit reached; this game can still sync normally.',
      CHALLENGE_CORS_HEADERS,
    );
  }
  return apiJson(201, await deps.createChallenge(userId), CHALLENGE_CORS_HEADERS);
}
