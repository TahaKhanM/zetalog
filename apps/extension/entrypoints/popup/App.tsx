import { browser } from '#imports';
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';

import { AdaptiveTrend } from '../../components/AdaptiveTrend.js';
import { CaptureFailedBanner } from '../../components/CaptureFailedBanner.js';
import { Footer } from '../../components/Footer.js';
import { Header } from '../../components/Header.js';
import { Hero } from '../../components/Hero.js';
import { RecentGames } from '../../components/RecentGames.js';
import { TrendControls, type ConfigOption } from '../../components/TrendControls.js';
import { WEB_APP_URL } from '../../lib/config.js';
import {
  fingerprintLabel,
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

  const reload = useCallback(async (): Promise<void> => {
    const [gamesResult, prefsResult] = await Promise.all([store.listGames(), store.getPrefs()]);
    if (gamesResult.ok) setGames(gamesResult.value);
    if (prefsResult.ok) setPrefs(prefsResult.value);
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = (_changes: unknown, areaName: string): void => {
      if (areaName === 'local') void reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [reload]);

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

  function persistPrefs(next: Prefs): void {
    setPrefs(next);
    void store.setPrefs(next);
  }

  function restore(id: string): void {
    void store.restore(id).then(reload);
  }
  function remove(id: string): void {
    void store.remove(id).then(reload);
  }
  function sync(): void {
    void browser.tabs.create({ url: `${WEB_APP_URL}/link` });
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

      <Footer onSync={sync} />
    </div>
  );
}
