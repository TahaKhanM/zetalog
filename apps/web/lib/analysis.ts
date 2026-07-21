import {
  factStats,
  operationStats,
  skillBuckets,
  slowestSolves,
  solvedProblems,
  weakestBuckets,
  type SkillBucket,
  type SolvedProblem,
} from '@zetalog/shared';

import type { GameRow } from './db/rows';

/**
 * The `/me` in-depth analysis view-model: pooled per-problem statistics over
 * the user's ACCEPTED games' telemetry. Pure projection — times stay in ms and
 * are formatted at render.
 */

/** Weak-spot verdicts need at least this many solves in a skill area. */
export const WEAK_SPOT_MIN_SOLVED = 8;

/** How many weak spots and toughest problems the dashboard names. */
const WEAK_SPOT_LIMIT = 2;
const TOUGHEST_LIMIT = 6;

const OP_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' } as const;

export interface AnalysisOp {
  readonly op: keyof typeof OP_SYMBOLS;
  /** Display glyph (true minus/multiply signs, not ASCII). */
  readonly symbol: string;
  readonly solved: number;
  readonly medianMs: number;
  /** This operation's share of total solve time, 0..1. */
  readonly share: number;
}

export interface AnalysisWeakSpot {
  readonly key: SkillBucket['key'];
  readonly label: string;
  readonly solved: number;
  readonly medianMs: number;
  /** How many times slower than the user's fastest well-sampled skill area. */
  readonly ratio: number;
}

export interface AnalysisTough {
  readonly text: string;
  readonly solveMs: number;
  readonly corrections: number;
}

export interface Analysis {
  readonly gamesAnalysed: number;
  readonly problemsAnalysed: number;
  readonly ops: readonly AnalysisOp[];
  readonly facts: readonly {
    readonly op: '*' | '/';
    readonly factor: number;
    readonly solved: number;
    readonly medianMs: number;
  }[];
  readonly weakSpots: readonly AnalysisWeakSpot[];
  readonly toughest: readonly AnalysisTough[];
}

/**
 * Build the analysis over the accepted games' telemetry; null when there is
 * nothing to analyse (no accepted games, or none with verified solves).
 */
export function buildAnalysis(rows: readonly GameRow[]): Analysis | null {
  const accepted = rows.filter((gameRow) => gameRow.status === 'accepted');
  const solved: SolvedProblem[] = accepted.flatMap((gameRow) => solvedProblems(gameRow.telemetry));
  if (solved.length === 0) return null;

  const ops = operationStats(solved);
  const totalMs = ops.reduce((sum, stat) => sum + stat.totalMs, 0);

  const buckets = skillBuckets(solved);
  const sampled = buckets.filter((bucket) => bucket.solved >= WEAK_SPOT_MIN_SOLVED);
  const fastest = sampled.reduce(
    (best, bucket) => Math.min(best, bucket.medianSolveMs),
    Number.POSITIVE_INFINITY,
  );
  const weakSpots = weakestBuckets(buckets, WEAK_SPOT_MIN_SOLVED, WEAK_SPOT_LIMIT).map(
    (bucket) => ({
      key: bucket.key,
      label: bucket.label,
      solved: bucket.solved,
      medianMs: bucket.medianSolveMs,
      ratio: fastest > 0 ? bucket.medianSolveMs / fastest : 1,
    }),
  );

  return {
    gamesAnalysed: accepted.length,
    problemsAnalysed: solved.length,
    ops: ops.map((stat) => ({
      op: stat.op,
      symbol: OP_SYMBOLS[stat.op],
      solved: stat.solved,
      medianMs: stat.medianSolveMs,
      share: totalMs > 0 ? stat.totalMs / totalMs : 0,
    })),
    facts: factStats(solved).map((fact) => ({
      op: fact.op,
      factor: fact.factor,
      solved: fact.solved,
      medianMs: fact.medianSolveMs,
    })),
    weakSpots,
    toughest: slowestSolves(solved, TOUGHEST_LIMIT).map((slow) => ({
      text: slow.text,
      solveMs: slow.solveMs,
      corrections: slow.corrections,
    })),
  };
}
