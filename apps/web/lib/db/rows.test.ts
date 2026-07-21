import { describe, expect, it } from 'vitest';

import {
  gameRowSchema,
  gameStatusSchema,
  leaderboardEntrySchema,
  parseRows,
  profileRowSchema,
  storedValidationSchema,
  universityRowSchema,
} from './rows';

describe('leaderboardEntrySchema', () => {
  const valid = {
    user_id: '11111111-1111-4111-8111-111111111111',
    display_name: 'ada',
    duration: 120,
    best_score: 88,
    games_counted: 12,
    university_name: 'University of Oxford',
    university_slug: 'university-of-oxford',
    avatar_url: 'https://example.supabase.co/storage/v1/object/public/avatars/x?v=1',
  };

  it('accepts a verified entry with university columns', () => {
    expect(leaderboardEntrySchema.parse(valid)).toEqual(valid);
  });

  it('accepts an unverified entry with null university columns', () => {
    const row = { ...valid, university_name: null, university_slug: null };
    expect(leaderboardEntrySchema.parse(row)).toEqual(row);
  });

  it('accepts a null avatar (none uploaded yet)', () => {
    const row = { ...valid, avatar_url: null };
    expect(leaderboardEntrySchema.parse(row)).toEqual(row);
  });

  it('rejects a non-rankable duration', () => {
    expect(() => leaderboardEntrySchema.parse({ ...valid, duration: 90 })).toThrow();
  });

  it('rejects a negative best score', () => {
    expect(() => leaderboardEntrySchema.parse({ ...valid, best_score: -1 })).toThrow();
  });
});

describe('gameStatusSchema', () => {
  it('accepts every game_status enum member', () => {
    for (const status of ['accepted', 'quarantined', 'rejected', 'user_removed']) {
      expect(gameStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects an unknown status', () => {
    expect(() => gameStatusSchema.parse('pending')).toThrow();
  });
});

describe('storedValidationSchema', () => {
  it('parses a full verdict with flags, violations, and a history flag', () => {
    const verdict = {
      outcome: 'quarantined',
      serverScore: 71,
      violations: [{ rule: 'claimed-score-mismatch', detail: 'claimed 80, recomputed 71' }],
      flags: [{ rule: 'answer-floor', detail: '4/10 problems solved faster than 250ms' }],
      historyFlag: 'pb-jump',
      problemViolations: [
        {
          rule: 'range-nonconforming',
          detail: '3 problem(s) impossible under the claimed settings',
        },
      ],
      problemFlags: [{ rule: 'operation-mix', detail: 'operation shares deviate' }],
    };
    expect(storedValidationSchema.parse(verdict)).toEqual(verdict);
  });

  it('parses a clean accepted verdict', () => {
    const verdict = {
      outcome: 'accepted',
      serverScore: 40,
      violations: [],
      flags: [],
      historyFlag: null,
      problemViolations: [],
      problemFlags: [],
    };
    expect(storedValidationSchema.parse(verdict)).toEqual(verdict);
  });

  it('defaults the W6 problem fields to empty for rows judged before they shipped', () => {
    const legacy = {
      outcome: 'accepted',
      serverScore: 40,
      violations: [],
      flags: [],
      historyFlag: null,
    };
    expect(storedValidationSchema.parse(legacy)).toEqual({
      ...legacy,
      problemViolations: [],
      problemFlags: [],
    });
  });

  it('rejects an unknown problem-flag rule', () => {
    expect(() =>
      storedValidationSchema.parse({
        outcome: 'accepted',
        serverScore: 1,
        violations: [],
        flags: [],
        historyFlag: null,
        problemFlags: [{ rule: 'clairvoyance', detail: 'x' }],
      }),
    ).toThrow();
  });

  it('rejects an unknown flag rule', () => {
    expect(() =>
      storedValidationSchema.parse({
        outcome: 'accepted',
        serverScore: 1,
        violations: [],
        flags: [{ rule: 'telepathy', detail: 'x' }],
        historyFlag: null,
      }),
    ).toThrow();
  });
});

describe('gameRowSchema', () => {
  const valid = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '11111111-1111-4111-8111-111111111111',
    client_game_id: '33333333-3333-4333-8333-333333333333',
    played_at: '2026-07-20T10:00:00.000Z',
    received_at: '2026-07-20T10:02:00.000Z',
    settings_fingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
    rankable_duration: 120,
    claimed_score: 42,
    server_score: 42,
    status: 'accepted',
    telemetry: [
      { kind: 'problem', at: 10, text: '2 + 2' },
      { kind: 'input', at: 400, value: '4' },
      { kind: 'accepted', at: 420, answer: 4 },
    ],
    validation: {
      outcome: 'accepted',
      serverScore: 42,
      violations: [],
      flags: [],
      historyFlag: null,
      problemViolations: [],
      problemFlags: [],
    },
  };

  it('parses a complete game row including telemetry and validation', () => {
    expect(gameRowSchema.parse(valid)).toEqual(valid);
  });

  it('allows a null rankable_duration (non-rankable game)', () => {
    const row = { ...valid, rankable_duration: null };
    expect(gameRowSchema.parse(row)).toEqual(row);
  });

  it('rejects telemetry that is not a valid event stream', () => {
    expect(() => gameRowSchema.parse({ ...valid, telemetry: [{ kind: 'nope' }] })).toThrow();
  });
});

describe('profileRowSchema', () => {
  it('accepts a profile with a null display name (pre-onboarding)', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      display_name: null,
      university_id: null,
      uni_verified_at: null,
      is_admin: false,
      created_at: '2026-07-01T00:00:00.000Z',
      avatar_url: null,
    };
    expect(profileRowSchema.parse(row)).toEqual(row);
  });

  it('accepts a profile with an avatar URL', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      display_name: 'ada',
      university_id: null,
      uni_verified_at: null,
      is_admin: false,
      created_at: '2026-07-01T00:00:00.000Z',
      avatar_url: 'https://example.supabase.co/storage/v1/object/public/avatars/x?v=1',
    };
    expect(profileRowSchema.parse(row)).toEqual(row);
  });
});

describe('universityRowSchema', () => {
  it('parses a university with its domains array', () => {
    const row = {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'University of Oxford',
      slug: 'university-of-oxford',
      domains: ['ox.ac.uk'],
    };
    expect(universityRowSchema.parse(row)).toEqual(row);
  });
});

describe('parseRows', () => {
  it('validates every element and returns a typed array', () => {
    const rows = parseRows(gameStatusSchema, ['accepted', 'rejected']);
    expect(rows).toEqual(['accepted', 'rejected']);
  });

  it('throws with row context when any element is invalid', () => {
    expect(() => parseRows(gameStatusSchema, ['accepted', 'bogus'])).toThrow();
  });

  it('returns an empty array unchanged', () => {
    expect(parseRows(gameStatusSchema, [])).toEqual([]);
  });
});
