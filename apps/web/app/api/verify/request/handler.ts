import { z } from 'zod';

import { adjudicateAliasClaim, type IdentifierMatch } from '@/lib/auth-modes';
import type { SendResult } from '@/lib/email/types';
import { apiError, apiJson, readJsonBody } from '@/lib/http';
import { findUniversityForEmail } from '@/lib/uni';
import { expiresAtMs, generateCode, hashCode, type RandomInt } from '@/lib/verification';

/**
 * The testable core of `POST /api/verify/request`: domain check, ownership check (a verified uni email becomes a
 * LOGIN alias, so an address claimed by any other account is refused before a
 * code is ever sent), per-address hourly limit, global daily cap, code
 * generation, send, and persistence — all over injected ports.
 */

/** Max verification emails to one address per rolling hour. */
export const MAX_REQUESTS_PER_HOUR = 3;
/** Global daily email cap guard: at or above this in 24h, refuse. */
export const EMAIL_DAILY_CAP = 90;

const bodySchema = z.object({ email: z.email() });

/** Injected dependencies for the core handler. */
export interface VerifyRequestDeps {
  authenticate: () => Promise<string | null>;
  listUniversities: () => Promise<{ id: string; domains: string[] }[]>;
  /** Resolve who (if anyone) already owns this address as email or alias. */
  resolveIdentifier: (email: string) => Promise<IdentifierMatch | null>;
  /** Atomically reserve the per-address/global quotas and persist the pending OTP. */
  reserveVerification: (input: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAtMs: number;
  }) => Promise<
    { status: 'reserved'; verificationId: string } | { status: 'rate-limited' | 'capacity' }
  >;
  /** Best-effort durable delivery state for the outbox row. */
  recordDelivery: (input: {
    verificationId: string;
    sent: boolean;
    error?: string;
  }) => Promise<void>;
  sendCode: (email: string, code: string) => Promise<SendResult>;
  random: RandomInt;
  now: () => number;
}

export async function handleVerifyRequest(
  request: Request,
  deps: VerifyRequestDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in before verifying a university email.');
  }

  const body = await readJsonBody(request);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Request body is too large.');
  }
  if (!body.ok) {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'Enter a valid email address.');
  }
  const email = parsed.data.email.toLowerCase();
  const nowMs = deps.now();

  const university = findUniversityForEmail(email, await deps.listUniversities());
  if (university === null) {
    return apiError(
      404,
      'unknown-university',
      'That email domain is not a known UK or US university.',
    );
  }

  // Alias integrity: a verified uni email doubles as a login alias, so an
  // address can only belong to one account. Refuse before spending any email
  // budget. (The partial unique index closes the confirm-time race.)
  const verdict = adjudicateAliasClaim({
    requesterId: userId,
    match: await deps.resolveIdentifier(email),
  });
  if (verdict === 'taken') {
    return apiError(409, 'email-taken', 'That email is already attached to another account.');
  }
  if (verdict === 'already-verified') {
    return apiError(
      409,
      'already-verified',
      'You have already verified this email — you can sign in with it.',
    );
  }

  const code = generateCode(deps.random);
  const reservation = await deps.reserveVerification({
    userId,
    email,
    codeHash: hashCode(code),
    expiresAtMs: expiresAtMs(nowMs),
  });
  if (reservation.status !== 'reserved' && reservation.status === 'rate-limited') {
    return apiError(
      429,
      'rate-limited',
      'Too many codes requested. Try again in an hour (3 per hour).',
    );
  }

  if (reservation.status !== 'reserved') {
    return apiError(503, 'capacity', 'Verification is busy right now. Please try again tomorrow.');
  }

  const sent = await deps.sendCode(email, code);
  // Delivery audit must not turn an already delivered code into a false error;
  // an unsent/pending outbox row is safer than claiming the code was unusable.
  try {
    await deps.recordDelivery({
      verificationId: reservation.verificationId,
      sent: sent.ok,
      ...(sent.ok ? {} : { error: sent.error.message }),
    });
  } catch {
    // The reservation remains durable and can be reconciled operationally.
  }
  if (!sent.ok) {
    return apiError(502, 'email-failed', 'Could not send the code. Please try again shortly.');
  }

  return apiJson(200, { ok: true });
}
