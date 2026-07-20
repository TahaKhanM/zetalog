import { describe, expect, it } from 'vitest';

import { checkHistory } from './history.js';

describe('checkHistory', () => {
  const tenGames = { acceptedScores: [50, 55, 60, 52, 58, 61, 49, 57, 62, 54] }; // best 62

  it('returns null with fewer than ten accepted games', () => {
    expect(checkHistory(200, { acceptedScores: [10, 12] })).toBeNull();
  });

  it('flags a score far above the personal best', () => {
    expect(checkHistory(95, tenGames)).toBe('pb-jump'); // 62 + max(15, 15.5) = 77.5
  });

  it('allows a plausible new personal best inside the margin', () => {
    expect(checkHistory(70, tenGames)).toBeNull();
  });

  it('allows a score exactly at the margin boundary', () => {
    expect(checkHistory(77.5, tenGames)).toBeNull();
  });
});
