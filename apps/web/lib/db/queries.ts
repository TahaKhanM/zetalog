import type { RankableDuration } from '@zetalog/shared';
import { z } from 'zod';

import {
  adminGameRowSchema,
  gameRowSchema,
  leaderboardEntrySchema,
  parseRows,
  profileRowSchema,
  universityRowSchema,
  type AdminGameRow,
  type GameRow,
  type LeaderboardEntry,
  type ProfileRow,
  type UniversityRow,
} from './rows';
import type { Db } from '../supabase/database';

/**
 * Typed reads over Supabase. Every function takes the client as a parameter so
 * callers choose the right one — the anon/cookie client (RLS-scoped) for public
 * and own-data reads, the service client (RLS-bypassing) for the admin queue.
 * PostgREST returns untyped JSON, so each result is validated through the
 * schemas in {@link rows} before it leaves this module.
 */

/** The minimal PostgREST response shape both helpers rely on. */
interface Response {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

async function fetchList<T>(
  query: PromiseLike<Response>,
  schema: z.ZodType<T>,
  context: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error !== null) throw new Error(`${context}: ${error.message}`);
  return parseRows(schema, data ?? []);
}

async function fetchMaybe<T>(
  query: PromiseLike<Response>,
  schema: z.ZodType<T>,
  context: string,
): Promise<T | null> {
  const { data, error } = await query;
  if (error !== null) throw new Error(`${context}: ${error.message}`);
  return data === null || data === undefined ? null : schema.parse(data);
}

/** Options for a leaderboard read: a required duration and an optional university scope. */
export interface LeaderboardQuery {
  readonly duration: RankableDuration;
  readonly universitySlug?: string;
}

/**
 * Best score per user at one duration, highest first (display name breaks
 * ties for a stable order). Scoped to one university when `universitySlug` is
 * given. Reads the `leaderboard_entries` view, which already restricts to
 * accepted, rankable games and named profiles.
 */
export function getLeaderboard(client: Db, query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
  let builder = client.from('leaderboard_entries').select('*').eq('duration', query.duration);
  if (query.universitySlug !== undefined) {
    builder = builder.eq('university_slug', query.universitySlug);
  }
  return fetchList(
    builder.order('best_score', { ascending: false }).order('display_name', { ascending: true }),
    leaderboardEntrySchema,
    'getLeaderboard',
  );
}

const universityOptionSchema = z.object({
  university_slug: z.string(),
  university_name: z.string(),
});

/** A selectable university on the leaderboard filter: those with ranked entries. */
export interface UniversityOption {
  readonly slug: string;
  readonly name: string;
}

/**
 * The universities that currently have at least one ranked entry, deduplicated
 * and sorted by name — the source for the `/` university filter select.
 */
export async function getUniversityOptions(client: Db): Promise<UniversityOption[]> {
  const rows = await fetchList(
    client
      .from('leaderboard_entries')
      .select('university_slug, university_name')
      .not('university_slug', 'is', null),
    universityOptionSchema,
    'getUniversityOptions',
  );
  const bySlug = new Map<string, UniversityOption>();
  for (const row of rows) {
    bySlug.set(row.university_slug, { slug: row.university_slug, name: row.university_name });
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A university by its slug, or null if the slug is unknown (drives the `/uni/[slug]` 404). */
export function getUniversityBySlug(client: Db, slug: string): Promise<UniversityRow | null> {
  return fetchMaybe(
    client.from('universities').select('*').eq('slug', slug).maybeSingle(),
    universityRowSchema,
    'getUniversityBySlug',
  );
}

/** A university by id — used to label the badge card on `/me`. */
export function getUniversityById(client: Db, id: string): Promise<UniversityRow | null> {
  return fetchMaybe(
    client.from('universities').select('*').eq('id', id).maybeSingle(),
    universityRowSchema,
    'getUniversityById',
  );
}

/** A user's own profile, or null if the row does not exist yet. */
export function getProfile(client: Db, userId: string): Promise<ProfileRow | null> {
  return fetchMaybe(
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    profileRowSchema,
    'getProfile',
  );
}

/**
 * A user's own games, most recently received first — the `/me` history table.
 * The caller passes the user's cookie client; RLS restricts the read to their
 * own rows, and the explicit filter documents that intent.
 */
export function getOwnGames(client: Db, userId: string): Promise<GameRow[]> {
  return fetchList(
    client
      .from('games')
      .select('*')
      .eq('user_id', userId)
      .order('received_at', { ascending: false }),
    gameRowSchema,
    'getOwnGames',
  );
}

const aliasEmailSchema = z.object({ email: z.string() });

/**
 * The user's verified university alias email (W8: it doubles as a login
 * identifier), or null when none is verified. MUST be called with the service
 * client — `uni_verifications` has no client policies by design.
 */
export async function getVerifiedAliasEmail(service: Db, userId: string): Promise<string | null> {
  const row = await fetchMaybe(
    service
      .from('uni_verifications')
      .select('email')
      .eq('user_id', userId)
      .not('verified_at', 'is', null)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    aliasEmailSchema,
    'getVerifiedAliasEmail',
  );
  return row?.email ?? null;
}

const quarantineJoinSchema = gameRowSchema.extend({
  profile: z.object({ display_name: z.string().nullable() }).nullable(),
});

/**
 * The admin review queue: every quarantined game with its owner's display name,
 * oldest first (first-in-first-reviewed). MUST be called with the service
 * client — RLS would otherwise hide other users' rows.
 */
export async function getQuarantineQueue(service: Db): Promise<AdminGameRow[]> {
  const rows = await fetchList(
    service
      .from('games')
      .select('*, profile:profiles(display_name)')
      .eq('status', 'quarantined')
      .order('received_at', { ascending: true }),
    quarantineJoinSchema,
    'getQuarantineQueue',
  );
  return rows.map(({ profile, ...game }): AdminGameRow => {
    return adminGameRowSchema.parse({ ...game, display_name: profile?.display_name ?? null });
  });
}

const boardStatsRowSchema = z.object({
  user_id: z.string(),
  university_slug: z.string().nullable(),
  games_counted: z.number().int().nonnegative(),
});

/** Aggregate figures for the masthead stat rail (CO-3 §2). */
export interface BoardStats {
  readonly players: number;
  readonly universities: number;
  readonly gamesValidated: number;
}

/**
 * Masthead statistics, derived entirely from the public leaderboard view
 * (players with a ranked entry, universities represented, accepted games
 * counted across all boards). One small read; cached with the pages.
 */
export async function getBoardStats(client: Db): Promise<BoardStats> {
  const rows = await fetchList(
    client.from('leaderboard_entries').select('user_id, university_slug, games_counted'),
    boardStatsRowSchema,
    'getBoardStats',
  );
  const players = new Set(rows.map((row) => row.user_id)).size;
  const universities = new Set(
    rows.flatMap((row) => (row.university_slug === null ? [] : [row.university_slug])),
  ).size;
  const gamesValidated = rows.reduce((sum, row) => sum + row.games_counted, 0);
  return { players, universities, gamesValidated };
}
