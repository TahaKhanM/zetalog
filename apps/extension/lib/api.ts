import { err, ok, type GameRecord, type Result } from '@zetalog/shared';
import { z } from 'zod';

import { type FetchLike } from './auth.js';
import { WEB_APP_URL } from './config.js';

/** The subset of `GET /api/profile` the extension reads (extra fields ignored). */
export const profileViewSchema = z.object({ leaderboardOptOut: z.boolean() });
export type ProfileView = z.infer<typeof profileViewSchema>;

/**
 * Typed client for the game API.
 * Bearer-authenticated; on a 401 it performs exactly one token refresh and
 * retries; responses are zod-parsed; results are values, never thrown. The
 * claimed score is never trusted server-side — {@link SubmitSuccess.serverScore}
 * is the recomputed, authoritative score.
 */

/** The persisted status the server assigns a submission. */
export const submitOutcomeSchema = z.enum(['accepted', 'quarantined', 'rejected', 'user_removed']);
export type SubmitOutcome = z.infer<typeof submitOutcomeSchema>;

/** The 201 body of `POST /api/games`. */
export const submitSuccessSchema = z.object({
  id: z.string().min(1),
  outcome: submitOutcomeSchema,
  serverScore: z.number().int().nonnegative(),
});
export type SubmitSuccess = z.infer<typeof submitSuccessSchema>;

/** One game as `GET /api/games` returns it, for backfilling the popup history. */
export const remoteGameSchema = z.object({
  clientGameId: z.string().min(1),
  playedAt: z.string().min(1),
  settingsFingerprint: z.string().min(1),
  rankableDuration: z.union([z.literal(30), z.literal(60), z.literal(120), z.null()]),
  claimedScore: z.number().int().nonnegative(),
  serverScore: z.number().int().nonnegative(),
  status: submitOutcomeSchema,
});
export type RemoteGame = z.infer<typeof remoteGameSchema>;

const listGamesResponseSchema = z.object({ games: z.array(remoteGameSchema) });

/**
 * A typed API failure. `auth` means the session is invalid even after a refresh
 * (the caller should stop and re-link); `not-rankable` / `bad-request` are
 * permanent for a given record; `rate-limited` / `network` / `server` are worth
 * retrying later; `not-found` is a revoke of a game the server does not have.
 */
export type ApiError =
  | { readonly kind: 'auth' }
  | { readonly kind: 'not-rankable' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'bad-request' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'server'; readonly status: number }
  | { readonly kind: 'network' };

/** The token source the client authenticates with (an {@link AuthController}). */
export interface ApiAuth {
  accessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
}

/** Dependencies for {@link createApiClient}. */
export interface ApiDeps {
  readonly fetch: FetchLike;
  readonly auth: ApiAuth;
  readonly baseUrl?: string;
}

/** The API surface the sync queue and the popup drive. */
export interface ApiClient {
  submitGame(record: GameRecord): Promise<Result<SubmitSuccess, ApiError>>;
  revokeGame(clientGameId: string): Promise<Result<null, ApiError>>;
  /** The caller's own leaderboard-privacy state (defaults to visible if no row yet). */
  getProfile(): Promise<Result<ProfileView, ApiError>>;
  /** Set the leaderboard opt-out (true keeps the account off the public boards). */
  setLeaderboardOptOut(optOut: boolean): Promise<Result<null, ApiError>>;
  /** The account's recent games, to backfill the popup history after linking. */
  listGames(): Promise<Result<RemoteGame[], ApiError>>;
}

/** A completed request: HTTP status and best-effort parsed JSON body. */
interface RawResponse {
  readonly status: number;
  readonly parsed: unknown;
}

/** Create the API client. `baseUrl` defaults to the bundled {@link WEB_APP_URL}. */
export function createApiClient(deps: ApiDeps): ApiClient {
  const baseUrl = deps.baseUrl ?? WEB_APP_URL;

  async function send(
    method: string,
    path: string,
    token: string,
    body: object | undefined,
  ): Promise<Result<RawResponse, ApiError>> {
    let response;
    try {
      response = await deps.fetch(`${baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      return err({ kind: 'network' });
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    return ok({ status: response.status, parsed });
  }

  /** Send with the stored token, refreshing + retrying once on a 401. */
  async function authed(
    method: string,
    path: string,
    body: object | undefined,
  ): Promise<Result<RawResponse, ApiError>> {
    const token = await deps.auth.accessToken();
    if (token === null) return err({ kind: 'auth' });

    const first = await send(method, path, token, body);
    if (!first.ok || first.value.status !== 401) return first;

    const refreshed = await deps.auth.refresh();
    if (refreshed === null) return err({ kind: 'auth' });

    const second = await send(method, path, refreshed, body);
    if (second.ok && second.value.status === 401) return err({ kind: 'auth' });
    return second;
  }

  return {
    async submitGame(record) {
      const response = await authed('POST', '/api/games', record);
      if (!response.ok) return response;
      const { status, parsed } = response.value;
      switch (status) {
        case 201: {
          const body = submitSuccessSchema.safeParse(parsed);
          return body.success ? ok(body.data) : err({ kind: 'network' });
        }
        case 400:
          return err({ kind: 'bad-request' });
        case 422:
          return err({ kind: 'not-rankable' });
        case 429:
          return err({ kind: 'rate-limited' });
        default:
          return err({ kind: 'server', status });
      }
    },

    async revokeGame(clientGameId) {
      const response = await authed(
        'DELETE',
        `/api/games/${encodeURIComponent(clientGameId)}`,
        undefined,
      );
      if (!response.ok) return response;
      const { status } = response.value;
      switch (status) {
        case 200:
          return ok(null);
        case 404:
          return err({ kind: 'not-found' });
        default:
          return err({ kind: 'server', status });
      }
    },

    async getProfile() {
      const response = await authed('GET', '/api/profile', undefined);
      if (!response.ok) return response;
      const { status, parsed } = response.value;
      switch (status) {
        case 200: {
          const body = profileViewSchema.safeParse(parsed);
          return body.success ? ok(body.data) : err({ kind: 'network' });
        }
        // No profile row yet: treat as visible (the default) rather than an error.
        case 404:
          return ok({ leaderboardOptOut: false });
        default:
          return err({ kind: 'server', status });
      }
    },

    async setLeaderboardOptOut(optOut) {
      const response = await authed('POST', '/api/profile', { leaderboardOptOut: optOut });
      if (!response.ok) return response;
      const { status } = response.value;
      switch (status) {
        case 200:
          return ok(null);
        case 400:
          return err({ kind: 'bad-request' });
        default:
          return err({ kind: 'server', status });
      }
    },

    async listGames() {
      const response = await authed('GET', '/api/games', undefined);
      if (!response.ok) return response;
      const { status, parsed } = response.value;
      if (status !== 200) return err({ kind: 'server', status });
      const body = listGamesResponseSchema.safeParse(parsed);
      return body.success ? ok(body.data.games) : err({ kind: 'network' });
    },
  };
}
