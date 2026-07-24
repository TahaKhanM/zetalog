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

/**
 * Presence signal: posted unprompted when the content script starts and again
 * in answer to a page ping, so `/link` can show whether the extension is
 * actually reachable BEFORE the user clicks (a freshly reloaded extension has
 * no content script in tabs opened earlier — the page tells them to refresh).
 */
export const LINK_READY = { type: 'zl-link-ready' } as const;

/** Whether an incoming message is the page's presence ping (same guards as the handoff). */
export function isLinkPing(
  event: IncomingMessage,
  expectedSource: unknown,
  allowedOrigins: readonly string[],
): boolean {
  if (!allowedOrigins.includes(event.origin)) return false;
  if (event.source !== expectedSource) return false;
  return (
    typeof event.data === 'object' &&
    event.data !== null &&
    (event.data as { type?: unknown }).type === 'zl-link-ping'
  );
}

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
