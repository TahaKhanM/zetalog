/**
 * Sliding-window rate limiter for the auth routes. Time is passed in by the
 * caller, so behaviour is fully deterministic under test.
 *
 * Scope trade-off, stated deliberately: state is in-memory and therefore
 * per-server-instance. On serverless that means the limit applies per warm
 * lambda, not globally — acceptable here because this is a first defence for
 * UX-shaped abuse (enumeration scraping, password stuffing) and GoTrue applies
 * its own authoritative per-IP limits behind us. A global limiter would need a
 * shared store, which this project does not otherwise require.
 */

/** Configuration for one limiter instance. */
export interface RateLimiterConfig {
  /** Max accepted hits per key inside any sliding window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Hard cap on attacker-controlled keys retained in this process. */
  readonly maxKeys?: number;
}

/** A keyed sliding-window limiter. */
export interface RateLimiter {
  /**
   * Record an attempt for `key` at `nowMs`. Returns true when the attempt is
   * allowed (and consumes a slot); false when the key is over the limit —
   * blocked attempts consume nothing, so an attacker cannot extend the lockout.
   */
  check(key: string, nowMs: number): boolean;
}

/** Create an independent limiter (one per route concern). */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const maxKeys = config.maxKeys ?? 10_000;
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1)
    throw new Error('RateLimiterConfig.maxKeys must be a positive integer.');
  const hits = new Map<string, { at: number[]; touchedAt: number }>();

  function evictOldest(): void {
    if (hits.size < maxKeys) return;
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, value] of hits) {
      if (value.touchedAt < oldestAt) {
        oldestKey = key;
        oldestAt = value.touchedAt;
      }
    }
    if (oldestKey !== undefined) hits.delete(oldestKey);
  }

  return {
    check(key, nowMs) {
      const cutoff = nowMs - config.windowMs;
      const existing = hits.get(key);
      if (existing === undefined) evictOldest();
      const kept = (existing?.at ?? []).filter((at) => at > cutoff);
      if (kept.length >= config.limit) {
        // Still store the pruned list so stale entries do not accumulate.
        hits.set(key, { at: kept, touchedAt: nowMs });
        return false;
      }
      kept.push(nowMs);
      hits.set(key, { at: kept, touchedAt: nowMs });
      return true;
    },
  };
}
