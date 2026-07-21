import { browser } from '#imports';
import { type JSX, useEffect, useMemo, useState } from 'react';

import { AdaptiveTrend } from '../../components/AdaptiveTrend.js';
import { Header } from '../../components/Header.js';
import { Hero } from '../../components/Hero.js';
import { TrendControls, type ConfigOption } from '../../components/TrendControls.js';
import {
  fingerprintLabel,
  graphMode,
  isNewPersonalBest,
  latestGame,
  mostPlayedFingerprint,
  personalBests,
  trendSeries,
} from '../../lib/stats.js';
import { createStore, type Prefs, type StoredGame } from '../../lib/store.js';

const store = createStore(browser.storage.local);

const DEFAULT_PREFS: Prefs = { selectedFingerprint: null, range: 'all' };

/** Distinct configurations present in history, most-played first, with labels. */
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

/** The popup root: loads local history + prefs and renders the score summary and trend. */
export function App(): JSX.Element {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    void store.listGames().then((result) => {
      if (result.ok) setGames(result.value);
    });
    void store.getPrefs().then((result) => {
      if (result.ok) setPrefs(result.value);
    });
  }, []);

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

  function persistPrefs(next: Prefs): void {
    setPrefs(next);
    void store.setPrefs(next);
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
    </div>
  );
}
