import { parseDuration } from '@/lib/leaderboard';
import {
  getCachedBoardStats,
  getCachedLeaderboard,
  getCachedUniversityOptions,
} from '@/lib/public-board';

import { LeaderboardView } from './_components/LeaderboardView';

/**
 * Cacheable public render, revalidated every 30s. The board reads NO
 * cookies — the viewer's own-row highlight is applied client-side after
 * hydration (see ViewerRowHighlight) — so this stays a shared, identity-free
 * server render and signed-out visitors cost zero auth work.
 */
export const revalidate = 30;

type SearchParams = Record<string, string | string[] | undefined>;

/** `/` — the global leaderboard. Reads via the anon (public) client. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const duration = parseDuration((await searchParams).d);
  const [entries, uniOptions, stats] = await Promise.all([
    getCachedLeaderboard(duration, null),
    getCachedUniversityOptions(),
    getCachedBoardStats(),
  ]);

  return (
    <LeaderboardView
      title="Global leaderboard"
      entries={entries}
      duration={duration}
      uniOptions={uniOptions}
      currentSlug={null}
      showBadges
      stats={stats}
    />
  );
}
