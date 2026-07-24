import type { RecomputedScore } from '../score';

/** Below this per-problem solve time we consider the answer super-human. */
export const MIN_HUMAN_SOLVE_MS = 250;

/** Flag when at least this fraction of solved problems beat {@link MIN_HUMAN_SOLVE_MS}. */
export const FAST_SOLVE_FLAG_FRACTION = 0.3;

/** Cadence analysis needs at least this many inter-input intervals to be meaningful. */
export const MIN_INPUTS_FOR_CADENCE = 30;

/** Human typing shows a coefficient of variation well above this; scripts do not. */
export const MIN_CADENCE_VARIATION = 0.12;

/** A physiological-plausibility concern raised about a recomputed game. */
export interface PhysiologyFlag {
  readonly rule: 'answer-floor' | 'cadence-uniformity' | 'entry-burst';
  readonly detail: string;
}

/** Standard deviation divided by mean; zero for constant or zero-mean series. */
export function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Physiological plausibility screening. Flags are grounds for quarantine
 * and human review — never automatic rejection, because exceptional humans
 * exist.
 */
export function checkPhysiology(recomputed: RecomputedScore): readonly PhysiologyFlag[] {
  const flags: PhysiologyFlag[] = [];

  const solved = recomputed.outcomes.filter((outcome) => outcome.verified);
  if (solved.length > 0) {
    const fast = solved.filter((outcome) => outcome.solveMs < MIN_HUMAN_SOLVE_MS).length;
    if (fast / solved.length >= FAST_SOLVE_FLAG_FRACTION) {
      flags.push({
        rule: 'answer-floor',
        detail: `${String(fast)}/${String(solved.length)} problems solved faster than ${String(MIN_HUMAN_SOLVE_MS)}ms`,
      });
    }
  }

  const intervals = recomputed.inputIntervalsMs;
  if (intervals.length >= MIN_INPUTS_FOR_CADENCE) {
    const variation = coefficientOfVariation(intervals);
    if (variation < MIN_CADENCE_VARIATION) {
      flags.push({
        rule: 'cadence-uniformity',
        detail: `inter-input coefficient of variation ${variation.toFixed(4)} over ${String(intervals.length)} intervals`,
      });
    }
  }

  if (recomputed.entryBursts > 0) {
    flags.push({
      rule: 'entry-burst',
      detail: `${String(recomputed.entryBursts)} paste-like input bursts`,
    });
  }

  return flags;
}
