import { describe, expect, it } from 'vitest';

import { DEFAULT_DURATION, parseDuration } from './leaderboard';

describe('parseDuration', () => {
  it('accepts the three rankable durations', () => {
    expect(parseDuration('30')).toBe(30);
    expect(parseDuration('60')).toBe(60);
    expect(parseDuration('120')).toBe(120);
  });

  it('defaults to 120 for missing, unknown, or non-numeric values', () => {
    expect(parseDuration(undefined)).toBe(DEFAULT_DURATION);
    expect(parseDuration('90')).toBe(DEFAULT_DURATION);
    expect(parseDuration('abc')).toBe(DEFAULT_DURATION);
    expect(DEFAULT_DURATION).toBe(120);
  });

  it('uses the first value when the query param repeats', () => {
    expect(parseDuration(['60', '30'])).toBe(60);
  });
});
