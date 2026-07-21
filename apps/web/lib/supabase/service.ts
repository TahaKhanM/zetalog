import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { serverEnv } from '../env';

/**
 * Service-role Supabase client — bypasses RLS. Import ONLY from API routes and
 * server-only lib modules; it must never reach a Client Component or the
 * extension bundle (CLAUDE.md #2). Session persistence is disabled: this client
 * authenticates with the service key, never a user cookie.
 */
export function createServiceClient(): ReturnType<typeof createSupabaseClient> {
  const env = serverEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
