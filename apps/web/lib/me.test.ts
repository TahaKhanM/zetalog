import { describe, expect, it } from 'vitest';

import type { GameRow, StoredValidation } from './db/rows';
import { mostPlayedFingerprint, personalBests, projectGame, reasonsFor } from './me';

const cleanValidation: StoredValidation = {
  outcome: 'accepted',
  serverScore: 40,
  violations: [],
  flags: [],
  historyFlag: null,
  problemViolations: [],
  problemFlags: [],
};

function row(over: Partial<GameRow>): GameRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '11111111-1111-4111-8111-111111111111',
    client_game_id: '33333333-3333-4333-8333-333333333333',
    played_at: '2026-07-20T10:00:00.000Z',
    received_at: '2026-07-20T10:02:00.000Z',
    settings_fingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
    rankable_duration: 120,
    claimed_score: 40,
    server_score: 40,
    status: 'accepted',
    telemetry: [],
    validation: cleanValidation,
    ...over,
  };
}

describe('projectGame', () => {
  it('drops telemetry and carries the display-relevant fields', () => {
    const game = projectGame(row({ server_score: 55, status: 'accepted' }));
    expect(game).toEqual({
      clientGameId: '33333333-3333-4333-8333-333333333333',
      playedAt: '2026-07-20T10:00:00.000Z',
      fingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
      duration: 120,
      score: 55,
      status: 'accepted',
      reasons: [],
    });
    expect(game).not.toHaveProperty('telemetry');
  });
});

describe('reasonsFor', () => {
  it('maps physiology flags and a pb-jump to human phrases', () => {
    const reasons = reasonsFor({
      outcome: 'quarantined',
      serverScore: 90,
      violations: [],
      flags: [
        { rule: 'answer-floor', detail: 'x' },
        { rule: 'entry-burst', detail: 'y' },
      ],
      historyFlag: 'pb-jump',
      problemViolations: [],
      problemFlags: [],
    });
    expect(reasons).toEqual([
      'Superhuman solve times',
      'Pasted answers',
      'Far above your usual range',
    ]);
  });

  it('maps problem-stream violations and flags to human phrases', () => {
    const reasons = reasonsFor({
      outcome: 'rejected',
      serverScore: 12,
      violations: [],
      flags: [],
      historyFlag: null,
      problemViolations: [{ rule: 'range-nonconforming', detail: 'x' }],
      problemFlags: [
        { rule: 'operation-mix', detail: 'a' },
        { rule: 'low-entropy', detail: 'b' },
        { rule: 'problem-switch', detail: 'c' },
      ],
    });
    expect(reasons).toEqual([
      'Problem outside the claimed range',
      'Implausible operation mix',
      'Problems repeat too often',
      'Problems re-shown unsolved',
    ]);
  });

  it('maps rejecting violations but ignores the informational claimed-score mismatch', () => {
    const reasons = reasonsFor({
      outcome: 'rejected',
      serverScore: 3,
      violations: [
        { rule: 'non-monotonic-timestamps', detail: 'x' },
        { rule: 'claimed-score-mismatch', detail: 'y' },
      ],
      flags: [],
      historyFlag: null,
      problemViolations: [],
      problemFlags: [],
    });
    expect(reasons).toEqual(['Timestamps out of order']);
  });

  it('returns nothing for a clean verdict', () => {
    expect(reasonsFor(cleanValidation)).toEqual([]);
  });
});

describe('personalBests', () => {
  it('takes the max accepted score per duration and counts accepted games', () => {
    const games = [
      projectGame(row({ rankable_duration: 120, server_score: 40 })),
      projectGame(row({ rankable_duration: 120, server_score: 62 })),
      projectGame(row({ rankable_duration: 60, server_score: 30 })),
      projectGame(row({ rankable_duration: 120, server_score: 55, status: 'quarantined' })),
    ];
    expect(personalBests(games)).toEqual([
      { duration: 120, best: 62, count: 2 },
      { duration: 60, best: 30, count: 1 },
    ]);
  });

  it('ignores non-accepted and non-rankable games', () => {
    const games = [
      projectGame(row({ status: 'rejected', server_score: 99 })),
      projectGame(row({ rankable_duration: null, server_score: 80, status: 'accepted' })),
    ];
    expect(personalBests(games)).toEqual([]);
  });
});

describe('mostPlayedFingerprint', () => {
  it('returns the fingerprint with the most accepted games', () => {
    const a = 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120';
    const b = 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:60';
    const games = [
      projectGame(row({ settings_fingerprint: a })),
      projectGame(row({ settings_fingerprint: b })),
      projectGame(row({ settings_fingerprint: b })),
    ];
    expect(mostPlayedFingerprint(games)).toBe(b);
  });

  it('returns null when there are no accepted games', () => {
    expect(mostPlayedFingerprint([projectGame(row({ status: 'rejected' }))])).toBeNull();
  });
});
