import { createServerClient } from '@supabase/ssr';

import { clientEnv } from '../env';
import type { Database } from './database';

/**
 * A cookieless, anon-role Supabase client for PUBLIC reads (the leaderboard
 * view and university reference data, both anon-readable under RLS).
 *
 * Unlike {@link import('./server').createClient}, this never touches
 * `next/headers` cookies. That matters twice over: the public boards stay a
 * cacheable, identity-free render (no cookie access → no forced per-request
 * work), and these reads are safe to run inside `unstable_cache` (which forbids
 * dynamic request APIs like `cookies()`). It carries no session, so RLS treats
 * every call as anonymous — exactly the public surface these pages need.
 */
export function createPublicClient() {
  const env = clientEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No session is ever written: this client is deliberately anonymous.
        },
      },
    },
  );
}
