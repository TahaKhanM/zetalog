import type { JSX } from 'react';

import { relativeTime } from '../lib/format.js';
import { fingerprintLabel } from '../lib/stats.js';
import type { StoredGame } from '../lib/store.js';

interface RecentGamesProps {
  readonly games: readonly StoredGame[];
  readonly nowMs: number;
  readonly onRestore: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

/** A short status/quarantine flag, or null for a plain kept game. */
function flagLabel(game: StoredGame): string | null {
  if (game.quarantineReason === 'restart') return 'Restart';
  if (game.quarantineReason === 'outlier') return 'Outlier';
  if (game.status === 'capture_failed') return 'Capture failed';
  if (game.status === 'removed') return 'Removed';
  return null;
}

/**
 * The recent-games list (10 most recent, any status; spec §3.3). Non-kept
 * scores are greyed and struck through; each row carries its config, relative
 * time, a quarantine/status flag, and Restore / Remove actions. Remove is the
 * only destructive control, so it is the sole red element (§8).
 */
export function RecentGames(props: RecentGamesProps): JSX.Element {
  const { games, nowMs, onRestore, onRemove } = props;

  return (
    <div className="zl-recent" data-testid="recent-games">
      {games.map((game) => {
        const inactive = game.status !== 'kept';
        const flag = flagLabel(game);
        const showRestore = game.status === 'quarantined' || game.status === 'removed';
        const showRemove = game.status !== 'removed';
        return (
          <div
            className={`zl-game${inactive ? ' zl-game--inactive' : ''}`}
            key={game.record.id}
            data-status={game.status}
          >
            <span className="zl-num zl-game__score">
              {game.status === 'capture_failed' ? '—' : game.record.claimedScore}
            </span>
            <div className="zl-game__body">
              <div className="zl-game__config">{fingerprintLabel(game.record.settings)}</div>
              <div className="zl-game__sub">
                <span className="zl-num">{relativeTime(game.savedAtMs, nowMs)}</span>
                {flag === null ? null : <span className="zl-flag">{flag}</span>}
              </div>
            </div>
            <div className="zl-game__actions">
              {showRestore ? (
                <button
                  className="zl-btn"
                  type="button"
                  onClick={() => {
                    onRestore(game.record.id);
                  }}
                >
                  Restore
                </button>
              ) : null}
              {showRemove ? (
                <button
                  className="zl-btn zl-btn--danger"
                  type="button"
                  onClick={() => {
                    onRemove(game.record.id);
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
