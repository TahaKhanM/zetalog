import { userIdFromCookies } from '@/lib/auth';
import { getLeaderboard, getUniversityOptions } from '@/lib/db/queries';
import { parseDuration } from '@/lib/leaderboard';
import { createClient } from '@/lib/supabase/server';

import { LeaderboardView } from './_components/LeaderboardView';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** `/` — the global leaderboard (spec §6). Reads via the RLS-scoped client. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const duration = parseDuration((await searchParams).d);
  const supabase = await createClient();
  const [entries, uniOptions, viewerId] = await Promise.all([
    getLeaderboard(supabase, { duration }),
    getUniversityOptions(supabase),
    userIdFromCookies(supabase),
  ]);

  return (
    <LeaderboardView
      title="Global leaderboard"
      subtitle="Personal-best Zetamac scores, recomputed and validated server-side."
      entries={entries}
      duration={duration}
      uniOptions={uniOptions}
      currentSlug={null}
      viewerId={viewerId}
      showBadges
    />
  );
}
