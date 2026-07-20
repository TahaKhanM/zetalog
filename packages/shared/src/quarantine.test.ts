import { describe, expect, it } from 'vitest';

import { evaluateQuarantine, median } from './quarantine.js';

const base = {
  score: 80,
  playedMs: 120_000,
  durationSeconds: 120,
  recentKeptScores: [] as number[],
};

describe('median', () => {
  it('returns the middle value for odd-length input', () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it('averages the two middle values for even-length input', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it('returns NaN for empty input', () => {
    expect(median([])).toBeNaN();
  });
});

describe('evaluateQuarantine — restart rule', () => {
  it('quarantines a game that played under 80% of its duration', () => {
    expect(evaluateQuarantine({ ...base, playedMs: 95_999 })).toBe('restart');
  });

  it('keeps a game at exactly the 80% boundary', () => {
    expect(evaluateQuarantine({ ...base, playedMs: 96_000 })).toBeNull();
  });
});

describe('evaluateQuarantine — outlier rule', () => {
  const history = [90, 88, 92, 85, 91]; // median 90

  it('quarantines a score under 40% of the median with enough history', () => {
    expect(evaluateQuarantine({ ...base, score: 35, recentKeptScores: history })).toBe('outlier');
  });

  it('keeps a score at exactly 40% of the median', () => {
    expect(evaluateQuarantine({ ...base, score: 36, recentKeptScores: history })).toBeNull();
  });

  it('never quarantines with fewer than five kept games', () => {
    expect(
      evaluateQuarantine({ ...base, score: 1, recentKeptScores: [90, 90, 90, 90] }),
    ).toBeNull();
  });

  it('considers only the ten most recent kept games', () => {
    // Window median is 100 (threshold 40); the full 30-game median would be 10
    // (threshold 4). A score of 35 is an outlier only if the window is used.
    const recent = [...Array<number>(10).fill(100), ...Array<number>(20).fill(10)];
    expect(evaluateQuarantine({ ...base, score: 35, recentKeptScores: recent })).toBe('outlier');
  });
});
