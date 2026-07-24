/** The PB-jump rule needs this many accepted games before it activates. */
export const PB_JUMP_MIN_HISTORY = 10;

/** A new score may exceed the personal best by this many points... */
export const PB_JUMP_ABSOLUTE_MARGIN = 15;

/** ...or by this fraction of the personal best, whichever is larger. */
export const PB_JUMP_RELATIVE_MARGIN = 0.25;

/** The user's accepted scores at the same rankable duration. */
export interface HistoryContext {
  readonly acceptedScores: readonly number[];
}

/**
 * Statistical smell test: a score massively above everything the user has
 * ever posted goes to human review rather than auto-accepting.
 */
export function checkHistory(score: number, context: HistoryContext): 'pb-jump' | null {
  if (context.acceptedScores.length < PB_JUMP_MIN_HISTORY) return null;
  const best = Math.max(...context.acceptedScores);
  const margin = Math.max(PB_JUMP_ABSOLUTE_MARGIN, PB_JUMP_RELATIVE_MARGIN * best);
  return score > best + margin ? 'pb-jump' : null;
}
