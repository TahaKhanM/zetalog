import type { GameRecord } from '../schemas';
import { recomputeScore } from '../score';
import { checkConsistency, type ConsistencyViolation } from './consistency';
import { checkHistory, type HistoryContext } from './history';
import { checkPhysiology, type PhysiologyFlag } from './physiology';
import { checkProblems, type ProblemFlag, type ProblemViolation } from './problems';

/** The three outcomes a submitted game can be judged to. */
export type ValidationOutcome = 'accepted' | 'quarantined' | 'rejected';

/** The complete result of judging one submission (spec §5). */
export interface Verdict {
  readonly outcome: ValidationOutcome;
  /** The recomputed score — the only score that ever ranks. */
  readonly serverScore: number;
  readonly violations: readonly ConsistencyViolation[];
  readonly flags: readonly PhysiologyFlag[];
  readonly historyFlag: 'pb-jump' | null;
  /** Hard problem-stream impossibilities (W6): any one rejects, like a bad timestamp. */
  readonly problemViolations: readonly ProblemViolation[];
  /** Statistical problem-stream implausibilities (W6): grounds for quarantine. */
  readonly problemFlags: readonly ProblemFlag[];
}

/** Violations that indicate a fabricated stream and reject outright. */
const REJECTING_RULES: ReadonlySet<ConsistencyViolation['rule']> = new Set([
  'non-monotonic-timestamps',
  'exceeds-duration',
]);

/**
 * The full validation pipeline: recompute, then structural, physiological,
 * and historical checks. Pure — the server supplies history from the
 * database; the extension may call it with local history to pre-flag.
 *
 * Outcome policy: fabrication evidence rejects; plausibility doubts
 * quarantine for human review; everything else is accepted. A
 * claimed-score mismatch alone does not reject because the recomputed
 * score is authoritative regardless of what the page displayed.
 *
 * The W6 problem-stream checks slot into the same policy: a hard range
 * violation is an impossible stream (reject); an operation-mix, entropy, or
 * problem-switch flag is a plausibility doubt (quarantine).
 */
export function judge(record: GameRecord, history: HistoryContext): Verdict {
  const recomputed = recomputeScore(record.events);
  const violations = checkConsistency(record, recomputed);
  const flags = checkPhysiology(recomputed);
  const historyFlag = checkHistory(recomputed.score, history);
  const { violations: problemViolations, flags: problemFlags } = checkProblems(record, recomputed);

  const rejected =
    violations.some((violation) => REJECTING_RULES.has(violation.rule)) ||
    problemViolations.length > 0;
  const outcome: ValidationOutcome = rejected
    ? 'rejected'
    : flags.length > 0 || historyFlag !== null || problemFlags.length > 0
      ? 'quarantined'
      : 'accepted';

  return {
    outcome,
    serverScore: recomputed.score,
    violations,
    flags,
    historyFlag,
    problemViolations,
    problemFlags,
  };
}
