import { z } from 'zod';

/** Monotonic per-game timestamp in milliseconds (from `performance.now()`), never negative. */
const timestampMs = z.number().nonnegative();

/** Inclusive operand range as configured on the Zetamac settings form. */
export const operandRangeSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
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
  durationSeconds: z.number().int().positive(),
});

/**
 * One recorder observation. `problem` = a new problem was displayed;
 * `input` = the answer box changed (full value snapshot, as Zetamac's own
 * log records it); `accepted` = Zetamac auto-advanced because the typed
 * answer was correct.
 */
export const gameEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('problem'), at: timestampMs, text: z.string().min(1) }),
  z.object({ kind: z.literal('input'), at: timestampMs, value: z.string().max(12) }),
  z.object({ kind: z.literal('accepted'), at: timestampMs, answer: z.number().int() }),
]);

/**
 * A complete recorded game — the unit the extension stores locally and
 * submits for validation. `claimedScore` is what the page displayed; the
 * server never trusts it (spec §5).
 */
export const gameRecordSchema = z.object({
  id: z.uuid(),
  startedAtMs: z.number().int().nonnegative(),
  playedMs: z.number().nonnegative(),
  settings: zetamacSettingsSchema,
  events: z.array(gameEventSchema),
  claimedScore: z.number().int().nonnegative(),
});

export type OperandRange = z.infer<typeof operandRangeSchema>;
export type ZetamacSettings = z.infer<typeof zetamacSettingsSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameRecord = z.infer<typeof gameRecordSchema>;
