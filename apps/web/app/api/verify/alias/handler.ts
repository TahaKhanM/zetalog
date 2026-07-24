import { apiError, apiJson } from '@/lib/http';

/**
 * The testable core of `DELETE /api/verify/alias`: remove the user's
 * verified university email. The alias and the badge are one system, so
 * removal clears both. Idempotent: removing when nothing is verified still
 * answers 200. Re-verifying later restores both.
 */

/** Injected dependencies for the core handler. */
export interface AliasDeleteDeps {
  authenticate: () => Promise<string | null>;
  /** Delete verified alias rows and clear the profile badge columns. */
  removeAlias: (userId: string) => Promise<void>;
}

export async function handleAliasDelete(deps: AliasDeleteDeps): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to manage your emails.');
  }
  await deps.removeAlias(userId);
  return apiJson(200, { ok: true });
}
