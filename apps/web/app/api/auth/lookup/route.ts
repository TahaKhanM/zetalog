import { createIdentifierResolver } from '@/lib/auth-identifier';
import { apiError, clientIpFrom } from '@/lib/http';
import { createRateLimiter } from '@/lib/rate-limit';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
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
  const service = createServiceClient();
  const allowed = await consumeSharedRateLimit(service, {
    bucket: 'auth-lookup-ip',
    key: clientIpFrom(request),
    nowMs: Date.now(),
    windowMs: 60_000,
    limit: LOOKUP_LIMIT_PER_MINUTE,
  });
  if (!allowed)
    return apiError(429, 'rate-limited', 'Too many attempts. Please wait and try again.');
  return handleAuthLookup(request, {
    resolveIdentifier: createIdentifierResolver(service),
    rateLimiter: limiter,
    now: () => Date.now(),
  });
}
