import { browser, defineBackground } from '#imports';

import { createApiClient } from '../lib/api.js';
import { createAuthController, type FetchLike } from '../lib/auth.js';
import { remoteGameToStored } from '../lib/backfill.js';
import { WEB_APP_URL } from '../lib/endpoints.js';
import {
  bgRequestSchema,
  CAPTURE_PORT_NAME,
  CAPTURE_READY_TYPE,
  capturePortRequestSchema,
  type BgResponse,
  type CaptureRequest,
} from '../lib/messages.js';
import { singleFlight } from '../lib/single-flight.js';
import { createPendingRevocationStore } from '../lib/pending-revocations.js';
import { nextRetryAlarmAt } from '../lib/retry-scheduler.js';
import { createStore } from '../lib/store.js';
import { createSyncQueueStore, drainSync } from '../lib/sync.js';

/**
 * Background service worker: the sole owner of the sync queue drain. Thin wiring only — every decision lives in the
 * tested `lib/` cores. It is message-triggered (link / drain / unlink from the
 * popup and content scripts) and alarm-triggered (retry drain on backoff). MV3
 * service workers are ephemeral, so no state is held in memory: the session,
 * queue, and games all live in `browser.storage.local`, re-read on every event.
 */

/** One-shot alarm derived from the next durable sync/revocation retry. */
const RETRY_ALARM = 'zl-sync-retry';

/** Real `fetch` narrowed to the {@link FetchLike} seam the lib cores expect. */
const httpFetch: FetchLike = (url, init) => fetch(url, init);

export default defineBackground(() => {
  const area = browser.storage.local;
  // Content scripts communicate through validated background channels; they
  // do not need direct access to credentials or recorded telemetry.
  void area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  const store = createStore(area);
  const auth = createAuthController(area, {
    fetch: httpFetch,
    identity: {
      getRedirectURL: (path) => browser.identity.getRedirectURL(path),
      launchWebAuthFlow: (details) => browser.identity.launchWebAuthFlow(details),
    },
  });
  const api = createApiClient({ fetch: httpFetch, auth });
  const queue = createSyncQueueStore(area);
  const pendingRevocations = createPendingRevocationStore(area);

  // Keep an idle MV3 worker asleep. A one-shot alarm exists only while there is
  // durable work, and is moved to the earliest queue/revocation retry.
  const scheduleRetryAlarm = singleFlight(async (): Promise<void> => {
    try {
      const linked = await auth.isLinked();
      const [entries, revocations] = await Promise.all([
        linked ? queue.read() : Promise.resolve([]),
        pendingRevocations.read(),
      ]);
      const when = nextRetryAlarmAt({
        nowMs: Date.now(),
        linked,
        queue: entries,
        pendingRevocations: revocations.length,
      });
      if (when === null) {
        await browser.alarms.clear(RETRY_ALARM);
      } else {
        await browser.alarms.create(RETRY_ALARM, { when });
      }
    } catch {
      // Scheduling is recoverable: capture, popup open, or worker startup will
      // derive the queue and try again without risking an unhandled rejection.
    }
  });

  // Credentials survive a transient unlink failure without preserving an active
  // account session. Single-flight keeps startup and alarm retries from racing.
  const retryPendingRevocations = singleFlight(async () => {
    try {
      await pendingRevocations.retry((token) => api.revokeCredential(token));
    } finally {
      await scheduleRetryAlarm();
    }
  });

  /** Make a rare storage failure visible without interrupting normal capture. */
  async function showStorageHealth(healthy: boolean): Promise<void> {
    try {
      await browser.action.setBadgeBackgroundColor({ color: '#b42318' });
      await browser.action.setBadgeText({ text: healthy ? '' : '!' });
      await browser.action.setTitle({
        title: healthy ? 'ZetaLog' : 'ZetaLog could not save data — open for details',
      });
    } catch {
      // Badge support is diagnostic only; it must never interfere with capture.
    }
  }

  // Single-flight: a message-triggered drain and the retry alarm can coincide;
  // concurrent triggers share one pass instead of double-submitting.
  const drain = singleFlight(async () => {
    try {
      const userId = await auth.userId();
      if (userId !== null) {
        const assigned = await store.assignUnownedGames(userId);
        if (!assigned.ok) await showStorageHealth(false);
      }
      return await drainSync({
        api,
        store,
        queue,
        now: () => Date.now(),
        isLinked: () => auth.isLinked(),
        userId: () => Promise.resolve(userId),
      });
    } finally {
      await scheduleRetryAlarm();
    }
  });

  // Pull the account's game history and merge it into local storage so the
  // popup shows games synced from any device. Single-flight: link and popup
  // open can both trigger it. No-op (false) when signed out or on any error.
  const backfill = singleFlight(async (): Promise<boolean> => {
    if (!(await auth.isLinked())) return false;
    const remote = await api.listGames();
    if (!remote.ok) return false;
    const userId = await auth.userId();
    if (userId === null) return false;
    const result = await store.importBackfill(
      remote.value.map((game) => remoteGameToStored(game, userId)),
    );
    if (!result.ok) await showStorageHealth(false);
    return result.ok;
  });

  async function beginLink(): Promise<BgResponse> {
    const linked = await auth.beginLink();
    if (!linked.ok) return linked;

    // Storing the independent extension credential is the success boundary.
    // A transient history/upload failure must not turn a completed link into a
    // vague failure or tempt the user to create another credential.
    let syncPending: boolean;
    try {
      syncPending = !(await backfill());
      const summary = await drain();
      syncPending ||= summary.authFailed || summary.retryScheduled > 0 || summary.remaining > 0;
    } catch {
      syncPending = true;
    }
    return { ok: true, ...(syncPending ? { syncPending: true } : {}) };
  }

  async function persistCapture(request: CaptureRequest): Promise<boolean> {
    switch (request.type) {
      case 'zl-save-game': {
        const saved = await store.saveGame(request.record, await auth.storedUserId());
        await showStorageHealth(saved.ok);
        if (saved.ok) await drain();
        return saved.ok;
      }
      case 'zl-checkpoint-game': {
        const saved = await store.checkpointGame(request.record, await auth.storedUserId());
        await showStorageHealth(saved.ok);
        return saved.ok;
      }
      case 'zl-save-capture-failed': {
        const saved = await store.saveCaptureFailed(request.record, await auth.storedUserId());
        await showStorageHealth(saved.ok);
        return saved.ok;
      }
    }
  }

  // A game page keeps this port for its lifetime. Port messages are queued
  // before navigation tears down the content context, unlike an unobserved
  // request promise created during pagehide.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== CAPTURE_PORT_NAME) return;
    try {
      const sender = new URL(port.sender?.url ?? '');
      if (
        sender.protocol !== 'https:' ||
        sender.hostname !== 'arithmetic.zetamac.com' ||
        !/^\/game\/?$/.test(sender.pathname)
      ) {
        port.disconnect();
        return;
      }
    } catch {
      port.disconnect();
      return;
    }
    port.onMessage.addListener((message) => {
      const parsed = capturePortRequestSchema.safeParse(message);
      if (!parsed.success) return;
      if (parsed.data.type === 'zl-capture-mounted') {
        port.postMessage({ type: CAPTURE_READY_TYPE });
        return;
      }
      void persistCapture(parsed.data).catch(() => showStorageHealth(false));
    });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async (): Promise<void> => {
      const parsed = bgRequestSchema.safeParse(message);
      if (!parsed.success) {
        sendResponse({ ok: false } satisfies BgResponse);
        return;
      }
      switch (parsed.data.type) {
        case 'zl-begin-link': {
          sendResponse(await beginLink());
          break;
        }
        case 'zl-start-challenge': {
          const challenge = await api.startChallenge();
          sendResponse(
            (challenge.ok
              ? { ok: true, challenge: challenge.value }
              : { ok: false }) satisfies BgResponse,
          );
          break;
        }
        case 'zl-remove-game': {
          const changed = await store.remove(parsed.data.id);
          await showStorageHealth(changed.ok);
          if (changed.ok) await drain();
          sendResponse({ ok: changed.ok } satisfies BgResponse);
          break;
        }
        case 'zl-restore-game': {
          const changed = await store.restore(parsed.data.id);
          await showStorageHealth(changed.ok);
          if (changed.ok) await drain();
          sendResponse({ ok: changed.ok } satisfies BgResponse);
          break;
        }
        case 'zl-drain':
          {
            const summary = await drain();
            const syncPending =
              summary.authFailed || summary.retryScheduled > 0 || summary.remaining > 0;
            sendResponse({ ok: !summary.authFailed, syncPending } satisfies BgResponse);
          }
          break;
        case 'zl-unlink': {
          // Forget the account immediately. If its opaque credential cannot be
          // revoked right now, it remains in trusted storage and is retried in
          // the background; local scores keep their original owner either way.
          const credential = await auth.extensionCredential();
          if (credential !== null) await pendingRevocations.enqueue(credential);
          await auth.clear();
          await queue.write([]);
          const cleared = await store.clearAllSync();
          await showStorageHealth(cleared.ok);
          void retryPendingRevocations().catch(() => undefined);
          sendResponse({ ok: cleared.ok } satisfies BgResponse);
          break;
        }
        case 'zl-get-profile': {
          // Routed through the background so token refresh stays in one owner.
          const profile = await api.getProfile();
          sendResponse(
            (profile.ok
              ? { ok: true, leaderboardOptOut: profile.value.leaderboardOptOut }
              : { ok: false }) satisfies BgResponse,
          );
          break;
        }
        case 'zl-set-privacy': {
          const result = await api.setLeaderboardOptOut(parsed.data.optOut);
          sendResponse({ ok: result.ok } satisfies BgResponse);
          break;
        }
        case 'zl-backfill': {
          const ok = await backfill();
          sendResponse({ ok } satisfies BgResponse);
          break;
        }
      }
    })().catch(() => {
      sendResponse({ ok: false, error: 'internal' } satisfies BgResponse);
    });
    return true; // keep the message channel open for the async sendResponse
  });

  // Worker startup reconciles any game persisted just before a prior worker was
  // suspended; each pass then derives (or clears) the next one-shot alarm.
  void drain().catch(() => undefined);
  void retryPendingRevocations().catch(() => undefined);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM) {
      void drain().catch(() => undefined);
      void retryPendingRevocations().catch(() => undefined);
    }
  });

  // A fresh install receives the web entry point once. The page's explicit
  // button (or the popup's Sync button) is the only path that opens an
  // interactive identity window.
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') void browser.tabs.create({ url: `${WEB_APP_URL}/link` });
  });
});
