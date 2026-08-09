import { browser, defineContentScript } from '#imports';

import { type GameRecord } from '@zetalog/shared';

import {
  CAPTURE_MOUNT_TYPE,
  CAPTURE_PORT_NAME,
  capturePortResponseSchema,
  type BgRequest,
  type BgResponse,
  type CaptureRequest,
} from '../lib/messages.js';
import { startCapture } from '../lib/wiring.js';

/**
 * Thin wiring only. Runs solely on arithmetic.zetamac.com — the
 * match pattern is the origin guard (invariant 8) — and only on `/game` pages.
 * All logic lives in the tested lib/ modules; this file just injects the real
 * clock/uuid and the storage repository.
 */
export default defineContentScript({
  matches: ['https://arithmetic.zetamac.com/*'],
  // Open the background channel at document start. This gives the MV3 worker
  // the page parse interval to attach before a player can answer and navigate.
  // Capture itself waits for the parsed game DOM below.
  runAt: 'document_start',
  main() {
    if (!/^\/game\/?$/.test(window.location.pathname)) return;

    let capturePort: ReturnType<typeof browser.runtime.connect> | null = null;
    let captureReady = false;
    let recorderMounted = false;
    const pendingCaptures: CaptureRequest[] = [];

    function sendMount(port: NonNullable<typeof capturePort>): void {
      if (!recorderMounted) return;
      try {
        port.postMessage({ type: CAPTURE_MOUNT_TYPE });
      } catch {
        // `onDisconnect` resets the channel; the next record reconnects it.
      }
    }

    function flushCaptures(port: NonNullable<typeof capturePort>): void {
      if (!captureReady || capturePort !== port) return;
      while (pendingCaptures.length > 0) {
        const request = pendingCaptures[0];
        if (request === undefined) return;
        try {
          port.postMessage(request);
          pendingCaptures.shift();
        } catch {
          captureReady = false;
          return;
        }
      }
    }

    function connectCapturePort(): NonNullable<typeof capturePort> {
      const port = browser.runtime.connect({ name: CAPTURE_PORT_NAME });
      capturePort = port;
      captureReady = false;
      port.onMessage.addListener((message) => {
        if (capturePort !== port || !capturePortResponseSchema.safeParse(message).success) return;
        captureReady = true;
        flushCaptures(port);
      });
      port.onDisconnect.addListener(() => {
        if (capturePort === port) {
          capturePort = null;
          captureReady = false;
        }
      });
      sendMount(port);
      return port;
    }

    // Records stay buffered until the background acknowledges a validated
    // channel. If Chrome idles the worker during a long pause, the next record
    // reconnects and re-announces the mounted recorder.
    function postCapture(request: CaptureRequest): void {
      pendingCaptures.push(request);
      if (capturePort === null) {
        try {
          connectCapturePort();
        } catch {
          // The storage-health badge will expose a persistent worker failure.
        }
        return;
      }
      flushCaptures(capturePort);
    }

    // Open the channel while the game page is still stable, rather than at the
    // first checkpoint. `runtime.connect()` is synchronous, but the receiving
    // worker is scheduled separately; opening it here gives the worker time to
    // register the port before a player can answer and immediately navigate.
    // A later checkpoint still reconnects if Chrome has discarded the port.
    try {
      connectCapturePort();
    } catch {
      capturePort = null;
    }

    let challenge: BgResponse['challenge'];
    void browser.runtime
      .sendMessage({ type: 'zl-start-challenge' } satisfies BgRequest)
      .then((response: unknown) => {
        const parsed = response as BgResponse | undefined;
        if (parsed?.ok === true && parsed.challenge !== undefined) challenge = parsed.challenge;
      })
      .catch(() => undefined);

    const beginCapture = (): void => {
      startCapture({
        document,
        window,
        clock: {
          now: () => performance.now(),
          wallClock: () => Date.now(),
          uuid: () => crypto.randomUUID(),
        },
        hooks: {
          onCheckpoint: (record) => {
            postCapture({ type: 'zl-checkpoint-game', record });
          },
          // The background persists and queues the game before acknowledging it;
          // a capture failure has no rankable score to sync.
          onGameComplete: (record) => {
            const bound: GameRecord =
              challenge === undefined ? record : { ...record, evidence: challenge };
            postCapture({ type: 'zl-save-game', record: bound });
          },
          onCaptureFailed: (record) => {
            postCapture({ type: 'zl-save-capture-failed', record });
          },
        },
      });
      recorderMounted = true;
      if (capturePort === null) {
        try {
          connectCapturePort();
        } catch {
          // The first record will retry the connection.
        }
      } else {
        sendMount(capturePort);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', beginCapture, { once: true });
    } else {
      beginCapture();
    }
  },
});
