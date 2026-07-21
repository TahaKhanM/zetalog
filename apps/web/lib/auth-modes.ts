import { z } from 'zod';

/**
 * Pure account-classification rules for the W8 email-first auth flow.
 *
 * The server resolves an identifier (primary email or verified uni alias) to
 * an {@link IdentifierMatch} via the service role; these rules then decide
 * which flow the form should reveal. Keeping the decision table pure means the
 * lookup/login route cores and the client form all share one tested truth.
 */

/** A resolved identifier: who it belongs to and how it matched. */
export interface IdentifierMatch {
  readonly userId: string;
  /** The account's primary (GoTrue) email — the only email a grant may use. */
  readonly primaryEmail: string;
  /** Whether the account has a usable password credential. */
  readonly hasPassword: boolean;
  /** Identity providers on the account (e.g. 'email', 'google', 'github'). */
  readonly providers: readonly string[];
  /** Whether the identifier hit the primary email or a verified uni alias. */
  readonly matchedBy: 'primary' | 'alias';
}

/** Which flow the sign-in form should reveal after the email-first step. */
export type LookupMode =
  | { readonly mode: 'signup' }
  | { readonly mode: 'signin' }
  | { readonly mode: 'oauth'; readonly provider: string }
  | { readonly mode: 'set-password' };

/** Providers we render dedicated buttons for, in hint-preference order. */
const SUPPORTED_OAUTH_PROVIDERS = ['google', 'github'] as const;

/**
 * Decide the flow for a resolved identifier:
 * - no account → sign-up;
 * - password on the account → password sign-in (regardless of OAuth links);
 * - passwordless with an OAuth identity → steer to that provider's button;
 * - passwordless email-only (OTP-era account) → set-password via recovery.
 */
export function classifyLookup(match: IdentifierMatch | null): LookupMode {
  if (match === null) return { mode: 'signup' };
  if (match.hasPassword) return { mode: 'signin' };
  const oauthProviders = match.providers.filter((p) => p !== 'email' && p !== 'phone');
  const hint =
    SUPPORTED_OAUTH_PROVIDERS.find((p) => oauthProviders.includes(p)) ?? oauthProviders[0];
  if (hint !== undefined) return { mode: 'oauth', provider: hint };
  return { mode: 'set-password' };
}

/** Boundary schema for `POST /api/auth/lookup` responses (client-side parse). */
export const lookupResponseSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('signup') }),
  z.object({ mode: z.literal('signin') }),
  z.object({ mode: z.literal('oauth'), provider: z.string().min(1) }),
  z.object({ mode: z.literal('set-password') }),
]);

/** Verdict on a uni-email verification request claiming `match`'s address. */
export type AliasClaimVerdict = 'ok' | 'taken' | 'already-verified';

/**
 * Alias integrity (W8): a university email may become a login alias, so an
 * address can only ever be claimed by one account. Verifying your own primary
 * email is fine (badge only, alias is a no-op); anyone else's primary email or
 * verified alias is taken; your own verified alias needs no second pass.
 */
export function adjudicateAliasClaim(input: {
  readonly requesterId: string;
  readonly match: IdentifierMatch | null;
}): AliasClaimVerdict {
  if (input.match === null) return 'ok';
  if (input.match.userId !== input.requesterId) return 'taken';
  return input.match.matchedBy === 'primary' ? 'ok' : 'already-verified';
}
