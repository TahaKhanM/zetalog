import { z } from 'zod';

/** Monotonic per-game timestamp in milliseconds (from `performance.now()`), never negative. */
export const MAX_GAME_DURATION_SECONDS = 3600;
export const MAX_GAME_EVENTS = 20_000;
export const MAX_PROBLEM_TEXT_LENGTH = 128;
export const MAX_PLAYED_MS = (MAX_GAME_DURATION_SECONDS + 60) * 1000;
export const MAX_OPERAND_ABS = 1_000_000;

const timestampMs = z.number().nonnegative().max(MAX_PLAYED_MS);

/** Inclusive operand range as configured on the Zetamac settings form. */
export const operandRangeSchema = z
  .object({
    min: z.number().int().min(-MAX_OPERAND_ABS).max(MAX_OPERAND_ABS),
    max: z.number().int().min(-MAX_OPERAND_ABS).max(MAX_OPERAND_ABS),
  })
  .refine((range) => range.min <= range.max, { message: 'min must not exceed max' });

/**
 * A full Zetamac configuration. Subtraction and division have no ranges of
 * their own on Zetamac — they are the reverses of addition and multiplication.
 */
export const zetamacSettingsSchema = z.object({
  addEnabled: z.boolean(),
  addLeft: operandRangeSchema,
  addRight: operandRangeSchema,
  subEnabled: z.boolean(),
  mulEnabled: z.boolean(),
  mulLeft: operandRangeSchema,
  mulRight: operandRangeSchema,
  divEnabled: z.boolean(),
  durationSeconds: z.number().int().positive().max(MAX_GAME_DURATION_SECONDS),
});

/**
 * One recorder observation. `problem` = a new problem was displayed;
 * `input` = the answer box changed (full value snapshot, as Zetamac's own
 * log records it); `accepted` = Zetamac auto-advanced because the typed
 * answer was correct.
 */
export const gameEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('problem'),
    at: timestampMs,
    text: z.string().min(1).max(MAX_PROBLEM_TEXT_LENGTH),
  }),
  z.object({ kind: z.literal('input'), at: timestampMs, value: z.string().max(12) }),
  z.object({ kind: z.literal('accepted'), at: timestampMs, answer: z.number().int() }),
]);

/** Optional online binding. Offline games deliberately remain schema-valid. */
export const gameEvidenceSchema = z.object({
  challengeId: z.uuid(),
  nonce: z.string().min(16).max(128),
});

/**
 * A complete recorded game — the unit the extension stores locally and
 * submits for validation. `claimedScore` is what the page displayed; the
 * server never trusts it.
 */
export const gameRecordSchema = z.object({
  id: z.uuid(),
  startedAtMs: z.number().int().nonnegative(),
  playedMs: z.number().nonnegative().max(MAX_PLAYED_MS),
  settings: zetamacSettingsSchema,
  events: z.array(gameEventSchema).max(MAX_GAME_EVENTS),
  claimedScore: z.number().int().nonnegative().max(MAX_GAME_EVENTS),
  evidence: gameEvidenceSchema.optional(),
});

/** An inclusive min/max operand bound, inferred from operandRangeSchema. */
export type OperandRange = z.infer<typeof operandRangeSchema>;
/** A full Zetamac configuration, inferred from zetamacSettingsSchema. */
export type ZetamacSettings = z.infer<typeof zetamacSettingsSchema>;
/** One recorder observation, inferred from gameEventSchema. */
export type GameEvent = z.infer<typeof gameEventSchema>;
/** A complete recorded game, inferred from gameRecordSchema. */
export type GameRecord = z.infer<typeof gameRecordSchema>;
export type GameEvidence = z.infer<typeof gameEvidenceSchema>;
