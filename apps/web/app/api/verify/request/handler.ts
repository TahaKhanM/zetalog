import { z } from 'zod';

import type { SendResult } from '@/lib/email/types';
import { apiError, apiJson } from '@/lib/http';
import { findUniversityForEmail } from '@/lib/uni';
import { expiresAtMs, generateCode, hashCode, type RandomInt } from '@/lib/verification';

/**
 * The testable core of `POST /api/verify/request` (spec §7): domain check,
 * per-address hourly limit, global daily cap, code generation, send, and
 * persistence — all over injected ports.
 */

/** Max verification emails to one address per rolling hour (CLAUDE.md #6). */
export const MAX_REQUESTS_PER_HOUR = 3;
/** Global daily email cap guard: at or above this in 24h, refuse (spec §7). */
export const EMAIL_DAILY_CAP = 90;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const bodySchema = z.object({ email: z.email() });

/** Injected dependencies for the core handler. */
export interface VerifyRequestDeps {
  authenticate: () => Promise<string | null>;
  listUniversities: () => Promise<{ id: string; domains: string[] }[]>;
  countRequestsForEmail: (email: string, sinceMs: number) => Promise<number>;
  countEmailsSince: (sinceMs: number) => Promise<number>;
  createVerification: (input: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAtMs: number;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'Enter a valid email address.');
  }
  const email = parsed.data.email.toLowerCase();
  const nowMs = deps.now();

  const university = findUniversityForEmail(email, await deps.listUniversities());
  if (university === null) {
    return apiError(404, 'unknown-university', 'That email domain is not a known UK university.');
  }

  if ((await deps.countRequestsForEmail(email, nowMs - HOUR_MS)) >= MAX_REQUESTS_PER_HOUR) {
    return apiError(
      429,
      'rate-limited',
      'Too many codes requested. Try again in an hour (3 per hour).',
    );
  }

  if ((await deps.countEmailsSince(nowMs - DAY_MS)) >= EMAIL_DAILY_CAP) {
    return apiError(503, 'capacity', 'Verification is busy right now. Please try again tomorrow.');
  }

  const code = generateCode(deps.random);
  const sent = await deps.sendCode(email, code);
  if (!sent.ok) {
    return apiError(502, 'email-failed', 'Could not send the code. Please try again shortly.');
  }

  await deps.createVerification({
    userId,
    email,
    codeHash: hashCode(code),
    expiresAtMs: expiresAtMs(nowMs),
  });

  return apiJson(200, { ok: true });
}
