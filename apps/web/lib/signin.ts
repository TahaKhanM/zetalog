/**
 * Pure logic for the auth forms: emailed-code handling (sign-up confirmation
 * and password recovery) and the GoTrue error → user-copy mapper.
 *
 * Code emails carry only a code — no links — so university mail filters have
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

/** The auth step a GoTrue failure came from (each maps to distinct copy). */
export type AuthErrorKind = 'send' | 'verify' | 'signup' | 'recovery-send' | 'update-password';

/**
 * Map a GoTrue failure to safe, actionable copy. Raw server text is never
 * shown to users (it can leak internals and is useless to them) — and error
 * objects are matched, never logged, so a failure can never leak a password.
 */
export function signInErrorMessage(kind: AuthErrorKind, error: AuthErrorLike | null): string {
  if (error?.status === 429) {
    return 'Too many attempts — wait a minute, then try again.';
  }
  const message = error?.message ?? '';
  switch (kind) {
    case 'send':
      return 'Could not send the code. Check the address and try again.';
    case 'recovery-send':
      return 'Could not send the reset code. Check the address and try again.';
    case 'signup':
      if (/already registered|already exists/i.test(message)) {
        return 'An account with this email already exists — sign in instead.';
      }
      if (/password|weak/i.test(message)) {
        return 'That password is too weak. Use at least 10 characters.';
      }
      return 'Could not create the account. Please try again.';
    case 'update-password':
      if (/different/i.test(message)) {
        return 'Choose a password different from your old one.';
      }
      if (/password|weak/i.test(message)) {
        return 'That password is too weak. Use at least 10 characters.';
      }
      return 'Could not set the password. Please try again.';
    case 'verify':
      if (/expired|invalid|not found/i.test(message)) {
        return 'That code is wrong or has expired. Check it, or send a new one.';
      }
      return 'Could not verify the code. Please try again.';
  }
}
