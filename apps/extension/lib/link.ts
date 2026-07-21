import { err, ok, type Result } from '@zetalog/shared';
import { z } from 'zod';

/**
 * Validation for the account-link postMessage handoff (brief "Session handoff").
 * The web app's LinkHandoff posts the current session ONLY on an explicit user
 * click; the link content script (which the browser runs solely on our own
 * `/link` origins) validates the message and forwards the tokens to the
 * background. Because the content script's origin is guaranteed by the browser,
 * the tokens can only originate from — and only be acknowledged back to — our
 * own page. This module is the pure, exhaustively-tested validation core.
 */

/** The wire shape the web app posts. */
const linkMessageSchema = z.object({
  type: z.literal('zl-link'),
  session: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
  }),
});

/** The message the extension posts back once the background has stored the session. */
export const LINK_ACK = { type: 'zl-link-ack' } as const;

/** Tokens lifted from a validated handoff message. */
export interface LinkTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/** Why a message was rejected — never carries token material. */
export interface LinkError {
  readonly reason: 'bad-origin' | 'bad-source' | 'bad-payload';
}

/** The subset of a `MessageEvent` the validator inspects. */
export interface IncomingMessage {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}

/**
 * Validate an incoming `window` message and extract the session tokens. Rejects
 * unless (1) the origin is in `allowedOrigins`, (2) `source` is the content
 * script's own `window` (so the message came from this very page, not an
 * embedded frame), and (3) the payload matches the handoff schema. Both guards
 * run before the tokens are ever read.
 */
export function parseLinkMessage(
  event: IncomingMessage,
  expectedSource: unknown,
  allowedOrigins: readonly string[],
): Result<LinkTokens, LinkError> {
  if (!allowedOrigins.includes(event.origin)) return err({ reason: 'bad-origin' });
  if (event.source !== expectedSource) return err({ reason: 'bad-source' });

  const parsed = linkMessageSchema.safeParse(event.data);
  if (!parsed.success) return err({ reason: 'bad-payload' });

  return ok({
    accessToken: parsed.data.session.access_token,
    refreshToken: parsed.data.session.refresh_token,
  });
}
