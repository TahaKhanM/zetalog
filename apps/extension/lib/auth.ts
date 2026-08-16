import { err, ok, type Result } from '@zetalog/shared';
import { z } from 'zod';

import { SUPABASE_ANON_KEY, SUPABASE_URL, WEB_APP_URL } from './config.js';
import { codeFromLinkCallback, createPkceValues } from './pkce.js';
import { singleFlight } from './single-flight.js';

/**
 * Extension account sessions. New links use a revocable installation credential
 * that is independent of the website session. The small raw Supabase refresh
 * client remains only to migrate pre-v2 installations without interrupting
 * users; refresh material is never logged and is removed after migration.
 */

/** Versioned storage key for the persisted account session. */
export const SESSION_KEY = 'zl:v1:session';
export const AUTH_STATE_KEY = 'zl:v2:authState';

/** The persisted account session — the minimum needed to authenticate uploads. */
export const legacySessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  userId: z.string().min(1),
});
export const extensionSessionSchema = z.object({
  kind: z.literal('extension'),
  token: z.string().min(1),
  userId: z.string().min(1),
});
export const sessionSchema = z.union([extensionSessionSchema, legacySessionSchema]);
export type Session = z.infer<typeof sessionSchema>;
export type LegacySession = z.infer<typeof legacySessionSchema>;
export type ExtensionSession = z.infer<typeof extensionSessionSchema>;

const authStateSchema = z.object({ needsRelink: z.boolean() });
const linkedResponseSchema = z.object({ token: z.string().min(1), userId: z.string().min(1) });
const tokenExchangeResponseSchema = z.object({
  credential: z.string().min(1),
  userId: z.string().min(1),
});

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

/** Safe, user-actionable outcomes from the interactive account-link flow. */
export type LinkError =
  | 'identity-unavailable'
  | 'extension-not-enabled'
  | 'network'
  | 'server'
  | 'cancelled'
  | 'invalid-callback'
  | 'exchange-failed';

export type LinkResult = { readonly ok: true } | { readonly ok: false; readonly error: LinkError };

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

/** The small identity API surface required for a browser-owned redirect flow. */
export interface IdentityApi {
  getRedirectURL(path?: string): string;
  launchWebAuthFlow(details: {
    readonly url: string;
    readonly interactive: boolean;
  }): Promise<string | undefined>;
}

/** The Supabase endpoint + anon key the refresh call targets. */
export interface AuthConfig {
  readonly supabaseUrl: string;
  readonly anonKey: string;
}

const DEFAULT_CONFIG: AuthConfig = { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };

/** Decode a base64url segment to a UTF-8-safe ASCII string (JWT payloads are ASCII). */
function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

/**
 * The `sub` (user id) claim of a Supabase access token, or null if the token is
 * not a well-formed JWT carrying a string `sub`. The extension does not trust
 * this for security — the server re-verifies every request — it is only used to
 * populate {@link Session.userId} without a round-trip or a JWT dependency.
 */
export function decodeUserId(accessToken: string): string | null {
  const parts = accessToken.split('.');
  const payload = parts.length === 3 ? parts[1] : undefined;
  if (payload === undefined) return null;
  try {
    const claims: unknown = JSON.parse(base64UrlDecode(payload));
    if (typeof claims === 'object' && claims !== null && 'sub' in claims) {
      const sub: unknown = claims.sub;
      return typeof sub === 'string' && sub.length > 0 ? sub : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a {@link Session} from handoff tokens, deriving `userId` from the access
 * token. Returns null when the access token is malformed (an invalid token is
 * not worth persisting).
 */
export function sessionFromTokens(accessToken: string, refreshToken: string): LegacySession | null {
  const userId = decodeUserId(accessToken);
  if (userId === null) return null;
  return { accessToken, refreshToken, userId };
}

/**
 * Exchange a refresh token for a fresh {@link Session} via the GoTrue token
 * endpoint. Pure over an injected `fetch`. Every failure path returns a typed
 * `refresh-failed` whose detail is safe to log — it never echoes the token.
 */
export async function requestRefresh(
  refreshToken: string,
  fetchFn: FetchLike,
  config: AuthConfig = DEFAULT_CONFIG,
): Promise<Result<LegacySession, AuthError>> {
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
  /** Stored owner id without network migration; safe on the capture hot path. */
  storedUserId(): Promise<string | null>;
  /** Stored opaque credential only; never migrates, refreshes, or performs network I/O. */
  extensionCredential(): Promise<string | null>;
  /** Owning user id, after silently migrating a readable legacy session. */
  userId(): Promise<string | null>;
  /** Whether a (readable) session is stored. */
  isLinked(): Promise<boolean>;
  /** Persist a session (primarily a migration/test seam). */
  save(session: Session): Promise<void>;
  /** Run an explicit, browser-owned PKCE link flow and store its opaque credential. */
  beginLink(): Promise<LinkResult>;
  /** Forget the session (Unlink). Leaves local game data untouched. */
  clear(): Promise<void>;
  /** Whether a terminal credential failure requires the agreed one-time relink. */
  needsRelink(): Promise<boolean>;
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
  readonly apiBaseUrl?: string;
  /** Omit outside the service worker; link initiation then fails closed. */
  readonly identity?: IdentityApi;
}

/** Create the session controller over a `browser.storage.local`-shaped area. */
export function createAuthController(area: AuthStorageArea, deps: AuthDeps): AuthController {
  const config = deps.config ?? DEFAULT_CONFIG;
  const apiBaseUrl = deps.apiBaseUrl ?? WEB_APP_URL;

  async function read(): Promise<Result<Session | null, AuthError>> {
    const raw = await area.get(SESSION_KEY);
    const value = raw[SESSION_KEY];
    if (value === undefined) return ok(null);
    const parsed = sessionSchema.safeParse(value);
    if (!parsed.success) return err({ reason: 'corrupt-session', detail: parsed.error.message });
    return ok(parsed.data);
  }

  async function setNeedsRelink(value: boolean): Promise<void> {
    await area.set({ [AUTH_STATE_KEY]: { needsRelink: value } });
  }

  async function clearAndRequireRelink(): Promise<void> {
    await area.remove(SESSION_KEY);
    await setNeedsRelink(true);
  }

  async function linkedRequest(path: string, init: RequestInit): Promise<HttpResponse | null> {
    try {
      return await deps.fetch(`${apiBaseUrl}${path}`, init);
    } catch {
      return null;
    }
  }

  async function parseLinked(response: HttpResponse): Promise<ExtensionSession | null> {
    if (!response.ok) return null;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }
    const parsed = linkedResponseSchema.safeParse(body);
    return parsed.success ? { kind: 'extension', ...parsed.data } : null;
  }

  async function exchangeLinkCode(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<ExtensionSession | null> {
    const response = await linkedRequest('/api/extension/link/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier: verifier, redirectUri }),
    });
    if (!response?.ok) return null;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }
    const parsed = tokenExchangeResponseSchema.safeParse(body);
    return parsed.success
      ? { kind: 'extension', token: parsed.data.credential, userId: parsed.data.userId }
      : null;
  }

  async function migrateWithAccessToken(accessToken: string): Promise<{
    readonly status: 'migrated' | 'invalid' | 'temporary';
    readonly session?: ExtensionSession;
  }> {
    const response = await linkedRequest('/api/extension/migrate', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    });
    if (response === null || response.status >= 500) return { status: 'temporary' };
    if (response.status === 401) return { status: 'invalid' };
    const migrated = await parseLinked(response);
    return migrated === null ? { status: 'temporary' } : { status: 'migrated', session: migrated };
  }

  // Single-flight: refresh tokens are single-use, so two concurrent 401
  // handlers racing two exchanges would invalidate the session — concurrent
  // callers share one exchange and receive the same new access token.
  const migrateShared = singleFlight(async (): Promise<string | null> => {
    const current = await read();
    if (!current.ok || current.value === null) return null;
    if ('kind' in current.value) return current.value.token;

    const direct = await migrateWithAccessToken(current.value.accessToken);
    if (direct.status === 'migrated' && direct.session !== undefined) {
      await area.set({ [SESSION_KEY]: direct.session });
      await setNeedsRelink(false);
      return direct.session.token;
    }
    if (direct.status === 'temporary') {
      // Compatibility fallback: the existing API still accepts a valid legacy
      // JWT, so a transient migration outage must not interrupt normal syncing.
      return current.value.accessToken;
    }

    const refreshed = await requestRefresh(current.value.refreshToken, deps.fetch, config);
    if (!refreshed.ok) {
      if (refreshed.error.detail.startsWith('status 4')) await clearAndRequireRelink();
      return null;
    }
    await area.set({ [SESSION_KEY]: refreshed.value });
    const retry = await migrateWithAccessToken(refreshed.value.accessToken);
    if (retry.status === 'migrated' && retry.session !== undefined) {
      await area.set({ [SESSION_KEY]: retry.session });
      await setNeedsRelink(false);
      return retry.session.token;
    }
    if (retry.status === 'temporary') return refreshed.value.accessToken;
    await clearAndRequireRelink();
    return null;
  });

  const refreshLegacyShared = singleFlight(async (): Promise<string | null> => {
    const current = await read();
    if (!current.ok || current.value === null) return null;
    if ('kind' in current.value) {
      await clearAndRequireRelink();
      return null;
    }
    const refreshed = await requestRefresh(current.value.refreshToken, deps.fetch, config);
    if (!refreshed.ok) {
      if (refreshed.error.detail.startsWith('status 4')) await clearAndRequireRelink();
      return null;
    }
    await area.set({ [SESSION_KEY]: refreshed.value });
    return refreshed.value.accessToken;
  });

  const beginLinkShared = singleFlight(async (): Promise<LinkResult> => {
    const identity = deps.identity;
    if (identity === undefined) return { ok: false, error: 'identity-unavailable' };
    const redirectUri = identity.getRedirectURL('zetalog-link');

    // Fail before opening an interactive window when the deployed website has
    // not yet allowlisted this Chrome Web Store release id. Previously this
    // surfaced as a disappearing login window and looked like a broken button.
    const status = await linkedRequest(
      `/api/extension/link/status?redirect_uri=${encodeURIComponent(redirectUri)}`,
      { method: 'GET' },
    );
    if (status === null) return { ok: false, error: 'network' };
    if (status.status === 409) return { ok: false, error: 'extension-not-enabled' };
    if (!status.ok) return { ok: false, error: 'server' };

    const pkce = await createPkceValues();
    const authorizeUrl = new URL('/api/extension/link/authorize', apiBaseUrl);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', pkce.state);

    let callback: string | undefined;
    try {
      callback = await identity.launchWebAuthFlow({
        url: authorizeUrl.toString(),
        interactive: true,
      });
    } catch {
      return { ok: false, error: 'cancelled' };
    }
    const code = codeFromLinkCallback(callback, redirectUri, pkce.state);
    if (code === null) return { ok: false, error: 'invalid-callback' };
    const session = await exchangeLinkCode(code, pkce.verifier, redirectUri);
    if (session === null) return { ok: false, error: 'exchange-failed' };
    await area.set({ [SESSION_KEY]: session });
    await setNeedsRelink(false);
    return { ok: true };
  });

  return {
    read,

    async accessToken() {
      const result = await read();
      if (!result.ok || result.value === null) return null;
      return 'kind' in result.value ? result.value.token : migrateShared();
    },

    async storedUserId() {
      const result = await read();
      return result.ok && result.value !== null ? result.value.userId : null;
    },

    async extensionCredential() {
      const result = await read();
      if (!result.ok || result.value === null || !('kind' in result.value)) return null;
      return result.value.token;
    },

    async userId() {
      const token = await migrateShared();
      if (token === null) return null;
      const result = await read();
      return result.ok && result.value !== null ? result.value.userId : null;
    },

    async isLinked() {
      const result = await read();
      if (!result.ok) {
        await clearAndRequireRelink();
        return false;
      }
      return result.value !== null;
    },

    async save(session) {
      await area.set({ [SESSION_KEY]: session });
      await setNeedsRelink(false);
    },

    beginLink: beginLinkShared,

    async clear() {
      await area.remove(SESSION_KEY);
      await setNeedsRelink(false);
    },

    async needsRelink() {
      const raw = await area.get(AUTH_STATE_KEY);
      const parsed = authStateSchema.safeParse(raw[AUTH_STATE_KEY]);
      return parsed.success && parsed.data.needsRelink;
    },

    refresh: refreshLegacyShared,
  };
}
