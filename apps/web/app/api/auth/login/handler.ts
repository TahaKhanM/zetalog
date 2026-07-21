import { z } from 'zod';

import type { IdentifierMatch } from '@/lib/auth-modes';
import { apiError, apiJson, clientIpFrom } from '@/lib/http';
import type { RateLimiter } from '@/lib/rate-limit';

/**
 * The testable core of `POST /api/auth/login` — password sign-in that also
 * accepts a VERIFIED university alias as the identifier. The alias resolves
 * server-side (service role) to the account's primary email and the password
 * grant runs against that; the browser only learns ok / not-ok.
 *
 * Security posture, stated for the record:
 * - The password transits our server once, over TLS, straight into the GoTrue
 *   grant — the standard first-party pattern. It is never stored, never
 *   logged, and never echoed into a response, an error detail, or telemetry.
 * - Wrong-password and unknown-identifier answer with byte-identical bodies
 *   AND identical work (an unresolved identifier still runs one grant), so
 *   neither the response nor its timing confirms whether an account exists.
 * - Per-IP and per-identifier sliding-window limits blunt credential
 *   stuffing; GoTrue applies its own authoritative limits behind us.
 */

/** Max login attempts per key (IP, and separately identifier) per minute. */
export const LOGIN_LIMIT_PER_MINUTE = 10;

const bodySchema = z.object({
  /** Primary email or verified uni alias — always an email shape. */
  identifier: z.email(),
  password: z.string().min(1),
});

/** Outcome of the injected password grant (no message: nothing to leak). */
export type GrantResult = { ok: true } | { ok: false; status: number | undefined };

/** Injected dependencies for the core handler. */
export interface AuthLoginDeps {
  /** Resolve an identifier to its account via the service role, or null. */
  resolveIdentifier: (identifier: string) => Promise<IdentifierMatch | null>;
  /**
   * Run the GoTrue password grant as the browser's session (the wiring layer
   * owns the @supabase/ssr cookie write-back onto the response).
   */
  signInWithPassword: (email: string, password: string) => Promise<GrantResult>;
  /** Shared limiter; keys are prefixed (`ip:`/`id:`) by this handler. */
  rateLimiter: RateLimiter;
  now: () => number;
}

export async function handleAuthLogin(request: Request, deps: AuthLoginDeps): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'Enter your email and password.');
  }
  const identifier = parsed.data.identifier.toLowerCase();
  const nowMs = deps.now();

  const ipAllowed = deps.rateLimiter.check(`ip:${clientIpFrom(request)}`, nowMs);
  const identifierAllowed = deps.rateLimiter.check(`id:${identifier}`, nowMs);
  if (!ipAllowed || !identifierAllowed) {
    return apiError(429, 'rate-limited', 'Too many attempts — wait a minute, then try again.');
  }

  // Unresolved identifiers fall through to a grant with the raw identifier:
  // one downstream call either way, so unknown-vs-wrong stays indistinguishable.
  const account = await deps.resolveIdentifier(identifier);
  const grantEmail = account?.primaryEmail.toLowerCase() ?? identifier;

  const granted = await deps.signInWithPassword(grantEmail, parsed.data.password);
  if (!granted.ok) {
    if (granted.status === 429) {
      return apiError(429, 'rate-limited', 'Too many attempts — wait a minute, then try again.');
    }
    return apiError(401, 'invalid-credentials', 'Wrong email or password.');
  }

  return apiJson(200, { ok: true });
}
