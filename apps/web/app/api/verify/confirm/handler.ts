import { z } from 'zod';

import { apiError, apiJson, readJsonBody } from '@/lib/http';
import { hashCode } from '@/lib/verification';

/**
 * The testable core of `POST /api/verify/confirm`: find the latest
 * pending code, adjudicate the submitted digits (constant-time, attempt-capped,
 * expiry-aware), and on success stamp the profile's university.
 */

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** A pending verification, resolved from the database. */
export type ConfirmVerificationResult =
  | { readonly status: 'ok'; readonly university: { readonly name: string; readonly slug: string } }
  | { readonly status: 'incorrect'; readonly attemptsRemaining: number }
  | {
      readonly status:
        'expired' | 'locked' | 'no-pending' | 'unknown-university' | 'alias-conflict';
    };

/** Injected dependencies for the core handler. */
export interface VerifyConfirmDeps {
  authenticate: () => Promise<string | null>;
  /** Atomic database transition: locks/consumes the OTP and applies the alias + badge. */
  confirmVerification: (input: {
    userId: string;
    codeHash: string;
    nowIso: string;
  }) => Promise<ConfirmVerificationResult>;
  now: () => number;
}

export async function handleVerifyConfirm(
  request: Request,
  deps: VerifyConfirmDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in before confirming a code.');
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
    return apiError(400, 'bad-request', 'Enter the 6-digit code.');
  }

  const nowMs = deps.now();
  const outcome = await deps.confirmVerification({
    userId,
    codeHash: hashCode(parsed.data.code),
    nowIso: new Date(nowMs).toISOString(),
  });

  switch (outcome.status) {
    case 'no-pending':
      return apiError(404, 'no-pending', 'No pending verification. Request a new code.');
    case 'expired':
      return apiError(410, 'expired', 'That code has expired. Request a new one.');
    case 'locked':
      return apiError(429, 'too-many-attempts', 'Too many attempts. Request a new code.');
    case 'incorrect': {
      return apiJson(400, {
        error: {
          code: 'incorrect-code',
          message: `Incorrect code. ${String(outcome.attemptsRemaining)} attempt(s) left.`,
        },
        attemptsRemaining: outcome.attemptsRemaining,
      });
    }
    case 'ok': {
      return apiJson(200, {
        ok: true,
        university: outcome.university,
      });
    }
    case 'unknown-university':
      return apiError(409, 'unknown-university', 'That university is no longer available.');
    case 'alias-conflict':
      return apiError(409, 'email-taken', 'That email is already attached to another account.');
  }
}
