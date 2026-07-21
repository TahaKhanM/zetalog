import { apiError, apiJson } from '@/lib/http';
import { displayNameSchema } from '@/lib/profile';
import { z } from 'zod';

/**
 * The testable core of `POST /api/profile` (spec §7): validate the display name
 * against the same rule as the DB CHECK, and map the unique violation to 409.
 */

const bodySchema = z.object({ displayName: displayNameSchema });

/** The result of attempting to persist a display name. */
export type SetNameResult = 'ok' | 'taken';

/** Injected dependencies for the core handler. */
export interface ProfilePostDeps {
  authenticate: () => Promise<string | null>;
  setDisplayName: (userId: string, displayName: string) => Promise<SetNameResult>;
}

export async function handleProfilePost(
  request: Request,
  deps: ProfilePostDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to choose a display name.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid-name', '3–15 characters: letters, digits, and underscores.');
  }

  const result = await deps.setDisplayName(userId, parsed.data.displayName);
  if (result === 'taken') {
    return apiError(409, 'name-taken', 'That display name is already taken.');
  }
  return apiJson(200, { ok: true, displayName: parsed.data.displayName });
}
