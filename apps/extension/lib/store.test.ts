import {
  ZETAMAC_DEFAULT_SETTINGS,
  fingerprint,
  type GameRecord,
  type ZetamacSettings,
} from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import {
  PRUNE_LIMIT,
  createStore,
  pruneStoredGames,
  type StorageArea,
  type StoredGame,
} from './store.js';

const GAMES_KEY = 'zl:v1:games';
const PREFS_KEY = 'zl:v1:prefs';

function fakeArea(seed: Record<string, unknown> = {}): StorageArea & {
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...seed };
  return {
    data,
    get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

/** A monotonic clock so each save gets a strictly increasing savedAtMs. */
function tickingClock(start = 1000): () => number {
  let t = start;
  return () => t++;
}

function gameRecord(
  opts: {
    score?: number;
    playedMs?: number;
    settings?: ZetamacSettings;
    events?: GameRecord['events'];
  } = {},
): GameRecord {
  return {
    id: crypto.randomUUID(),
    startedAtMs: 1_700_000_000_000,
    playedMs: opts.playedMs ?? 120_000,
    settings: opts.settings ?? ZETAMAC_DEFAULT_SETTINGS,
    events: opts.events ?? [],
    claimedScore: opts.score ?? 50,
  };
}

/**
 * An event stream of `count` cleanly-verified problems — recomputeScore returns
 * `count`. Used to prove the store persists the VERIFIED score, independent of
 * whatever claimedScore the record carries.
 */
function verifiedEvents(count: number): GameRecord['events'] {
  const events: GameRecord['events'] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const left = 10 + i;
    const answer = left + 5;
    events.push({ kind: 'problem', at, text: `${String(left)} + 5` });
    at += 800;
    events.push({ kind: 'input', at, value: String(answer) });
    at += 200;
    events.push({ kind: 'accepted', at, answer });
    at += 1000;
  }
  return events;
}

/** A rankable-but-not-default config (custom duration) → rankableDuration null. */
const customSettings: ZetamacSettings = { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 45 };

describe('createStore.saveGame — a normal game', () => {
  it('stores a kept game with fingerprint and rankable duration', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const result = await store.saveGame(gameRecord({ score: 42 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('kept');
    expect(result.value.rankableDuration).toBe(120);
    expect(result.value.fingerprint).toBe(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
    expect(result.value.quarantineReason).toBeUndefined();
  });

  it('marks a non-default configuration as not rankable', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const result = await store.saveGame(gameRecord({ settings: customSettings }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rankableDuration).toBeNull();
  });

  it('appends without dropping earlier games', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    await store.saveGame(gameRecord({ score: 10 }));
    await store.saveGame(gameRecord({ score: 20 }));

    const games = await store.listGames();
    expect(games.ok).toBe(true);
    if (!games.ok) return;
    expect(games.value).toHaveLength(2);
  });

  it('persists the recomputed verifiedScore, not the claimed score', async () => {
    const store = createStore(fakeArea(), tickingClock());
    // Claimed 51 undercounts; the events cleanly verify 52.
    const result = await store.saveGame(gameRecord({ score: 51, events: verifiedEvents(52) }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verifiedScore).toBe(52);
    // The claimed score is retained for the server's cross-check.
    expect(result.value.record.claimedScore).toBe(51);
  });
});

describe('createStore.saveGame — quarantine', () => {
  it('quarantines a restart (played under 80% of the duration)', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const result = await store.saveGame(gameRecord({ score: 30, playedMs: 50_000 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('quarantined');
    expect(result.value.quarantineReason).toBe('restart');
  });

  it('quarantines an outlier once enough kept history exists', async () => {
    const store = createStore(fakeArea(), tickingClock());
    for (let n = 0; n < 5; n++) await store.saveGame(gameRecord({ score: 90 }));
    const result = await store.saveGame(gameRecord({ score: 20 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('quarantined');
    expect(result.value.quarantineReason).toBe('outlier');
  });

  it('does not treat an outlier-looking score as an outlier without enough history', async () => {
    const store = createStore(fakeArea(), tickingClock());
    for (let n = 0; n < 4; n++) await store.saveGame(gameRecord({ score: 90 }));
    const result = await store.saveGame(gameRecord({ score: 20 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('kept');
  });
});

describe('createStore.saveCaptureFailed', () => {
  it('stores a capture_failed row with a zero verifiedScore (no events)', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const result = await store.saveCaptureFailed(gameRecord({ score: 0 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('capture_failed');
    expect(result.value.verifiedScore).toBe(0);
  });

  it('surfaces corruption instead of clobbering it', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 'nope' }), tickingClock());
    const result = await store.saveCaptureFailed(gameRecord({ score: 0 }));
    expect(result.ok).toBe(false);
  });
});

describe('createStore — default wall clock', () => {
  it('stamps savedAtMs from Date.now when no clock is injected', async () => {
    const store = createStore(fakeArea());
    const before = Date.now();
    const result = await store.saveGame(gameRecord({ score: 5 }));
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.savedAtMs).toBeGreaterThanOrEqual(before);
    expect(result.value.savedAtMs).toBeLessThanOrEqual(after);
  });
});

describe('createStore.remove and restore', () => {
  it('remove flips status to removed but keeps the row', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 42 }));
    if (!saved.ok) throw new Error('save failed');

    const removed = await store.remove(saved.value.record.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value?.status).toBe('removed');

    const games = await store.listGames();
    if (!games.ok) return;
    expect(games.value).toHaveLength(1);
    expect(games.value[0]?.status).toBe('removed');
  });

  it('restore flips a quarantined game back to kept and clears the reason', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 30, playedMs: 50_000 }));
    if (!saved.ok) throw new Error('save failed');
    expect(saved.value.status).toBe('quarantined');

    const restored = await store.restore(saved.value.record.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value?.status).toBe('kept');
    expect(restored.value?.quarantineReason).toBeUndefined();
  });

  it('returns null when the id is unknown', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const removed = await store.remove(crypto.randomUUID());
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value).toBeNull();
  });

  it('leaves the other games untouched when removing one of several', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const first = await store.saveGame(gameRecord({ score: 10 }));
    await store.saveGame(gameRecord({ score: 20 }));
    if (!first.ok) throw new Error('save failed');

    await store.remove(first.value.record.id);
    const games = await store.listGames();
    if (!games.ok) return;
    const statuses = games.value.map((g) => g.status).sort();
    expect(statuses).toEqual(['kept', 'removed']);
  });

  it('surfaces corruption rather than mutating a corrupt store', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 7 }), tickingClock());
    const removed = await store.remove(crypto.randomUUID());
    expect(removed.ok).toBe(false);
  });
});

describe('createStore — remove/restore provenance', () => {
  it('records where a removed row came from', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 42 }));
    if (!saved.ok) throw new Error('save failed');

    const removed = await store.remove(saved.value.record.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value?.removedFrom).toBe('kept');
  });

  it('never lets a capture_failed record become kept via remove then restore', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveCaptureFailed(gameRecord({ score: 0 }));
    if (!saved.ok) throw new Error('save failed');

    await store.remove(saved.value.record.id);
    const restored = await store.restore(saved.value.record.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value?.status).toBe('capture_failed');
  });

  it('returns a removed quarantined game to quarantined with its reason intact', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 30, playedMs: 50_000 }));
    if (!saved.ok) throw new Error('save failed');
    expect(saved.value.status).toBe('quarantined');

    await store.remove(saved.value.record.id);
    const restored = await store.restore(saved.value.record.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value?.status).toBe('quarantined');
    expect(restored.value?.quarantineReason).toBe('restart');
  });

  it('returns a removed kept game to kept', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 42 }));
    if (!saved.ok) throw new Error('save failed');

    await store.remove(saved.value.record.id);
    const restored = await store.restore(saved.value.record.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value?.status).toBe('kept');
  });

  it('defaults a legacy removed row without provenance to kept on restore', async () => {
    const legacy = {
      record: gameRecord({ score: 42 }),
      fingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
      rankableDuration: 120,
      status: 'removed',
      savedAtMs: 1,
    };
    const store = createStore(fakeArea({ [GAMES_KEY]: [legacy] }), tickingClock());

    const restored = await store.restore(legacy.record.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value?.status).toBe('kept');
  });

  it('keeps the original provenance when remove is called twice', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveCaptureFailed(gameRecord({ score: 0 }));
    if (!saved.ok) throw new Error('save failed');

    await store.remove(saved.value.record.id);
    const again = await store.remove(saved.value.record.id);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value?.removedFrom).toBe('capture_failed');
  });

  it('leaves a kept or capture_failed row unchanged when restore targets it directly', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const kept = await store.saveGame(gameRecord({ score: 42 }));
    const failed = await store.saveCaptureFailed(gameRecord({ score: 0 }));
    if (!kept.ok || !failed.ok) throw new Error('save failed');

    const restoredKept = await store.restore(kept.value.record.id);
    const restoredFailed = await store.restore(failed.value.record.id);
    if (!restoredKept.ok || !restoredFailed.ok) return;
    expect(restoredKept.value?.status).toBe('kept');
    expect(restoredFailed.value?.status).toBe('capture_failed');
  });
});

describe('createStore — verifiedScore backfill for legacy rows', () => {
  it('recomputes verifiedScore from events when the stored row lacks it', async () => {
    // A row written before the field existed: no verifiedScore, but real events.
    const legacy = {
      record: gameRecord({ score: 2, events: verifiedEvents(3) }),
      fingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
      rankableDuration: 120,
      status: 'kept',
      savedAtMs: 1,
    };
    const store = createStore(fakeArea({ [GAMES_KEY]: [legacy] }), tickingClock());

    const games = await store.listGames();
    expect(games.ok).toBe(true);
    if (!games.ok) return;
    expect(games.value[0]?.verifiedScore).toBe(3);
  });

  it('falls back to claimedScore for a legacy PRUNED row (events stripped)', async () => {
    // pruneStoredGames strips event streams from old non-rankable rows while
    // preserving scores. A pruned row written before verifiedScore existed has
    // NO events to recompute from — recomputing would clobber its score to 0,
    // so the stored claimed score is the best remaining truth.
    const pruned = {
      record: gameRecord({ score: 42, settings: customSettings }), // events: []
      fingerprint: fingerprint(customSettings),
      rankableDuration: null,
      status: 'kept',
      savedAtMs: 1,
    };
    const store = createStore(fakeArea({ [GAMES_KEY]: [pruned] }), tickingClock());

    const games = await store.listGames();
    expect(games.ok).toBe(true);
    if (!games.ok) return;
    expect(games.value[0]?.verifiedScore).toBe(42);
  });
});

describe('createStore prefs', () => {
  it('returns defaults when no prefs are stored', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const prefs = await store.getPrefs();
    expect(prefs.ok).toBe(true);
    if (!prefs.ok) return;
    expect(prefs.value).toEqual({ selectedFingerprint: null, range: 'all' });
  });

  it('round-trips selected fingerprint and range', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    await store.setPrefs({
      selectedFingerprint: 'add:2-100x2-100|sub:on|mul:off|div:on|t:60',
      range: 25,
    });

    const prefs = await store.getPrefs();
    if (!prefs.ok) return;
    expect(prefs.value.range).toBe(25);
    expect(prefs.value.selectedFingerprint).toBe('add:2-100x2-100|sub:on|mul:off|div:on|t:60');
  });
});

describe('createStore — corrupt data recovery', () => {
  it('returns a typed error instead of throwing when games are corrupt', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 'not an array' }), tickingClock());
    const games = await store.listGames();
    expect(games.ok).toBe(false);
    if (games.ok) return;
    expect(games.error.reason).toBe('corrupt-games');
  });

  it('refuses to save over corrupt games rather than clobbering them', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 42 }), tickingClock());
    const result = await store.saveGame(gameRecord({ score: 1 }));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error when prefs are corrupt', async () => {
    const store = createStore(fakeArea({ [PREFS_KEY]: { range: 'weird' } }), tickingClock());
    const prefs = await store.getPrefs();
    expect(prefs.ok).toBe(false);
    if (prefs.ok) return;
    expect(prefs.error.reason).toBe('corrupt-prefs');
  });
});

describe('pruneStoredGames', () => {
  function storedGame(over: Partial<StoredGame> & { savedAtMs: number }): StoredGame {
    return {
      record: gameRecord(),
      verifiedScore: 0,
      fingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
      rankableDuration: 120,
      status: 'kept',
      ...over,
    };
  }

  function withEvents(g: StoredGame): StoredGame {
    return { ...g, record: { ...g.record, events: [{ kind: 'problem', at: 0, text: '1 + 1' }] } };
  }

  it('leaves games untouched at or below the limit', () => {
    const games = [withEvents(storedGame({ savedAtMs: 1 }))];
    expect(pruneStoredGames(games, 1)).toEqual(games);
  });

  it('strips events from the oldest non-rankable games first', () => {
    const games = [
      withEvents(storedGame({ savedAtMs: 1, rankableDuration: null })),
      withEvents(storedGame({ savedAtMs: 2, rankableDuration: null })),
      withEvents(storedGame({ savedAtMs: 3, rankableDuration: 120 })),
    ];
    const pruned = pruneStoredGames(games, 2);

    // Oldest non-rankable loses its events; the rest keep them.
    expect(pruned[0]?.record.events).toEqual([]);
    expect(pruned[1]?.record.events).toHaveLength(1);
    expect(pruned[2]?.record.events).toHaveLength(1);
  });

  it('never strips rankable games even when over the limit', () => {
    const games = [
      withEvents(storedGame({ savedAtMs: 1, rankableDuration: 120 })),
      withEvents(storedGame({ savedAtMs: 2, rankableDuration: 120 })),
      withEvents(storedGame({ savedAtMs: 3, rankableDuration: 120 })),
    ];
    const pruned = pruneStoredGames(games, 2);
    expect(pruned.every((g) => g.record.events.length === 1)).toBe(true);
  });

  it('preserves scores and status while pruning', () => {
    const games = [
      withEvents(storedGame({ savedAtMs: 1, rankableDuration: null, status: 'quarantined' })),
      withEvents(storedGame({ savedAtMs: 2, rankableDuration: null })),
    ];
    const pruned = pruneStoredGames(games, 1);
    expect(pruned[0]?.status).toBe('quarantined');
    expect(pruned[0]?.record.claimedScore).toBe(games[0]?.record.claimedScore);
  });

  it('exposes a limit of 400', () => {
    expect(PRUNE_LIMIT).toBe(400);
  });
});

describe('createStore.markSync / clearAllSync', () => {
  const GAMES_KEY = 'zl:v1:games';

  it('writes sync state onto an existing game', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 42 }));
    if (!saved.ok) throw new Error('setup failed');

    const marked = await store.markSync(saved.value.record.id, {
      state: 'uploaded',
      outcome: 'accepted',
      serverScore: 41,
    });

    expect(marked.ok).toBe(true);
    if (!marked.ok || marked.value === null) throw new Error('expected a game');
    expect(marked.value.sync).toEqual({ state: 'uploaded', outcome: 'accepted', serverScore: 41 });

    const listed = await store.listGames();
    if (!listed.ok) throw new Error('list failed');
    expect(listed.value[0]?.sync?.state).toBe('uploaded');
  });

  it('returns null when the id is unknown', async () => {
    const store = createStore(fakeArea(), tickingClock());
    expect(await store.markSync('missing', { state: 'pending' })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('surfaces corruption instead of writing', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 'not-an-array' }), tickingClock());
    const result = await store.markSync('x', { state: 'pending' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('corrupt-games');
  });

  it('clears sync bookkeeping from every game without touching game data', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    const a = await store.saveGame(gameRecord({ score: 10 }));
    const b = await store.saveGame(gameRecord({ score: 20 }));
    if (!a.ok || !b.ok) throw new Error('setup failed');
    await store.markSync(a.value.record.id, {
      state: 'uploaded',
      outcome: 'accepted',
      serverScore: 10,
    });
    await store.markSync(b.value.record.id, { state: 'pending' });

    const cleared = await store.clearAllSync();
    expect(cleared.ok).toBe(true);

    const listed = await store.listGames();
    if (!listed.ok) throw new Error('list failed');
    expect(listed.value.every((g) => g.sync === undefined)).toBe(true);
    // Scores and status survive.
    expect(listed.value.map((g) => g.record.claimedScore).sort((x, y) => x - y)).toEqual([10, 20]);
    expect(listed.value.every((g) => g.status === 'kept')).toBe(true);
  });

  it('clearAllSync surfaces corruption', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 5 }), tickingClock());
    const result = await store.clearAllSync();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('corrupt-games');
  });
});

describe('createStore.restore — sync bookkeeping', () => {
  it('preserves the sync field across remove and restore', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    const saved = await store.saveGame(gameRecord({ score: 42 }));
    if (!saved.ok) throw new Error('setup failed');
    const id = saved.value.record.id;
    await store.markSync(id, { state: 'revoked' });
    await store.remove(id);

    const restored = await store.restore(id);

    if (!restored.ok || restored.value === null) throw new Error('expected a game');
    expect(restored.value.status).toBe('kept');
    // The revoked marker survives, so the sync queue re-derives a submit for it.
    expect(restored.value.sync).toEqual({ state: 'revoked' });
  });
});
