import { apiError, apiJson } from '@/lib/http';
import { displayNameSchema } from '@/lib/profile';
import { z } from 'zod';

/**
 * The testable core of `POST /api/profile`: change the display name
 * (validated against the same rule as the DB CHECK, unique violation mapped to
 * 409) or the `independent` flag ("not at a university"), or both.
 */

const bodySchema = z
  .object({
    displayName: displayNameSchema.optional(),
    independent: z.boolean().optional(),
  })
  .refine((body) => body.displayName !== undefined || body.independent !== undefined, {
    message: 'Nothing to change.',
  });

/** The result of attempting to persist a display name. */
export type SetNameResult = 'ok' | 'taken';

/** Injected dependencies for the core handler. */
export interface ProfilePostDeps {
  authenticate: () => Promise<string | null>;
  setDisplayName: (userId: string, displayName: string) => Promise<SetNameResult>;
  setIndependent: (userId: string, independent: boolean) => Promise<void>;
}

export async function handleProfilePost(
  request: Request,
  deps: ProfilePostDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to change your profile.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid-name', '3 to 15 characters: letters, digits and underscores.');
  }

  if (parsed.data.displayName !== undefined) {
    const result = await deps.setDisplayName(userId, parsed.data.displayName);
    if (result === 'taken') {
      return apiError(409, 'name-taken', 'That display name is already taken.');
    }
  }
  if (parsed.data.independent !== undefined) {
    await deps.setIndependent(userId, parsed.data.independent);
  }
  return apiJson(200, { ok: true, ...parsed.data });
}
