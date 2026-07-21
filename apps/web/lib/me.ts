import type { RankableDuration } from '@zetalog/shared';

import type { GameRow, GameStatus, StoredValidation } from './db/rows';

/**
 * Pure projections for the `/me` dashboard. The server fetches full GameRows
 * (with telemetry); these helpers strip them to a light, client-serialisable
 * shape and derive personal bests and the default chart config.
 */

/** A game as the dashboard needs it — telemetry dropped, reasons pre-rendered. */
export interface MeGame {
  readonly clientGameId: string;
  readonly playedAt: string;
  readonly fingerprint: string;
  readonly duration: RankableDuration | null;
  readonly score: number;
  readonly status: GameStatus;
  /** Human-readable quarantine/rejection reasons, empty for clean games. */
  readonly reasons: readonly string[];
}

const VIOLATION_LABELS: Partial<Record<StoredValidation['violations'][number]['rule'], string>> = {
  'non-monotonic-timestamps': 'Timestamps out of order',
  'exceeds-duration': 'Exceeded the timer',
  'event-anomalies': 'Event-stream anomalies',
  // claimed-score-mismatch is intentionally omitted — the recomputed score is
  // authoritative, so the page never scolds the player for it.
};

const FLAG_LABELS: Record<StoredValidation['flags'][number]['rule'], string> = {
  'answer-floor': 'Superhuman solve times',
  'cadence-uniformity': 'Uniform typing cadence',
  'entry-burst': 'Pasted answers',
};

/** Human phrase for each hard problem-stream impossibility (W6). */
const PROBLEM_VIOLATION_LABELS: Record<
  StoredValidation['problemViolations'][number]['rule'],
  string
> = {
  'range-nonconforming': 'Problem outside the claimed range',
};

/** Human phrase for each statistical problem-stream flag (W6). */
const PROBLEM_FLAG_LABELS: Record<StoredValidation['problemFlags'][number]['rule'], string> = {
  'operation-mix': 'Implausible operation mix',
  'operand-marginal': 'Operands skew easy',
  'low-entropy': 'Problems repeat too often',
  'problem-switch': 'Problems re-shown unsolved',
};

/** Human phrases explaining why a game was quarantined or rejected. */
export function reasonsFor(validation: StoredValidation): string[] {
  const reasons: string[] = [];
  for (const violation of validation.violations) {
    const label = VIOLATION_LABELS[violation.rule];
    if (label !== undefined) reasons.push(label);
  }
  for (const violation of validation.problemViolations) {
    reasons.push(PROBLEM_VIOLATION_LABELS[violation.rule]);
  }
  for (const flag of validation.flags) {
    reasons.push(FLAG_LABELS[flag.rule]);
  }
  for (const flag of validation.problemFlags) {
    reasons.push(PROBLEM_FLAG_LABELS[flag.rule]);
  }
  if (validation.historyFlag === 'pb-jump') {
    reasons.push('Far above your usual range');
  }
  return reasons;
}

/** Strip a DB row to the dashboard shape. */
export function projectGame(row: GameRow): MeGame {
  return {
    clientGameId: row.client_game_id,
    playedAt: row.played_at,
    fingerprint: row.settings_fingerprint,
    duration: row.rankable_duration,
    score: row.server_score,
    status: row.status,
    reasons: reasonsFor(row.validation),
  };
}

/** A personal best at one duration, with how many accepted games back it. */
export interface PersonalBest {
  readonly duration: RankableDuration;
  readonly best: number;
  readonly count: number;
}

const DURATION_ORDER: readonly RankableDuration[] = [120, 60, 30];

/** Max accepted score per rankable duration, ordered 120/60/30. */
export function personalBests(games: readonly MeGame[]): PersonalBest[] {
  const byDuration = new Map<RankableDuration, { best: number; count: number }>();
  for (const game of games) {
    if (game.status !== 'accepted' || game.duration === null) continue;
    const current = byDuration.get(game.duration);
    if (current === undefined) {
      byDuration.set(game.duration, { best: game.score, count: 1 });
    } else {
      current.best = Math.max(current.best, game.score);
      current.count += 1;
    }
  }
  return DURATION_ORDER.filter((duration) => byDuration.has(duration)).map((duration) => {
    const entry = byDuration.get(duration);
    return { duration, best: entry?.best ?? 0, count: entry?.count ?? 0 };
  });
}

/** The settings fingerprint with the most accepted games (default chart config). */
export function mostPlayedFingerprint(games: readonly MeGame[]): string | null {
  const counts = new Map<string, number>();
  for (const game of games) {
    if (game.status !== 'accepted') continue;
    counts.set(game.fingerprint, (counts.get(game.fingerprint) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [fingerprint, count] of counts) {
    if (count > bestCount) {
      best = fingerprint;
      bestCount = count;
    }
  }
  return best;
}
