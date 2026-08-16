import type { GameRecord } from '../schemas';
import type { RecomputedScore } from '../score';

/** Recorder jitter allowance beyond the configured duration. */
export const DURATION_TOLERANCE_MS = 2000;

/** A structural integrity problem found in a submitted record. */
export interface ConsistencyViolation {
  readonly rule:
    'non-monotonic-timestamps' | 'exceeds-duration' | 'claimed-score-mismatch' | 'event-anomalies';
  readonly detail: string;
}

/**
 * Structural integrity checks over a submitted record. Timestamp and
 * duration violations indicate a fabricated stream and reject outright;
 * a claimed-score mismatch merely records that the page disagreed — the
 * recomputed score is authoritative either way.
 */
export function checkConsistency(
  record: GameRecord,
  recomputed: RecomputedScore,
): readonly ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];

  let previousAt = 0;
  let monotonic = true;
  for (const event of record.events) {
    if (event.at < previousAt) {
      monotonic = false;
      break;
    }
    previousAt = event.at;
  }
  if (!monotonic) {
    violations.push({ rule: 'non-monotonic-timestamps', detail: 'event timestamps decrease' });
  }

  const limitMs = record.settings.durationSeconds * 1000 + DURATION_TOLERANCE_MS;
  const lastEvent = record.events.at(-1);
  if (lastEvent !== undefined && lastEvent.at > limitMs) {
    violations.push({
      rule: 'exceeds-duration',
      detail: `last event at ${String(lastEvent.at)}ms exceeds the ${String(limitMs)}ms window`,
    });
  }

  if (record.claimedScore !== recomputed.score) {
    violations.push({
      rule: 'claimed-score-mismatch',
      detail: `claimed ${String(record.claimedScore)}, recomputed ${String(recomputed.score)}`,
    });
  }

  if (recomputed.anomalies.length > 0) {
    violations.push({
      rule: 'event-anomalies',
      detail: `${String(recomputed.anomalies.length)} event-stream anomalies`,
    });
  }

  return violations;
}
