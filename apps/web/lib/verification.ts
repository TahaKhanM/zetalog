import { sha256Hex, timingSafeEqualHex } from './hash';

/**
 * Pure uni-email verification logic (spec §7). Time and randomness are
 * injected, so every path is deterministic under test; the route supplies
 * `crypto.randomInt` and the wall clock. Only the SHA-256 of a code is ever
 * stored — the plaintext lives only in the email.
 */

/** Codes expire 15 minutes after issue. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/** A verification is locked after this many failed confirm attempts. */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/** The exclusive upper bound of the six-digit code space. */
const CODE_SPACE = 1_000_000;

/** Draws a non-negative integer in `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

/**
 * A fresh six-digit code, zero-padded so every value in 000000–999999 is
 * equally likely. `random` must be uniform over `[0, maxExclusive)`
 * (`crypto.randomInt` in production).
 */
export function generateCode(random: RandomInt): string {
  return String(random(CODE_SPACE)).padStart(6, '0');
}

/** The hash to persist for a code — never store the code itself. */
export function hashCode(code: string): string {
  return sha256Hex(code);
}

/** The absolute expiry instant (ms) for a code issued at `issuedAtMs`. */
export function expiresAtMs(issuedAtMs: number): number {
  return issuedAtMs + CODE_TTL_MS;
}

/** Everything needed to adjudicate one confirm attempt. */
export interface VerifyInput {
  readonly submittedCode: string;
  readonly storedHash: string;
  readonly expiresAtMs: number;
  /** Failed attempts so far, before this one. */
  readonly attempts: number;
  readonly nowMs: number;
}

/** The outcome of a confirm attempt. */
export type VerifyOutcome =
  | { readonly status: 'ok' }
  | { readonly status: 'incorrect'; readonly attemptsRemaining: number }
  | { readonly status: 'expired' }
  | { readonly status: 'locked' };

/**
 * Adjudicate a confirm attempt. Expiry is checked first (an expired code is
 * unusable regardless of attempts), then the attempt cap, then a constant-time
 * hash comparison. On a wrong code, `attemptsRemaining` counts this attempt and
 * never goes negative.
 */
export function verifyCode(input: VerifyInput): VerifyOutcome {
  if (input.nowMs > input.expiresAtMs) return { status: 'expired' };
  if (input.attempts >= MAX_VERIFICATION_ATTEMPTS) return { status: 'locked' };
  if (timingSafeEqualHex(hashCode(input.submittedCode), input.storedHash)) {
    return { status: 'ok' };
  }
  return {
    status: 'incorrect',
    attemptsRemaining: Math.max(0, MAX_VERIFICATION_ATTEMPTS - (input.attempts + 1)),
  };
}
