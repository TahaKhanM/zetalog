import { createIdentifierResolver } from '@/lib/auth-identifier';
import { createRateLimiter } from '@/lib/rate-limit';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleRecoveryVerify } from './handler';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/** Verify against the resolved primary email and persist the recovery cookie session. */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  const resolver = createIdentifierResolver(service);
  return handleRecoveryVerify(request, {
    allowIp: async (ip) =>
      limiter.check(ip, Date.now()) &&
      consumeSharedRateLimit(service, {
        bucket: 'auth-recovery-verify-ip',
        key: ip,
        nowMs: Date.now(),
        windowMs: 60_000,
        limit: 10,
      }),
    resolveIdentifier: resolver,
    allowRecipient: (target) =>
      consumeSharedRateLimit(service, {
        bucket: 'auth-recovery-verify-recipient',
        key: target,
        nowMs: Date.now(),
        windowMs: 10 * 60_000,
        limit: 10,
      }),
    verify: async (target, code) =>
      (await createClient()).auth.verifyOtp({ email: target, token: code, type: 'recovery' }),
  });
}
