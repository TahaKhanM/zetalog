import { browser } from '#imports';
import { type JSX, useEffect, useState } from 'react';

import { Header } from '../../components/Header.js';
import { Hero } from '../../components/Hero.js';
import { isNewPersonalBest, latestGame, personalBests } from '../../lib/stats.js';
import { createStore, type StoredGame } from '../../lib/store.js';

const store = createStore(browser.storage.local);

/** The popup root: loads local history and renders the score summary. */
export function App(): JSX.Element {
  const [games, setGames] = useState<StoredGame[]>([]);

  useEffect(() => {
    void store.listGames().then((result) => {
      if (result.ok) setGames(result.value);
    });
  }, []);

  const now = Date.now();

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
    </div>
  );
}
