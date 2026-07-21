import { ZETAMAC_DEFAULT_SETTINGS, err, ok, type GameRecord, type Result } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { type ApiClient, type ApiError, type SubmitSuccess } from './api.js';
import { singleFlight } from './single-flight.js';
import { createStore, type StorageArea, type StoredGame } from './store.js';
import {
  BACKOFF_CAP_MS,
  SYNC_QUEUE_KEY,
  backoffDelayMs,
  createSyncQueueStore,
  drainSync,
  reconcileJobs,
  reconcileQueue,
  type SyncEntry,
} from './sync.js';

const GAMES_KEY = 'zl:v1:games';

// Valid UUIDs — the store validates record.id, so drain fixtures need real ones.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';

function fakeArea(
  seed: Record<string, unknown> = {},
): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...seed };
  return {
    data,
    get: (key) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

function record(id: string): GameRecord {
  return {
    id,
    startedAtMs: 1_700_000_000_000,
    playedMs: 120_000,
    settings: ZETAMAC_DEFAULT_SETTINGS,
    events: [],
    claimedScore: 30,
  };
}

function game(id: string, over: Partial<StoredGame> = {}): StoredGame {
  return {
    record: record(id),
    fingerprint: 'fp',
    rankableDuration: 120,
    status: 'kept',
    savedAtMs: 1000,
    ...over,
  };
}

/** A scriptable ApiClient double. */
function fakeApi(handlers: {
  submit?: (r: GameRecord) => Result<SubmitSuccess, ApiError>;
  revoke?: (id: string) => Result<null, ApiError>;
}): ApiClient & { submitted: string[]; revoked: string[] } {
  const submitted: string[] = [];
  const revoked: string[] = [];
  return {
    submitted,
    revoked,
    submitGame: (r) => {
      submitted.push(r.id);
      return Promise.resolve(
        handlers.submit?.(r) ?? ok({ id: `srv-${r.id}`, outcome: 'accepted', serverScore: 30 }),
      );
    },
    revokeGame: (id) => {
      revoked.push(id);
      return Promise.resolve(handlers.revoke?.(id) ?? ok(null));
    },
  };
}

function deps(
  area: StorageArea,
  api: ApiClient,
  over: { now?: () => number; linked?: boolean } = {},
) {
  const store = createStore(area);
  return {
    api,
    store,
    queue: createSyncQueueStore(area),
    now: over.now ?? (() => 10_000),
    isLinked: () => Promise.resolve(over.linked ?? true),
  };
}

describe('backoffDelayMs', () => {
  it('grows geometrically from one minute and caps at two hours', () => {
    expect(backoffDelayMs(1)).toBe(60_000);
    expect(backoffDelayMs(2)).toBe(300_000);
    expect(backoffDelayMs(3)).toBe(1_500_000);
    expect(backoffDelayMs(4)).toBe(BACKOFF_CAP_MS);
    expect(backoffDelayMs(20)).toBe(BACKOFF_CAP_MS);
  });
});

describe('reconcileJobs / reconcileQueue', () => {
  it('queues a submit for a kept rankable game not yet uploaded', () => {
    const jobs = reconcileJobs([game('a')], [], 500);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.entry).toEqual({
      clientGameId: 'a',
      kind: 'submit',
      attempts: 0,
      nextAttemptAtMs: 500,
    });
  });

  it('skips uploaded, failed, quarantined, non-rankable, and never-uploaded-removed games', () => {
    const games = [
      game('uploaded', { sync: { state: 'uploaded' } }),
      game('failed', { sync: { state: 'failed' } }),
      game('quarantined', { status: 'quarantined' }),
      game('custom', { rankableDuration: null }),
      game('removed-clean', { status: 'removed' }),
    ];
    expect(reconcileQueue(games, [], 0)).toEqual([]);
  });

  it('queues a revoke for an uploaded game the user removed', () => {
    const removed = game('r', { status: 'removed', sync: { state: 'uploaded' } });
    expect(reconcileQueue([removed], [], 0)).toEqual([
      { clientGameId: 'r', kind: 'revoke', attempts: 0, nextAttemptAtMs: 0 },
    ]);
  });

  it('derives NO job for a removed game already revoked (terminal — no re-fire)', () => {
    const revoked = game('r', { status: 'removed', sync: { state: 'revoked' } });
    expect(reconcileQueue([revoked], [], 0)).toEqual([]);
  });

  it('queues a re-submit for a restored (kept) game whose upload was revoked', () => {
    const restored = game('r', { status: 'kept', sync: { state: 'revoked' } });
    expect(reconcileQueue([restored], [], 0)).toEqual([
      { clientGameId: 'r', kind: 'submit', attempts: 0, nextAttemptAtMs: 0 },
    ]);
  });

  it('preserves attempts and schedule of an entry that still applies', () => {
    const prior: SyncEntry = {
      clientGameId: 'a',
      kind: 'submit',
      attempts: 3,
      nextAttemptAtMs: 9_999,
    };
    expect(reconcileQueue([game('a')], [prior], 0)).toEqual([prior]);
  });
});

describe('createSyncQueueStore', () => {
  it('reads an empty queue when nothing is stored', async () => {
    expect(await createSyncQueueStore(fakeArea()).read()).toEqual([]);
  });

  it('round-trips entries through storage', async () => {
    const area = fakeArea();
    const store = createSyncQueueStore(area);
    const entries: SyncEntry[] = [
      { clientGameId: 'a', kind: 'submit', attempts: 0, nextAttemptAtMs: 1 },
    ];
    await store.write(entries);
    expect(area.data[SYNC_QUEUE_KEY]).toEqual(entries);
    expect(await store.read()).toEqual(entries);
  });

  it('treats a corrupt persisted queue as empty (it is derivable)', async () => {
    const store = createSyncQueueStore(fakeArea({ [SYNC_QUEUE_KEY]: { not: 'an array' } }));
    expect(await store.read()).toEqual([]);
  });
});

describe('drainSync', () => {
  it('does nothing when signed out', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A)] });
    const api = fakeApi({});
    const summary = await drainSync(deps(area, api, { linked: false }));
    expect(summary.processed).toBe(0);
    expect(api.submitted).toEqual([]);
  });

  it('returns early when history is unreadable', async () => {
    const area = fakeArea({ [GAMES_KEY]: 'corrupt' });
    const api = fakeApi({});
    const summary = await drainSync(deps(area, api));
    expect(summary.processed).toBe(0);
    expect(api.submitted).toEqual([]);
  });

  it('backfills every kept rankable game on first drain and writes the verdict back', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A), game(B)] });
    const api = fakeApi({
      submit: (r) => ok({ id: `srv-${r.id}`, outcome: 'accepted', serverScore: 29 }),
    });

    const summary = await drainSync(deps(area, api));

    expect(api.submitted.sort()).toEqual([A, B]);
    expect(summary.uploaded).toBe(2);
    expect(summary.remaining).toBe(0);

    const games = area.data[GAMES_KEY] as StoredGame[];
    expect(games.every((g) => g.sync?.state === 'uploaded')).toBe(true);
    expect(games.every((g) => g.sync?.serverScore === 29)).toBe(true);
    expect(area.data[SYNC_QUEUE_KEY]).toEqual([]);
  });

  it('marks a game pending and reschedules with backoff on a transient failure', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A)] });
    const api = fakeApi({ submit: () => err({ kind: 'network' }) });

    const summary = await drainSync(deps(area, api, { now: () => 10_000 }));

    expect(summary.retryScheduled).toBe(1);
    const games = area.data[GAMES_KEY] as StoredGame[];
    expect(games[0]?.sync?.state).toBe('pending');
    const queue = area.data[SYNC_QUEUE_KEY] as SyncEntry[];
    expect(queue[0]).toEqual({
      clientGameId: A,
      kind: 'submit',
      attempts: 1,
      nextAttemptAtMs: 10_000 + 60_000,
    });
  });

  it('marks a game failed on a permanent rejection and drops it from the queue', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A)] });
    const api = fakeApi({ submit: () => err({ kind: 'not-rankable' }) });

    const summary = await drainSync(deps(area, api));

    expect(summary.failed).toBe(1);
    expect((area.data[GAMES_KEY] as StoredGame[])[0]?.sync?.state).toBe('failed');
    expect(area.data[SYNC_QUEUE_KEY]).toEqual([]);
  });

  it('also marks failed on a bad-request', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A)] });
    const api = fakeApi({ submit: () => err({ kind: 'bad-request' }) });
    const summary = await drainSync(deps(area, api));
    expect(summary.failed).toBe(1);
  });

  it('revokes an uploaded-then-removed game and marks it terminally revoked', async () => {
    const removed = game(R, { status: 'removed', sync: { state: 'uploaded' } });
    const area = fakeArea({ [GAMES_KEY]: [removed] });
    const api = fakeApi({});

    const summary = await drainSync(deps(area, api));

    expect(api.revoked).toEqual([R]);
    expect(summary.revoked).toBe(1);
    expect(area.data[SYNC_QUEUE_KEY]).toEqual([]);
    expect((area.data[GAMES_KEY] as StoredGame[])[0]?.sync).toEqual({ state: 'revoked' });
  });

  it('treats a revoke 404 as done and still terminalizes the sync state', async () => {
    const removed = game(R, { status: 'removed', sync: { state: 'uploaded' } });
    const area = fakeArea({ [GAMES_KEY]: [removed] });
    const api = fakeApi({ revoke: () => err({ kind: 'not-found' }) });
    const summary = await drainSync(deps(area, api));
    expect(summary.revoked).toBe(1);
    expect(area.data[SYNC_QUEUE_KEY]).toEqual([]);
    expect((area.data[GAMES_KEY] as StoredGame[])[0]?.sync).toEqual({ state: 'revoked' });
  });

  it('never re-fires a completed revoke: a second drain issues no request', async () => {
    const removed = game(R, { status: 'removed', sync: { state: 'uploaded' } });
    const area = fakeArea({ [GAMES_KEY]: [removed] });
    const api = fakeApi({});
    const d = deps(area, api);

    await drainSync(d); // revoke succeeds
    const second = await drainSync(d); // the 1-minute alarm re-fires

    expect(api.revoked).toEqual([R]); // exactly one DELETE, ever
    expect(second.processed).toBe(0);
    expect(second.remaining).toBe(0);
    expect(area.data[SYNC_QUEUE_KEY]).toEqual([]);
  });

  it('re-submits a restored game whose upload was revoked', async () => {
    const removed = game(R, { status: 'removed', sync: { state: 'uploaded' } });
    const area = fakeArea({ [GAMES_KEY]: [removed] });
    const api = fakeApi({});
    const d = deps(area, api);

    await drainSync(d); // revoke completes -> sync.state 'revoked'

    // The user restores the game (store.restore flips removed -> kept).
    const store = createStore(area);
    await store.restore(R);

    const summary = await drainSync(d);

    expect(api.submitted).toEqual([R]); // re-submitted through validation
    expect(summary.uploaded).toBe(1);
    const row = (area.data[GAMES_KEY] as StoredGame[])[0];
    expect(row?.sync?.state).toBe('uploaded');
    expect(area.data[SYNC_QUEUE_KEY]).toEqual([]);
  });

  it('reschedules a transient revoke failure', async () => {
    const removed = game(R, { status: 'removed', sync: { state: 'uploaded' } });
    const area = fakeArea({ [GAMES_KEY]: [removed] });
    const api = fakeApi({ revoke: () => err({ kind: 'server', status: 500 }) });
    const summary = await drainSync(deps(area, api));
    expect(summary.retryScheduled).toBe(1);
    expect((area.data[SYNC_QUEUE_KEY] as SyncEntry[])[0]?.kind).toBe('revoke');
  });

  it('stops the pass on an auth failure and leaves remaining entries intact', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A), game(B)] });
    const api = fakeApi({ submit: () => err({ kind: 'auth' }) });

    const summary = await drainSync(deps(area, api));

    expect(summary.authFailed).toBe(true);
    expect(summary.processed).toBe(1); // stopped after the first
    expect(api.submitted).toHaveLength(1);
    expect(area.data[SYNC_QUEUE_KEY]).toHaveLength(2); // both kept for later
  });

  it('stops on an auth failure during a revoke', async () => {
    const removed = game(R, { status: 'removed', sync: { state: 'uploaded' } });
    const area = fakeArea({ [GAMES_KEY]: [removed] });
    const api = fakeApi({ revoke: () => err({ kind: 'auth' }) });
    const summary = await drainSync(deps(area, api));
    expect(summary.authFailed).toBe(true);
    expect(area.data[SYNC_QUEUE_KEY]).toHaveLength(1);
  });

  it('leaves a not-yet-due entry untouched', async () => {
    const area = fakeArea({
      [GAMES_KEY]: [game(A)],
      [SYNC_QUEUE_KEY]: [
        { clientGameId: A, kind: 'submit', attempts: 2, nextAttemptAtMs: 999_999 },
      ],
    });
    const api = fakeApi({});

    const summary = await drainSync(deps(area, api, { now: () => 10_000 }));

    expect(summary.processed).toBe(0);
    expect(api.submitted).toEqual([]);
    expect((area.data[SYNC_QUEUE_KEY] as SyncEntry[])[0]?.attempts).toBe(2);
  });

  it('does not re-mark a game that already has a sync state', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A, { sync: { state: 'pending' } })] });
    const api = fakeApi({ submit: () => ok({ id: 's', outcome: 'quarantined', serverScore: 30 }) });
    await drainSync(deps(area, api));
    expect((area.data[GAMES_KEY] as StoredGame[])[0]?.sync?.outcome).toBe('quarantined');
  });

  it('single-flight: two simultaneous drain triggers share one underlying pass', async () => {
    const area = fakeArea({ [GAMES_KEY]: [game(A)] });
    const api = fakeApi({});
    const d = deps(area, api);
    const drain = singleFlight(() => drainSync(d));

    const [first, second] = await Promise.all([drain(), drain()]);

    expect(api.submitted).toEqual([A]); // the API was hit exactly once
    expect(first).toBe(second); // both callers observed the same pass
    expect(first.uploaded).toBe(1);
  });
});
