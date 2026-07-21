import { createIdentifierResolver } from '@/lib/auth-identifier';
import { createRateLimiter } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';

import { LOOKUP_LIMIT_PER_MINUTE, handleAuthLookup } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/lookup` — the email-first step: which flow should the form
 * reveal for this address? Core logic (and the documented user-enumeration
 * trade-off) lives in {@link handleAuthLookup}; this file wires real ports.
 */

// Module scope: shared across requests within one warm server instance.
const limiter = createRateLimiter({ limit: LOOKUP_LIMIT_PER_MINUTE, windowMs: 60_000 });

export async function POST(request: Request): Promise<Response> {
  return handleAuthLookup(request, {
    resolveIdentifier: createIdentifierResolver(createServiceClient()),
    rateLimiter: limiter,
    now: () => Date.now(),
  });
}
