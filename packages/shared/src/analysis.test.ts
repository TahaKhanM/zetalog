import { describe, expect, it } from 'vitest';

import {
  factStats,
  operationStats,
  skillBuckets,
  slowestSolves,
  solvedProblems,
  weakestBuckets,
} from './analysis';
import type { GameEvent } from './schemas';

/**
 * Fixture: a four-problem game covering every operation, with one correction
 * (backspace) on the division and one unverified (mismatched) answer that the
 * analysis must ignore.
 *
 *   3 + 4   → solved in 450ms, clean
 *   52 – 9  → solved in 1200ms, clean          (43: borrow, 2 < 9)
 *   12 × 7  → solved in 2600ms, clean          (84)
 *   84 ÷ 12 → solved in 3400ms, one correction (7: typed "9", backspaced, "7")
 *   6 + 1   → answer mismatch, must be ignored
 */
const richGame: GameEvent[] = [
  { kind: 'problem', at: 0, text: '3 + 4' },
  { kind: 'input', at: 400, value: '7' },
  { kind: 'accepted', at: 450, answer: 7 },

  { kind: 'problem', at: 1000, text: '52 – 9' },
  { kind: 'input', at: 1900, value: '4' },
  { kind: 'input', at: 2100, value: '43' },
  { kind: 'accepted', at: 2200, answer: 43 },

  { kind: 'problem', at: 3000, text: '12 × 7' },
  { kind: 'input', at: 5200, value: '8' },
  { kind: 'input', at: 5450, value: '84' },
  { kind: 'accepted', at: 5600, answer: 84 },

  { kind: 'problem', at: 6000, text: '84 ÷ 12' },
  { kind: 'input', at: 8800, value: '9' },
  { kind: 'input', at: 9000, value: '' },
  { kind: 'input', at: 9200, value: '7' },
  { kind: 'accepted', at: 9400, answer: 7 },

  { kind: 'problem', at: 10000, text: '6 + 1' },
  { kind: 'input', at: 10400, value: '9' },
  { kind: 'accepted', at: 10500, answer: 7 },
];

describe('solvedProblems', () => {
  it('extracts each verified solve with its parsed problem, time, and corrections', () => {
    const solved = solvedProblems(richGame);
    expect(solved).toHaveLength(4);
    expect(solved[0]).toEqual({
      text: '3 + 4',
      problem: { left: 3, op: '+', right: 4 },
      answer: 7,
      solveMs: 450,
      corrections: 0,
    });
    expect(solved[3]).toEqual({
      text: '84 ÷ 12',
      problem: { left: 84, op: '/', right: 12 },
      answer: 7,
      solveMs: 3400,
      corrections: 1,
    });
  });

  it('ignores unverified answers, unparseable problems, and orphan accepts', () => {
    const events: GameEvent[] = [
      { kind: 'accepted', at: 10, answer: 1 },
      { kind: 'problem', at: 20, text: 'garbage' },
      { kind: 'input', at: 30, value: '1' },
      { kind: 'accepted', at: 40, answer: 1 },
      { kind: 'problem', at: 50, text: '2 + 2' },
      { kind: 'input', at: 60, value: '5' },
      { kind: 'accepted', at: 70, answer: 4 },
    ];
    expect(solvedProblems(events)).toEqual([]);
  });

  it('resets the input trail between problems (no correction bleed-through)', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 100, value: '9' },
      { kind: 'input', at: 200, value: '' },
      { kind: 'input', at: 300, value: '7' },
      { kind: 'accepted', at: 350, answer: 7 },
      { kind: 'problem', at: 400, text: '2 + 2' },
      { kind: 'input', at: 500, value: '4' },
      { kind: 'accepted', at: 550, answer: 4 },
    ];
    const solved = solvedProblems(events);
    expect(solved.map((p) => p.corrections)).toEqual([1, 0]);
  });

  it('returns an empty list for an empty stream', () => {
    expect(solvedProblems([])).toEqual([]);
  });
});

describe('operationStats', () => {
  it('aggregates solves per operation in canonical + − × ÷ order', () => {
    const stats = operationStats(solvedProblems(richGame));
    expect(stats.map((s) => s.op)).toEqual(['+', '-', '*', '/']);
    expect(stats.map((s) => s.solved)).toEqual([1, 1, 1, 1]);
    expect(stats.map((s) => s.medianSolveMs)).toEqual([450, 1200, 2600, 3400]);
    expect(stats.map((s) => s.totalMs)).toEqual([450, 1200, 2600, 3400]);
  });

  it('omits operations with no solves', () => {
    const addOnly = solvedProblems([
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 400, value: '7' },
      { kind: 'accepted', at: 450, answer: 7 },
    ]);
    expect(operationStats(addOnly).map((s) => s.op)).toEqual(['+']);
  });

  it('computes medians across repeated solves of the same operation', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 300, value: '7' },
      { kind: 'accepted', at: 400, answer: 7 },
      { kind: 'problem', at: 1000, text: '5 + 5' },
      { kind: 'input', at: 1500, value: '1' },
      { kind: 'input', at: 1600, value: '10' },
      { kind: 'accepted', at: 1800, answer: 10 },
      { kind: 'problem', at: 2000, text: '2 + 2' },
      { kind: 'input', at: 3100, value: '4' },
      { kind: 'accepted', at: 3200, answer: 4 },
    ];
    const stats = operationStats(solvedProblems(events));
    expect(stats).toEqual([{ op: '+', solved: 3, medianSolveMs: 800, totalMs: 2400 }]);
  });
});

describe('factStats', () => {
  it('groups multiplication by its small left factor and division by its divisor', () => {
    const stats = factStats(solvedProblems(richGame));
    expect(stats).toEqual([
      { op: '*', factor: 12, solved: 1, medianSolveMs: 2600 },
      { op: '/', factor: 12, solved: 1, medianSolveMs: 3400 },
    ]);
  });

  it('orders by operation then ascending factor, pools a repeated factor, ignores + and −', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '9 × 8' },
      { kind: 'input', at: 500, value: '7' },
      { kind: 'input', at: 700, value: '72' },
      { kind: 'accepted', at: 900, answer: 72 },
      { kind: 'problem', at: 1000, text: '3 × 5' },
      { kind: 'input', at: 1500, value: '1' },
      { kind: 'input', at: 1600, value: '15' },
      { kind: 'accepted', at: 1700, answer: 15 },
      { kind: 'problem', at: 2000, text: '3 + 5' },
      { kind: 'input', at: 2500, value: '8' },
      { kind: 'accepted', at: 2600, answer: 8 },
      { kind: 'problem', at: 3000, text: '3 × 9' },
      { kind: 'input', at: 3800, value: '2' },
      { kind: 'input', at: 3900, value: '27' },
      { kind: 'accepted', at: 4100, answer: 27 },
    ];
    const stats = factStats(solvedProblems(events));
    expect(stats).toEqual([
      { op: '*', factor: 3, solved: 2, medianSolveMs: 900 },
      { op: '*', factor: 9, solved: 1, medianSolveMs: 900 },
    ]);
  });

  it('sorts multiplication ahead of division regardless of play order', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '10 ÷ 5' },
      { kind: 'input', at: 600, value: '2' },
      { kind: 'accepted', at: 700, answer: 2 },
      { kind: 'problem', at: 1000, text: '4 × 6' },
      { kind: 'input', at: 1500, value: '2' },
      { kind: 'input', at: 1600, value: '24' },
      { kind: 'accepted', at: 1700, answer: 24 },
    ];
    expect(factStats(solvedProblems(events)).map((stat) => stat.op)).toEqual(['*', '/']);
  });
});

describe('skillBuckets', () => {
  it('classifies carries, borrows, and large/small times tables', () => {
    const buckets = skillBuckets(solvedProblems(richGame));
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    // 3 + 4: units 3+4 < 10 → plain addition.
    expect(byKey.get('add-plain')?.solved).toBe(1);
    // 52 − 9: units 2 < 9 → borrow.
    expect(byKey.get('sub-borrow')?.solved).toBe(1);
    // 12 × 7: left 12 ≥ 7 → large table.
    expect(byKey.get('mul-large')?.solved).toBe(1);
    // 84 ÷ 12: divisor 12 ≥ 7 → large divisor.
    expect(byKey.get('div-large')?.solved).toBe(1);
    expect(byKey.has('add-carry')).toBe(false);
  });

  it('classifies the complementary bucket of each pair', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '58 + 6' },
      { kind: 'input', at: 500, value: '6' },
      { kind: 'input', at: 700, value: '64' },
      { kind: 'accepted', at: 800, answer: 64 },
      { kind: 'problem', at: 1000, text: '58 – 6' },
      { kind: 'input', at: 1500, value: '5' },
      { kind: 'input', at: 1700, value: '52' },
      { kind: 'accepted', at: 1800, answer: 52 },
      { kind: 'problem', at: 2000, text: '3 × 4' },
      { kind: 'input', at: 2500, value: '1' },
      { kind: 'input', at: 2600, value: '12' },
      { kind: 'accepted', at: 2700, answer: 12 },
      { kind: 'problem', at: 3000, text: '12 ÷ 4' },
      { kind: 'input', at: 3500, value: '3' },
      { kind: 'accepted', at: 3600, answer: 3 },
      { kind: 'problem', at: 4000, text: '49 + 5' },
      { kind: 'input', at: 4500, value: '5' },
      { kind: 'input', at: 4700, value: '54' },
      { kind: 'accepted', at: 4800, answer: 54 },
    ];
    const buckets = skillBuckets(solvedProblems(events));
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      'add-carry',
      'sub-plain',
      'mul-small',
      'div-small',
    ]);
    // 58 + 6 and 49 + 5 pool into one carry bucket.
    expect(buckets[0]?.solved).toBe(2);
  });

  it('carries human-readable labels', () => {
    const buckets = skillBuckets(solvedProblems(richGame));
    const large = buckets.find((bucket) => bucket.key === 'mul-large');
    expect(large?.label).toBe('× by 7–12');
  });
});

describe('weakestBuckets', () => {
  it('returns the slowest buckets first, gated by a minimum sample size', () => {
    const buckets = [
      { key: 'add-plain', label: 'Addition', solved: 20, medianSolveMs: 1000 },
      { key: 'div-large', label: '÷ by 7–12', solved: 10, medianSolveMs: 3000 },
      { key: 'mul-large', label: '× by 7–12', solved: 2, medianSolveMs: 9000 },
    ] as const;
    expect(weakestBuckets(buckets, 5, 2).map((bucket) => bucket.key)).toEqual([
      'div-large',
      'add-plain',
    ]);
  });

  it('honours the limit', () => {
    const buckets = [
      { key: 'add-plain', label: 'Addition', solved: 20, medianSolveMs: 1000 },
      { key: 'div-large', label: '÷ by 7–12', solved: 10, medianSolveMs: 3000 },
    ] as const;
    expect(weakestBuckets(buckets, 5, 1)).toHaveLength(1);
  });
});

describe('slowestSolves', () => {
  it('returns the slowest individual solves, slowest first, capped at the limit', () => {
    const slow = slowestSolves(solvedProblems(richGame), 2);
    expect(slow).toEqual([
      { text: '84 ÷ 12', op: '/', solveMs: 3400, corrections: 1 },
      { text: '12 × 7', op: '*', solveMs: 2600, corrections: 0 },
    ]);
  });

  it('returns everything when the limit exceeds the solve count', () => {
    expect(slowestSolves(solvedProblems(richGame), 99)).toHaveLength(4);
  });
});
