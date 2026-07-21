import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  getLeaderboard,
  getOwnGames,
  getProfile,
  getQuarantineQueue,
  getUniversityBySlug,
  getUniversityOptions,
} from './queries';

/**
 * A structural stub of the tiny slice of the Supabase query builder these read
 * functions touch. Records the calls so filters can be asserted, and resolves
 * to a canned PostgREST response per table.
 */
interface Response {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}
interface Call {
  readonly method: string;
  readonly args: readonly unknown[];
}
interface Builder extends PromiseLike<Response> {
  select(...args: unknown[]): Builder;
  eq(...args: unknown[]): Builder;
  not(...args: unknown[]): Builder;
  order(...args: unknown[]): Builder;
  maybeSingle(): PromiseLike<Response>;
}

function makeBuilder(response: Response, calls: Call[]): Builder {
  const promise = Promise.resolve(response);
  const builder: Builder = {
    select(...args) {
      calls.push({ method: 'select', args });
      return builder;
    },
    eq(...args) {
      calls.push({ method: 'eq', args });
      return builder;
    },
    not(...args) {
      calls.push({ method: 'not', args });
      return builder;
    },
    order(...args) {
      calls.push({ method: 'order', args });
      return builder;
    },
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] });
      return promise;
    },
    then: promise.then.bind(promise),
  };
  return builder;
}

function makeClient(responses: Record<string, Response>): {
  client: SupabaseClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const client = {
    from(table: string): Builder {
      calls.push({ method: 'from', args: [table] });
      return makeBuilder(responses[table] ?? { data: [], error: null }, calls);
    },
  };
  // Single localized cast: the stub implements exactly the query surface these
  // read functions use; the real SupabaseClient type is far larger.
  return { client: client as unknown as SupabaseClient, calls };
}

const entry = (over: Record<string, unknown>): Record<string, unknown> => ({
  user_id: '11111111-1111-4111-8111-111111111111',
  display_name: 'ada',
  duration: 120,
  best_score: 50,
  games_counted: 3,
  university_name: null,
  university_slug: null,
  ...over,
});

describe('getLeaderboard', () => {
  it('filters by duration and orders by best score then name', async () => {
    const { client, calls } = makeClient({
      leaderboard_entries: { data: [entry({ best_score: 90 })], error: null },
    });
    const result = await getLeaderboard(client, { duration: 120 });
    expect(result).toHaveLength(1);
    expect(result[0]?.best_score).toBe(90);
    expect(calls).toContainEqual({ method: 'eq', args: ['duration', 120] });
    expect(calls).toContainEqual({ method: 'order', args: ['best_score', { ascending: false }] });
    // No university filter applied for the global board.
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'university_slug')).toBe(false);
  });

  it('adds a university filter when a slug is supplied', async () => {
    const { client, calls } = makeClient({
      leaderboard_entries: { data: [], error: null },
    });
    await getLeaderboard(client, { duration: 60, universitySlug: 'university-of-oxford' });
    expect(calls).toContainEqual({ method: 'eq', args: ['duration', 60] });
    expect(calls).toContainEqual({
      method: 'eq',
      args: ['university_slug', 'university-of-oxford'],
    });
  });

  it('throws with context when PostgREST reports an error', async () => {
    const { client } = makeClient({
      leaderboard_entries: { data: null, error: { message: 'boom' } },
    });
    await expect(getLeaderboard(client, { duration: 30 })).rejects.toThrow(/getLeaderboard: boom/);
  });
});

describe('getUniversityOptions', () => {
  it('deduplicates by slug and sorts by name', async () => {
    const { client } = makeClient({
      leaderboard_entries: {
        data: [
          { university_slug: 'university-of-oxford', university_name: 'University of Oxford' },
          { university_slug: 'university-of-oxford', university_name: 'University of Oxford' },
          {
            university_slug: 'imperial-college-london',
            university_name: 'Imperial College London',
          },
        ],
        error: null,
      },
    });
    const options = await getUniversityOptions(client);
    expect(options).toEqual([
      { slug: 'imperial-college-london', name: 'Imperial College London' },
      { slug: 'university-of-oxford', name: 'University of Oxford' },
    ]);
  });
});

describe('getUniversityBySlug', () => {
  it('returns null when the slug is unknown', async () => {
    const { client } = makeClient({ universities: { data: null, error: null } });
    expect(await getUniversityBySlug(client, 'nope')).toBeNull();
  });

  it('parses a matching university row', async () => {
    const { client } = makeClient({
      universities: {
        data: {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'University of Oxford',
          slug: 'university-of-oxford',
          domains: ['ox.ac.uk'],
        },
        error: null,
      },
    });
    const uni = await getUniversityBySlug(client, 'university-of-oxford');
    expect(uni?.name).toBe('University of Oxford');
  });
});

describe('getProfile', () => {
  it('returns null when the profile row is absent', async () => {
    const { client } = makeClient({ profiles: { data: null, error: null } });
    expect(await getProfile(client, '11111111-1111-4111-8111-111111111111')).toBeNull();
  });
});

describe('getOwnGames', () => {
  it('scopes to the user and orders by received_at desc', async () => {
    const { client, calls } = makeClient({ games: { data: [], error: null } });
    await getOwnGames(client, '11111111-1111-4111-8111-111111111111');
    expect(calls).toContainEqual({
      method: 'eq',
      args: ['user_id', '11111111-1111-4111-8111-111111111111'],
    });
    expect(calls).toContainEqual({ method: 'order', args: ['received_at', { ascending: false }] });
  });
});

describe('getQuarantineQueue', () => {
  const game = (over: Record<string, unknown>): Record<string, unknown> => ({
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '11111111-1111-4111-8111-111111111111',
    client_game_id: '33333333-3333-4333-8333-333333333333',
    played_at: '2026-07-20T10:00:00.000Z',
    received_at: '2026-07-20T10:02:00.000Z',
    settings_fingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
    rankable_duration: 120,
    claimed_score: 99,
    server_score: 71,
    status: 'quarantined',
    telemetry: [],
    validation: {
      outcome: 'quarantined',
      serverScore: 71,
      violations: [],
      flags: [],
      historyFlag: 'pb-jump',
    },
    ...over,
  });

  it('flattens the joined display name and only reads quarantined games', async () => {
    const { client, calls } = makeClient({
      games: {
        data: [game({ profile: { display_name: 'ada' } }), game({ profile: null })],
        error: null,
      },
    });
    const queue = await getQuarantineQueue(client);
    expect(queue).toHaveLength(2);
    expect(queue[0]?.display_name).toBe('ada');
    expect(queue[1]?.display_name).toBeNull();
    expect(queue[0]).not.toHaveProperty('profile');
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'quarantined'] });
    expect(calls).toContainEqual({ method: 'order', args: ['received_at', { ascending: true }] });
  });
});
