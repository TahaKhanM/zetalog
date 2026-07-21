import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ProblemOutcome, RecomputedScore } from '../score';
import { checkPhysiology, coefficientOfVariation } from './physiology';

function outcome(solveMs: number): ProblemOutcome {
  return { text: '3 + 4 = ', shownAt: 0, acceptedAt: solveMs, solveMs, verified: true };
}

function recomputed(overrides: Partial<RecomputedScore>): RecomputedScore {
  return {
    score: 0,
    outcomes: [],
    anomalies: [],
    inputIntervalsMs: [],
    entryBursts: 0,
    ...overrides,
  };
}

describe('coefficientOfVariation', () => {
  it('is zero for a constant series', () => {
    expect(coefficientOfVariation([100, 100, 100])).toBe(0);
  });

  it('is zero when the mean is zero', () => {
    expect(coefficientOfVariation([0, 0])).toBe(0);
  });

  it('property: scale-invariant for positive series', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 2, maxLength: 50 }),
        fc.integer({ min: 2, max: 9 }),
        (values, k) => {
          const scaled = values.map((v) => v * k);
          expect(coefficientOfVariation(scaled)).toBeCloseTo(coefficientOfVariation(values), 10);
        },
      ),
    );
  });
});

describe('checkPhysiology — answer floor', () => {
  it('flags when 30% or more of solved problems beat the human floor', () => {
    const outcomes = [
      outcome(100),
      outcome(120),
      outcome(400),
      outcome(500),
      outcome(600),
      outcome(700),
    ];
    const flags = checkPhysiology(recomputed({ outcomes }));
    expect(flags.map((f) => f.rule)).toContain('answer-floor');
  });

  it('does not flag ordinary fast play under the threshold fraction', () => {
    const outcomes = [
      outcome(200),
      outcome(400),
      outcome(500),
      outcome(600),
      outcome(700),
      outcome(800),
      outcome(900),
    ];
    expect(checkPhysiology(recomputed({ outcomes }))).toEqual([]);
  });

  it('does not flag a game with no verified outcomes', () => {
    expect(checkPhysiology(recomputed({}))).toEqual([]);
  });
});

describe('checkPhysiology — cadence uniformity', () => {
  it('flags 30+ near-identical inter-input intervals', () => {
    const inputIntervalsMs = Array<number>(40).fill(150);
    const flags = checkPhysiology(recomputed({ inputIntervalsMs }));
    expect(flags.map((f) => f.rule)).toContain('cadence-uniformity');
  });

  it('ignores cadence with fewer than 30 inputs', () => {
    const inputIntervalsMs = Array<number>(29).fill(150);
    expect(checkPhysiology(recomputed({ inputIntervalsMs }))).toEqual([]);
  });

  it('does not flag human-variance typing', () => {
    const inputIntervalsMs = Array.from({ length: 40 }, (_, i) => 120 + (i % 7) * 35);
    expect(checkPhysiology(recomputed({ inputIntervalsMs }))).toEqual([]);
  });
});

describe('checkPhysiology — entry bursts', () => {
  it('flags any paste-like burst', () => {
    const flags = checkPhysiology(recomputed({ entryBursts: 2 }));
    expect(flags.map((f) => f.rule)).toContain('entry-burst');
  });
});
