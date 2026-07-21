import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { recomputeScore } from '@zetalog/shared';

import { userIdFromCookies } from '@/lib/auth';
import { getProfile, getQuarantineQueue } from '@/lib/db/queries';
import type { AdminGameRow } from '@/lib/db/rows';
import { formatRelativeTime } from '@/lib/format';
import { reasonsFor } from '@/lib/me';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { AdminActions } from './_components/AdminActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Review queue' };

/**
 * `/admin` — the quarantine review queue (spec §5). Gated on the caller's own
 * `is_admin`; the queue itself is read with the service client because RLS hides
 * other users' games. Each card recomputes per-problem solve times server-side.
 */
export default async function AdminPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const userId = await userIdFromCookies(supabase);
  if (userId === null) redirect('/signin?next=/admin');

  const profile = await getProfile(supabase, userId);
  if (profile?.is_admin !== true) notFound();

  const queue = await getQuarantineQueue(createServiceClient());
  const now = Date.now();

  return (
    <div>
      <header className="me__head">
        <h1 className="display board-title">Review queue</h1>
        <p className="meta">
          {queue.length === 0
            ? 'Nothing to review.'
            : `${String(queue.length)} game${queue.length === 1 ? '' : 's'} awaiting review.`}
        </p>
      </header>

      {queue.length === 0 ? (
        <div className="card card--pad empty">
          <p className="empty__title num">All clear</p>
          <p className="meta">No quarantined games right now.</p>
        </div>
      ) : (
        <div className="admin-list">
          {queue.map((game) => (
            <AdminCard key={game.id} game={game} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminCard({ game, now }: { game: AdminGameRow; now: number }): React.JSX.Element {
  const solves = recomputeScore(game.telemetry).outcomes.map((outcome) => outcome.solveMs);
  const reasons = reasonsFor(game.validation);

  return (
    <article className="card card--pad admin-card">
      <header className="admin-card__head">
        <div>
          <span className="player__name">{game.display_name ?? 'Unknown player'}</span>
          <span className="meta"> · received {formatRelativeTime(game.received_at, now)}</span>
        </div>
        <span className="chip chip--badge num">
          {game.rankable_duration === null ? '—' : `${String(game.rankable_duration)}s`}
        </span>
      </header>

      <div className="admin-card__scores">
        <div className="admin-score">
          <span className="uni-filter__label">Claimed</span>
          <span className="num admin-score__value">{game.claimed_score}</span>
        </div>
        <div className="admin-score">
          <span className="uni-filter__label">Server</span>
          <span className="num admin-score__value">{game.server_score}</span>
        </div>
      </div>

      {reasons.length > 0 ? (
        <div className="admin-card__flags">
          {reasons.map((reason) => (
            <span key={reason} className="chip chip--quarantined">
              {reason}
            </span>
          ))}
        </div>
      ) : null}

      <div>
        <span className="uni-filter__label">Per-problem solve time</span>
        <SolveBars solves={solves} />
      </div>

      <AdminActions gameId={game.id} />
    </article>
  );
}

/** Per-problem solve times as thin bars; sub-human (<250ms) bars in maroon. */
function SolveBars({ solves }: { solves: readonly number[] }): React.JSX.Element {
  if (solves.length === 0) {
    return <p className="meta">No solved problems in the event stream.</p>;
  }
  const max = solves.reduce((acc, value) => Math.max(acc, value), 1);
  const barWidth = 6;
  const gap = 3;
  const height = 56;
  const width = solves.length * (barWidth + gap);

  return (
    <svg
      className="solve-bars"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label="Per-problem solve times in milliseconds"
      preserveAspectRatio="none"
    >
      {solves.map((ms, index) => {
        const barHeight = Math.max(2, (ms / max) * (height - 2));
        return (
          <rect
            key={`${String(index)}-${String(ms)}`}
            x={index * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={2}
            className={ms < 250 ? 'solve-bar solve-bar--fast' : 'solve-bar'}
          />
        );
      })}
    </svg>
  );
}
