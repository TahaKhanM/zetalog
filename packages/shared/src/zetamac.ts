import type { OperandRange, ZetamacSettings } from './schemas';

/** Durations (seconds) whose default-config games rank on leaderboards (spec §1). */
export const RANKABLE_DURATIONS = [30, 60, 120] as const;

/** One of the leaderboard-eligible game durations in seconds: 30, 60, or 120. */
export type RankableDuration = (typeof RANKABLE_DURATIONS)[number];

/**
 * The exact configuration Zetamac's settings form ships with.
 * Verified against https://arithmetic.zetamac.com/ on 2026-07-20; Plan 2's
 * recon task re-verifies against a saved DOM fixture.
 */
export const ZETAMAC_DEFAULT_SETTINGS: ZetamacSettings = {
  addEnabled: true,
  addLeft: { min: 2, max: 100 },
  addRight: { min: 2, max: 100 },
  subEnabled: true,
  mulEnabled: true,
  mulLeft: { min: 2, max: 12 },
  mulRight: { min: 2, max: 100 },
  divEnabled: true,
  durationSeconds: 120,
};

const range = (r: OperandRange): string => `${String(r.min)}-${String(r.max)}`;

/**
 * Canonical, human-readable key for a settings configuration. Games are
 * grouped by fingerprint in history and graphs. Ranges of disabled
 * operations do not contribute (Zetamac ignores them too).
 */
export function fingerprint(settings: ZetamacSettings): string {
  return [
    settings.addEnabled ? `add:${range(settings.addLeft)}x${range(settings.addRight)}` : 'add:off',
    settings.subEnabled ? 'sub:on' : 'sub:off',
    settings.mulEnabled ? `mul:${range(settings.mulLeft)}x${range(settings.mulRight)}` : 'mul:off',
    settings.divEnabled ? 'div:on' : 'div:off',
    `t:${String(settings.durationSeconds)}`,
  ].join('|');
}

/**
 * The leaderboard duration this game qualifies for, or null if any
 * operation/range differs from Zetamac defaults or the duration is not
 * 30/60/120 (spec §3.1).
 */
export function rankableDuration(settings: ZetamacSettings): RankableDuration | null {
  const atDefaultDuration = {
    ...settings,
    durationSeconds: ZETAMAC_DEFAULT_SETTINGS.durationSeconds,
  };
  if (fingerprint(atDefaultDuration) !== fingerprint(ZETAMAC_DEFAULT_SETTINGS)) return null;
  const matched = RANKABLE_DURATIONS.find((duration) => duration === settings.durationSeconds);
  return matched ?? null;
}
