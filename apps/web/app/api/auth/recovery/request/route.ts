import { createIdentifierResolver } from '@/lib/auth-identifier';
import { createRateLimiter } from '@/lib/rate-limit';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleRecoveryRequest } from './handler';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

/** Send recovery to the primary auth email even when a verified alias was entered. */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  const resolver = createIdentifierResolver(service);
  return handleRecoveryRequest(request, {
    allowIp: async (ip) =>
      limiter.check(ip, Date.now()) &&
      consumeSharedRateLimit(service, {
        bucket: 'auth-recovery-request-ip',
        key: ip,
        nowMs: Date.now(),
        windowMs: 60_000,
        limit: 5,
      }),
    resolveIdentifier: resolver,
    allowRecipient: (target) =>
      consumeSharedRateLimit(service, {
        bucket: 'auth-recovery-request-recipient',
        key: target,
        nowMs: Date.now(),
        windowMs: 60 * 60_000,
        limit: 3,
      }),
    send: async (target) => (await createClient()).auth.resetPasswordForEmail(target),
  });
}
