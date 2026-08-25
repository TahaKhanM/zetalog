import { createGameChallenge, userIdFromApiBearer } from '@/lib/extension-auth';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
import { createServiceClient } from '@/lib/supabase/service';

import {
  CHALLENGE_CORS_HEADERS,
  GAME_CHALLENGE_LIMIT_PER_HOUR,
  GAME_CHALLENGE_LIMIT_WINDOW_MS,
  handleGameChallengePost,
} from './handler';

export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CHALLENGE_CORS_HEADERS });
}

/** Start evidence is transparent and optional: offline capture never waits on it. */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleGameChallengePost(request, {
    authenticate: (token) => userIdFromApiBearer(service, token),
    consumeLimit: (userId) =>
      consumeSharedRateLimit(service, {
        bucket: 'game-challenge',
        key: userId,
        nowMs: Date.now(),
        windowMs: GAME_CHALLENGE_LIMIT_WINDOW_MS,
        limit: GAME_CHALLENGE_LIMIT_PER_HOUR,
      }),
    createChallenge: (userId) => createGameChallenge(service, userId),
  });
}
