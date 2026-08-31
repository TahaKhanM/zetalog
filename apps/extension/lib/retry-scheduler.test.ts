import { describe, expect, it } from 'vitest';

import { MIN_ALARM_DELAY_MS, REVOCATION_RETRY_MS, nextRetryAlarmAt } from './retry-scheduler.js';

const NOW = 1_000_000;

function entry(nextAttemptAtMs: number) {
  return { clientGameId: 'game-1', kind: 'submit' as const, attempts: 1, nextAttemptAtMs };
}

describe('nextRetryAlarmAt', () => {
  it('keeps an idle, unlinked worker asleep', () => {
    expect(
      nextRetryAlarmAt({ nowMs: NOW, linked: false, queue: [], pendingRevocations: 0 }),
    ).toBeNull();
    expect(
      nextRetryAlarmAt({
        nowMs: NOW,
        linked: false,
        queue: [entry(NOW + 20_000)],
        pendingRevocations: 0,
      }),
    ).toBeNull();
  });

  it('schedules the earliest linked queue entry without a tight alarm loop', () => {
    expect(
      nextRetryAlarmAt({
        nowMs: NOW,
        linked: true,
        queue: [entry(NOW + 20_000), entry(NOW - 5_000)],
        pendingRevocations: 0,
      }),
    ).toBe(NOW + MIN_ALARM_DELAY_MS);
    expect(
      nextRetryAlarmAt({
        nowMs: NOW,
        linked: true,
        queue: [entry(NOW + 120_000), entry(NOW + 90_000)],
        pendingRevocations: 0,
      }),
    ).toBe(NOW + 90_000);
  });

  it('keeps offline unlink revocation alive and lets it beat a later game retry', () => {
    expect(nextRetryAlarmAt({ nowMs: NOW, linked: false, queue: [], pendingRevocations: 1 })).toBe(
      NOW + REVOCATION_RETRY_MS,
    );
    expect(
      nextRetryAlarmAt({
        nowMs: NOW,
        linked: true,
        queue: [entry(NOW + 2 * REVOCATION_RETRY_MS)],
        pendingRevocations: 1,
      }),
    ).toBe(NOW + REVOCATION_RETRY_MS);
  });
});
