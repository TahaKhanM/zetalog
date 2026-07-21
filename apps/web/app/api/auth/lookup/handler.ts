import { z } from 'zod';

import { classifyLookup, type IdentifierMatch } from '@/lib/auth-modes';
import { apiError, apiJson, clientIpFrom } from '@/lib/http';
import type { RateLimiter } from '@/lib/rate-limit';

/**
 * The testable core of `POST /api/auth/lookup` — the email-first step of the
 * sign-in form. Resolves the address (service role, primary email or verified
 * uni alias) and answers ONLY which flow to reveal: sign-in, sign-up, an
 * OAuth steer, or set-password for OTP-era accounts.
 *
 * Deliberate trade-off, stated for the record: this endpoint lets a caller
 * learn whether an address has an account (user enumeration). Email-first is
 * the accepted consumer-auth pattern — the alternative (asking for a password
 * that may not exist) loses more users than the enumeration reveals, GoTrue's
 * own signup/recovery endpoints leak the same bit, and the response carries
 * nothing beyond the mode (no ids, no providers list, no primary address).
 * The per-IP and per-address rate limits below keep bulk scraping impractical.
 */

/** Max lookups per key (IP, and separately address) per minute. */
export const LOOKUP_LIMIT_PER_MINUTE = 10;

const bodySchema = z.object({ email: z.email() });

/** Injected dependencies for the core handler. */
export interface AuthLookupDeps {
  /** Resolve an address to its account via the service role, or null. */
  resolveIdentifier: (email: string) => Promise<IdentifierMatch | null>;
  /** Shared limiter; keys are prefixed (`ip:`/`email:`) by this handler. */
  rateLimiter: RateLimiter;
  now: () => number;
}

export async function handleAuthLookup(request: Request, deps: AuthLookupDeps): Promise<Response> {
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

  const ipAllowed = deps.rateLimiter.check(`ip:${clientIpFrom(request)}`, nowMs);
  const emailAllowed = deps.rateLimiter.check(`email:${email}`, nowMs);
  if (!ipAllowed || !emailAllowed) {
    return apiError(429, 'rate-limited', 'Too many attempts — wait a minute, then try again.');
  }

  const mode = classifyLookup(await deps.resolveIdentifier(email));
  return apiJson(200, mode);
}
