import type { GameRecord } from '../schemas.js';
import { recomputeScore } from '../score.js';
import { checkConsistency, type ConsistencyViolation } from './consistency.js';
import { checkHistory, type HistoryContext } from './history.js';
import { checkPhysiology, type PhysiologyFlag } from './physiology.js';

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
 */
export function judge(record: GameRecord, history: HistoryContext): Verdict {
  const recomputed = recomputeScore(record.events);
  const violations = checkConsistency(record, recomputed);
  const flags = checkPhysiology(recomputed);
  const historyFlag = checkHistory(recomputed.score, history);

  const rejected = violations.some((violation) => REJECTING_RULES.has(violation.rule));
  const outcome: ValidationOutcome = rejected
    ? 'rejected'
    : flags.length > 0 || historyFlag !== null
      ? 'quarantined'
      : 'accepted';

  return { outcome, serverScore: recomputed.score, violations, flags, historyFlag };
}
