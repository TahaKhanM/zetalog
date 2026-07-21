import { RANKABLE_DURATIONS } from '@zetalog/shared';
import type { JSX } from 'react';

import { relativeTime } from '../lib/format.js';
import type { PersonalBests } from '../lib/stats.js';
import { fingerprintLabel } from '../lib/stats.js';
import type { StoredGame } from '../lib/store.js';

interface HeroProps {
  /** Most recent kept game, or null when nothing has been recorded yet. */
  readonly latest: StoredGame | null;
  /** True when {@link latest} set a new personal best for its duration. */
  readonly isNewPersonalBest: boolean;
  readonly bests: PersonalBests;
  /** Wall-clock reference for the relative-time label. */
  readonly nowMs: number;
}

/**
 * The hero: the latest kept score in mono tabular numerals (red on a new PB),
 * its config + relative time, and the per-duration personal-best row (spec
 * §3.3). Numerals are the visual hero of the screen (§8).
 */
export function Hero(props: HeroProps): JSX.Element {
  const { latest, isNewPersonalBest, bests, nowMs } = props;

  if (latest === null) {
    return (
      <div className="zl-hero">
        <div className="zl-hero__label">
          <span className="zl-eyebrow">Latest</span>
        </div>
        <p className="zl-hero__empty">No games yet — play a round on Zetamac to begin.</p>
      </div>
    );
  }

  return (
    <div className="zl-hero">
      <div className="zl-hero__label">
        <span className="zl-eyebrow">Latest</span>
        {isNewPersonalBest ? <span className="zl-chip">New PB</span> : null}
      </div>
      <span
        className={`zl-num zl-hero__score${isNewPersonalBest ? ' zl-hero__score--pb' : ''}`}
        data-testid="hero-score"
      >
        {latest.verifiedScore}
      </span>
      <p className="zl-hero__meta">
        {fingerprintLabel(latest.record.settings)} ·{' '}
        <span className="zl-num">{relativeTime(latest.savedAtMs, nowMs)}</span>
      </p>

      <div className="zl-pbs">
        {RANKABLE_DURATIONS.map((duration) => {
          const best = bests[duration];
          return (
            <div className="zl-pb" key={duration}>
              <span className="zl-pb__dur">
                <span className="zl-num">{duration}</span>s best
              </span>
              {best === null ? (
                <span className="zl-num zl-pb__val zl-pb__val--empty">—</span>
              ) : (
                <span className="zl-num zl-pb__val">{best}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
