import type { Db } from './supabase/database';

/**
 * Resolve the authenticated user id from a Supabase client, or null. Both
 * helpers use `getUser()` (which verifies the token against the auth server)
 * rather than trusting a decoded session.
 */

/** The user id behind a bearer JWT (extension requests), or null if invalid. */
export async function userIdFromBearer(client: Db, token: string): Promise<string | null> {
  const { data, error } = await client.auth.getUser(token);
  if (error !== null) return null;
  return data.user.id;
}

/** The user id behind the request's session cookie, or null if signed out. */
export async function userIdFromCookies(client: Db): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  if (error !== null) return null;
  return data.user.id;
}
