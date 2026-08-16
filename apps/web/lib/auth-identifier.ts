import { z } from 'zod';

import type { IdentifierMatch } from './auth-modes';
import type { Db } from './supabase/database';

/**
 * Service-role wiring for `public.auth_identifier_lookup` (the alias-login migration):
 * resolve a sign-in identifier — primary email or VERIFIED uni alias — to its
 * account. The SQL function is the single audited reader of `auth.users`; this
 * module just calls it and zod-validates the boundary.
 */

const rpcRowSchema = z.object({
  user_id: z.uuid(),
  primary_email: z.string(),
  has_password: z.boolean(),
  providers: z.array(z.string()),
  matched_by: z.enum(['primary', 'alias']),
});

/** Parse the rpc result rows (0 or 1) into an {@link IdentifierMatch}. */
export function matchFromRpcRows(rows: unknown): IdentifierMatch | null {
  const parsed = z.array(rpcRowSchema).max(1).parse(rows);
  const row = parsed[0];
  if (row === undefined) return null;
  return {
    userId: row.user_id,
    primaryEmail: row.primary_email,
    hasPassword: row.has_password,
    providers: row.providers,
    matchedBy: row.matched_by,
  };
}

/**
 * An identifier resolver over a service-role client (client roles cannot
 * execute the function). Suitable for injection into the route cores.
 */
export function createIdentifierResolver(
  service: Db,
): (identifier: string) => Promise<IdentifierMatch | null> {
  return async (identifier) => {
    const { data, error } = await service.rpc('auth_identifier_lookup', {
      p_identifier: identifier,
    });
    if (error !== null) throw new Error(`auth_identifier_lookup: ${error.message}`);
    return matchFromRpcRows(data);
  };
}
