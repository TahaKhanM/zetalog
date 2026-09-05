import type { RankableDuration } from '@zetalog/shared';
import Link from 'next/link';

import type { UniversityOption } from '@/lib/db/queries';
import type { LeaderboardEntry } from '@/lib/db/rows';
import { leaderboardBadgeForEntry } from '@/lib/leaderboard-badge';

import { UniBadge } from './UniBadge';
import { UniversityFilter } from './UniversityFilter';
import { ViewerRowHighlight } from './ViewerRowHighlight';

/** Tab order: 120s default, then 60s, 30s. */
const DURATION_TABS: readonly RankableDuration[] = [120, 60, 30];

interface LeaderboardViewProps {
  readonly title: string;
  /** Optional one-liner under the title (the global board runs without one). */
  readonly subtitle?: string | undefined;
  readonly entries: readonly LeaderboardEntry[];
  readonly duration: RankableDuration;
  readonly uniOptions: readonly UniversityOption[];
  readonly currentSlug: string | null;
  /** University badges are shown on the global board, redundant on a uni board. */
  readonly showBadges: boolean;
  /** A university board's own mark, branded large in the masthead. */
  readonly universityBadge?: { readonly slug: string; readonly name: string } | undefined;
}

/**
 * The shared leaderboard surface: an editorial masthead — eyebrow,
 * maroon rule, duration tabs as large index numerals — over a ruled ledger
 * table. Server-rendered and identity-free (the
 * viewer's own row is decorated client-side by ViewerRowHighlight).
 */
export function LeaderboardView(props: LeaderboardViewProps): React.JSX.Element {
  const basePath = props.currentSlug === null ? '/' : `/uni/${props.currentSlug}`;

  return (
    <section aria-label={props.title} className="board-enter">
      <header className="masthead">
        <p className="masthead__eyebrow display">
          {props.currentSlug === null ? 'The leaderboard' : 'University board'}
        </p>
        <div className="masthead__row">
          <div>
            <div className="board-title-row">
              {props.universityBadge !== undefined ? (
                <UniBadge
                  slug={props.universityBadge.slug}
                  name={props.universityBadge.name}
                  size="masthead"
                />
              ) : null}
              <h1 className="display board-title">{props.title}</h1>
            </div>
            {props.subtitle !== undefined ? <p className="meta">{props.subtitle}</p> : null}
          </div>
        </div>
      </header>

      <div className="board-layout">
        <div>
          <div className="board-controls">
            <nav className="index-tabs" aria-label="Game duration">
              {DURATION_TABS.map((duration) => (
                <Link
                  key={duration}
                  href={`${basePath}?d=${String(duration)}`}
                  aria-current={duration === props.duration ? 'page' : undefined}
                  className="index-tab num"
                >
                  {duration}
                  <span className="index-tab__unit">s</span>
                </Link>
              ))}
            </nav>
            <UniversityFilter
              options={props.uniOptions}
              currentSlug={props.currentSlug}
              duration={props.duration}
            />
          </div>

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
                    <th scope="col">Player</th>
                    {props.showBadges ? (
                      <th className="ltable__badge-h" scope="col" aria-label="Badge" />
                    ) : null}
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
      </div>

      {/* The board above is a cached, identity-free server render. This client
          component highlights the viewer's own row after hydration, so the HTML
          stays cacheable and signed-out visitors cost zero auth work. */}
      <ViewerRowHighlight showAddBadge={props.showBadges} />
    </section>
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
  return (
    <tr>
      <td className={`num ltable__rank${rank <= 3 ? ' rank-top' : ''}`}>{rank}</td>
      <td>
        <span className="player">
          <span className="player__name">{entry.display_name}</span>
        </span>
      </td>
      {showBadges ? (
        <td className="ltable__badge-c">
          <LeaderboardBadge entry={entry} />
        </td>
      ) : null}
      <td className="num ltable__games meta">{entry.games_counted}</td>
      <td className="ltable__num ltable__score">{entry.best_score}</td>
    </tr>
  );
}

function LeaderboardBadge({ entry }: { entry: LeaderboardEntry }): React.JSX.Element | null {
  // Service-managed badges take precedence over university marks and do not
  // link to a university board. Ordinary university marks keep their existing
  // link. The viewer's own add-badge affordance is mounted client-side.
  const badge = leaderboardBadgeForEntry(entry);
  if (badge === null) return null;
  if (badge.kind === 'service') {
    return (
      <img
        src={badge.logo}
        alt={`${badge.name} badge`}
        title={badge.name}
        className="uni-badge uni-badge--logo leaderboard-badge"
        width={24}
        height={24}
      />
    );
  }
  return (
    <Link href={`/uni/${badge.slug}`} className="player__badge-link">
      <UniBadge slug={badge.slug} name={badge.name} />
    </Link>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="card card--pad empty">
      <p className="empty__title num">No scores yet</p>
      <p className="meta">
        <Link href="/how-it-works">Install the extension</Link> and play a ranked game to appear
        here.
      </p>
    </div>
  );
}
