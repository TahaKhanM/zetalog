/** A game counts as a restart when it played under this fraction of its duration. */
export const RESTART_PLAYED_FRACTION = 0.8;

/** Minimum kept games on a fingerprint before the outlier rule activates. */
export const OUTLIER_MIN_HISTORY = 5;

/** The outlier rule looks at this many most-recent kept games. */
export const OUTLIER_WINDOW = 10;

/** Scores under this fraction of the window median are quarantined. */
export const OUTLIER_MEDIAN_FRACTION = 0.4;

/** Why a game was auto-quarantined. */
export type QuarantineReason = 'restart' | 'outlier';

/** Inputs needed to decide whether a finished game should be auto-quarantined. */
export interface QuarantineInput {
  readonly score: number;
  /** Wall-clock time the game actually ran, in milliseconds. */
  readonly playedMs: number;
  readonly durationSeconds: number;
  /** Kept (not quarantined/removed) scores on the same settings fingerprint, most recent first. */
  readonly recentKeptScores: readonly number[];
}

/** Median of a list; NaN for empty input. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted.at(mid);
  const lower = sorted.at(sorted.length % 2 === 0 ? mid - 1 : mid);
  if (upper === undefined || lower === undefined) return Number.NaN;
  return (upper + lower) / 2;
}

/**
 * Decide whether a finished game is auto-quarantined. Both the
 * extension (pre-flag) and the server (authoritative mirror) call this with
 * identical inputs. Quarantine is always restorable — callers must never
 * delete on the strength of this verdict.
 */
export function evaluateQuarantine(input: QuarantineInput): QuarantineReason | null {
  if (input.playedMs < RESTART_PLAYED_FRACTION * input.durationSeconds * 1000) {
    return 'restart';
  }
  if (input.recentKeptScores.length >= OUTLIER_MIN_HISTORY) {
    const window = input.recentKeptScores.slice(0, OUTLIER_WINDOW);
    if (input.score < OUTLIER_MEDIAN_FRACTION * median(window)) {
      return 'outlier';
    }
  }
  return null;
}
