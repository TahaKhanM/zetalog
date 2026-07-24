import { browser, defineBackground } from '#imports';

import { createApiClient } from '../lib/api.js';
import { createAuthController, type FetchLike } from '../lib/auth.js';
import { bgRequestSchema, type BgResponse } from '../lib/messages.js';
import { singleFlight } from '../lib/single-flight.js';
import { createStore } from '../lib/store.js';
import { createSyncQueueStore, drainSync } from '../lib/sync.js';

/**
 * Background service worker: the sole owner of the sync queue drain. Thin wiring only — every decision lives in the
 * tested `lib/` cores. It is message-triggered (link / drain / unlink from the
 * popup and content scripts) and alarm-triggered (retry drain on backoff). MV3
 * service workers are ephemeral, so no state is held in memory: the session,
 * queue, and games all live in `browser.storage.local`, re-read on every event.
 */

/** Fires the backoff retry drain; 1 min matches the base backoff granularity. */
const RETRY_ALARM = 'zl-sync-retry';

/** Real `fetch` narrowed to the {@link FetchLike} seam the lib cores expect. */
const httpFetch: FetchLike = (url, init) => fetch(url, init);

export default defineBackground(() => {
  const area = browser.storage.local;
  const store = createStore(area);
  const auth = createAuthController(area, { fetch: httpFetch });
  const api = createApiClient({ fetch: httpFetch, auth });
  const queue = createSyncQueueStore(area);

  // Single-flight: a message-triggered drain and the retry alarm can coincide;
  // concurrent triggers share one pass instead of double-submitting.
  const drain = singleFlight(() =>
    drainSync({ api, store, queue, now: () => Date.now(), isLinked: () => auth.isLinked() }),
  );

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async (): Promise<void> => {
      const parsed = bgRequestSchema.safeParse(message);
      if (!parsed.success) {
        sendResponse({ ok: false } satisfies BgResponse);
        return;
      }
      switch (parsed.data.type) {
        case 'zl-link': {
          const linked = await auth.link(parsed.data.accessToken, parsed.data.refreshToken);
          if (linked) await drain();
          sendResponse({ ok: linked } satisfies BgResponse);
          break;
        }
        case 'zl-drain':
          await drain();
          sendResponse({ ok: true } satisfies BgResponse);
          break;
        case 'zl-unlink':
          // Forget the session and all sync bookkeeping; local games are untouched.
          await auth.clear();
          await queue.write([]);
          await store.clearAllSync();
          sendResponse({ ok: true } satisfies BgResponse);
          break;
      }
    })();
    return true; // keep the message channel open for the async sendResponse
  });

  void browser.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM) void drain();
  });
});
