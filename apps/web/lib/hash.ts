import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Cryptographic helpers shared by the email logger (recipient hashing) and the
 * uni-verification module (code hashing + constant-time comparison). Pure and
 * deterministic — no injection needed.
 */

/** Lowercase hex SHA-256 digest of a UTF-8 string. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex strings. Returns false (rather than
 * throwing) when lengths differ, so callers can compare a stored hash against
 * an attacker-controlled one without leaking length or timing.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
