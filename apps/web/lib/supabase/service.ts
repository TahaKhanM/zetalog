import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { serverEnv } from '../env.server';
import type { Database, Db } from './database';

// Server-only tripwire: this module holds the RLS-bypassing service-role path.
if (typeof window !== 'undefined')
  throw new Error('lib/supabase/service.ts must never load in a client bundle');

/**
 * Service-role Supabase client — bypasses RLS. Import ONLY from API routes and
 * server-only lib modules; it must never reach a Client Component or the
 * extension bundle (CLAUDE.md #2). Session persistence is disabled: this client
 * authenticates with the service key, never a user cookie.
 */
export function createServiceClient(): Db {
  const env = serverEnv();
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
