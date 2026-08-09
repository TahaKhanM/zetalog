import { z } from 'zod';

/** Badge identifiers that the service, never the user, may assign to a profile. */
export const leaderboardBadgeIdSchema = z.enum(['chrome-reviewer']);
export type LeaderboardBadgeId = z.infer<typeof leaderboardBadgeIdSchema>;

export interface LeaderboardBadge {
  readonly name: string;
  readonly logo: string;
}

interface BadgeEntry {
  readonly leaderboard_badge: LeaderboardBadgeId | null;
  readonly university_name: string | null;
  readonly university_slug: string | null;
}

export type LeaderboardBadgePresentation =
  | ({ readonly kind: 'service' } & LeaderboardBadge)
  | { readonly kind: 'university'; readonly name: string; readonly slug: string }
  | null;

const BADGES: Readonly<Record<LeaderboardBadgeId, LeaderboardBadge>> = {
  'chrome-reviewer': {
    name: 'Chrome Web Store reviewer',
    logo: '/badges/chrome-reviewer.png',
  },
};

/** Return the presentation for a database-validated leaderboard badge. */
export function leaderboardBadgeFor(id: LeaderboardBadgeId): LeaderboardBadge {
  return BADGES[id];
}

/** Resolve the one mark shown in a leaderboard row, with service badges first. */
export function leaderboardBadgeForEntry(entry: BadgeEntry): LeaderboardBadgePresentation {
  if (entry.leaderboard_badge !== null) {
    return { kind: 'service', ...leaderboardBadgeFor(entry.leaderboard_badge) };
  }
  if (entry.university_name !== null && entry.university_slug !== null) {
    return { kind: 'university', name: entry.university_name, slug: entry.university_slug };
  }
  return null;
}
