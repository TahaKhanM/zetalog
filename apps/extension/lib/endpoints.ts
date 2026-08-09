/**
 * Stable production endpoint. The WXT-prefixed override is compiled only into
 * the dedicated browser E2E build, where a local protocol replica proves the
 * real chrome.identity/PKCE/storage wiring. Published builds leave it unset.
 */
const runtimeEnv = import.meta.env as ImportMetaEnv | undefined;
const webAppUrlOverride = runtimeEnv?.WXT_WEB_APP_URL?.trim();

export const WEB_APP_URL =
  webAppUrlOverride === undefined || webAppUrlOverride === ''
    ? 'https://www.zetalog.co.uk'
    : webAppUrlOverride;

/** Used only to silently migrate valid sessions created by extension 1.0.0. */
export const SUPABASE_URL = 'https://jnhalsnndqqowyoinbrz.supabase.co';

/** Public anon key; database RLS remains the authorization boundary. */
export const SUPABASE_ANON_KEY = 'sb_publishable_oB9siDNO9u8Vo9HPUEXXdA_pZlr7MxE';
