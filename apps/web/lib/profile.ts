import { z } from 'zod';

/**
 * Display-name rules, mirroring the `profiles.display_name` CHECK constraint
 *: 3–15 characters drawn from letters, digits, and
 * underscore — no spaces, so names read as handles and can never collide on
 * invisible whitespace. Uniqueness is enforced by the database (citext unique)
 * and surfaced as a 409 by the profile route. Legacy spaced names were
 * conformed by the backfill migration, so the CHECK is fully validated.
 */
export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_]{3,15}$/;

/** True iff `name` satisfies the display-name constraint. */
export function isValidDisplayName(name: string): boolean {
  return DISPLAY_NAME_PATTERN.test(name);
}

/** Zod schema for a display name — the constraint-satisfying handle. */
export const displayNameSchema = z.string().refine(isValidDisplayName, {
  message: '3–15 characters: letters, digits, and underscores.',
});
