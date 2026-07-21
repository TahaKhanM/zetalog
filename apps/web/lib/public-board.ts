import type { RankableDuration } from '@zetalog/shared';
import { unstable_cache } from 'next/cache';

import {
  getBoardStats,
  getLeaderboard,
  getUniversityBySlug,
  getUniversityOptions,
  type BoardStats,
  type UniversityOption,
} from './db/queries';
import type { LeaderboardEntry, UniversityRow } from './db/rows';
import { createPublicClient } from './supabase/public';

/**
 * Cached public-board reads. The `/` and `/uni/[slug]` pages access
 * `searchParams` (the `?d=` duration tab), so Next renders them on demand; but
 * the underlying DB reads are the real cost (cross-region round-trips to the
 * London database), so we cache them for 30s — matching each page's
 * `revalidate` — keyed by their arguments. Within that window every visitor to
 * the same board shares one cached result and the page does zero DB work.
 *
 * Every read goes through the cookieless {@link createPublicClient} (anon role),
 * so nothing here depends on the request — a requirement for `unstable_cache`.
 */

const REVALIDATE_SECONDS = 30;

/** Best-per-user leaderboard for a duration, optionally scoped to a university. */
export const getCachedLeaderboard = unstable_cache(
  (duration: RankableDuration, universitySlug: string | null): Promise<LeaderboardEntry[]> =>
    getLeaderboard(
      createPublicClient(),
      universitySlug === null ? { duration } : { duration, universitySlug },
    ),
  ['public-leaderboard'],
  { revalidate: REVALIDATE_SECONDS, tags: ['leaderboard'] },
);

/** The universities that currently have ranked entries (the filter select). */
export const getCachedUniversityOptions = unstable_cache(
  (): Promise<UniversityOption[]> => getUniversityOptions(createPublicClient()),
  ['public-university-options'],
  { revalidate: REVALIDATE_SECONDS, tags: ['leaderboard'] },
);

/** A university by slug (drives the `/uni/[slug]` 404 + its title). */
export const getCachedUniversityBySlug = unstable_cache(
  (slug: string): Promise<UniversityRow | null> => getUniversityBySlug(createPublicClient(), slug),
  ['public-university-by-slug'],
  { revalidate: REVALIDATE_SECONDS, tags: ['leaderboard'] },
);

/** Masthead stat-rail figures (players, universities, games validated). */
export const getCachedBoardStats = unstable_cache(
  (): Promise<BoardStats> => getBoardStats(createPublicClient()),
  ['public-board-stats'],
  { revalidate: REVALIDATE_SECONDS, tags: ['leaderboard'] },
);
