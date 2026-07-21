import { err, ok, type GameRecord, type Result } from '@zetalog/shared';
import { z } from 'zod';

import { type FetchLike } from './auth.js';
import { WEB_APP_URL } from './config.js';

/**
 * Typed client for the W3 game API (brief "Extension session + API client").
 * Bearer-authenticated; on a 401 it performs exactly one token refresh and
 * retries; responses are zod-parsed; results are values, never thrown. The
 * claimed score is never trusted server-side — {@link SubmitSuccess.serverScore}
 * is the recomputed, authoritative score.
 */

/** The persisted status the server assigns a submission (spec §5). */
export const submitOutcomeSchema = z.enum(['accepted', 'quarantined', 'rejected', 'user_removed']);
export type SubmitOutcome = z.infer<typeof submitOutcomeSchema>;

/** The 201 body of `POST /api/games`. */
export const submitSuccessSchema = z.object({
  id: z.string().min(1),
  outcome: submitOutcomeSchema,
  serverScore: z.number().int().nonnegative(),
});
export type SubmitSuccess = z.infer<typeof submitSuccessSchema>;

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

/** The game API surface the sync queue drives. */
export interface ApiClient {
  submitGame(record: GameRecord): Promise<Result<SubmitSuccess, ApiError>>;
  revokeGame(clientGameId: string): Promise<Result<null, ApiError>>;
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
    body: GameRecord | undefined,
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
    body: GameRecord | undefined,
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
  };
}
