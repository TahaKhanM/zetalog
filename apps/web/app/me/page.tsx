import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { userIdFromCookies } from '@/lib/auth';
import { getOwnGames, getProfile, getUniversityById } from '@/lib/db/queries';
import { formatRelativeTime } from '@/lib/format';
import { personalBests, projectGame } from '@/lib/me';
import { createClient } from '@/lib/supabase/server';

import { DisplayNameForm } from './_components/DisplayNameForm';
import { HistoryTable } from './_components/HistoryTable';
import { ProgressChart } from './_components/ProgressChart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My progress' };

/** `/me` — the private dashboard (spec §6). Auth-gated by the proxy and here. */
export default async function MePage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const userId = await userIdFromCookies(supabase);
  if (userId === null) redirect('/signin?next=/me');

  const [profile, gameRows] = await Promise.all([
    getProfile(supabase, userId),
    getOwnGames(supabase, userId),
  ]);

  const games = gameRows.map(projectGame);
  const bests = personalBests(games);
  const history = games.filter((game) => game.status !== 'user_removed');
  const displayName = profile?.display_name ?? null;
  const university =
    profile?.university_id != null
      ? await getUniversityById(supabase, profile.university_id)
      : null;

  return (
    <div className="me">
      <header className="me__head">
        <h1 className="display board-title">My progress</h1>
      </header>

      {displayName === null ? (
        <p className="notice" style={{ marginBottom: '1.25rem' }}>
          Choose a display name to appear on the leaderboards.
        </p>
      ) : null}

      <section className="card card--pad me__section">
        <h2 className="me__h2">Account</h2>
        <DisplayNameForm current={displayName} />
      </section>

      <section className="me__section">
        <h2 className="me__h2">Personal bests</h2>
        {bests.length === 0 ? (
          <p className="meta">No ranked games yet — play a default-config game to set a PB.</p>
        ) : (
          <div className="pb-grid">
            {bests.map((best) => (
              <div key={best.duration} className="card card--pad pb-card">
                <span className="pb-card__dur num">{best.duration}s</span>
                <span className="pb-card__score num">{best.best}</span>
                <span className="meta">
                  {best.count} game{best.count === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card card--pad me__section">
        <h2 className="me__h2">Trend</h2>
        <ProgressChart games={games} />
      </section>

      <section className="me__section">
        <h2 className="me__h2">University badge</h2>
        <div className="card card--pad badge-card">
          {university !== null && profile?.uni_verified_at != null ? (
            <>
              <div>
                <span className="chip chip--badge">{university.name}</span>
                <p className="meta" style={{ marginTop: '0.5rem' }}>
                  Verified {formatRelativeTime(profile.uni_verified_at, Date.now())}.
                </p>
              </div>
              <Link href="/verify" className="btn btn--ghost btn--sm">
                Change
              </Link>
            </>
          ) : (
            <>
              <p className="meta" style={{ margin: 0 }}>
                No university badge yet. Verify a UK university email to earn one.
              </p>
              <Link href="/verify" className="btn btn--primary btn--sm">
                Verify email
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="me__section">
        <h2 className="me__h2">History</h2>
        <HistoryTable games={history} />
      </section>

      <form action="/auth/signout" method="post" className="me__signout">
        <button type="submit" className="btn btn--ghost btn--sm">
          Sign out
        </button>
      </form>
    </div>
  );
}
