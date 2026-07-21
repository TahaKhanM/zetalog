import { err, ok, type Result } from '@zetalog/shared';
import { z } from 'zod';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

/**
 * Extension account session and Supabase token refresh (brief "Extension session
 * + API client"). supabase-js stays OUT of the bundle: the one thing the
 * extension needs from Supabase — trading a refresh token for a fresh access
 * token — is a single raw `fetch` to the GoTrue token endpoint. Tokens are only
 * ever sent to {@link SUPABASE_URL} and are NEVER written to an error detail or
 * a log (brief "Constraints").
 */

/** Versioned storage key for the persisted account session. */
export const SESSION_KEY = 'zl:v1:session';

/** The persisted account session — the minimum needed to authenticate uploads. */
export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  userId: z.string().min(1),
});
export type Session = z.infer<typeof sessionSchema>;

/** The subset of the GoTrue token response the extension depends on. */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  user: z.object({ id: z.string().min(1) }),
});

/** A typed auth failure — details never carry token material. */
export type AuthError =
  | { readonly reason: 'corrupt-session'; readonly detail: string }
  | { readonly reason: 'refresh-failed'; readonly detail: string };

/** The subset of a `fetch` Response the network layer reads (structural seam). */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/**
 * A `fetch`-shaped function narrowed to what the extension needs. The platform
 * `fetch` satisfies this structurally; tests inject a deterministic stub without
 * casting through `Response`.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<HttpResponse>;

/** The `browser.storage.local` slice the auth layer needs (injectable for tests). */
export interface AuthStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

/** The Supabase endpoint + anon key the refresh call targets. */
export interface AuthConfig {
  readonly supabaseUrl: string;
  readonly anonKey: string;
}

const DEFAULT_CONFIG: AuthConfig = { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };

/**
 * Exchange a refresh token for a fresh {@link Session} via the GoTrue token
 * endpoint. Pure over an injected `fetch`. Every failure path returns a typed
 * `refresh-failed` whose detail is safe to log — it never echoes the token.
 */
export async function requestRefresh(
  refreshToken: string,
  fetchFn: FetchLike,
  config: AuthConfig = DEFAULT_CONFIG,
): Promise<Result<Session, AuthError>> {
  let response: HttpResponse;
  try {
    response = await fetchFn(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.anonKey,
        authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return err({ reason: 'refresh-failed', detail: 'network error' });
  }
  if (!response.ok) {
    return err({ reason: 'refresh-failed', detail: `status ${String(response.status)}` });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err({ reason: 'refresh-failed', detail: 'malformed response body' });
  }
  const parsed = tokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    return err({ reason: 'refresh-failed', detail: 'unexpected response shape' });
  }
  return ok({
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    userId: parsed.data.user.id,
  });
}

/** Reads, persists, clears, and refreshes the account session. */
export interface AuthController {
  /** The stored session, `null` if signed out, or a typed corruption error. */
  read(): Promise<Result<Session | null, AuthError>>;
  /** The current access token, or `null` if signed out / unreadable. */
  accessToken(): Promise<string | null>;
  /** Persist a session (from the link handoff). */
  save(session: Session): Promise<void>;
  /** Forget the session (Unlink). Leaves local game data untouched. */
  clear(): Promise<void>;
  /**
   * Refresh the stored session and persist the result. Returns the new access
   * token, or `null` if there is no (readable) session or the exchange failed —
   * the API client uses this for its one-shot 401 retry.
   */
  refresh(): Promise<string | null>;
}

/** Dependencies for {@link createAuthController}. */
export interface AuthDeps {
  readonly fetch: FetchLike;
  readonly config?: AuthConfig;
}

/** Create the session controller over a `browser.storage.local`-shaped area. */
export function createAuthController(area: AuthStorageArea, deps: AuthDeps): AuthController {
  const config = deps.config ?? DEFAULT_CONFIG;

  async function read(): Promise<Result<Session | null, AuthError>> {
    const raw = await area.get(SESSION_KEY);
    const value = raw[SESSION_KEY];
    if (value === undefined) return ok(null);
    const parsed = sessionSchema.safeParse(value);
    if (!parsed.success) return err({ reason: 'corrupt-session', detail: parsed.error.message });
    return ok(parsed.data);
  }

  return {
    read,

    async accessToken() {
      const result = await read();
      return result.ok && result.value !== null ? result.value.accessToken : null;
    },

    async save(session) {
      await area.set({ [SESSION_KEY]: session });
    },

    async clear() {
      await area.remove(SESSION_KEY);
    },

    async refresh() {
      const current = await read();
      if (!current.ok || current.value === null) return null;
      const refreshed = await requestRefresh(current.value.refreshToken, deps.fetch, config);
      if (!refreshed.ok) return null;
      await area.set({ [SESSION_KEY]: refreshed.value });
      return refreshed.value.accessToken;
    },
  };
}
