import { z } from 'zod';

import { apiError, apiJson, readJsonBody } from '@/lib/http';

const bodySchema = z.object({ confirmation: z.literal('DELETE') });

/** Dependencies for the destructive account-erasure endpoint. */
export interface AccountDeleteDeps {
  authenticate: () => Promise<string | null>;
  /** Atomically revokes credentials and removes account-owned application data. */
  deleteAccount: (userId: string) => Promise<boolean>;
}

/**
 * `DELETE /api/account` requires an explicit request-body acknowledgement. The
 * UI may additionally perform recent-authentication, but this API never treats
 * a cross-site or accidental DELETE as consent to erase an account.
 */
export async function handleAccountDelete(
  request: Request,
  deps: AccountDeleteDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) return apiError(401, 'unauthorized', 'Sign in to delete your account.');

  const body = await readJsonBody(request);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Request body is too large.');
  }
  if (!body.ok) {
    return apiError(400, 'confirmation-required', 'Confirm account deletion before continuing.');
  }
  if (!bodySchema.safeParse(body.value).success) {
    return apiError(400, 'confirmation-required', 'Confirm account deletion before continuing.');
  }

  if (!(await deps.deleteAccount(userId))) {
    return apiError(404, 'not-found', 'Account no longer exists.');
  }
  return apiJson(200, { ok: true });
}
