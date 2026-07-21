import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { clientEnv } from '../env';

/** Outcome of refreshing the session for one request. */
export interface SessionResult {
  /** The response carrying any refreshed auth cookies — return it (or copy its cookies). */
  readonly response: NextResponse;
  /** The signed-in user's id, or null when the request is anonymous. */
  readonly userId: string | null;
}

/**
 * Refresh the Supabase session for an incoming request and report who is
 * signed in. Rotated tokens are written onto the returned response's cookies.
 * The proxy calls `auth.getUser()` (not `getSession()`) so the token is
 * verified against the auth server, not just decoded.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  const env = clientEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, userId: user?.id ?? null };
}
