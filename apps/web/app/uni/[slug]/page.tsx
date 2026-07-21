import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LeaderboardView } from '@/app/_components/LeaderboardView';
import { parseDuration } from '@/lib/leaderboard';
import {
  getCachedBoardStats,
  getCachedLeaderboard,
  getCachedUniversityBySlug,
  getCachedUniversityOptions,
} from '@/lib/public-board';

/**
 * Cacheable public render, revalidated every 30s (spec §6). Reads no cookies —
 * the viewer's own-row highlight is applied client-side after hydration (see
 * ViewerRowHighlight) — so the board stays a shared, identity-free server render.
 */
export const revalidate = 30;

type SearchParams = Record<string, string | string[] | undefined>;
interface Params {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const university = await getCachedUniversityBySlug(slug);
  return { title: university?.name ?? 'University leaderboard' };
}

/** `/uni/[slug]` — a single university's leaderboard; 404 on an unknown slug. */
export default async function UniversityPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const { slug } = await params;
  const duration = parseDuration((await searchParams).d);

  const university = await getCachedUniversityBySlug(slug);
  if (university === null) notFound();

  const [entries, uniOptions, stats] = await Promise.all([
    getCachedLeaderboard(duration, slug),
    getCachedUniversityOptions(),
    getCachedBoardStats(),
  ]);

  return (
    <LeaderboardView
      title={university.name}
      subtitle="University leaderboard — verified members only."
      entries={entries}
      duration={duration}
      uniOptions={uniOptions}
      currentSlug={slug}
      showBadges={false}
      stats={stats}
    />
  );
}
