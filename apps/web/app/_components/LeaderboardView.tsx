import type { RankableDuration } from '@zetalog/shared';
import Link from 'next/link';

import type { UniversityOption } from '@/lib/db/queries';
import type { LeaderboardEntry } from '@/lib/db/rows';

import { UniversityFilter } from './UniversityFilter';

/** Tab order per spec §6: 120s default, then 60s, 30s. */
const DURATION_TABS: readonly RankableDuration[] = [120, 60, 30];

interface LeaderboardViewProps {
  readonly title: string;
  readonly subtitle: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly duration: RankableDuration;
  readonly uniOptions: readonly UniversityOption[];
  readonly currentSlug: string | null;
  readonly viewerId: string | null;
  /** University badges are shown on the global board, redundant on a uni board. */
  readonly showBadges: boolean;
}

/** The shared leaderboard surface for the global (`/`) and per-university boards. */
export function LeaderboardView(props: LeaderboardViewProps): React.JSX.Element {
  const basePath = props.currentSlug === null ? '/' : `/uni/${props.currentSlug}`;

  return (
    <section aria-label={props.title}>
      <div className="board-head">
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

      <div className="board-controls">
        <div className="tabs" role="tablist" aria-label="Game duration">
          {DURATION_TABS.map((duration) => (
            <Link
              key={duration}
              href={`${basePath}?d=${String(duration)}`}
              role="tab"
              aria-selected={duration === props.duration}
              className="tab"
            >
              {duration}s
            </Link>
          ))}
        </div>
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
                  isSelf={entry.user_id === props.viewerId}
                  showBadges={props.showBadges}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LeaderboardRow({
  entry,
  rank,
  isSelf,
  showBadges,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isSelf: boolean;
  showBadges: boolean;
}): React.JSX.Element {
  return (
    <tr className={isSelf ? 'row-self' : undefined}>
      <td className={`num ltable__rank${rank <= 3 ? ' rank-top' : ''}`}>{rank}</td>
      <td>
        <span className="player">
          <span className="player__name">{entry.display_name}</span>
          {showBadges ? <Badge entry={entry} isSelf={isSelf} /> : null}
        </span>
      </td>
      <td className="ltable__num ltable__score">{entry.best_score}</td>
    </tr>
  );
}

function Badge({
  entry,
  isSelf,
}: {
  entry: LeaderboardEntry;
  isSelf: boolean;
}): React.JSX.Element | null {
  if (entry.university_slug !== null && entry.university_name !== null) {
    return (
      <Link href={`/uni/${entry.university_slug}`} className="chip chip--badge">
        {entry.university_name}
      </Link>
    );
  }
  if (isSelf) {
    return (
      <Link href="/verify" className="chip chip--add">
        ＋ add badge
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
