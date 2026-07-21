import { createIdentifierResolver } from '@/lib/auth-identifier';
import { createRateLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { LOGIN_LIMIT_PER_MINUTE, handleAuthLogin } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/login` — alias-aware password sign-in. Core logic (and the
 * password-handling posture) lives in {@link handleAuthLogin}; this file wires
 * real ports.
 *
 * Session mechanics — the part that must never drift: the grant runs through
 * `lib/supabase/server`'s @supabase/ssr client, which is bound to THIS
 * request's cookie store. In a Route Handler that store is writable, so
 * `signInWithPassword` persists the session by writing the exact cookies the
 * browser client and the proxy expect (same path as `/auth/callback`'s
 * `exchangeCodeForSession`). Hand-rolling the GoTrue token endpoint and
 * setting cookies manually is how you get silent session churn — don't.
 */

// Module scope: shared across requests within one warm server instance.
const limiter = createRateLimiter({ limit: LOGIN_LIMIT_PER_MINUTE, windowMs: 60_000 });

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  return handleAuthLogin(request, {
    resolveIdentifier: createIdentifierResolver(createServiceClient()),
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      // Only the status crosses back: grant failures all collapse to one
      // user-facing message, and nothing here can echo a credential.
      if (error !== null) return { ok: false, status: error.status };
      return { ok: true };
    },
    rateLimiter: limiter,
    now: () => Date.now(),
  });
}
