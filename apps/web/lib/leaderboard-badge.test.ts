import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  leaderboardBadgeFor,
  leaderboardBadgeForEntry,
  leaderboardBadgeIdSchema,
} from './leaderboard-badge';

describe('leaderboard badges', () => {
  it('accepts only service-supported identifiers', () => {
    expect(leaderboardBadgeIdSchema.parse('chrome-reviewer')).toBe('chrome-reviewer');
    expect(() => leaderboardBadgeIdSchema.parse('self-awarded')).toThrow();
  });

  it('maps the reviewer badge to a local, documented asset', () => {
    const badge = leaderboardBadgeFor('chrome-reviewer');
    expect(badge.name).toBe('Chrome Web Store reviewer');
    expect(badge.logo).toMatch(/^\/badges\/[\w.-]+\.png$/);
    expect(existsSync(join(import.meta.dirname, '../public', badge.logo))).toBe(true);
  });

  it('gives a service badge precedence over a university badge', () => {
    expect(
      leaderboardBadgeForEntry({
        leaderboard_badge: 'chrome-reviewer',
        university_name: 'University of Oxford',
        university_slug: 'university-of-oxford',
      }),
    ).toEqual({
      kind: 'service',
      name: 'Chrome Web Store reviewer',
      logo: '/badges/chrome-reviewer.png',
    });
  });

  it('retains ordinary university badges and empty rows', () => {
    expect(
      leaderboardBadgeForEntry({
        leaderboard_badge: null,
        university_name: 'University of Oxford',
        university_slug: 'university-of-oxford',
      }),
    ).toEqual({
      kind: 'university',
      name: 'University of Oxford',
      slug: 'university-of-oxford',
    });
    expect(
      leaderboardBadgeForEntry({
        leaderboard_badge: null,
        university_name: null,
        university_slug: null,
      }),
    ).toBeNull();
  });
});
