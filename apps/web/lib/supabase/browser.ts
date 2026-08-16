import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '../env';
import type { Database } from './database';

/** Match supabase-js's historic default so proxying does not sign users out. */
export function supabaseCookieName(projectUrl: string): string {
  const projectRef = new URL(projectUrl).hostname.split('.').at(0) ?? '';
  return `sb-${projectRef}-auth-token`;
}

/**
 * Supabase client for use in Client Components. Reads and writes the session
 * via browser cookies so it stays in sync with the server/proxy clients. Only
 * the anon key is used — RLS is the security boundary.
 */
export function createClient() {
  const env = clientEnv();
  // Browser requests stay on the application origin and are forwarded by the
  // fixed Next.js rewrite. Besides simplifying CSP, this avoids campus-network
  // failures when `*.supabase.co` is filtered independently of ZetaLog.
  const browserUrl = `${window.location.origin}/supabase`;
  return createBrowserClient<Database>(browserUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // The client URL now starts with www.zetalog.co.uk, but both browser and
    // server clients must keep using the existing project-ref cookie name.
    cookieOptions: { name: supabaseCookieName(env.NEXT_PUBLIC_SUPABASE_URL) },
  });
}
