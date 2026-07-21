'use client';

import type { RankableDuration } from '@zetalog/shared';
import { useRouter } from 'next/navigation';

import type { UniversityOption } from '@/lib/db/queries';

/**
 * The university filter on the leaderboard. Selecting a university navigates to
 * its board (`/uni/[slug]`), preserving the chosen duration; "All universities"
 * returns to the global board.
 */
export function UniversityFilter({
  options,
  currentSlug,
  duration,
}: {
  options: readonly UniversityOption[];
  currentSlug: string | null;
  duration: RankableDuration;
}): React.JSX.Element {
  const router = useRouter();

  return (
    <label className="uni-filter">
      <span className="uni-filter__label">University</span>
      <select
        className="field field--select"
        value={currentSlug ?? ''}
        onChange={(event) => {
          const slug = event.target.value;
          router.push(
            slug === '' ? `/?d=${String(duration)}` : `/uni/${slug}?d=${String(duration)}`,
          );
        }}
      >
        <option value="">All universities</option>
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
