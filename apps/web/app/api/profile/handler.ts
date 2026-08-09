import { apiError, apiJson, readJsonBody } from '@/lib/http';
import { displayNameSchema } from '@/lib/profile';
import { z } from 'zod';

/**
 * The testable core of `/api/profile`: read the profile flags (GET), or
 * change the display name (validated against the same rule as the DB CHECK,
 * unique violation mapped to 409), the `independent` flag ("not at a
 * university"), or the `leaderboardOptOut` flag (keep scores off the public
 * boards) — any combination (POST). The extension calls this cross-origin with
 * a bearer token, so every response carries permissive CORS headers.
 */

/** The extension reaches this cross-origin with a bearer JWT, so it is CORS-open. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const bodySchema = z
  .object({
    displayName: displayNameSchema.optional(),
    independent: z.boolean().optional(),
    leaderboardOptOut: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.displayName !== undefined ||
      body.independent !== undefined ||
      body.leaderboardOptOut !== undefined,
    { message: 'Nothing to change.' },
  );

/** The profile flags the account page and the extension popup read back. */
export interface ProfileView {
  readonly displayName: string | null;
  readonly independent: boolean;
  readonly leaderboardOptOut: boolean;
}

/** Injected dependencies for the POST handler. */
export interface ProfilePostDeps {
  authenticate: () => Promise<string | null>;
  /** Persist all requested fields in one database transaction. */
  updateProfile: (
    userId: string,
    changes: {
      displayName?: string | undefined;
      independent?: boolean | undefined;
      leaderboardOptOut?: boolean | undefined;
    },
  ) => Promise<'ok' | 'taken'>;
}

/** Injected dependencies for the GET handler. */
export interface ProfileGetDeps {
  authenticate: () => Promise<string | null>;
  readProfile: (userId: string) => Promise<ProfileView | null>;
}

export async function handleProfileGet(deps: ProfileGetDeps): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to read your profile.', CORS_HEADERS);
  }
  const profile = await deps.readProfile(userId);
  if (profile === null) {
    return apiError(404, 'not-found', 'No profile yet.', CORS_HEADERS);
  }
  return apiJson(200, profile, CORS_HEADERS);
}

export async function handleProfilePost(
  request: Request,
  deps: ProfilePostDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to change your profile.', CORS_HEADERS);
  }

  const body = await readJsonBody(request);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Request body is too large.', CORS_HEADERS);
  }
  if (!body.ok) {
    return apiError(400, 'bad-request', 'Request body must be JSON.', CORS_HEADERS);
  }
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(
      400,
      'invalid-name',
      '3 to 15 characters: letters, digits and underscores.',
      CORS_HEADERS,
    );
  }

  const result = await deps.updateProfile(userId, parsed.data);
  if (result === 'taken') {
    return apiError(409, 'name-taken', 'That display name is already taken.', CORS_HEADERS);
  }
  return apiJson(200, { ok: true, ...parsed.data }, CORS_HEADERS);
}
