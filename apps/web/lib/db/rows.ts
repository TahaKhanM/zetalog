import { gameEventSchema } from '@zetalog/shared';
import { z } from 'zod';

/**
 * Zod schemas for every Supabase row this app reads. Rows arrive as untyped
 * JSON from PostgREST; parsing them here is the single trusted boundary
 * (spec §11 — "validate every external boundary"). Column names are
 * snake_case to match the database exactly (W2's contract).
 */

/** The three leaderboard-eligible durations, as stored in `rankable_duration`. */
const rankableDurationSchema = z.union([z.literal(30), z.literal(60), z.literal(120)]);

/** `game_status` enum (W2). `user_removed` is a soft delete — never a hard delete. */
export const gameStatusSchema = z.enum(['accepted', 'quarantined', 'rejected', 'user_removed']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

/** One structural-integrity violation, as recorded by `judge` (mirrors ConsistencyViolation). */
const consistencyViolationSchema = z.object({
  rule: z.enum([
    'non-monotonic-timestamps',
    'exceeds-duration',
    'claimed-score-mismatch',
    'event-anomalies',
  ]),
  detail: z.string(),
});

/** One physiological-plausibility flag, as recorded by `judge` (mirrors PhysiologyFlag). */
const physiologyFlagSchema = z.object({
  rule: z.enum(['answer-floor', 'cadence-uniformity', 'entry-burst']),
  detail: z.string(),
});

/** One hard problem-stream impossibility, as recorded by `judge` (mirrors ProblemViolation). */
const problemViolationSchema = z.object({
  rule: z.enum(['range-nonconforming']),
  detail: z.string(),
});

/** One statistical problem-stream flag, as recorded by `judge` (mirrors ProblemFlag). */
const problemFlagSchema = z.object({
  rule: z.enum(['operation-mix', 'operand-marginal', 'low-entropy', 'problem-switch']),
  detail: z.string(),
});

/**
 * The `validation` jsonb column: the full {@link Verdict} `judge` produced for a
 * game. Parsed back out to render status chips (/me) and flag/violation chips
 * plus reviewer context (/admin). `problemViolations`/`problemFlags` default to
 * empty so rows judged before the W6 checks shipped still parse.
 */
export const storedValidationSchema = z.object({
  outcome: z.enum(['accepted', 'quarantined', 'rejected']),
  serverScore: z.number().int().nonnegative(),
  violations: z.array(consistencyViolationSchema),
  flags: z.array(physiologyFlagSchema),
  historyFlag: z.enum(['pb-jump']).nullable(),
  problemViolations: z.array(problemViolationSchema).default([]),
  problemFlags: z.array(problemFlagSchema).default([]),
});
export type StoredValidation = z.infer<typeof storedValidationSchema>;

/** A row of the `leaderboard_entries` view (W2): one (user, duration) best. */
export const leaderboardEntrySchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
  duration: rankableDurationSchema,
  best_score: z.number().int().nonnegative(),
  games_counted: z.number().int().nonnegative(),
  /** NULL unless the profile's `uni_verified_at` is set (view hides it otherwise). */
  university_name: z.string().nullable(),
  university_slug: z.string().nullable(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

/** A `games` row, including the telemetry event stream and validation verdict. */
export const gameRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  client_game_id: z.uuid(),
  played_at: z.string(),
  received_at: z.string(),
  settings_fingerprint: z.string(),
  rankable_duration: rankableDurationSchema.nullable(),
  claimed_score: z.number().int().nonnegative(),
  server_score: z.number().int().nonnegative(),
  status: gameStatusSchema,
  telemetry: z.array(gameEventSchema),
  validation: storedValidationSchema,
});
export type GameRow = z.infer<typeof gameRowSchema>;

/** A `games` row joined to its owner's display name — the admin queue shape. */
export const adminGameRowSchema = gameRowSchema.extend({
  display_name: z.string().nullable(),
});
export type AdminGameRow = z.infer<typeof adminGameRowSchema>;

/** A `profiles` row. `display_name` is null until the user completes onboarding. */
export const profileRowSchema = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  university_id: z.uuid().nullable(),
  uni_verified_at: z.string().nullable(),
  is_admin: z.boolean(),
  created_at: z.string(),
});
export type ProfileRow = z.infer<typeof profileRowSchema>;

/** A `universities` reference row. */
export const universityRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  domains: z.array(z.string()),
});
export type UniversityRow = z.infer<typeof universityRowSchema>;

/**
 * Parse untyped PostgREST data as an array of rows, validating each element.
 * Throws a zod error (naming the offending element's index, or reporting that
 * the payload was not an array) if anything is malformed — a corrupt boundary
 * should fail loudly, never render partial garbage.
 */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown): T[] {
  return z.array(schema).parse(rows);
}
