import { parseProblem, solve, type Operator, type Problem } from './problems';
import { median } from './quarantine';
import type { GameEvent } from './schemas';

/**
 * Per-problem practice analysis over recorded event streams: where time goes
 * by operation, which times tables drag, which skills (carrying, borrowing,
 * big tables) run slow, and the individual problems that took longest.
 *
 * Pure functions over telemetry — no I/O, no clocks. Only VERIFIED
 * solves participate: an unverified accept says nothing about skill.
 */

/** One verified solve: the parsed problem plus how the player got there. */
export interface SolvedProblem {
  /** The problem text as displayed (e.g. "84 ÷ 12"). */
  readonly text: string;
  readonly problem: Problem;
  readonly answer: number;
  /** Time from the problem appearing to the answer being accepted. */
  readonly solveMs: number;
  /** Backspace-like edits while typing (value snapshots that shrank). */
  readonly corrections: number;
}

/**
 * Extract every verified solve from an event stream, mirroring
 * `recomputeScore`'s verification rule (final input equals the true answer and
 * the reported answer agrees). Unparseable problems, mismatched answers, and
 * orphan accepts are skipped — they carry no skill signal.
 */
export function solvedProblems(events: readonly GameEvent[]): SolvedProblem[] {
  const solved: SolvedProblem[] = [];
  let current: { readonly text: string; readonly at: number } | null = null;
  let lastValue = '';
  let corrections = 0;

  for (const event of events) {
    switch (event.kind) {
      case 'problem': {
        current = { text: event.text, at: event.at };
        lastValue = '';
        corrections = 0;
        break;
      }
      case 'input': {
        if (event.value.length < lastValue.length) corrections += 1;
        lastValue = event.value;
        break;
      }
      case 'accepted': {
        if (current !== null) {
          const parsed = parseProblem(current.text);
          if (parsed.ok) {
            const answer = solve(parsed.value);
            if (lastValue.trim() === String(answer) && event.answer === answer) {
              solved.push({
                text: current.text,
                problem: parsed.value,
                answer,
                solveMs: event.at - current.at,
                corrections,
              });
            }
          }
        }
        current = null;
        lastValue = '';
        corrections = 0;
        break;
      }
    }
  }
  return solved;
}

/** Aggregate speed for one operation. */
export interface OperationStat {
  readonly op: Operator;
  readonly solved: number;
  readonly medianSolveMs: number;
  readonly totalMs: number;
}

const OPERATOR_ORDER: readonly Operator[] = ['+', '-', '*', '/'];

/** Solve-time aggregates per operation, in canonical + − × ÷ order. */
export function operationStats(problems: readonly SolvedProblem[]): OperationStat[] {
  const byOp = new Map<Operator, number[]>();
  for (const solvedProblem of problems) {
    const times = byOp.get(solvedProblem.problem.op) ?? [];
    times.push(solvedProblem.solveMs);
    byOp.set(solvedProblem.problem.op, times);
  }
  return [...byOp.entries()]
    .sort(([a], [b]) => OPERATOR_ORDER.indexOf(a) - OPERATOR_ORDER.indexOf(b))
    .map(([op, times]) => ({
      op,
      solved: times.length,
      medianSolveMs: median(times),
      totalMs: times.reduce((sum, time) => sum + time, 0),
    }));
}

/** Aggregate speed for one times-table fact family (×N or ÷N). */
export interface FactStat {
  readonly op: '*' | '/';
  /** The table: multiplication's small left factor, division's divisor. */
  readonly factor: number;
  readonly solved: number;
  readonly medianSolveMs: number;
}

/**
 * Times-table breakdown: multiplication grouped by its left factor (Zetamac
 * draws the small factor on the left), division by its divisor. Addition and
 * subtraction have no table structure and are excluded.
 */
export function factStats(problems: readonly SolvedProblem[]): FactStat[] {
  const groups = new Map<string, { op: '*' | '/'; factor: number; times: number[] }>();
  for (const solvedProblem of problems) {
    const { op, left, right } = solvedProblem.problem;
    if (op !== '*' && op !== '/') continue;
    const factor = op === '*' ? left : right;
    const key = `${op}:${String(factor)}`;
    const group = groups.get(key) ?? { op, factor, times: [] };
    group.times.push(solvedProblem.solveMs);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.op === b.op ? a.factor - b.factor : a.op === '*' ? -1 : 1))
    .map((group) => ({
      op: group.op,
      factor: group.factor,
      solved: group.times.length,
      medianSolveMs: median(group.times),
    }));
}

/** A named skill area with its solve count and median time. */
export interface SkillBucket {
  readonly key:
    | 'add-plain'
    | 'add-carry'
    | 'sub-plain'
    | 'sub-borrow'
    | 'mul-small'
    | 'mul-large'
    | 'div-small'
    | 'div-large';
  readonly label: string;
  readonly solved: number;
  readonly medianSolveMs: number;
}

const BUCKET_LABELS: Record<SkillBucket['key'], string> = {
  'add-plain': 'Addition, no carry',
  'add-carry': 'Addition with carrying',
  'sub-plain': 'Subtraction, no borrow',
  'sub-borrow': 'Subtraction with borrowing',
  'mul-small': '× by 2–6',
  'mul-large': '× by 7–12',
  'div-small': '÷ by 2–6',
  'div-large': '÷ by 7–12',
};

const BUCKET_ORDER: readonly SkillBucket['key'][] = [
  'add-plain',
  'add-carry',
  'sub-plain',
  'sub-borrow',
  'mul-small',
  'mul-large',
  'div-small',
  'div-large',
];

/** The skill bucket a single problem belongs to. */
function bucketOf(problem: Problem): SkillBucket['key'] {
  switch (problem.op) {
    case '+':
      return (problem.left % 10) + (problem.right % 10) >= 10 ? 'add-carry' : 'add-plain';
    case '-':
      return problem.left % 10 < problem.right % 10 ? 'sub-borrow' : 'sub-plain';
    case '*':
      return problem.left >= 7 ? 'mul-large' : 'mul-small';
    case '/':
      return problem.right >= 7 ? 'div-large' : 'div-small';
  }
}

/**
 * Classify solves into named skill areas: carrying, borrowing, and small vs
 * large times tables. Buckets with no solves are omitted.
 */
export function skillBuckets(problems: readonly SolvedProblem[]): SkillBucket[] {
  const byKey = new Map<SkillBucket['key'], number[]>();
  for (const solvedProblem of problems) {
    const key = bucketOf(solvedProblem.problem);
    const times = byKey.get(key) ?? [];
    times.push(solvedProblem.solveMs);
    byKey.set(key, times);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => BUCKET_ORDER.indexOf(a) - BUCKET_ORDER.indexOf(b))
    .map(([key, times]) => ({
      key,
      label: BUCKET_LABELS[key],
      solved: times.length,
      medianSolveMs: median(times),
    }));
}

/**
 * The slowest skill areas, slowest first, considering only buckets with at
 * least `minSolved` solves (small samples make noisy verdicts).
 */
export function weakestBuckets(
  buckets: readonly SkillBucket[],
  minSolved: number,
  limit: number,
): SkillBucket[] {
  return buckets
    .filter((bucket) => bucket.solved >= minSolved)
    .sort((a, b) => b.medianSolveMs - a.medianSolveMs)
    .slice(0, limit);
}

/** One individual slow solve, for the "toughest problems" list. */
export interface SlowestSolve {
  readonly text: string;
  readonly op: Operator;
  readonly solveMs: number;
  readonly corrections: number;
}

/** The `limit` slowest individual solves, slowest first. */
export function slowestSolves(problems: readonly SolvedProblem[], limit: number): SlowestSolve[] {
  return [...problems]
    .sort((a, b) => b.solveMs - a.solveMs)
    .slice(0, limit)
    .map((solvedProblem) => ({
      text: solvedProblem.text,
      op: solvedProblem.problem.op,
      solveMs: solvedProblem.solveMs,
      corrections: solvedProblem.corrections,
    }));
}
