import { describe, expect, it } from 'vitest';

import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows requests up to the limit inside one window', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check('k', 1_000)).toBe(true);
    expect(limiter.check('k', 2_000)).toBe(true);
    expect(limiter.check('k', 3_000)).toBe(true);
  });

  it('blocks the request after the limit inside one window', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    limiter.check('k', 1_000);
    limiter.check('k', 2_000);
    limiter.check('k', 3_000);
    expect(limiter.check('k', 4_000)).toBe(false);
  });

  it('slides: hits older than the window stop counting', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check('k', 0);
    limiter.check('k', 30_000);
    expect(limiter.check('k', 59_999)).toBe(false);
    // The hit at t=0 has aged out at t=60_001; one slot is free again.
    expect(limiter.check('k', 60_001)).toBe(true);
    // …but now t=30_000 and t=60_001 occupy the window.
    expect(limiter.check('k', 60_002)).toBe(false);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check('a', 1_000)).toBe(true);
    expect(limiter.check('b', 1_000)).toBe(true);
    expect(limiter.check('a', 2_000)).toBe(false);
  });

  it('a blocked attempt does not consume a slot (pure sliding window on accepts)', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    limiter.check('k', 0);
    expect(limiter.check('k', 5_000)).toBe(false);
    // Only the accepted hit at t=0 counts, so the window frees at t=10_001.
    expect(limiter.check('k', 10_001)).toBe(true);
  });

  it('recovers a key fully after a quiet window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });
    limiter.check('k', 0);
    limiter.check('k', 1);
    expect(limiter.check('k', 2)).toBe(false);
    expect(limiter.check('k', 2_000)).toBe(true);
    expect(limiter.check('k', 2_001)).toBe(true);
    expect(limiter.check('k', 2_002)).toBe(false);
  });
});
