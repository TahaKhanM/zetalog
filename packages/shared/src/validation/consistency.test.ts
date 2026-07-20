import { describe, expect, it } from 'vitest';

import type { GameRecord } from '../schemas.js';
import type { RecomputedScore } from '../score.js';
import { ZETAMAC_DEFAULT_SETTINGS } from '../zetamac.js';
import { checkConsistency } from './consistency.js';

function record(overrides: Partial<GameRecord>): GameRecord {
  return {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 0,
    playedMs: 120_000,
    settings: ZETAMAC_DEFAULT_SETTINGS,
    events: [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 400, value: '7' },
      { kind: 'accepted', at: 450, answer: 7 },
    ],
    claimedScore: 1,
    ...overrides,
  };
}

function recomputed(overrides: Partial<RecomputedScore>): RecomputedScore {
  return {
    score: 1,
    outcomes: [],
    anomalies: [],
    inputIntervalsMs: [],
    entryBursts: 0,
    ...overrides,
  };
}

describe('checkConsistency', () => {
  it('passes a clean record', () => {
    expect(checkConsistency(record({}), recomputed({}))).toEqual([]);
  });

  it('flags decreasing timestamps', () => {
    const bad = record({
      events: [
        { kind: 'problem', at: 500, text: '3 + 4' },
        { kind: 'input', at: 100, value: '7' },
      ],
    });
    const rules = checkConsistency(bad, recomputed({ score: 0 })).map((v) => v.rule);
    expect(rules).toContain('non-monotonic-timestamps');
  });

  it('flags events beyond the configured duration plus tolerance', () => {
    const bad = record({ events: [{ kind: 'problem', at: 122_001, text: '3 + 4' }] });
    const rules = checkConsistency(bad, recomputed({ score: 0 })).map((v) => v.rule);
    expect(rules).toContain('exceeds-duration');
  });

  it('accepts an event exactly at the tolerance boundary', () => {
    const edge = record({ events: [{ kind: 'problem', at: 122_000, text: '3 + 4' }] });
    expect(
      checkConsistency(edge, recomputed({ score: 0, anomalies: [] })).map((v) => v.rule),
    ).not.toContain('exceeds-duration');
  });

  it('handles an empty event stream without violations beyond score mismatch', () => {
    const empty = record({ events: [], claimedScore: 0 });
    expect(checkConsistency(empty, recomputed({ score: 0 }))).toEqual([]);
  });

  it('flags a claimed score that disagrees with the recomputation', () => {
    const rules = checkConsistency(record({ claimedScore: 99 }), recomputed({ score: 1 })).map(
      (v) => v.rule,
    );
    expect(rules).toContain('claimed-score-mismatch');
  });

  it('flags event-stream anomalies reported by the recomputation', () => {
    const anomalous = recomputed({ anomalies: [{ kind: 'answer-mismatch', at: 450 }], score: 1 });
    const rules = checkConsistency(record({}), anomalous).map((v) => v.rule);
    expect(rules).toContain('event-anomalies');
  });
});
