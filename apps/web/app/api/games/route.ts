import { userIdFromBearer } from '@/lib/auth';
import { createSubmitPort } from '@/lib/games/port';
import { createServiceClient } from '@/lib/supabase/service';

import { CORS_HEADERS, handleGamesPost } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/games` — extension game submissions. Bearer-only (no
 * cookies), so it is CORS-open to the extension origin. The claimed score is
 * never trusted; the pipeline recomputes and judges it. Core logic lives in
 * {@link handleGamesPost}; this file only wires real dependencies.
 */

/** CORS preflight for the extension. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleGamesPost(request, {
    authenticateBearer: (token) => userIdFromBearer(service, token),
    port: createSubmitPort(service),
    now: () => Date.now(),
  });
}
