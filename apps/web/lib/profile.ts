import { z } from 'zod';

/**
 * Display-name rules, mirroring the `profiles.display_name` CHECK constraint
 * (W2): 3–20 characters drawn from letters, digits, underscore, and spaces,
 * with no leading or trailing space. Uniqueness is enforced by the database
 * (citext unique) and surfaced as a 409 by the profile route.
 */
export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_ ]{3,20}$/;

/** True iff `name` satisfies the display-name constraint. */
export function isValidDisplayName(name: string): boolean {
  return DISPLAY_NAME_PATTERN.test(name) && name.trim() === name;
}

/** Zod schema for a display name — the trimmed, constraint-satisfying string. */
export const displayNameSchema = z.string().refine(isValidDisplayName, {
  message: '3–20 characters: letters, digits, underscores, and spaces (no leading/trailing space).',
});
