import type { SyncEntry } from './sync.js';

/** Retry an offline credential revocation after one minute. */
export const REVOCATION_RETRY_MS = 60_000;
/** Chrome 116–119 enforce a one-minute minimum alarm delay. */
export const MIN_ALARM_DELAY_MS = 60_000;

export interface RetryScheduleInput {
  readonly nowMs: number;
  readonly linked: boolean;
  readonly queue: readonly SyncEntry[];
  readonly pendingRevocations: number;
}

/**
 * Derive the next one-shot worker wakeup from durable work. Signed-out game
 * entries wait for the next link, while credential revocations continue even
 * after the local session has been forgotten.
 */
export function nextRetryAlarmAt(input: RetryScheduleInput): number | null {
  const candidates: number[] = [];
  if (input.linked) {
    for (const entry of input.queue) candidates.push(entry.nextAttemptAtMs);
  }
  if (input.pendingRevocations > 0) {
    candidates.push(input.nowMs + REVOCATION_RETRY_MS);
  }
  if (candidates.length === 0) return null;
  return Math.max(Math.min(...candidates), input.nowMs + MIN_ALARM_DELAY_MS);
}
