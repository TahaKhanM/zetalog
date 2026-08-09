import { browser } from '#imports';
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';

import { AdaptiveTrend } from '../../components/AdaptiveTrend.js';
import { CaptureFailedBanner } from '../../components/CaptureFailedBanner.js';
import { Footer } from '../../components/Footer.js';
import { Header } from '../../components/Header.js';
import { Hero } from '../../components/Hero.js';
import { RecentGames } from '../../components/RecentGames.js';
import { TrendControls, type ConfigOption } from '../../components/TrendControls.js';
import { createAuthController } from '../../lib/auth.js';
import { type BgRequest, type BgResponse } from '../../lib/messages.js';
import {
  fingerprintLabel,
  focusArea,
  graphMode,
  isNewPersonalBest,
  latestGame,
  mostPlayedFingerprint,
  personalBests,
  recentGames,
  trendSeries,
} from '../../lib/stats.js';
import { createStore, type Prefs, type StoredGame } from '../../lib/store.js';

const store = createStore(browser.storage.local);
// The popup uses only the controller's local read methods. The background owns
// every network request, token migration, refresh, and link operation.
const auth = createAuthController(browser.storage.local, {
  fetch: (url, init) => fetch(url, init),
});

/** Fire-and-forget message to the background worker (drain / unlink). */
function tellBackground(request: BgRequest): Promise<unknown> {
  return browser.runtime.sendMessage(request).catch(() => undefined);
}

/** Send a message and return the typed reply, or null on any failure. */
async function askBackground(request: BgRequest): Promise<BgResponse | null> {
  try {
    const reply: unknown = await browser.runtime.sendMessage(request);
    if (
      typeof reply === 'object' &&
      reply !== null &&
      typeof (reply as BgResponse).ok === 'boolean'
    ) {
      return reply as BgResponse;
    }
    return null;
  } catch {
    return null;
  }
}

const DEFAULT_PREFS: Prefs = { selectedFingerprint: null, range: 'all' };
const RECENT_LIMIT = 10;

/** Distinct configurations present in history, first-seen order, with labels. */
function configOptions(games: readonly StoredGame[]): ConfigOption[] {
  const seen = new Map<string, ConfigOption>();
  for (const game of games) {
    if (!seen.has(game.fingerprint)) {
      seen.set(game.fingerprint, {
        fingerprint: game.fingerprint,
        label: fingerprintLabel(game.record.settings),
      });
    }
  }
  return [...seen.values()];
}

/** The popup root: loads local history + prefs and renders the whole surface. */
export function App(): JSX.Element {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [linked, setLinked] = useState(false);
  const [needsRelink, setNeedsRelink] = useState(false);
  const [storageFailure, setStorageFailure] = useState(false);
  // The leaderboard opt-out for the linked account: null until read from the server.
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const [gamesResult, prefsResult, isLinked, relinkRequired, badgeText] = await Promise.all([
      store.listGames(),
      store.getPrefs(),
      auth.isLinked(),
      auth.needsRelink(),
      browser.action.getBadgeText({}).catch(() => ''),
    ]);
    if (gamesResult.ok) setGames(gamesResult.value);
    if (prefsResult.ok) setPrefs(prefsResult.value);
    setLinked(isLinked);
    setNeedsRelink(relinkRequired);
    setStorageFailure(badgeText === '!');
  }, []);

  useEffect(() => {
    void reload();
    // Kick a sync on open so pending uploads flush and chips refresh (no-op signed out).
    void tellBackground({ type: 'zl-drain' });
    const onChanged = (_changes: unknown, areaName: string): void => {
      if (areaName === 'local') void reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [reload]);

  // Read the leaderboard-privacy state once the account is linked (the
  // background owns the token, so the read is routed through it).
  useEffect(() => {
    if (!linked) {
      setOptedOut(null);
      return;
    }
    let active = true;
    void askBackground({ type: 'zl-get-profile' }).then((reply) => {
      if (active && reply?.ok === true && typeof reply.leaderboardOptOut === 'boolean') {
        setOptedOut(reply.leaderboardOptOut);
      }
    });
    // Pull the account's history so games synced from other devices (or before
    // this install) show up; the merged write triggers a reload via onChanged.
    void tellBackground({ type: 'zl-backfill' });
    return () => {
      active = false;
    };
  }, [linked]);

  function setPrivacy(next: boolean): void {
    const previous = optedOut;
    setOptedOut(next); // optimistic; revert if the write does not land
    void askBackground({ type: 'zl-set-privacy', optOut: next }).then((reply) => {
      if (reply?.ok !== true) setOptedOut(previous);
    });
  }

  const now = Date.now();
  const configs = useMemo(() => configOptions(games), [games]);
  const selectedFingerprint =
    prefs.selectedFingerprint ?? mostPlayedFingerprint(games) ?? configs[0]?.fingerprint ?? null;

  const fullSeries =
    selectedFingerprint === null ? [] : trendSeries(games, selectedFingerprint, 'all');
  const mode = graphMode(fullSeries.length);
  const series =
    selectedFingerprint !== null && mode === 'chart'
      ? trendSeries(games, selectedFingerprint, prefs.range)
      : fullSeries;

  const hasCaptureFailure = games.some((game) => game.status === 'capture_failed');
  const focus = useMemo(() => focusArea(games), [games]);

  function persistPrefs(next: Prefs): void {
    setPrefs(next);
    void store.setPrefs(next).then((result) => {
      if (!result.ok) setStorageFailure(true);
    });
  }

  function restore(id: string): void {
    void tellBackground({ type: 'zl-restore-game', id }).then(reload);
  }
  function remove(id: string): void {
    void tellBackground({ type: 'zl-remove-game', id }).then(reload);
  }
  function sync(): void {
    void tellBackground({ type: 'zl-begin-link' });
  }
  function unlink(): void {
    void tellBackground({ type: 'zl-unlink' }).then(reload);
  }

  return (
    <div className="zl-popup">
      <Header />

      <section className="zl-section">
        <Hero
          latest={latestGame(games)}
          isNewPersonalBest={isNewPersonalBest(games)}
          bests={personalBests(games)}
          nowMs={now}
        />
      </section>

      <section className="zl-section">
        <div className="zl-trend__head">
          <span className="zl-eyebrow">Trend</span>
          {mode === 'chart' && selectedFingerprint !== null ? (
            <TrendControls
              configs={configs}
              selectedFingerprint={selectedFingerprint}
              onSelectFingerprint={(fingerprint) => {
                persistPrefs({ ...prefs, selectedFingerprint: fingerprint });
              }}
              range={prefs.range}
              onSelectRange={(range) => {
                persistPrefs({ ...prefs, range });
              }}
            />
          ) : null}
        </div>
        <AdaptiveTrend mode={mode} series={series} nowMs={now} />
      </section>

      {focus !== null ? (
        <section className="zl-section">
          <div className="zl-trend__head">
            <span className="zl-eyebrow">Focus</span>
          </div>
          <p className="zl-focus">
            <span className="zl-focus__label">{focus.label}</span>:{' '}
            <span className="zl-num">{(focus.medianSolveMs / 1000).toFixed(1)}s</span> median,{' '}
            <span className="zl-num">{focus.ratio.toFixed(1)}×</span> your fastest area
          </p>
        </section>
      ) : null}

      {games.length > 0 ? (
        <section className="zl-section">
          <div className="zl-trend__head">
            <span className="zl-eyebrow">Recent</span>
          </div>
          <RecentGames
            games={recentGames(games, RECENT_LIMIT)}
            nowMs={now}
            onRestore={restore}
            onRemove={remove}
          />
        </section>
      ) : null}

      {hasCaptureFailure ? <CaptureFailedBanner /> : null}

      {storageFailure ? (
        <div className="zl-banner" role="alert">
          <span className="zl-banner__dot" />
          <div>
            <strong>A score may not have been saved.</strong>
            <p>
              Browser storage rejected an update. Free some extension storage, then play normally.
            </p>
          </div>
        </div>
      ) : null}

      <Footer
        linked={linked}
        needsRelink={needsRelink}
        optedOut={optedOut}
        onSync={sync}
        onUnlink={unlink}
        onSetPrivacy={setPrivacy}
      />
    </div>
  );
}
