import { describe, expect, it } from 'vitest';

import type { GameEvent, GameRecord } from '../schemas';
import { ZETAMAC_DEFAULT_SETTINGS } from '../zetamac';
import { judge } from './verdict';

/** A clean, human-plausible one-problem game. */
function cleanRecord(): GameRecord {
  return {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 1_750_000_000_000,
    playedMs: 120_000,
    settings: ZETAMAC_DEFAULT_SETTINGS,
    events: [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 900, value: '7' },
      { kind: 'accepted', at: 1000, answer: 7 },
    ],
    claimedScore: 1,
  };
}

const noHistory = { acceptedScores: [] as number[] };

describe('judge', () => {
  it('accepts a clean record and reports the recomputed score', () => {
    const verdict = judge(cleanRecord(), noHistory);
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.serverScore).toBe(1);
    expect(verdict.violations).toEqual([]);
    expect(verdict.flags).toEqual([]);
    expect(verdict.historyFlag).toBeNull();
  });

  it('rejects a record with non-monotonic timestamps', () => {
    const record = cleanRecord();
    const events: GameEvent[] = [
      { kind: 'problem', at: 1000, text: '3 + 4' },
      { kind: 'input', at: 100, value: '7' },
      { kind: 'accepted', at: 1100, answer: 7 },
    ];
    const verdict = judge({ ...record, events }, noHistory);
    expect(verdict.outcome).toBe('rejected');
  });

  it('quarantines superhuman solve times instead of rejecting', () => {
    const record = cleanRecord();
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 50, value: '7' },
      { kind: 'accepted', at: 60, answer: 7 },
    ];
    const verdict = judge({ ...record, events }, noHistory);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.flags.map((f) => f.rule)).toContain('answer-floor');
  });

  it('quarantines an implausible PB jump', () => {
    const history = { acceptedScores: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
    // One verified problem = score 1, far above... build a 40-problem game instead.
    const events: GameEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      const base = i * 2500;
      events.push({ kind: 'problem', at: base, text: '3 + 4 = ' });
      events.push({ kind: 'input', at: base + 800 + (i % 5) * 90, value: '7' });
      // Base shifted from the brief's 1000 to 1200 so `accepted` always follows
      // `input` (max input offset is 1160); the original 1000 base overlaps for
      // i = 14, 28, 29 and spuriously trips non-monotonic-timestamps.
      events.push({ kind: 'accepted', at: base + 1200 + (i % 7) * 80, answer: 7 });
    }
    const record = { ...cleanRecord(), events, claimedScore: 40 };
    const verdict = judge(record, history);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.historyFlag).toBe('pb-jump');
  });

  it('uses the recomputed score even when the claim disagrees, without rejecting', () => {
    const record = { ...cleanRecord(), claimedScore: 50 };
    const verdict = judge(record, noHistory);
    expect(verdict.serverScore).toBe(1);
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.violations.map((v) => v.rule)).toContain('claimed-score-mismatch');
  });
});
