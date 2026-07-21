/**
 * The ZetaLog web app. The popup's "Sync to leaderboard" button opens
 * `WEB_APP_URL + '/link'` in a new tab, and the API client posts recorded games
 * to `WEB_APP_URL + '/api/games'`. Together with the account session this is the
 * entire sync seam (W4); the product stays fully functional signed out
 * (invariant 4) — nothing here runs until the user links an account.
 */
export const WEB_APP_URL = 'https://www.zetalog.co.uk';

/**
 * The Supabase project URL. Public and client-safe (RLS is the security
 * boundary; only the anon key ever ships). The extension talks to Supabase for
 * exactly one thing — refreshing an expired access token via the token endpoint
 * (`lib/auth.ts`) — so supabase-js never enters the bundle.
 *
 * RUNBOOK: replace this placeholder with the real project URL before publishing
 * (docs/store — "Fill extension Supabase constants"). Must be the origin the
 * account session was minted for; tokens are only ever sent here (never logged).
 */
export const SUPABASE_URL = 'https://jnhalsnndqqowyoinbrz.supabase.co';

/**
 * The Supabase anonymous (publishable) key. Public by design — it authorizes
 * only anon-role requests, which RLS then constrains. Sent as the `apikey`
 * header on the token-refresh call. RUNBOOK: fill before publishing (same step
 * as {@link SUPABASE_URL}).
 */
export const SUPABASE_ANON_KEY = 'sb_publishable_oB9siDNO9u8Vo9HPUEXXdA_pZlr7MxE';

/**
 * Origins the account-link handoff is accepted from and tokens may be sent to.
 * The link content script only runs on these, and the token refresh only talks
 * to {@link SUPABASE_URL} — no token ever reaches any other recipient (brief
 * "Constraints"). localhost is included for the full-stack e2e / local dev.
 */
export const LINK_ORIGINS = ['https://www.zetalog.co.uk', 'http://localhost:3000'] as const;
