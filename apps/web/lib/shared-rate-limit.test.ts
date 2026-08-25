import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { Db } from './supabase/database';
import { consumeSharedRateLimit } from './shared-rate-limit';

function service(
  data: boolean,
  error: { message: string } | null = null,
): { db: Db; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(() => Promise.resolve({ data, error }));
  return { db: { rpc } as unknown as Db, rpc };
}

describe('consumeSharedRateLimit', () => {
  it('hashes the raw key and converts the window to whole seconds for the database RPC', async () => {
    const { db, rpc } = service(true);
    await expect(
      consumeSharedRateLimit(db, {
        bucket: 'auth-recovery-request-ip',
        key: '203.0.113.9',
        nowMs: 1_700_000_000_123,
        windowMs: 1_234,
        limit: 5,
      }),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('consume_auth_rate_limit', {
      p_bucket: 'auth-recovery-request-ip',
      p_key_hash: createHash('sha256').update('203.0.113.9', 'utf8').digest('hex'),
      p_now: new Date(1_700_000_000_123).toISOString(),
      p_window_seconds: 2,
      p_limit: 5,
    });
  });

  it('returns the database admission decision and fails closed on RPC errors', async () => {
    await expect(
      consumeSharedRateLimit(service(false).db, {
        bucket: 'auth-recovery-verify-ip',
        key: 'unknown',
        nowMs: 0,
        windowMs: 60_000,
        limit: 10,
      }),
    ).resolves.toBe(false);

    await expect(
      consumeSharedRateLimit(service(false, { message: 'database unavailable' }).db, {
        bucket: 'auth-recovery-verify-ip',
        key: 'unknown',
        nowMs: 0,
        windowMs: 60_000,
        limit: 10,
      }),
    ).rejects.toThrow('consume_auth_rate_limit: database unavailable');
  });
});
