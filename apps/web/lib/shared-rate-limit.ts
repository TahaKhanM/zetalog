import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { Db } from './supabase/database';

if (typeof window !== 'undefined')
  throw new Error('lib/shared-rate-limit.ts must never load in a client bundle');

/** Database-backed limit shared by every server instance. Raw IPs are never stored. */
export async function consumeSharedRateLimit(
  service: Db,
  input: {
    bucket: string;
    key: string;
    nowMs: number;
    windowMs: number;
    limit: number;
  },
): Promise<boolean> {
  const keyHash = createHash('sha256').update(input.key, 'utf8').digest('hex');
  const result = await service.rpc('consume_auth_rate_limit', {
    p_bucket: input.bucket,
    p_key_hash: keyHash,
    p_now: new Date(input.nowMs).toISOString(),
    p_window_seconds: Math.max(1, Math.ceil(input.windowMs / 1000)),
    p_limit: input.limit,
  });
  if (result.error !== null) throw new Error(`consume_auth_rate_limit: ${result.error.message}`);
  return z.boolean().parse(result.data);
}
