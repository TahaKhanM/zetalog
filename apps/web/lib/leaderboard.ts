import { RANKABLE_DURATIONS, type RankableDuration } from '@zetalog/shared';

/** The default leaderboard duration when `?d=` is missing or invalid (spec §6). */
export const DEFAULT_DURATION: RankableDuration = 120;

/**
 * Resolve the `?d=` search param to a rankable duration, falling back to 120.
 * Accepts the raw Next.js searchParams value (string, repeated, or undefined).
 */
export function parseDuration(value: string | string[] | undefined): RankableDuration {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return RANKABLE_DURATIONS.find((duration) => duration === parsed) ?? DEFAULT_DURATION;
}
