import { ZETAMAC_DEFAULT_SETTINGS, fingerprint } from '@zetalog/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PersonalBests } from '../lib/stats.js';
import type { StoredGame } from '../lib/store.js';
import { Hero } from './Hero.js';

afterEach(cleanup);

const NOW = 1_700_000_000_000;

function keptGame(score: number, claimedScore: number = score): StoredGame {
  return {
    record: {
      id: crypto.randomUUID(),
      startedAtMs: NOW - 120_000,
      playedMs: 120_000,
      settings: ZETAMAC_DEFAULT_SETTINGS,
      events: [],
      claimedScore,
    },
    verifiedScore: score,
    fingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
    rankableDuration: 120,
    status: 'kept',
    savedAtMs: NOW - 120_000,
  };
}

const noBests: PersonalBests = { 30: null, 60: null, 120: null };

describe('Hero', () => {
  it('shows an empty state when there is no latest game', () => {
    render(<Hero latest={null} isNewPersonalBest={false} bests={noBests} nowMs={NOW} />);
    expect(screen.getByText(/No games yet/i)).toBeTruthy();
    expect(screen.queryByTestId('hero-score')).toBeNull();
  });

  it('renders the latest score, config label, and PB row', () => {
    render(
      <Hero
        latest={keptGame(58)}
        isNewPersonalBest={false}
        bests={{ 30: 40, 60: null, 120: 58 }}
        nowMs={NOW}
      />,
    );
    expect(screen.getByTestId('hero-score').textContent).toBe('58');
    expect(screen.getByText(/Default · 120s/)).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
  });

  it('shows the verified score, not the scraped claimed score', () => {
    // Claimed 51 undercounts the game; the verified score is 52.
    render(
      <Hero
        latest={keptGame(52, 51)}
        isNewPersonalBest={false}
        bests={{ 30: null, 60: null, 120: 52 }}
        nowMs={NOW}
      />,
    );
    expect(screen.getByTestId('hero-score').textContent).toBe('52');
  });

  it('does not flag a new PB when the score is not one', () => {
    render(<Hero latest={keptGame(58)} isNewPersonalBest={false} bests={noBests} nowMs={NOW} />);
    expect(screen.queryByText('New PB')).toBeNull();
    expect(screen.getByTestId('hero-score').className).not.toContain('zl-hero__score--pb');
  });

  it('flags a new personal best with the red score and chip', () => {
    render(
      <Hero
        latest={keptGame(72)}
        isNewPersonalBest
        bests={{ 30: null, 60: null, 120: 72 }}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText('New PB')).toBeTruthy();
    expect(screen.getByTestId('hero-score').className).toContain('zl-hero__score--pb');
  });
});
