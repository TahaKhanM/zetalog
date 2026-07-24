import { z } from 'zod';

/**
 * The runtime message protocol between the extension's surfaces and its
 * background service worker. The link content script sends `zl-link`; the popup
 * sends `zl-drain` (sync now), `zl-unlink`, the leaderboard-privacy
 * `zl-get-profile` / `zl-set-privacy`, and `zl-backfill` (pull the account's
 * game history); the Zetamac content script sends
 * `zl-drain` after saving a game. Profile requests are routed through the
 * background because it owns token refresh. The background validates every
 * message with {@link bgRequestSchema} before acting — tokens travel only over
 * this intra-extension channel, never to the network or a log.
 */
export const bgRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('zl-link'),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
  z.object({ type: z.literal('zl-drain') }),
  z.object({ type: z.literal('zl-unlink') }),
  z.object({ type: z.literal('zl-get-profile') }),
  z.object({ type: z.literal('zl-set-privacy'), optOut: z.boolean() }),
  z.object({ type: z.literal('zl-backfill') }),
]);

/** A message the background handles. */
export type BgRequest = z.infer<typeof bgRequestSchema>;

/**
 * The background's reply. `ok` is false on a rejected/unrecognised request or an
 * auth/network failure. `leaderboardOptOut` is present only on a successful
 * `zl-get-profile` reply.
 */
export interface BgResponse {
  readonly ok: boolean;
  readonly leaderboardOptOut?: boolean;
}
