import { z } from 'zod';

import { apiError, apiJson } from '@/lib/http';
import { findUniversityForEmail } from '@/lib/uni';
import { verifyCode } from '@/lib/verification';

/**
 * The testable core of `POST /api/verify/confirm` (spec §7): find the latest
 * pending code, adjudicate the submitted digits (constant-time, attempt-capped,
 * expiry-aware), and on success stamp the profile's university.
 */

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** A pending verification, resolved from the database. */
export interface PendingVerification {
  readonly id: string;
  readonly email: string;
  readonly codeHash: string;
  readonly expiresAtMs: number;
  readonly attempts: number;
}

/** Injected dependencies for the core handler. */
export interface VerifyConfirmDeps {
  authenticate: () => Promise<string | null>;
  getLatestPending: (userId: string) => Promise<PendingVerification | null>;
  listUniversities: () => Promise<{ id: string; name: string; slug: string; domains: string[] }[]>;
  incrementAttempts: (verificationId: string) => Promise<void>;
  applyVerification: (input: {
    userId: string;
    universityId: string;
    verificationId: string;
    nowIso: string;
  }) => Promise<void>;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'Enter the 6-digit code.');
  }

  const pending = await deps.getLatestPending(userId);
  if (pending === null) {
    return apiError(404, 'no-pending', 'No pending verification. Request a new code.');
  }

  const nowMs = deps.now();
  const outcome = verifyCode({
    submittedCode: parsed.data.code,
    storedHash: pending.codeHash,
    expiresAtMs: pending.expiresAtMs,
    attempts: pending.attempts,
    nowMs,
  });

  switch (outcome.status) {
    case 'expired':
      return apiError(410, 'expired', 'That code has expired. Request a new one.');
    case 'locked':
      return apiError(429, 'too-many-attempts', 'Too many attempts. Request a new code.');
    case 'incorrect': {
      await deps.incrementAttempts(pending.id);
      return apiJson(400, {
        error: {
          code: 'incorrect-code',
          message: `Incorrect code. ${String(outcome.attemptsRemaining)} attempt(s) left.`,
        },
        attemptsRemaining: outcome.attemptsRemaining,
      });
    }
    case 'ok': {
      const university = findUniversityForEmail(pending.email, await deps.listUniversities());
      if (university === null) {
        return apiError(409, 'unknown-university', 'That university is no longer available.');
      }
      await deps.applyVerification({
        userId,
        universityId: university.id,
        verificationId: pending.id,
        nowIso: new Date(nowMs).toISOString(),
      });
      return apiJson(200, {
        ok: true,
        university: { name: university.name, slug: university.slug },
      });
    }
  }
}
