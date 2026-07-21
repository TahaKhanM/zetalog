import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LeaderboardView } from '@/app/_components/LeaderboardView';
import { userIdFromCookies } from '@/lib/auth';
import { getLeaderboard, getUniversityBySlug, getUniversityOptions } from '@/lib/db/queries';
import { parseDuration } from '@/lib/leaderboard';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
interface Params {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const university = await getUniversityBySlug(supabase, slug);
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
  const supabase = await createClient();

  const university = await getUniversityBySlug(supabase, slug);
  if (university === null) notFound();

  const [entries, uniOptions, viewerId] = await Promise.all([
    getLeaderboard(supabase, { duration, universitySlug: slug }),
    getUniversityOptions(supabase),
    userIdFromCookies(supabase),
  ]);

  return (
    <LeaderboardView
      title={university.name}
      subtitle="University leaderboard — verified members only."
      entries={entries}
      duration={duration}
      uniOptions={uniOptions}
      currentSlug={slug}
      viewerId={viewerId}
      showBadges={false}
    />
  );
}
