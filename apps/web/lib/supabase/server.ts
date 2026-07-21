import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { clientEnv } from '../env';

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Backed by the request cookie store so it acts as the signed-in user under
 * RLS. Cookie writes from a Server Component render throw (the response is
 * already streaming) — that path is expected and covered by the proxy, which
 * refreshes the session on every request; see {@link updateSession}.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = clientEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component render context: cookies are read-only here. The
          // proxy owns session refresh, so dropping these writes is correct.
        }
      },
    },
  });
}
