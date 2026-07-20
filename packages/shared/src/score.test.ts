import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GameEvent } from './schemas.js';
import { recomputeScore } from './score.js';

/** A clean two-problem game: 3 + 4 = 7 (typed "7"), 9 × 2 = 18 (typed "1", "18"). */
const cleanGame: GameEvent[] = [
  { kind: 'problem', at: 0, text: '3 + 4' },
  { kind: 'input', at: 400, value: '7' },
  { kind: 'accepted', at: 450, answer: 7 },
  { kind: 'problem', at: 500, text: '9 × 2' },
  { kind: 'input', at: 900, value: '1' },
  { kind: 'input', at: 1000, value: '18' },
  { kind: 'accepted', at: 1050, answer: 18 },
];

describe('recomputeScore', () => {
  it('counts only verified answers and reports solve times', () => {
    const result = recomputeScore(cleanGame);
    expect(result.score).toBe(2);
    expect(result.anomalies).toEqual([]);
    expect(result.outcomes.map((o) => o.solveMs)).toEqual([450, 550]);
    expect(result.inputIntervalsMs).toEqual([500, 100]);
    expect(result.entryBursts).toBe(0);
  });

  it('handles corrections (backspace) via shrinking value snapshots', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 100, value: '9' },
      { kind: 'input', at: 200, value: '' },
      { kind: 'input', at: 300, value: '7' },
      { kind: 'accepted', at: 350, answer: 7 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(1);
    expect(result.anomalies).toEqual([]);
    expect(result.entryBursts).toBe(0);
  });

  it('counts a paste-like burst when the value grows by more than one character', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '9 × 2' },
      { kind: 'input', at: 100, value: '18' },
      { kind: 'accepted', at: 150, answer: 18 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(1);
    expect(result.entryBursts).toBe(1);
  });

  it('flags an accepted event whose final value does not solve the problem', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 100, value: '9' },
      { kind: 'accepted', at: 150, answer: 7 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(0);
    expect(result.anomalies).toEqual([{ kind: 'answer-mismatch', at: 150 }]);
  });

  it('flags an accepted event with no preceding problem', () => {
    const result = recomputeScore([{ kind: 'accepted', at: 10, answer: 1 }]);
    expect(result.score).toBe(0);
    expect(result.anomalies).toEqual([{ kind: 'accepted-without-problem', at: 10 }]);
  });

  it('flags an unparseable problem text', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: 'garbage' },
      { kind: 'input', at: 50, value: '1' },
      { kind: 'accepted', at: 100, answer: 1 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(0);
    expect(result.anomalies).toEqual([{ kind: 'unparseable-problem', at: 100 }]);
  });

  it('returns zero for an empty event stream', () => {
    expect(recomputeScore([])).toEqual({
      score: 0,
      outcomes: [],
      anomalies: [],
      inputIntervalsMs: [],
      entryBursts: 0,
    });
  });

  it('property: score never exceeds the number of accepted events', () => {
    const eventArb: fc.Arbitrary<GameEvent> = fc.oneof(
      fc.record({
        kind: fc.constant('problem' as const),
        at: fc.nat(),
        text: fc.string({ minLength: 1 }),
      }),
      fc.record({
        kind: fc.constant('input' as const),
        at: fc.nat(),
        value: fc.constantFrom('', '7', '18'),
      }),
      fc.record({ kind: fc.constant('accepted' as const), at: fc.nat(), answer: fc.integer() }),
    );
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        const accepted = events.filter((e) => e.kind === 'accepted').length;
        expect(recomputeScore(events).score).toBeLessThanOrEqual(accepted);
      }),
    );
  });
});
