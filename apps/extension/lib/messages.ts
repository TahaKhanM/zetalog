import { gameRecordSchema } from '@zetalog/shared';
import { z } from 'zod';

import type { LinkError } from './auth.js';

export const CAPTURE_PORT_NAME = 'zl-capture-v1';
export const CAPTURE_MOUNT_TYPE = 'zl-capture-mounted';
export const CAPTURE_READY_TYPE = 'zl-capture-ready';

const captureRequestSchemas = [
  z.object({ type: z.literal('zl-checkpoint-game'), record: gameRecordSchema }),
  z.object({ type: z.literal('zl-save-game'), record: gameRecordSchema }),
  z.object({ type: z.literal('zl-save-capture-failed'), record: gameRecordSchema }),
] as const;

/** Records accepted over the game page's navigation-safe runtime port. */
export const captureRequestSchema = z.discriminatedUnion('type', captureRequestSchemas);
export type CaptureRequest = z.infer<typeof captureRequestSchema>;

/** The content script announces that its DOM recorder is attached. */
export const capturePortRequestSchema = z.union([
  z.object({ type: z.literal(CAPTURE_MOUNT_TYPE) }),
  captureRequestSchema,
]);
export type CapturePortRequest = z.infer<typeof capturePortRequestSchema>;

/** The background acknowledges a validated port before records are sent. */
export const capturePortResponseSchema = z.object({ type: z.literal(CAPTURE_READY_TYPE) });

/**
 * The runtime message protocol between the extension's surfaces and its
 * background service worker. The link content script and popup send
 * `zl-begin-link` only after an explicit user click; the popup also sends
 * `zl-drain` (sync now), `zl-unlink`, the leaderboard-privacy
 * `zl-get-profile` / `zl-set-privacy`, and `zl-backfill` (pull the account's
 * game history); the Zetamac content script sends completed records to the
 * background for durable storage and queueing. Profile requests are routed through the
 * background because it owns token refresh. The background validates every
 * message with {@link bgRequestSchema} before acting. Credentials never cross
 * this message protocol or appear in logs.
 */
export const bgRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('zl-begin-link') }),
  z.object({ type: z.literal('zl-drain') }),
  z.object({ type: z.literal('zl-start-challenge') }),
  ...captureRequestSchemas,
  z.object({ type: z.literal('zl-remove-game'), id: z.uuid() }),
  z.object({ type: z.literal('zl-restore-game'), id: z.uuid() }),
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
  /** Present when an interactive link failed before a credential was stored. */
  readonly error?: LinkError | 'internal';
  /** Linked successfully, but one or more scores will retry in the background. */
  readonly syncPending?: boolean;
  readonly leaderboardOptOut?: boolean;
  readonly challenge?: { readonly challengeId: string; readonly nonce: string };
}
