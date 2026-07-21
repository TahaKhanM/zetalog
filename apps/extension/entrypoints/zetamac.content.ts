import { browser, defineContentScript } from '#imports';

import { createStore } from '../lib/store.js';
import { startCapture } from '../lib/wiring.js';

/**
 * Thin wiring only (spec §3.1). Runs solely on arithmetic.zetamac.com — the
 * match pattern is the origin guard (invariant 8) — and only on `/game` pages.
 * All logic lives in the tested lib/ modules; this file just injects the real
 * clock/uuid and the storage repository.
 */
export default defineContentScript({
  matches: ['*://arithmetic.zetamac.com/*'],
  main() {
    if (!window.location.pathname.startsWith('/game')) return;

    const store = createStore(browser.storage.local);
    startCapture({
      document,
      window,
      clock: {
        now: () => performance.now(),
        wallClock: () => Date.now(),
        uuid: () => crypto.randomUUID(),
      },
      hooks: {
        onGameComplete: (record) => void store.saveGame(record),
        onCaptureFailed: (record) => void store.saveCaptureFailed(record),
      },
    });
  },
});
