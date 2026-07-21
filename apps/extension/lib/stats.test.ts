import { ZETAMAC_DEFAULT_SETTINGS, fingerprint, type ZetamacSettings } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import type { StoredGame } from './store.js';
import {
  fingerprintLabel,
  graphMode,
  isNewPersonalBest,
  latestGame,
  mostPlayedFingerprint,
  personalBests,
  recentGames,
  trendSeries,
} from './stats.js';

function stored(opts: {
  score: number;
  savedAtMs: number;
  status?: StoredGame['status'];
  rankableDuration?: StoredGame['rankableDuration'];
  fingerprint?: string;
  settings?: ZetamacSettings;
}): StoredGame {
  const settings = opts.settings ?? ZETAMAC_DEFAULT_SETTINGS;
  return {
    record: {
      id: crypto.randomUUID(),
      startedAtMs: opts.savedAtMs,
      playedMs: 120_000,
      settings,
      events: [],
      claimedScore: opts.score,
    },
    fingerprint: opts.fingerprint ?? fingerprint(settings),
    rankableDuration: opts.rankableDuration === undefined ? 120 : opts.rankableDuration,
    status: opts.status ?? 'kept',
    savedAtMs: opts.savedAtMs,
  };
}

describe('personalBests', () => {
  it('returns the max kept score per rankable duration', () => {
    const games = [
      stored({ score: 40, savedAtMs: 1, rankableDuration: 120 }),
      stored({ score: 55, savedAtMs: 2, rankableDuration: 120 }),
      stored({ score: 30, savedAtMs: 3, rankableDuration: 120 }),
      stored({ score: 70, savedAtMs: 4, rankableDuration: 60 }),
    ];
    expect(personalBests(games)).toEqual({ 30: null, 60: 70, 120: 55 });
  });

  it('ignores quarantined, removed, and non-rankable games', () => {
    const games = [
      stored({ score: 99, savedAtMs: 1, rankableDuration: 120, status: 'quarantined' }),
      stored({ score: 98, savedAtMs: 2, rankableDuration: 120, status: 'removed' }),
      stored({ score: 88, savedAtMs: 3, rankableDuration: null }),
      stored({ score: 42, savedAtMs: 4, rankableDuration: 120 }),
    ];
    expect(personalBests(games)).toEqual({ 30: null, 60: null, 120: 42 });
  });
});

describe('latestGame', () => {
  it('returns the most recent kept game, skipping newer non-kept games', () => {
    const games = [
      stored({ score: 10, savedAtMs: 1 }),
      stored({ score: 20, savedAtMs: 2 }),
      stored({ score: 99, savedAtMs: 3, status: 'quarantined' }),
    ];
    expect(latestGame(games)?.record.claimedScore).toBe(20);
  });

  it('picks the highest savedAtMs regardless of array order', () => {
    const games = [stored({ score: 20, savedAtMs: 2 }), stored({ score: 10, savedAtMs: 1 })];
    expect(latestGame(games)?.record.claimedScore).toBe(20);
  });

  it('returns null when there are no kept games', () => {
    expect(latestGame([stored({ score: 5, savedAtMs: 1, status: 'removed' })])).toBeNull();
    expect(latestGame([])).toBeNull();
  });

  it('never surfaces a capture_failed record as the latest game', () => {
    const games = [stored({ score: 0, savedAtMs: 1, status: 'capture_failed' })];
    expect(latestGame(games)).toBeNull();
    expect(personalBests(games)).toEqual({ 30: null, 60: null, 120: null });
  });
});

describe('isNewPersonalBest', () => {
  it('is true for the first kept rankable game', () => {
    expect(isNewPersonalBest([stored({ score: 30, savedAtMs: 1 })])).toBe(true);
  });

  it('is true when the latest kept game beats the prior best on its duration', () => {
    const games = [stored({ score: 30, savedAtMs: 1 }), stored({ score: 45, savedAtMs: 2 })];
    expect(isNewPersonalBest(games)).toBe(true);
  });

  it('is false when the latest game does not beat the prior best', () => {
    const games = [stored({ score: 45, savedAtMs: 1 }), stored({ score: 45, savedAtMs: 2 })];
    expect(isNewPersonalBest(games)).toBe(false);
  });

  it('is false when the latest kept game is not rankable', () => {
    expect(isNewPersonalBest([stored({ score: 99, savedAtMs: 1, rankableDuration: null })])).toBe(
      false,
    );
  });

  it('is false when there are no kept games', () => {
    expect(isNewPersonalBest([])).toBe(false);
  });

  it('compares only against the same duration', () => {
    const games = [
      stored({ score: 90, savedAtMs: 1, rankableDuration: 60 }),
      stored({ score: 30, savedAtMs: 2, rankableDuration: 120 }),
    ];
    expect(isNewPersonalBest(games)).toBe(true);
  });
});

describe('graphMode', () => {
  it('is a list below 5 games', () => {
    expect(graphMode(0)).toBe('list');
    expect(graphMode(4)).toBe('list');
  });
  it('is a sparkline from 5 to 19 games', () => {
    expect(graphMode(5)).toBe('sparkline');
    expect(graphMode(19)).toBe('sparkline');
  });
  it('is a full chart at 20 games and beyond', () => {
    expect(graphMode(20)).toBe('chart');
    expect(graphMode(200)).toBe('chart');
  });
});

describe('trendSeries', () => {
  const fpA = 'A';
  const fpB = 'B';

  it('returns kept scores for the fingerprint in ascending time order', () => {
    const games = [
      stored({ score: 30, savedAtMs: 3, fingerprint: fpA }),
      stored({ score: 10, savedAtMs: 1, fingerprint: fpA }),
      stored({ score: 20, savedAtMs: 2, fingerprint: fpA }),
      stored({ score: 99, savedAtMs: 4, fingerprint: fpB }),
      stored({ score: 99, savedAtMs: 5, fingerprint: fpA, status: 'quarantined' }),
    ];
    expect(trendSeries(games, fpA, 'all').map((p) => p.score)).toEqual([10, 20, 30]);
  });

  it('keeps only the most recent N when a numeric range is given', () => {
    const games = [1, 2, 3, 4, 5].map((n) =>
      stored({ score: n * 10, savedAtMs: n, fingerprint: fpA }),
    );
    expect(trendSeries(games, fpA, 10).map((p) => p.score)).toEqual([10, 20, 30, 40, 50]);
    expect(trendSeries(games, fpA, 25).map((p) => p.score)).toHaveLength(5);
    expect(trendSeries(games, fpA, 50).map((p) => p.score)).toHaveLength(5);
    const three = trendSeries(
      [1, 2, 3, 4, 5, 6].map((n) => stored({ score: n, savedAtMs: n, fingerprint: fpA })),
      fpA,
      10,
    );
    expect(three).toHaveLength(6);
  });

  it('exposes the game time on each point', () => {
    const games = [stored({ score: 30, savedAtMs: 7, fingerprint: fpA })];
    expect(trendSeries(games, fpA, 'all')[0]?.at).toBe(7);
  });
});

describe('mostPlayedFingerprint', () => {
  it('returns the fingerprint with the most kept games', () => {
    const games = [
      stored({ score: 1, savedAtMs: 1, fingerprint: 'A' }),
      stored({ score: 1, savedAtMs: 2, fingerprint: 'A' }),
      stored({ score: 1, savedAtMs: 3, fingerprint: 'B' }),
    ];
    expect(mostPlayedFingerprint(games)).toBe('A');
  });

  it('breaks ties by the most recent game', () => {
    const games = [
      stored({ score: 1, savedAtMs: 1, fingerprint: 'A' }),
      stored({ score: 1, savedAtMs: 5, fingerprint: 'B' }),
    ];
    expect(mostPlayedFingerprint(games)).toBe('B');
  });

  it('ignores non-kept games and returns null when none are kept', () => {
    expect(
      mostPlayedFingerprint([stored({ score: 1, savedAtMs: 1, status: 'removed' })]),
    ).toBeNull();
    expect(mostPlayedFingerprint([])).toBeNull();
  });
});

describe('fingerprintLabel', () => {
  it('labels the shipped default configuration', () => {
    expect(fingerprintLabel(ZETAMAC_DEFAULT_SETTINGS)).toBe('Default · 120s');
  });

  it('labels a default configuration at a non-default duration', () => {
    expect(fingerprintLabel({ ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 60 })).toBe(
      'Default · 60s',
    );
  });

  it('labels a customised configuration', () => {
    expect(fingerprintLabel({ ...ZETAMAC_DEFAULT_SETTINGS, addEnabled: false })).toBe(
      'Custom · 120s',
    );
  });
});

describe('recentGames', () => {
  it('returns games of any status, most recent first, limited', () => {
    const games = [
      stored({ score: 1, savedAtMs: 1, status: 'kept' }),
      stored({ score: 2, savedAtMs: 2, status: 'quarantined' }),
      stored({ score: 3, savedAtMs: 3, status: 'removed' }),
    ];
    const recent = recentGames(games, 2);
    expect(recent.map((g) => g.record.claimedScore)).toEqual([3, 2]);
  });
});
