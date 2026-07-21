import {
  evaluateQuarantine,
  fingerprint,
  gameRecordSchema,
  ok,
  err,
  rankableDuration,
  type GameRecord,
  type QuarantineReason,
  type Result,
} from '@zetalog/shared';
import { z } from 'zod';

/** Versioned storage keys. Bumping the `v1` segment is how a schema migration is staged. */
const GAMES_KEY = 'zl:v1:games';
const PREFS_KEY = 'zl:v1:prefs';

/** Above this many stored games, oldest non-rankable event streams are pruned (spec §9). */
export const PRUNE_LIMIT = 400;

/** A stored game: the raw record plus derived, denormalised fields the popup reads directly. */
export interface StoredGame {
  readonly record: GameRecord;
  /** Settings fingerprint from shared `fingerprint()` — the grouping key for history/graphs. */
  readonly fingerprint: string;
  /** Leaderboard duration this game qualifies for, or null (mirrors shared `rankableDuration`). */
  readonly rankableDuration: 30 | 60 | 120 | null;
  readonly status: 'kept' | 'quarantined' | 'removed' | 'capture_failed';
  readonly quarantineReason?: QuarantineReason | undefined;
  /** Wall-clock time this row was written. */
  readonly savedAtMs: number;
}

/** Time range for the popup trend graph; persisted so the user's choice sticks. */
export type TrendRange = 10 | 25 | 50 | 'all';

/** Popup graph preferences (spec §3.3): which config to show and how much history. */
export interface Prefs {
  /** null → the popup falls back to the most-played fingerprint. */
  readonly selectedFingerprint: string | null;
  readonly range: TrendRange;
}

const DEFAULT_PREFS: Prefs = { selectedFingerprint: null, range: 'all' };

/** Corruption is surfaced, never swallowed — the caller decides how to react (spec §9). */
export interface StoreError {
  readonly reason: 'corrupt-games' | 'corrupt-prefs';
  readonly detail: string;
}

/** The slice of `browser.storage.local` the store depends on (injectable for tests). */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const rankableDurationSchema = z.union([z.literal(30), z.literal(60), z.literal(120), z.null()]);

const storedGameSchema = z.object({
  record: gameRecordSchema,
  fingerprint: z.string(),
  rankableDuration: rankableDurationSchema,
  status: z.enum(['kept', 'quarantined', 'removed', 'capture_failed']),
  quarantineReason: z.enum(['restart', 'outlier']).optional(),
  savedAtMs: z.number(),
});

const prefsSchema = z.object({
  selectedFingerprint: z.string().nullable(),
  range: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal('all')]),
});

/**
 * Reclaim storage by clearing the event streams of the oldest *non-rankable*
 * games first, once the store exceeds `limit` rows. Rankable games keep their
 * events (they still need server backfill); scores and status are never
 * touched, and no row is ever deleted (spec §9, invariant 3).
 */
export function pruneStoredGames(games: readonly StoredGame[], limit = PRUNE_LIMIT): StoredGame[] {
  if (games.length <= limit) return [...games];

  let withEvents = games.filter((game) => game.record.events.length > 0).length;
  const stripIds = new Set<string>();
  const oldestFirst = [...games].sort((a, b) => a.savedAtMs - b.savedAtMs);
  for (const game of oldestFirst) {
    if (withEvents <= limit) break;
    if (game.rankableDuration === null && game.record.events.length > 0) {
      stripIds.add(game.record.id);
      withEvents -= 1;
    }
  }

  return games.map((game) =>
    stripIds.has(game.record.id) ? { ...game, record: { ...game.record, events: [] } } : game,
  );
}

/** The storage repository surface the content script and popup consume. */
export interface Store {
  saveGame(record: GameRecord): Promise<Result<StoredGame, StoreError>>;
  saveCaptureFailed(record: GameRecord): Promise<Result<StoredGame, StoreError>>;
  restore(id: string): Promise<Result<StoredGame | null, StoreError>>;
  remove(id: string): Promise<Result<StoredGame | null, StoreError>>;
  listGames(): Promise<Result<StoredGame[], StoreError>>;
  getPrefs(): Promise<Result<Prefs, StoreError>>;
  setPrefs(prefs: Prefs): Promise<Result<Prefs, StoreError>>;
}

/**
 * Create the storage repository over a `browser.storage.local`-shaped area.
 * `now` supplies each row's `savedAtMs` (inject a fake in tests).
 */
export function createStore(area: StorageArea, now: () => number = () => Date.now()): Store {
  async function readGames(): Promise<Result<StoredGame[], StoreError>> {
    const raw = await area.get(GAMES_KEY);
    const value = raw[GAMES_KEY];
    if (value === undefined) return ok([]);
    const parsed = z.array(storedGameSchema).safeParse(value);
    if (!parsed.success) return err({ reason: 'corrupt-games', detail: parsed.error.message });
    return ok(parsed.data);
  }

  async function writeGames(games: readonly StoredGame[]): Promise<void> {
    await area.set({ [GAMES_KEY]: pruneStoredGames(games) });
  }

  async function append(stored: StoredGame): Promise<Result<StoredGame, StoreError>> {
    const games = await readGames();
    if (!games.ok) return games;
    await writeGames([...games.value, stored]);
    return ok(stored);
  }

  function keptScoresFor(games: readonly StoredGame[], fp: string): number[] {
    return games
      .filter((game) => game.status === 'kept' && game.fingerprint === fp)
      .sort((a, b) => b.savedAtMs - a.savedAtMs)
      .map((game) => game.record.claimedScore);
  }

  async function update(
    id: string,
    transform: (game: StoredGame) => StoredGame,
  ): Promise<Result<StoredGame | null, StoreError>> {
    const games = await readGames();
    if (!games.ok) return games;
    const existing = games.value.find((game) => game.record.id === id);
    if (existing === undefined) return ok(null);
    const updated = transform(existing);
    await writeGames(games.value.map((game) => (game === existing ? updated : game)));
    return ok(updated);
  }

  return {
    async saveGame(record) {
      const games = await readGames();
      if (!games.ok) return games;
      const fp = fingerprint(record.settings);
      const reason = evaluateQuarantine({
        score: record.claimedScore,
        playedMs: record.playedMs,
        durationSeconds: record.settings.durationSeconds,
        recentKeptScores: keptScoresFor(games.value, fp),
      });
      const base = {
        record,
        fingerprint: fp,
        rankableDuration: rankableDuration(record.settings),
        savedAtMs: now(),
      };
      const stored: StoredGame =
        reason === null
          ? { ...base, status: 'kept' }
          : { ...base, status: 'quarantined', quarantineReason: reason };
      await writeGames([...games.value, stored]);
      return ok(stored);
    },

    saveCaptureFailed(record) {
      return append({
        record,
        fingerprint: fingerprint(record.settings),
        rankableDuration: rankableDuration(record.settings),
        status: 'capture_failed',
        savedAtMs: now(),
      });
    },

    restore(id) {
      return update(id, (game) => ({
        record: game.record,
        fingerprint: game.fingerprint,
        rankableDuration: game.rankableDuration,
        status: 'kept',
        savedAtMs: game.savedAtMs,
      }));
    },

    remove(id) {
      return update(id, (game) => ({ ...game, status: 'removed' }));
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
      await area.set({ [PREFS_KEY]: prefs });
      return ok(prefs);
    },
  };
}
