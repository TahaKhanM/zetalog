import { userIdFromBearer, userIdFromCookies } from '@/lib/auth';
import { getProfile } from '@/lib/db/queries';
import { readBearerToken } from '@/lib/http';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { CORS_HEADERS, handleProfileGet, handleProfilePost } from './handler';

export const dynamic = 'force-dynamic';

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = '23505';

/**
 * Resolve the caller: a bearer token (the extension) verified against the auth
 * server, else the session cookie (the website). Mirrors the dual-auth used by
 * the game-revoke route so both surfaces can read and write the profile.
 */
async function authenticate(
  request: Request,
  service: ReturnType<typeof createServiceClient>,
): Promise<string | null> {
  const token = readBearerToken(request);
  if (token !== null) return userIdFromBearer(service, token);
  return userIdFromCookies(await createClient());
}

/**
 * `GET /api/profile` — the caller's own profile flags (display name, the
 * "not at a university" choice, and the leaderboard opt-out). Read via the
 * service role after the bearer/cookie identity is verified.
 */
export async function GET(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleProfileGet({
    authenticate: () => authenticate(request, service),
    readProfile: async (userId) => {
      const profile = await getProfile(service, userId);
      if (profile === null) return null;
      return {
        displayName: profile.display_name,
        independent: profile.independent,
        leaderboardOptOut: profile.leaderboard_opt_out,
      };
    },
  });
}

/**
 * `POST /api/profile` — set or change the display name, the "not at a
 * university" flag, or the leaderboard opt-out. Core logic lives in
 * {@link handleProfilePost}; this file wires the real writes and maps the
 * citext unique violation to the "taken" result.
 */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleProfilePost(request, {
    authenticate: () => authenticate(request, service),
    setDisplayName: async (userId, displayName) => {
      const { error } = await service
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId);
      if (error === null) return 'ok';
      if (error.code === UNIQUE_VIOLATION) return 'taken';
      throw new Error(`setDisplayName: ${error.message}`);
    },
    setIndependent: async (userId, independent) => {
      const { error } = await service.from('profiles').update({ independent }).eq('id', userId);
      if (error !== null) throw new Error(`setIndependent: ${error.message}`);
    },
    setLeaderboardOptOut: async (userId, optOut) => {
      const { error } = await service
        .from('profiles')
        .update({ leaderboard_opt_out: optOut })
        .eq('id', userId);
      if (error !== null) throw new Error(`setLeaderboardOptOut: ${error.message}`);
    },
  });
}

/** CORS preflight for the extension's cross-origin bearer requests. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
