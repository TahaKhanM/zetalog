import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buildAnalysis } from '@/lib/analysis';
import { userIdFromCookies } from '@/lib/auth';
import { getOwnGames, getProfile, getUniversityById } from '@/lib/db/queries';
import { personalBests, projectGame } from '@/lib/me';
import { createClient } from '@/lib/supabase/server';

import { Avatar } from '../_components/Avatar';
import { UniBadge } from '../_components/UniBadge';
import { AnalysisSections } from './_components/AnalysisSections';
import { HistoryTable } from './_components/HistoryTable';
import { ProgressChart } from './_components/ProgressChart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My progress' };

/**
 * `/me` — the private progress dashboard (spec §6): personal bests, the trend
 * chart, in-depth per-problem analysis, and history. Account settings live at
 * `/account`; this page is purely about the numbers.
 */
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
  const analysis = buildAnalysis(gameRows);
  const displayName = profile?.display_name ?? null;
  const university =
    profile?.university_id != null && profile.uni_verified_at != null
      ? await getUniversityById(supabase, profile.university_id)
      : null;

  return (
    <div className="me">
      <header className="masthead me__head">
        <p className="masthead__eyebrow display">The workbook</p>
        <div className="masthead__row">
          <div>
            <h1 className="display board-title">My progress</h1>
            <p className="meta">Recomputed from your recorded games.</p>
          </div>
          <Link href="/account" className="identity-chip" aria-label="Account settings">
            <Avatar name={displayName ?? '?'} size={24} />
            {university !== null ? (
              <UniBadge slug={university.slug} name={university.name} />
            ) : null}
            <span className="identity-chip__name">{displayName ?? 'Set a display name'}</span>
            <span className="identity-chip__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </header>

      {displayName === null ? (
        <p className="notice" style={{ marginBottom: '1.25rem' }}>
          Choose a display name in <Link href="/account">account settings</Link> to appear on the
          leaderboards.
        </p>
      ) : null}

      <section className="me__section" aria-label="Personal bests">
        <h2 className="me__h2">Personal bests</h2>
        {bests.length === 0 ? (
          <p className="meta">No ranked games yet. Play a default-settings game to set a best.</p>
        ) : (
          <div className="pb-grid">
            {bests.map((best) => (
              <div key={best.duration} className="pb-card">
                <span className="pb-card__dur num">
                  {best.duration}
                  <span className="pb-card__unit">s</span>
                </span>
                <span className="pb-card__score num">{best.best}</span>
                <span className="meta">
                  <span className="num">{best.count}</span> game{best.count === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card card--pad me__section" aria-label="Trend">
        <h2 className="me__h2">Trend</h2>
        <ProgressChart games={games} />
      </section>

      {analysis !== null ? (
        <AnalysisSections analysis={analysis} />
      ) : (
        <section className="me__section" aria-label="Analysis">
          <h2 className="me__h2">Analysis</h2>
          <p className="meta">
            Play a few games and this page breaks your solve times down by operation, times table
            and skill. It also names the problems that slow you down.
          </p>
        </section>
      )}

      <section className="me__section" aria-label="History">
        <h2 className="me__h2">History</h2>
        <HistoryTable games={history} />
      </section>
    </div>
  );
}
