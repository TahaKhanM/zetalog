import { z } from 'zod';

/**
 * The runtime message protocol between the extension's surfaces and its
 * background service worker. The link content script sends `zl-link`; the popup
 * sends `zl-drain` (sync now) and `zl-unlink`; the Zetamac content script sends
 * `zl-drain` after saving a game. The background validates every message with
 * {@link bgRequestSchema} before acting — tokens travel only over this
 * intra-extension channel, never to the network or a log.
 */
export const bgRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('zl-link'),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
  z.object({ type: z.literal('zl-drain') }),
  z.object({ type: z.literal('zl-unlink') }),
]);

/** A message the background handles. */
export type BgRequest = z.infer<typeof bgRequestSchema>;

/** The background's reply. `ok` is false on a rejected/unrecognised request. */
export interface BgResponse {
  readonly ok: boolean;
}
