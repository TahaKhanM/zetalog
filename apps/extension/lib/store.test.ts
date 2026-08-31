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

/** Storage whose writes are rejected, matching quota/private-mode failures. */
function writeRejectingArea(seed: Record<string, unknown> = {}): StorageArea {
  const readable = fakeArea(seed);
  return {
    get: (key) => readable.get(key),
    set: () => Promise.reject(new Error('quota exceeded')),
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

  it('is idempotent when the same record is saved twice', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    const record = gameRecord({ score: 10 });
    const first = await store.saveGame(record, 'owner-1');
    const second = await store.saveGame(record, 'owner-2');

    expect(second).toEqual(first);
    const games = await store.listGames();
    expect(games.ok && games.value).toHaveLength(1);
    expect(games.ok && games.value[0]?.ownerUserId).toBe('owner-1');
  });

  it('surfaces a rejected game write without pretending the save succeeded', async () => {
    const store = createStore(writeRejectingArea(), tickingClock());
    expect(await store.saveGame(gameRecord({ score: 10 }))).toEqual({
      ok: false,
      error: {
        reason: 'write-failed',
        detail: 'Browser storage rejected the game update.',
      },
    });
  });

  it('serializes concurrent saves so neither tab can overwrite the other', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    const first = gameRecord({ score: 10 });
    const second = gameRecord({ score: 20 });

    await Promise.all([store.saveGame(first), store.saveGame(second)]);

    const games = await store.listGames();
    expect(games.ok && games.value.map((game) => game.record.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it('continues serial mutations after a storage read unexpectedly rejects', async () => {
    const area = fakeArea();
    let rejectNextRead = true;
    const flaky: StorageArea = {
      get: (key) => {
        if (rejectNextRead) {
          rejectNextRead = false;
          return Promise.reject(new Error('temporary read failure'));
        }
        return area.get(key);
      },
      set: (items) => area.set(items),
    };
    const store = createStore(flaky, tickingClock());

    await expect(store.saveGame(gameRecord({ score: 1 }))).rejects.toThrow(
      'temporary read failure',
    );
    expect((await store.saveGame(gameRecord({ score: 2 }))).ok).toBe(true);
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

describe('createStore.checkpointGame', () => {
  it('persists and updates a restart-quarantined partial before navigation', async () => {
    const area = fakeArea();
    const store = createStore(area, tickingClock());
    const id = crypto.randomUUID();
    const first = { ...gameRecord({ playedMs: 0 }), id };
    const later = { ...gameRecord({ playedMs: 1000, events: verifiedEvents(1) }), id };

    await store.saveGame(gameRecord({ score: 99 }));
    const initial = await store.checkpointGame(first, 'owner-1');
    const updated = await store.checkpointGame(later, null);
    expect(initial.ok && initial.value.status).toBe('quarantined');
    expect(updated.ok && updated.value.quarantineReason).toBe('restart');
    expect(updated.ok && updated.value.ownerUserId).toBe('owner-1');
    expect(updated.ok && updated.value.verifiedScore).toBe(1);
    if (!initial.ok || !updated.ok) throw new Error('checkpoint failed');
    expect(updated.value.savedAtMs).toBe(initial.value.savedAtMs);
  });

  it('upgrades its checkpoint to the completed game instead of losing the finish', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const id = crypto.randomUUID();
    await store.saveGame(gameRecord({ score: 99 }));
    await store.checkpointGame({ ...gameRecord({ playedMs: 1000 }), id });
    const completed = await store.saveGame({
      ...gameRecord({ playedMs: 120_000, events: verifiedEvents(2) }),
      id,
    });

    expect(completed.ok && completed.value.status).toBe('kept');
    expect(completed.ok && completed.value.verifiedScore).toBe(2);
  });

  it('keeps the checkpoint owner when the active account changes before completion', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const id = crypto.randomUUID();
    await store.checkpointGame({ ...gameRecord({ playedMs: 1000 }), id }, 'owner-at-start');

    const completed = await store.saveGame(
      { ...gameRecord({ playedMs: 120_000, events: verifiedEvents(2) }), id },
      'owner-at-finish',
    );

    expect(completed.ok && completed.value.ownerUserId).toBe('owner-at-start');
  });

  it('keeps an explicitly unowned checkpoint unowned until the normal link migration', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const id = crypto.randomUUID();
    await store.checkpointGame({ ...gameRecord({ playedMs: 1000 }), id }, null);

    const completed = await store.saveGame(
      { ...gameRecord({ playedMs: 120_000, events: verifiedEvents(2) }), id },
      'new-owner',
    );

    expect(completed.ok && completed.value.ownerUserId).toBeNull();
  });

  it('does not overwrite a server-synchronised game with a late checkpoint', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ events: verifiedEvents(1) }));
    if (!saved.ok) throw new Error('setup failed');
    await store.markSync(saved.value.record.id, {
      state: 'uploaded',
      outcome: 'accepted',
      serverScore: 1,
    });
    const checkpoint = await store.checkpointGame({
      ...saved.value.record,
      playedMs: 1000,
      events: [],
    });
    expect(checkpoint.ok && checkpoint.value.sync?.state).toBe('uploaded');
    expect(checkpoint.ok && checkpoint.value.verifiedScore).toBe(1);
  });

  it('surfaces corrupt reads and rejected checkpoint writes', async () => {
    const corrupt = createStore(fakeArea({ [GAMES_KEY]: 'bad' }));
    expect((await corrupt.checkpointGame(gameRecord())).ok).toBe(false);
    const rejecting = createStore(writeRejectingArea());
    const result = await rejecting.checkpointGame(gameRecord());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('write-failed');
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
    for (let n = 0; n < 5; n++)
      await store.saveGame(gameRecord({ score: 90, events: verifiedEvents(90) }));
    const result = await store.saveGame(gameRecord({ score: 20, events: verifiedEvents(20) }));

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

  it('returns the existing row for an idempotent repeated capture failure', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const record = gameRecord({ score: 0 });
    const first = await store.saveCaptureFailed(record, 'owner-1');
    const second = await store.saveCaptureFailed(record, 'owner-2');
    expect(second).toEqual(first);
  });

  it('surfaces a rejected capture-failure write', async () => {
    const store = createStore(writeRejectingArea(), tickingClock());
    const result = await store.saveCaptureFailed(gameRecord({ score: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('write-failed');
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

  it('surfaces a rejected update write', async () => {
    const record = gameRecord({ score: 42 });
    const stored = {
      record,
      verifiedScore: 0,
      fingerprint: fingerprint(record.settings),
      rankableDuration: 120,
      status: 'kept',
      savedAtMs: 1,
    };
    const store = createStore(writeRejectingArea({ [GAMES_KEY]: [stored] }), tickingClock());
    const result = await store.remove(record.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('write-failed');
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

  it('surfaces a rejected preference write', async () => {
    const store = createStore(writeRejectingArea(), tickingClock());
    const result = await store.setPrefs({ selectedFingerprint: null, range: 'all' });
    expect(result).toEqual({
      ok: false,
      error: {
        reason: 'write-failed',
        detail: 'Browser storage rejected the preference.',
      },
    });
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

  it('never retires an unsynced rankable game, even far above the soft limit', () => {
    const games = Array.from({ length: 900 }, (_, index) =>
      withEvents(storedGame({ savedAtMs: index, verifiedScore: index + 10 })),
    );
    const pruned = pruneStoredGames(games, 0);

    expect(pruned.every((game) => game.record.events.length === 1)).toBe(true);
    expect(pruned.every((game) => game.telemetryPruned !== true)).toBe(true);
  });

  it('keeps a failed rankable game recoverable after a client/server compatibility fix', () => {
    const failed = withEvents(
      storedGame({ savedAtMs: 1, rankableDuration: 120, sync: { state: 'failed' } }),
    );
    const [pruned] = pruneStoredGames([failed], 0);

    expect(pruned?.record.events).toHaveLength(1);
    expect(pruned?.telemetryPruned).not.toBe(true);
  });

  it('keeps telemetry for a removed game that never reached the server', () => {
    const removed = withEvents(storedGame({ savedAtMs: 1, status: 'removed' }));
    expect(pruneStoredGames([removed], 0)[0]?.record.events).toHaveLength(1);
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

  it('clearAllSync surfaces a rejected write', async () => {
    const record = gameRecord({ score: 10 });
    const stored = {
      record,
      verifiedScore: 0,
      fingerprint: fingerprint(record.settings),
      rankableDuration: 120,
      status: 'kept',
      savedAtMs: 1,
      sync: { state: 'pending' },
    };
    const store = createStore(writeRejectingArea({ [GAMES_KEY]: [stored] }), tickingClock());
    const result = await store.clearAllSync();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('write-failed');
  });
});

describe('createStore.assignUnownedGames', () => {
  function stored(ownerUserId?: string | null): StoredGame {
    const record = gameRecord({ score: 10 });
    return {
      record,
      ownerUserId,
      verifiedScore: 0,
      fingerprint: fingerprint(record.settings),
      rankableDuration: 120,
      status: 'kept',
      savedAtMs: 1,
    };
  }

  it('silently attributes only unowned legacy games to the linked account', async () => {
    const area = fakeArea({ [GAMES_KEY]: [stored(undefined), stored(null), stored('other-user')] });
    const store = createStore(area, tickingClock());
    expect((await store.assignUnownedGames('current-user')).ok).toBe(true);
    const games = await store.listGames();
    expect(games.ok && games.value.map((game) => game.ownerUserId)).toEqual([
      'current-user',
      'current-user',
      'other-user',
    ]);
  });

  it('surfaces corrupt source data and rejected migration writes', async () => {
    const corrupt = createStore(fakeArea({ [GAMES_KEY]: 'bad' }), tickingClock());
    expect((await corrupt.assignUnownedGames('user')).ok).toBe(false);

    const rejected = createStore(
      writeRejectingArea({ [GAMES_KEY]: [stored(undefined)] }),
      tickingClock(),
    );
    const result = await rejected.assignUnownedGames('user');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('write-failed');
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
    // The revoked marker survives, so the sync queue derives a restore for it.
    expect(restored.value.sync).toEqual({ state: 'revoked' });
  });
});

describe('createStore.importBackfill', () => {
  function backfilled(id: string, score: number): StoredGame {
    return {
      record: {
        id,
        startedAtMs: 1_700_000_000_000,
        playedMs: 120_000,
        settings: ZETAMAC_DEFAULT_SETTINGS,
        events: [],
        claimedScore: score,
      },
      verifiedScore: score,
      fingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
      rankableDuration: 120,
      status: 'kept',
      savedAtMs: 500,
      sync: { state: 'uploaded', outcome: 'accepted', serverScore: score },
    };
  }

  it('adds remote games not already stored locally', async () => {
    const store = createStore(fakeArea(), tickingClock());
    await store.saveGame(gameRecord({ score: 30 }));
    const result = await store.importBackfill([
      backfilled(crypto.randomUUID(), 40),
      backfilled(crypto.randomUUID(), 50),
    ]);
    expect(result.ok).toBe(true);
    const list = await store.listGames();
    expect(list.ok && list.value).toHaveLength(3);
  });

  it('keeps local telemetry but reconciles the server score on an id clash', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const local = await store.saveGame(gameRecord({ score: 30 }));
    const id = local.ok ? local.value.record.id : '';
    await store.importBackfill([backfilled(id, 99)]);
    const list = await store.listGames();
    expect(list.ok && list.value).toHaveLength(1);
    expect(list.ok && list.value[0]?.record.claimedScore).toBe(30);
    expect(list.ok && list.value[0]?.verifiedScore).toBe(99);
  });

  it('reconciles a cross-device moderation decision without deleting local telemetry', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const localRecord = gameRecord({ events: verifiedEvents(2) });
    await store.saveGame(localRecord, 'owner-local');
    const server = {
      ...backfilled(localRecord.id, 2),
      ownerUserId: 'owner-server',
      status: 'quarantined' as const,
      sync: { state: 'uploaded' as const, outcome: 'rejected' as const, serverScore: 2 },
    };
    await store.importBackfill([server]);
    const list = await store.listGames();
    if (!list.ok) throw new Error('list failed');
    expect(list.value[0]?.status).toBe('quarantined');
    expect(list.value[0]?.sync?.outcome).toBe('rejected');
    expect(list.value[0]?.ownerUserId).toBe('owner-server');
    expect(list.value[0]?.record.events).toEqual(localRecord.events);
  });

  it('preserves a local quarantine reason while the server still has the game under review', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const local = await store.saveGame(gameRecord({ playedMs: 10_000 }));
    if (!local.ok) throw new Error('setup failed');
    expect(local.value.quarantineReason).toBe('restart');

    await store.importBackfill([
      {
        ...backfilled(local.value.record.id, local.value.verifiedScore),
        status: 'quarantined',
        sync: {
          state: 'uploaded',
          outcome: 'quarantined',
          serverScore: local.value.verifiedScore,
        },
      },
    ]);

    const list = await store.listGames();
    expect(list.ok && list.value[0]?.quarantineReason).toBe('restart');
  });

  it('clears a local quarantine reason when the server accepts the game', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const local = await store.saveGame(gameRecord({ playedMs: 10_000 }));
    if (!local.ok) throw new Error('setup failed');

    await store.importBackfill([backfilled(local.value.record.id, local.value.verifiedScore)]);

    const list = await store.listGames();
    expect(list.ok && list.value[0]?.status).toBe('kept');
    expect(list.ok && list.value[0]?.quarantineReason).toBeUndefined();
  });

  it('preserves a local removal while importing the server row so revoke remains queued', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ events: verifiedEvents(1) }), 'owner-local');
    if (!saved.ok) throw new Error('setup failed');
    await store.remove(saved.value.record.id);
    await store.importBackfill([
      { ...backfilled(saved.value.record.id, 1), ownerUserId: 'owner-server' },
    ]);
    await store.importBackfill([backfilled(saved.value.record.id, 1)]);
    const list = await store.listGames();
    if (!list.ok) throw new Error('list failed');
    expect(list.value[0]?.status).toBe('removed');
    expect(list.value[0]?.sync?.state).toBe('uploaded');
    expect(list.value[0]?.ownerUserId).toBe('owner-server');
  });

  it('applies a server-side removal to an existing local game', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ events: verifiedEvents(1) }), 'owner-local');
    if (!saved.ok) throw new Error('setup failed');
    await store.importBackfill([
      {
        ...backfilled(saved.value.record.id, 1),
        status: 'removed',
        sync: { state: 'revoked', outcome: 'user_removed', serverScore: 1 },
      },
    ]);
    const list = await store.listGames();
    expect(list.ok && list.value[0]?.status).toBe('removed');
    expect(list.ok && list.value[0]?.sync?.state).toBe('revoked');
  });

  it('keeps server removal authoritative when the same game is already removed locally', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const saved = await store.saveGame(gameRecord({ events: verifiedEvents(1) }), 'owner-local');
    if (!saved.ok) throw new Error('setup failed');
    await store.remove(saved.value.record.id);
    await store.importBackfill([
      {
        ...backfilled(saved.value.record.id, 1),
        status: 'removed',
        sync: { state: 'revoked', outcome: 'user_removed', serverScore: 1 },
      },
    ]);
    const list = await store.listGames();
    expect(list.ok && list.value[0]?.sync?.outcome).toBe('user_removed');
  });

  it('is a no-op when there is nothing new to add', async () => {
    const store = createStore(fakeArea(), tickingClock());
    const result = await store.importBackfill([]);
    expect(result.ok && result.value).toEqual([]);
  });

  it('surfaces corrupt local storage', async () => {
    const store = createStore(fakeArea({ [GAMES_KEY]: 'nope' }), tickingClock());
    const result = await store.importBackfill([backfilled(crypto.randomUUID(), 10)]);
    expect(result.ok).toBe(false);
  });

  it('surfaces a rejected merged-history write', async () => {
    const store = createStore(writeRejectingArea(), tickingClock());
    const result = await store.importBackfill([backfilled(crypto.randomUUID(), 10)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('write-failed');
  });
});
