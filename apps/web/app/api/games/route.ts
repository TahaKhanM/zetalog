import { userIdFromBearer } from '@/lib/auth';
import { getRecentGamesForUser } from '@/lib/db/queries';
import { createSubmitPort } from '@/lib/games/port';
import { createServiceClient } from '@/lib/supabase/service';

import { CORS_HEADERS, handleGamesGet, handleGamesPost } from './handler';

export const dynamic = 'force-dynamic';

/** How many of the newest games the extension backfill fetches. */
const BACKFILL_LIMIT = 500;

/**
 * `/api/games` — extension game sync. `POST` submits a game (the claimed
 * score is never trusted; the pipeline recomputes and judges it). `GET` lists
 * the caller's own games so the extension can backfill its history after
 * linking. Bearer-only (no cookies), so it is CORS-open to the extension
 * origin. Core logic lives in {@link handleGamesPost}/{@link handleGamesGet};
 * this file only wires real dependencies.
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

export function GET(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleGamesGet(request, {
    authenticateBearer: (token) => userIdFromBearer(service, token),
    listGames: (userId) => getRecentGamesForUser(service, userId, BACKFILL_LIMIT),
  });
}
