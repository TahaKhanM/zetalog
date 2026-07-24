import { z } from 'zod';

import { type ApiClient } from './api.js';
import { type StorageArea, type Store, type StoredGame } from './store.js';

/**
 * The leaderboard sync queue and its drain.
 *
 * The queue is *derived* state: {@link reconcileQueue} rebuilds it from local
 * history on every drain, so backfill (upload every kept rankable game on first
 * link), incremental saves, restores, and removes all flow through one pure
 * function. {@link drainSync} then processes due entries against the API,
 * writing each server verdict back onto the game and rescheduling failures with
 * exponential backoff. All time and I/O are injected; the scheduling and
 * reconciliation logic are pure and exhaustively tested.
 */

/** Versioned storage key for the persisted queue. */
export const SYNC_QUEUE_KEY = 'zl:v1:syncQueue';

/** First retry delay (1 min); subsequent delays grow by {@link BACKOFF_FACTOR}. */
export const BACKOFF_BASE_MS = 60_000;
/** Geometric growth factor: 1 min → 5 min → 25 min → … */
export const BACKOFF_FACTOR = 5;
/** Retry delays are capped here (2 hours). */
export const BACKOFF_CAP_MS = 2 * 60 * 60 * 1000;

/** Whether a queued entry uploads a game or revokes a previously-uploaded one. */
export type SyncKind = 'submit' | 'revoke';

/** One pending sync operation. `attempts` is the number of failures so far. */
export interface SyncEntry {
  readonly clientGameId: string;
  readonly kind: SyncKind;
  readonly attempts: number;
  readonly nextAttemptAtMs: number;
}

const syncEntrySchema = z.object({
  clientGameId: z.string(),
  kind: z.enum(['submit', 'revoke']),
  attempts: z.number().int().nonnegative(),
  nextAttemptAtMs: z.number(),
});

/**
 * The delay before retry number `attempts` (1-based: the delay after the first
 * failure is {@link BACKOFF_BASE_MS}), capped at {@link BACKOFF_CAP_MS}.
 */
export function backoffDelayMs(attempts: number): number {
  const raw = BACKOFF_BASE_MS * BACKOFF_FACTOR ** (attempts - 1);
  return Math.min(raw, BACKOFF_CAP_MS);
}

/**
 * The sync operation a game currently warrants, or null if none.
 *
 * Submit: a kept rankable game that is neither uploaded nor permanently failed —
 * including one whose earlier upload was `revoked` and has since been restored
 * (it must go back through server validation). Revoke: an `uploaded` game the
 * user removed. `revoked` itself is TERMINAL for a removed game: the completed
 * server-side removal must never re-derive another revoke on later drains.
 */
function desiredKind(game: StoredGame): SyncKind | null {
  const state = game.sync?.state;
  if (
    game.status === 'kept' &&
    game.rankableDuration !== null &&
    state !== 'uploaded' &&
    state !== 'failed'
  ) {
    return 'submit';
  }
  if (state === 'uploaded' && game.status === 'removed') {
    return 'revoke';
  }
  return null;
}

/** A reconciled entry paired with the game it acts on. */
export interface ReconcileJob {
  readonly entry: SyncEntry;
  readonly game: StoredGame;
}

/**
 * Rebuild the queue from local history, pairing each entry with its game so the
 * drain never has to look a record back up. `attempts`/`nextAttemptAtMs` of
 * entries that still apply are preserved. A kept rankable game not yet uploaded
 * needs a submit; an uploaded game the user removed needs a revoke; everything
 * else (uploaded-and-kept, quarantined, capture-failed, permanently-failed, or
 * a removed game that never uploaded) needs nothing. Pure.
 */
export function reconcileJobs(
  games: readonly StoredGame[],
  queue: readonly SyncEntry[],
  nowMs: number,
): ReconcileJob[] {
  const existing = new Map<string, SyncEntry>();
  for (const entry of queue) existing.set(`${entry.kind}:${entry.clientGameId}`, entry);

  const jobs: ReconcileJob[] = [];
  for (const game of games) {
    const kind = desiredKind(game);
    if (kind === null) continue;
    const id = game.record.id;
    const prior = existing.get(`${kind}:${id}`);
    jobs.push({
      entry: prior ?? { clientGameId: id, kind, attempts: 0, nextAttemptAtMs: nowMs },
      game,
    });
  }
  return jobs;
}

/** The reconciled queue entries alone (persistable form of {@link reconcileJobs}). */
export function reconcileQueue(
  games: readonly StoredGame[],
  queue: readonly SyncEntry[],
  nowMs: number,
): SyncEntry[] {
  return reconcileJobs(games, queue, nowMs).map((job) => job.entry);
}

/** Persisted queue storage over a `browser.storage.local`-shaped area. */
export interface SyncQueueStore {
  read(): Promise<SyncEntry[]>;
  write(entries: readonly SyncEntry[]): Promise<void>;
}

/**
 * Create the queue store. A corrupt persisted queue is treated as empty rather
 * than fatal — the queue is derivable from history, so the next
 * {@link reconcileQueue} rebuilds it (no telemetry is ever lost).
 */
export function createSyncQueueStore(area: StorageArea): SyncQueueStore {
  return {
    async read() {
      const raw = await area.get(SYNC_QUEUE_KEY);
      const value = raw[SYNC_QUEUE_KEY];
      if (value === undefined) return [];
      const parsed = z.array(syncEntrySchema).safeParse(value);
      return parsed.success ? parsed.data : [];
    },
    async write(entries) {
      await area.set({ [SYNC_QUEUE_KEY]: entries });
    },
  };
}

/** Outcome tallies from one drain pass. */
export interface DrainSummary {
  readonly processed: number;
  readonly uploaded: number;
  readonly revoked: number;
  readonly failed: number;
  readonly retryScheduled: number;
  readonly authFailed: boolean;
  readonly remaining: number;
}

/** The `listGames` + `markSync` slice of the store the drain writes through. */
export type SyncStore = Pick<Store, 'listGames' | 'markSync'>;

/** Dependencies for {@link drainSync}. */
export interface SyncDeps {
  readonly api: ApiClient;
  readonly store: SyncStore;
  readonly queue: SyncQueueStore;
  readonly now: () => number;
  /** Whether an account is currently linked; the drain no-ops when signed out. */
  readonly isLinked: () => Promise<boolean>;
}

/** What to do with an entry after attempting it. */
type EntryAction = 'done' | 'retry' | 'auth-stop';

const EMPTY: DrainSummary = {
  processed: 0,
  uploaded: 0,
  revoked: 0,
  failed: 0,
  retryScheduled: 0,
  authFailed: false,
  remaining: 0,
};

/**
 * Reconcile the queue against local history, then process every due entry
 * against the API. On success the server verdict is written back onto the game;
 * permanent failures (`not-rankable`, `bad-request`) mark the game failed;
 * transient failures (`rate-limited`, `network`, `server`) reschedule with
 * backoff; an auth failure stops the pass and leaves the rest of the queue
 * intact for after the next link/refresh.
 */
export async function drainSync(deps: SyncDeps): Promise<DrainSummary> {
  if (!(await deps.isLinked())) return EMPTY;

  const listed = await deps.store.listGames();
  if (!listed.ok) return EMPTY;

  const now = deps.now();
  const jobs = reconcileJobs(listed.value, await deps.queue.read(), now);

  // Show a "pending" chip the moment a game is queued for its first upload —
  // or for a re-upload after its previous submission was revoked and the game
  // restored (the stale "Revoked" chip flips to "Syncing…").
  for (const { entry, game } of jobs) {
    if (entry.kind === 'submit' && (game.sync === undefined || game.sync.state === 'revoked')) {
      await deps.store.markSync(entry.clientGameId, { state: 'pending' });
    }
  }

  let uploaded = 0;
  let revoked = 0;
  let failed = 0;
  let retryScheduled = 0;
  let processed = 0;
  let authFailed = false;
  const remaining: SyncEntry[] = [];

  for (const { entry, game } of jobs) {
    if (authFailed || entry.nextAttemptAtMs > now) {
      remaining.push(entry);
      continue;
    }
    processed += 1;

    let action: EntryAction;
    if (entry.kind === 'submit') {
      const result = await deps.api.submitGame(game.record);
      if (result.ok) {
        await deps.store.markSync(entry.clientGameId, {
          state: 'uploaded',
          outcome: result.value.outcome,
          serverScore: result.value.serverScore,
        });
        uploaded += 1;
        action = 'done';
      } else if (result.error.kind === 'auth') {
        action = 'auth-stop';
      } else if (result.error.kind === 'not-rankable' || result.error.kind === 'bad-request') {
        await deps.store.markSync(entry.clientGameId, { state: 'failed' });
        failed += 1;
        action = 'done';
      } else {
        action = 'retry';
      }
    } else {
      const result = await deps.api.revokeGame(entry.clientGameId);
      if (result.ok || result.error.kind === 'not-found') {
        // Terminalize: without this the game would stay 'uploaded' and every
        // later drain (the 1-minute alarm included) would re-derive the revoke
        // and re-fire the DELETE forever. A 404 means the server already has
        // nothing to remove — equally final.
        await deps.store.markSync(entry.clientGameId, { state: 'revoked' });
        revoked += 1;
        action = 'done';
      } else if (result.error.kind === 'auth') {
        action = 'auth-stop';
      } else {
        action = 'retry';
      }
    }

    if (action === 'retry') {
      const attempts = entry.attempts + 1;
      remaining.push({ ...entry, attempts, nextAttemptAtMs: now + backoffDelayMs(attempts) });
      retryScheduled += 1;
    } else if (action === 'auth-stop') {
      remaining.push(entry);
      authFailed = true;
    }
  }

  await deps.queue.write(remaining);
  return {
    processed,
    uploaded,
    revoked,
    failed,
    retryScheduled,
    authFailed,
    remaining: remaining.length,
  };
}
