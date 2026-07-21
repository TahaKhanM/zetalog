import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '../env';
import type { Database } from './database';

/**
 * Supabase client for use in Client Components. Reads and writes the session
 * via browser cookies so it stays in sync with the server/proxy clients. Only
 * the anon key is used — RLS is the security boundary.
 */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
