import type { RankableDuration } from '@zetalog/shared';
import Link from 'next/link';

import type { BoardStats, UniversityOption } from '@/lib/db/queries';
import type { LeaderboardEntry } from '@/lib/db/rows';

import { Avatar } from './Avatar';
import { UniBadge } from './UniBadge';
import { UniversityFilter } from './UniversityFilter';
import { ViewerRowHighlight } from './ViewerRowHighlight';

/** Tab order per spec §6: 120s default, then 60s, 30s. */
const DURATION_TABS: readonly RankableDuration[] = [120, 60, 30];

interface LeaderboardViewProps {
  readonly title: string;
  readonly subtitle: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly duration: RankableDuration;
  readonly uniOptions: readonly UniversityOption[];
  readonly currentSlug: string | null;
  /** University badges are shown on the global board, redundant on a uni board. */
  readonly showBadges: boolean;
  readonly stats: BoardStats;
}

/**
 * The shared leaderboard surface (CO-3 §2): an editorial masthead — eyebrow,
 * maroon rule, duration tabs as large index numerals — over a ruled ledger
 * table, with a quiet stat rail. Server-rendered and identity-free (the
 * viewer's own row is decorated client-side by ViewerRowHighlight).
 */
export function LeaderboardView(props: LeaderboardViewProps): React.JSX.Element {
  const basePath = props.currentSlug === null ? '/' : `/uni/${props.currentSlug}`;

  return (
    <section aria-label={props.title}>
      <header className="masthead">
        <p className="masthead__eyebrow display">
          {props.currentSlug === null ? 'The leaderboard' : 'University board'}
        </p>
        <div className="masthead__row">
          <div>
            <h1 className="display board-title">{props.title}</h1>
            <p className="meta">{props.subtitle}</p>
          </div>
          <UniversityFilter
            options={props.uniOptions}
            currentSlug={props.currentSlug}
            duration={props.duration}
          />
        </div>
      </header>

      <div className="board-layout">
        <div>
          <nav className="index-tabs" role="tablist" aria-label="Game duration">
            {DURATION_TABS.map((duration) => (
              <Link
                key={duration}
                href={`${basePath}?d=${String(duration)}`}
                role="tab"
                aria-selected={duration === props.duration}
                className="index-tab num"
              >
                {duration}
                <span className="index-tab__unit">s</span>
              </Link>
            ))}
          </nav>

          {props.entries.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="card table-wrap">
              <table className="ltable">
                <thead>
                  <tr>
                    <th className="ltable__rank" scope="col">
                      #
                    </th>
                    <th className="ltable__avatar-h" scope="col" aria-label="Photo" />
                    <th scope="col">Player</th>
                    <th className="ltable__games-h" scope="col">
                      Games
                    </th>
                    <th className="ltable__score-h" scope="col">
                      Best
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {props.entries.map((entry, index) => (
                    <LeaderboardRow
                      key={entry.user_id}
                      entry={entry}
                      rank={index + 1}
                      showBadges={props.showBadges}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="stat-rail" aria-label="Leaderboard statistics">
          <StatTile label="Players" value={props.stats.players} />
          <StatTile label="Universities" value={props.stats.universities} />
          <StatTile label="Games validated" value={props.stats.gamesValidated} />
        </aside>
      </div>

      {/* The board above is a cached, identity-free server render. This client
          component highlights the viewer's own row after hydration, so the HTML
          stays cacheable and signed-out visitors cost zero auth work. */}
      <ViewerRowHighlight showAddBadge={props.showBadges} />
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="stat-tile">
      <span className="stat-tile__value num">{value.toLocaleString('en-GB')}</span>
      <span className="stat-tile__label">{label}</span>
    </div>
  );
}

function LeaderboardRow({
  entry,
  rank,
  showBadges,
}: {
  entry: LeaderboardEntry;
  rank: number;
  showBadges: boolean;
}): React.JSX.Element {
  // data-uid lets the client ViewerRowHighlight find and decorate the viewer's
  // own row after hydration (the cached HTML carries no viewer identity).
  return (
    <tr data-uid={entry.user_id}>
      <td className={`num ltable__rank${rank <= 3 ? ' rank-top' : ''}`}>{rank}</td>
      <td className="ltable__avatar-c">
        <Avatar url={entry.avatar_url} name={entry.display_name} size={28} />
      </td>
      <td>
        <span className="player">
          <span className="player__name">{entry.display_name}</span>
          {showBadges ? <Badge entry={entry} /> : null}
        </span>
      </td>
      <td className="num ltable__games meta">{entry.games_counted}</td>
      <td className="ltable__num ltable__score">{entry.best_score}</td>
    </tr>
  );
}

function Badge({ entry }: { entry: LeaderboardEntry }): React.JSX.Element | null {
  // Row order (CO-6): photo · name · badge · stats; the badge links to the
  // uni board. The viewer's own "＋ add badge" affordance is added client-side
  // by ViewerRowHighlight, so this render stays identity-free and cacheable.
  if (entry.university_slug !== null && entry.university_name !== null) {
    return (
      <Link href={`/uni/${entry.university_slug}`} className="player__badge-link">
        <UniBadge slug={entry.university_slug} name={entry.university_name} />
      </Link>
    );
  }
  return null;
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="card card--pad empty">
      <p className="empty__title num">No scores yet</p>
      <p className="meta">Install the extension and play a ranked game to appear here.</p>
    </div>
  );
}
