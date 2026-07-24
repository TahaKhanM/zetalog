import {
  fingerprint,
  judge,
  rankableDuration,
  type GameEvent,
  type GameRecord,
  type RankableDuration,
  type ValidationOutcome,
  type Verdict,
} from '@zetalog/shared';

/**
 * The server side of "aggressive validation", as a pure pipeline over
 * an injected {@link SubmitPort}. The route wires the port to Supabase; tests
 * fake it. The claimed score is never trusted — {@link judge} recomputes it.
 *
 * Pipeline: rankable? → hourly rate limit → load accepted-score history →
 * judge → idempotent insert → 201.
 */

/** The rate-limit window: submissions received in the last hour are counted. */
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/** More than this many games received within {@link RATE_WINDOW_MS} is rejected. */
export const RATE_LIMIT_MAX = 60;

/** Client wall clocks before this instant (2020-01-01T00:00:00Z) are treated as broken. */
export const MIN_PLAUSIBLE_STARTED_AT_MS = Date.parse('2020-01-01T00:00:00Z');

/**
 * The `played_at` to store for a submission. `startedAtMs` is the CLIENT's
 * epoch-ms wall clock at game start — display-only and never trusted for
 * ordering or rate limiting (`received_at`, stamped by the database, stays
 * authoritative there). It is used verbatim when plausible — within
 * [{@link MIN_PLAUSIBLE_STARTED_AT_MS}, `nowMs`] — so backfilled games keep
 * their real play date; a future or pre-2020 value means a broken client
 * clock, and the server receive time is stored instead.
 */
export function playedAtIso(startedAtMs: number, nowMs: number): string {
  const plausible = startedAtMs >= MIN_PLAUSIBLE_STARTED_AT_MS && startedAtMs <= nowMs;
  return new Date(plausible ? startedAtMs : nowMs).toISOString();
}

/** A validated game row ready to persist. Column mapping happens in the port. */
export interface GameToInsert {
  readonly userId: string;
  readonly clientGameId: string;
  readonly playedAt: string;
  readonly settingsFingerprint: string;
  readonly rankableDuration: RankableDuration;
  readonly claimedScore: number;
  readonly serverScore: number;
  readonly status: ValidationOutcome;
  readonly telemetry: readonly GameEvent[];
  readonly validation: Verdict;
}

/**
 * The persisted status, whether freshly inserted or resolved from a conflict.
 * A conflict can resolve to a game the user later removed, so `user_removed` is
 * possible here even though a fresh judge only yields the three judged states.
 */
export type PersistedOutcome = ValidationOutcome | 'user_removed';

/** The persisted outcome, whether freshly inserted or resolved from a conflict. */
export interface PersistedGame {
  readonly id: string;
  readonly outcome: PersistedOutcome;
  readonly serverScore: number;
}

/** The narrow database surface the submit pipeline needs. */
export interface SubmitPort {
  /** Games this user has had received at or after `sinceMs` (rate limiting). */
  countGamesReceivedSince(userId: string, sinceMs: number): Promise<number>;
  /** This user's accepted scores at `duration` — the history for the PB-jump rule. */
  getAcceptedScores(userId: string, duration: RankableDuration): Promise<number[]>;
  /**
   * Insert the game idempotently (`on conflict (user_id, client_game_id) do
   * nothing`). On a conflict, resolves to the existing row's outcome.
   */
  insertGame(game: GameToInsert): Promise<PersistedGame>;
}

/** A typed JSON error body, matching the API-wide `{ error: { code, message } }` shape. */
interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

/** The result of submitting a game: an HTTP status and a JSON body. */
export type SubmitResult =
  | { readonly status: 201; readonly body: PersistedGame }
  | { readonly status: 422; readonly body: ErrorBody }
  | { readonly status: 429; readonly body: ErrorBody };

/**
 * Run the submission pipeline for one already-parsed record and authenticated
 * user. `nowMs` is the server clock (the route passes `Date.now()`); it fixes
 * the rate-limit window and bounds the client-supplied `played_at`
 * (see {@link playedAtIso}).
 */
export async function submitGame(
  record: GameRecord,
  userId: string,
  nowMs: number,
  port: SubmitPort,
): Promise<SubmitResult> {
  const duration = rankableDuration(record.settings);
  if (duration === null) {
    return {
      status: 422,
      body: {
        error: {
          code: 'not-rankable',
          message: 'This game does not use the default Zetamac ranges at 30, 60, or 120 seconds.',
        },
      },
    };
  }

  const recent = await port.countGamesReceivedSince(userId, nowMs - RATE_WINDOW_MS);
  if (recent > RATE_LIMIT_MAX) {
    return {
      status: 429,
      body: {
        error: {
          code: 'rate-limited',
          message: 'Too many games submitted in the past hour. Please try again later.',
        },
      },
    };
  }

  const acceptedScores = await port.getAcceptedScores(userId, duration);
  const verdict = judge(record, { acceptedScores });

  const persisted = await port.insertGame({
    userId,
    clientGameId: record.id,
    playedAt: playedAtIso(record.startedAtMs, nowMs),
    settingsFingerprint: fingerprint(record.settings),
    rankableDuration: duration,
    claimedScore: record.claimedScore,
    serverScore: verdict.serverScore,
    status: verdict.outcome,
    telemetry: record.events,
    validation: verdict,
  });

  return { status: 201, body: persisted };
}
