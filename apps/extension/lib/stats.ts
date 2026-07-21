import {
  RANKABLE_DURATIONS,
  ZETAMAC_DEFAULT_SETTINGS,
  fingerprint,
  skillBuckets,
  solvedProblems,
  type RankableDuration,
  type ZetamacSettings,
} from '@zetalog/shared';

import type { StoredGame, TrendRange } from './store.js';

/** Best kept score per leaderboard duration; null when none has been played. */
export type PersonalBests = Record<RankableDuration, number | null>;

/** One point on the trend graph: a kept score at a wall-clock game time. */
export interface TrendPoint {
  readonly score: number;
  readonly at: number;
}

/** How the popup should render a config's history, by kept-game count (spec §3.3). */
export type GraphMode = 'list' | 'sparkline' | 'chart';

const isKept = (game: StoredGame): boolean => game.status === 'kept';

/** Best kept score for each rankable duration (spec §3.3 PB row). */
export function personalBests(games: readonly StoredGame[]): PersonalBests {
  const bests = { 30: null, 60: null, 120: null } as Record<RankableDuration, number | null>;
  for (const duration of RANKABLE_DURATIONS) {
    const scores = games
      .filter((game) => isKept(game) && game.rankableDuration === duration)
      .map((game) => game.verifiedScore);
    bests[duration] = scores.length === 0 ? null : Math.max(...scores);
  }
  return bests;
}

/** The most recently saved kept game, or null (drives the popup hero). */
export function latestGame(games: readonly StoredGame[]): StoredGame | null {
  return games
    .filter(isKept)
    .reduce<StoredGame | null>(
      (latest, game) => (latest === null || game.savedAtMs > latest.savedAtMs ? game : latest),
      null,
    );
}

/**
 * Whether the latest kept game set a new personal best for its rankable
 * duration — strictly above every other kept game on that duration (so the
 * first game on a duration counts). Non-rankable latest games never qualify.
 */
export function isNewPersonalBest(games: readonly StoredGame[]): boolean {
  const latest = latestGame(games);
  if (latest === null) return false;
  if (latest.rankableDuration === null) return false;
  const priorScores = games
    .filter(
      (game) =>
        game !== latest && isKept(game) && game.rankableDuration === latest.rankableDuration,
    )
    .map((game) => game.verifiedScore);
  if (priorScores.length === 0) return true;
  return latest.verifiedScore > Math.max(...priorScores);
}

/** Kept scores for one fingerprint, ascending in time, limited to the range (spec §3.3). */
export function trendSeries(
  games: readonly StoredGame[],
  fingerprintKey: string,
  range: TrendRange,
): TrendPoint[] {
  const ordered = games
    .filter((game) => isKept(game) && game.fingerprint === fingerprintKey)
    .sort((a, b) => a.savedAtMs - b.savedAtMs);
  const windowed = range === 'all' ? ordered : ordered.slice(-range);
  return windowed.map((game) => ({ score: game.verifiedScore, at: game.record.startedAtMs }));
}

/** Choose the trend rendering for a kept-game count (spec §3.3 thresholds). */
export function graphMode(count: number): GraphMode {
  if (count < 5) return 'list';
  if (count < 20) return 'sparkline';
  return 'chart';
}

/** The fingerprint with the most kept games (ties → most recent). Null when none. */
export function mostPlayedFingerprint(games: readonly StoredGame[]): string | null {
  const stats = new Map<string, { count: number; latest: number }>();
  for (const game of games) {
    if (!isKept(game)) continue;
    const current = stats.get(game.fingerprint) ?? { count: 0, latest: 0 };
    stats.set(game.fingerprint, {
      count: current.count + 1,
      latest: Math.max(current.latest, game.savedAtMs),
    });
  }
  let best: { fingerprint: string; count: number; latest: number } | null = null;
  for (const [fp, { count, latest }] of stats) {
    if (best === null || count > best.count || (count === best.count && latest > best.latest)) {
      best = { fingerprint: fp, count, latest };
    }
  }
  return best === null ? null : best.fingerprint;
}

/** Human label for a configuration, e.g. "Default · 120s" / "Custom · 60s" (spec §3.3). */
export function fingerprintLabel(settings: ZetamacSettings): string {
  const atDefaultDuration = {
    ...settings,
    durationSeconds: ZETAMAC_DEFAULT_SETTINGS.durationSeconds,
  };
  const isDefault = fingerprint(atDefaultDuration) === fingerprint(ZETAMAC_DEFAULT_SETTINGS);
  return `${isDefault ? 'Default' : 'Custom'} · ${String(settings.durationSeconds)}s`;
}

/** The `limit` most recently saved games of any status, most recent first (recent list). */
export function recentGames(games: readonly StoredGame[], limit: number): StoredGame[] {
  return [...games].sort((a, b) => b.savedAtMs - a.savedAtMs).slice(0, limit);
}

/** A focus verdict needs at least this many solves in a skill area. */
export const FOCUS_MIN_SOLVED = 8;

/** How many recent kept games the focus verdict considers (current form, not history). */
export const FOCUS_WINDOW = 20;

/** The skill area the player should drill next, with how far it lags. */
export interface FocusArea {
  readonly label: string;
  readonly medianSolveMs: number;
  /** How many times slower than the player's fastest well-sampled area. */
  readonly ratio: number;
}

/**
 * The popup's one-line practice hint: the slowest well-sampled skill area
 * (shared `skillBuckets` over the last {@link FOCUS_WINDOW} kept games'
 * telemetry). Null when fewer than two areas reach {@link FOCUS_MIN_SOLVED}
 * solves — a verdict needs both a weak area and a baseline to compare it to.
 */
export function focusArea(games: readonly StoredGame[]): FocusArea | null {
  const recent = [...games]
    .filter(isKept)
    .sort((a, b) => b.savedAtMs - a.savedAtMs)
    .slice(0, FOCUS_WINDOW);
  const solved = recent.flatMap((game) => solvedProblems(game.record.events));
  const buckets = skillBuckets(solved);
  const sampled = buckets.filter((bucket) => bucket.solved >= FOCUS_MIN_SOLVED);
  if (sampled.length < 2) return null;
  // Non-empty by the guard above, so the initialiser-free reduce is total.
  const weakest = sampled.reduce((worst, bucket) =>
    bucket.medianSolveMs > worst.medianSolveMs ? bucket : worst,
  );
  const fastest = sampled.reduce(
    (best, bucket) => Math.min(best, bucket.medianSolveMs),
    Number.POSITIVE_INFINITY,
  );
  return {
    label: weakest.label,
    medianSolveMs: weakest.medianSolveMs,
    ratio: fastest > 0 ? weakest.medianSolveMs / fastest : 1,
  };
}
