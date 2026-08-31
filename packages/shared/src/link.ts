import { z } from 'zod';

/** Safe failure codes produced by the extension-owned account-link flow. */
export const linkErrorSchema = z.enum([
  'identity-unavailable',
  'extension-not-enabled',
  'network',
  'server',
  'cancelled',
  'identity-failed',
  'invalid-callback',
  'exchange-failed',
]);
export type LinkError = z.infer<typeof linkErrorSchema>;

/** Every failure the extension may expose to one of its user interfaces. */
export const linkFailureSchema = z.union([linkErrorSchema, z.literal('internal')]);
export type LinkFailure = z.infer<typeof linkFailureSchema>;

/**
 * One copy contract for the popup and website handoff. Messages explain the
 * next useful action without exposing raw browser, network, or server details.
 */
export const LINK_FAILURE_MESSAGES: Readonly<Record<LinkFailure, string>> = {
  'identity-unavailable': 'Chrome could not start secure sign-in. Restart Chrome and try again.',
  'extension-not-enabled':
    'This Chrome Web Store release is not enabled on ZetaLog yet. Update the extension or contact support.',
  network: 'ZetaLog could not be reached. Check your connection, then try again.',
  server: 'ZetaLog sign-in is temporarily unavailable. Your recorded scores are safe.',
  cancelled: 'Secure sign-in was cancelled. You can safely try again.',
  'identity-failed':
    'Chrome could not complete secure sign-in. Close the sign-in window and try again.',
  'invalid-callback':
    'Chrome returned an invalid sign-in response. Update the extension and try again.',
  'exchange-failed': 'Secure sign-in expired or could not be completed. Try again.',
  internal:
    'The extension could not finish linking. Restart Chrome and try again; your scores are safe.',
};

/** Treat an unrecognised page/background value as the safe internal failure. */
export function normalizeLinkFailure(value: unknown): LinkFailure {
  const parsed = linkFailureSchema.safeParse(value);
  return parsed.success ? parsed.data : 'internal';
}

/** Resolve untrusted failure input to the shared, user-facing copy. */
export function linkFailureMessage(value: unknown): string {
  return LINK_FAILURE_MESSAGES[normalizeLinkFailure(value)];
}
