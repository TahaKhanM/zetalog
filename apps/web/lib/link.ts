/**
 * Pure message helpers for the extension account-link handoff (spec §3.4). The
 * `/link` page's LinkHandoff posts the current session to `window` on an
 * explicit click; the extension's content script (running only on this origin)
 * validates and forwards it, then posts an ack back. Keeping the message shape
 * and ack detection here makes the browser-only component a thin shell over
 * tested logic.
 */

/** The session-handoff message the page posts to the extension. */
export interface LinkSessionMessage {
  readonly type: 'zl-link';
  readonly session: { readonly access_token: string; readonly refresh_token: string };
}

/** Build the handoff message from a Supabase session's tokens. */
export function linkSessionMessage(accessToken: string, refreshToken: string): LinkSessionMessage {
  return { type: 'zl-link', session: { access_token: accessToken, refresh_token: refreshToken } };
}

/** Whether a received `message` payload is the extension's link acknowledgement. */
export function isLinkAck(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'zl-link-ack'
  );
}
