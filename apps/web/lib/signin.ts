/**
 * Pure logic for the two-step email-OTP sign-in (email → emailed digit code).
 *
 * The email carries only a code — no links — so university mail filters have
 * nothing to flag (a sender/link domain mismatch is what quarantined the old
 * magic-link emails as phishing). The thin `SignInForm` shell wires these
 * helpers to the browser Supabase client.
 */

/**
 * GoTrue's email OTP length is dashboard-configurable (6-10 digits; newer
 * Supabase projects default to 8). The form accepts the whole range so a
 * dashboard change can never lock users out.
 */
export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 10;

/** Strip everything but digits (users paste "123 456") and cap at the max length. */
export function normaliseCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
}

/** True once the input holds a plausible full code (6-10 digits). */
export function isCompleteCode(code: string): boolean {
  return code.length >= MIN_CODE_LENGTH && code.length <= MAX_CODE_LENGTH && /^\d+$/.test(code);
}

/** The shape of a GoTrue error we map to user-facing copy. */
export interface AuthErrorLike {
  readonly message?: string | undefined;
  readonly status?: number | undefined;
}

/**
 * Map a GoTrue failure to safe, actionable copy. Raw server text is never
 * shown to users (it can leak internals and is useless to them).
 */
export function signInErrorMessage(kind: 'send' | 'verify', error: AuthErrorLike | null): string {
  if (error?.status === 429) {
    return 'Too many attempts — wait a minute, then try again.';
  }
  if (kind === 'send') {
    return 'Could not send the code. Check the address and try again.';
  }
  const message = error?.message ?? '';
  if (/expired|invalid|not found/i.test(message)) {
    return 'That code is wrong or has expired. Check it, or send a new one.';
  }
  return 'Could not verify the code. Please try again.';
}
