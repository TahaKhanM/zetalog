import {
  evaluateQuarantine,
  fingerprint,
  gameRecordSchema,
  ok,
  err,
  rankableDuration,
  recomputeScore,
  type GameRecord,
  type QuarantineReason,
  type Result,
} from '@zetalog/shared';
import { z } from 'zod';

/** Versioned storage keys. Bumping the `v1` segment is how a schema migration is staged. */
const GAMES_KEY = 'zl:v1:games';
const PREFS_KEY = 'zl:v1:prefs';

/** Above this many stored games, oldest non-rankable event streams are pruned. */
export const PRUNE_LIMIT = 400;

/** A status a row can hold before Remove — i.e. anywhere Restore may return it to. */
export type RemovableStatus = 'kept' | 'quarantined' | 'capture_failed';

/**
 * Where a game stands relative to the leaderboard sync. `revoked` is the
 * TERMINAL state after a completed server-side removal — it stops the queue
 * from re-deriving the revoke, and a later local restore derives a matching
 * server-side restore operation.
 */
export type SyncState = 'pending' | 'uploaded' | 'failed' | 'revoked';

/**
 * Per-game sync metadata written back after an upload attempt. `outcome`/`serverScore` mirror the server's verdict once
 * uploaded so the popup can show it. This is sync bookkeeping, not game data:
 * Unlink clears it, and it is absent until the account is linked (invariant 4).
 * The outcome values mirror the API client's `SubmitOutcome`.
 */
export interface GameSync {
  readonly state: SyncState;
  readonly outcome?: 'accepted' | 'quarantined' | 'rejected' | 'user_removed' | undefined;
  readonly serverScore?: number | undefined;
}

/** A stored game: the raw record plus derived, denormalised fields the popup reads directly. */
export interface StoredGame {
  readonly record: GameRecord;
  /** Account this row may sync to; absent/null is assigned on the next link. */
  readonly ownerUserId?: string | null | undefined;
  /** Raw events were retired after a terminal/server-resolved state; score metadata remains. */
  readonly telemetryPruned?: boolean | undefined;
  /**
   * The recomputed, verified score — shared `recomputeScore(record.events).score`,
   * the same server-side truth that ranks (product invariant 1). This, NOT
   * `record.claimedScore`, is what every popup surface (hero/PB/trend/new-PB)
   * shows: the scraped `claimedScore` can miss points during the final DOM
   * update, so it is kept only for the server's claimed-vs-recomputed
   * cross-check at submit time. Backfilled from `record.events` for legacy rows
   * written before this field existed.
   */
  readonly verifiedScore: number;
  /** Settings fingerprint from shared `fingerprint()` — the grouping key for history/graphs. */
  readonly fingerprint: string;
  /** Leaderboard duration this game qualifies for, or null (mirrors shared `rankableDuration`). */
  readonly rankableDuration: 30 | 60 | 120 | null;
  readonly status: RemovableStatus | 'removed';
  readonly quarantineReason?: QuarantineReason | undefined;
  /**
   * Status before Remove, so Restore returns the row where it came from — a
   * removed capture_failed row must never resurface as a kept score. Absent on
   * rows written before this field existed (restore then defaults to 'kept').
   */
  readonly removedFrom?: RemovableStatus | undefined;
  /** Wall-clock time this row was written. */
  readonly savedAtMs: number;
  /** Leaderboard sync bookkeeping; absent while signed out (invariant 4). */
  readonly sync?: GameSync | undefined;
}

/** Time range for the popup trend graph; persisted so the user's choice sticks. */
export type TrendRange = 10 | 25 | 50 | 'all';

/** Popup graph preferences: which config to show and how much history. */
export interface Prefs {
  /** null → the popup falls back to the most-played fingerprint. */
  readonly selectedFingerprint: string | null;
  readonly range: TrendRange;
}

const DEFAULT_PREFS: Prefs = { selectedFingerprint: null, range: 'all' };

/** Corruption is surfaced, never swallowed — the caller decides how to react. */
export interface StoreError {
  readonly reason: 'corrupt-games' | 'corrupt-prefs' | 'write-failed';
  readonly detail: string;
}

/** The slice of `browser.storage.local` the store depends on (injectable for tests). */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const rankableDurationSchema = z.union([z.literal(30), z.literal(60), z.literal(120), z.null()]);

const gameSyncSchema = z.object({
  state: z.enum(['pending', 'uploaded', 'failed', 'revoked']),
  outcome: z.enum(['accepted', 'quarantined', 'rejected', 'user_removed']).optional(),
  serverScore: z.number().optional(),
});

const storedGameSchema = z.object({
  record: gameRecordSchema,
  ownerUserId: z.string().min(1).nullable().optional(),
  telemetryPruned: z.boolean().optional(),
  // Optional on the wire: rows written before verifiedScore existed lack it and
  // are backfilled on read (see readGames) by recomputing from record.events.
  verifiedScore: z.number().int().nonnegative().optional(),
  fingerprint: z.string(),
  rankableDuration: rankableDurationSchema,
  status: z.enum(['kept', 'quarantined', 'removed', 'capture_failed']),
  quarantineReason: z.enum(['restart', 'outlier']).optional(),
  removedFrom: z.enum(['kept', 'quarantined', 'capture_failed']).optional(),
  savedAtMs: z.number(),
  sync: gameSyncSchema.optional(),
});

const prefsSchema = z.object({
  selectedFingerprint: z.string().nullable(),
  range: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal('all')]),
});

/**
 * Reclaim storage by clearing the event streams of the oldest *non-rankable*
 * games and server-resolved games first, once the store exceeds `limit` rows.
 * Unsynced rankable games — including rows a temporarily incompatible server
 * rejected as `failed` — always keep their evidence so a later extension/server
 * fix can recover them; scores/status are never touched and no row is deleted.
 */
export function pruneStoredGames(games: readonly StoredGame[], limit = PRUNE_LIMIT): StoredGame[] {
  if (games.length <= limit) return [...games];

  let withEvents = games.filter((game) => game.record.events.length > 0).length;
  const stripIds = new Set<string>();
  const oldestFirst = [...games].sort((a, b) => a.savedAtMs - b.savedAtMs);
  for (const game of oldestFirst) {
    if (withEvents <= limit) break;
    const safeToStrip =
      game.rankableDuration === null ||
      game.status === 'capture_failed' ||
      game.sync?.state === 'uploaded' ||
      game.sync?.state === 'revoked';
    if (safeToStrip && game.record.events.length > 0) {
      stripIds.add(game.record.id);
      withEvents -= 1;
    }
  }

  return games.map((game) =>
    stripIds.has(game.record.id)
      ? { ...game, telemetryPruned: true, record: { ...game.record, events: [] } }
      : game,
  );
}

/** The storage repository surface the content script and popup consume. */
export interface Store {
  checkpointGame(
    record: GameRecord,
    ownerUserId?: string | null,
  ): Promise<Result<StoredGame, StoreError>>;
  saveGame(
    record: GameRecord,
    ownerUserId?: string | null,
  ): Promise<Result<StoredGame, StoreError>>;
  saveCaptureFailed(
    record: GameRecord,
    ownerUserId?: string | null,
  ): Promise<Result<StoredGame, StoreError>>;
  restore(id: string): Promise<Result<StoredGame | null, StoreError>>;
  remove(id: string): Promise<Result<StoredGame | null, StoreError>>;
  /** Write leaderboard sync state onto a game (`null` if the id is unknown). */
  markSync(id: string, sync: GameSync): Promise<Result<StoredGame | null, StoreError>>;
  /** Drop all sync bookkeeping (Unlink). Leaves scores/status/records untouched. */
  clearAllSync(): Promise<Result<void, StoreError>>;
  /** Silent legacy migration chosen by the product owner. */
  assignUnownedGames(userId: string): Promise<Result<void, StoreError>>;
  /**
   * Merge server-fetched games into local history, keyed by `record.id`. Local
   * telemetry remains authoritative, while server moderation/removal and sync
   * state are reconciled across installations.
   */
  importBackfill(remote: readonly StoredGame[]): Promise<Result<StoredGame[], StoreError>>;
  listGames(): Promise<Result<StoredGame[], StoreError>>;
  getPrefs(): Promise<Result<Prefs, StoreError>>;
  setPrefs(prefs: Prefs): Promise<Result<Prefs, StoreError>>;
}

/**
 * Create the storage repository over a `browser.storage.local`-shaped area.
 * `now` supplies each row's `savedAtMs` (inject a fake in tests).
 */
export function createStore(area: StorageArea, now: () => number = () => Date.now()): Store {
  let mutationTail: Promise<void> = Promise.resolve();

  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const running = mutationTail.then(operation, operation);
    mutationTail = running.then(
      () => undefined,
      () => undefined,
    );
    return running;
  }

  async function readGames(): Promise<Result<StoredGame[], StoreError>> {
    const raw = await area.get(GAMES_KEY);
    const value = raw[GAMES_KEY];
    if (value === undefined) return ok([]);
    const parsed = z.array(storedGameSchema).safeParse(value);
    if (!parsed.success) return err({ reason: 'corrupt-games', detail: parsed.error.message });
    // Backfill verifiedScore for legacy rows: recompute the verified score from
    // the event stream, so every StoredGame the popup reads carries the truth.
    // A legacy PRUNED row (pruneStoredGames stripped its events before this
    // field existed) has nothing to recompute from — recomputing [] would
    // clobber its score to 0 — so its stored claimed score is the best
    // remaining truth and is used verbatim.
    const games: StoredGame[] = parsed.data.map((game) => ({
      ...game,
      verifiedScore:
        game.verifiedScore ??
        (game.record.events.length === 0
          ? game.record.claimedScore
          : recomputeScore(game.record.events).score),
    }));
    return ok(games);
  }

  async function writeGames(games: readonly StoredGame[]): Promise<StoreError | null> {
    try {
      await area.set({ [GAMES_KEY]: pruneStoredGames(games) });
      return null;
    } catch {
      return { reason: 'write-failed', detail: 'Browser storage rejected the game update.' };
    }
  }

  function append(stored: StoredGame): Promise<Result<StoredGame, StoreError>> {
    return serial(async () => {
      const games = await readGames();
      if (!games.ok) return games;
      const existing = games.value.find((game) => game.record.id === stored.record.id);
      if (existing !== undefined) return ok(existing);
      const writeError = await writeGames([...games.value, stored]);
      if (writeError !== null) return err(writeError);
      return ok(stored);
    });
  }

  function keptScoresFor(games: readonly StoredGame[], fp: string): number[] {
    return games
      .filter((game) => game.status === 'kept' && game.fingerprint === fp)
      .sort((a, b) => b.savedAtMs - a.savedAtMs)
      .map((game) => game.verifiedScore);
  }

  function update(
    id: string,
    transform: (game: StoredGame) => StoredGame,
  ): Promise<Result<StoredGame | null, StoreError>> {
    return serial(async () => {
      const games = await readGames();
      if (!games.ok) return games;
      const existing = games.value.find((game) => game.record.id === id);
      if (existing === undefined) return ok(null);
      const updated = transform(existing);
      const writeError = await writeGames(
        games.value.map((game) => (game === existing ? updated : game)),
      );
      if (writeError !== null) return err(writeError);
      return ok(updated);
    });
  }

  return {
    checkpointGame(record, ownerUserId = null) {
      return serial(async () => {
        const games = await readGames();
        if (!games.ok) return games;
        const existing = games.value.find((game) => game.record.id === record.id);
        if (existing?.sync !== undefined) return ok(existing);
        const checkpoint: StoredGame = {
          record,
          ownerUserId: existing?.ownerUserId ?? ownerUserId,
          verifiedScore: recomputeScore(record.events).score,
          fingerprint: fingerprint(record.settings),
          rankableDuration: rankableDuration(record.settings),
          status: 'quarantined',
          quarantineReason: 'restart',
          savedAtMs: existing?.savedAtMs ?? now(),
        };
        const next =
          existing === undefined
            ? [...games.value, checkpoint]
            : games.value.map((game) => (game === existing ? checkpoint : game));
        const writeError = await writeGames(next);
        if (writeError !== null) return err(writeError);
        return ok(checkpoint);
      });
    },

    saveGame(record, ownerUserId = null) {
      return serial(async () => {
        const games = await readGames();
        if (!games.ok) return games;
        const existing = games.value.find((game) => game.record.id === record.id);
        const isCheckpoint =
          existing?.status === 'quarantined' &&
          existing.quarantineReason === 'restart' &&
          existing.sync === undefined;
        if (existing !== undefined && !isCheckpoint) return ok(existing);
        const fp = fingerprint(record.settings);
        const verifiedScore = recomputeScore(record.events).score;
        const reason = evaluateQuarantine({
          score: verifiedScore,
          playedMs: record.playedMs,
          durationSeconds: record.settings.durationSeconds,
          recentKeptScores: keptScoresFor(games.value, fp),
        });
        const base = {
          record,
          ownerUserId,
          verifiedScore,
          fingerprint: fp,
          rankableDuration: rankableDuration(record.settings),
          savedAtMs: now(),
        };
        const stored: StoredGame =
          reason === null
            ? { ...base, status: 'kept' }
            : { ...base, status: 'quarantined', quarantineReason: reason };
        const next =
          existing === undefined
            ? [...games.value, stored]
            : games.value.map((game) => (game === existing ? stored : game));
        const writeError = await writeGames(next);
        if (writeError !== null) return err(writeError);
        return ok(stored);
      });
    },

    saveCaptureFailed(record, ownerUserId = null) {
      return append({
        record,
        ownerUserId,
        verifiedScore: recomputeScore(record.events).score,
        fingerprint: fingerprint(record.settings),
        rankableDuration: rankableDuration(record.settings),
        status: 'capture_failed',
        savedAtMs: now(),
      });
    },

    restore(id) {
      return update(id, (game) => {
        // Quarantined → kept (the user overrides the auto-flag). Removed →
        // wherever it came from (legacy rows without provenance → kept). A
        // capture_failed row keeps its status: it has no real score and must
        // never enter stats as a kept game.
        const target: RemovableStatus =
          game.status === 'quarantined'
            ? 'kept'
            : game.status === 'removed'
              ? (game.removedFrom ?? 'kept')
              : game.status;
        const base = {
          record: game.record,
          ownerUserId: game.ownerUserId,
          telemetryPruned: game.telemetryPruned,
          verifiedScore: game.verifiedScore,
          fingerprint: game.fingerprint,
          rankableDuration: game.rankableDuration,
          savedAtMs: game.savedAtMs,
          // Sync bookkeeping survives the round trip: a restored game whose
          // upload was revoked carries `state: 'revoked'`, from which the sync
          // queue derives a server restore (and the chip shows Revoked, not
          // Synced, until it re-uploads).
          sync: game.sync,
        };
        return target === 'quarantined'
          ? { ...base, status: target, quarantineReason: game.quarantineReason }
          : { ...base, status: target };
      });
    },

    remove(id) {
      return update(id, (game) =>
        // Record provenance so restore can undo this exactly; removing an
        // already-removed row keeps the original provenance.
        game.status === 'removed' ? game : { ...game, status: 'removed', removedFrom: game.status },
      );
    },

    markSync(id, sync) {
      return update(id, (game) => ({ ...game, sync }));
    },

    clearAllSync() {
      return serial(async () => {
        const games = await readGames();
        if (!games.ok) return games;
        const writeError = await writeGames(
          games.value.map((game) => ({ ...game, sync: undefined })),
        );
        if (writeError !== null) return err(writeError);
        return ok(undefined);
      });
    },

    assignUnownedGames(userId) {
      return serial(async () => {
        const games = await readGames();
        if (!games.ok) return games;
        const migrated = games.value.map((game) =>
          game.ownerUserId === undefined || game.ownerUserId === null
            ? { ...game, ownerUserId: userId }
            : game,
        );
        const writeError = await writeGames(migrated);
        if (writeError !== null) return err(writeError);
        return ok(undefined);
      });
    },

    importBackfill(remote) {
      return serial(async () => {
        const games = await readGames();
        if (!games.ok) return games;
        const remoteById = new Map(remote.map((game) => [game.record.id, game]));
        const localIds = new Set(games.value.map((game) => game.record.id));
        const reconciled = games.value.map((local) => {
          const server = remoteById.get(local.record.id);
          if (server === undefined) return local;
          // A local delete which has not reached the server must remain queued;
          // otherwise the server's current accepted row would undo the click.
          if (local.status === 'removed' && server.status !== 'removed')
            return {
              ...local,
              ownerUserId: server.ownerUserId ?? local.ownerUserId,
              verifiedScore: server.verifiedScore,
              sync: server.sync,
            };
          return {
            ...local,
            ownerUserId: server.ownerUserId ?? local.ownerUserId,
            verifiedScore: server.verifiedScore,
            fingerprint: server.fingerprint,
            rankableDuration: server.rankableDuration,
            status: server.status,
            removedFrom: server.removedFrom,
            quarantineReason: server.quarantineReason,
            sync: server.sync,
          };
        });
        const additions = remote.filter((game) => !localIds.has(game.record.id));
        const merged = [...reconciled, ...additions];
        if (additions.length === 0 && merged.every((game, index) => game === games.value[index]))
          return ok(games.value);
        const writeError = await writeGames(merged);
        if (writeError !== null) return err(writeError);
        return ok(merged);
      });
    },

    listGames() {
      return readGames();
    },

    async getPrefs() {
      const raw = await area.get(PREFS_KEY);
      const value = raw[PREFS_KEY];
      if (value === undefined) return ok(DEFAULT_PREFS);
      const parsed = prefsSchema.safeParse(value);
      if (!parsed.success) return err({ reason: 'corrupt-prefs', detail: parsed.error.message });
      return ok(parsed.data);
    },

    async setPrefs(prefs) {
      try {
        await area.set({ [PREFS_KEY]: prefs });
      } catch {
        return err({ reason: 'write-failed', detail: 'Browser storage rejected the preference.' });
      }
      return ok(prefs);
    },
  };
}
