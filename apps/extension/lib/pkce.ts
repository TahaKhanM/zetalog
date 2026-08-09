/**
 * Browser-side PKCE helpers for the installation credential link flow.
 *
 * All values come from Web Crypto. They deliberately never enter a webpage,
 * extension runtime message, or persistent storage.
 */

export interface PkceValues {
  readonly state: string;
  readonly verifier: string;
  readonly challenge: string;
}

/** Encode bytes for URL query parameters without weakening their entropy. */
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function randomUrlValue(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** Generate an RFC 7636 S256 verifier/challenge pair and a CSRF state value. */
export async function createPkceValues(): Promise<PkceValues> {
  const verifier = randomUrlValue();
  const state = randomUrlValue();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, state, challenge: base64Url(new Uint8Array(digest)) };
}

/**
 * Accept only the exact Chrome identity redirect endpoint and its one-time
 * `code` + matching `state`. A callback that merely resembles the endpoint is
 * not enough: origin/path, fragment, duplicate keys, and extra parameters are
 * all rejected before its code can be exchanged.
 */
export function codeFromLinkCallback(
  callbackUrl: string | undefined,
  redirectUri: string,
  expectedState: string,
): string | null {
  if (callbackUrl === undefined) return null;
  try {
    const callback = new URL(callbackUrl);
    const redirect = new URL(redirectUri);
    if (
      redirect.search !== '' ||
      redirect.hash !== '' ||
      callback.protocol !== redirect.protocol ||
      callback.hostname !== redirect.hostname ||
      callback.port !== redirect.port ||
      callback.pathname !== redirect.pathname ||
      callback.username !== redirect.username ||
      callback.password !== redirect.password ||
      callback.hash !== ''
    ) {
      return null;
    }
    const entries = [...callback.searchParams.entries()];
    if (entries.length !== 2) return null;
    const code = callback.searchParams.getAll('code');
    const state = callback.searchParams.getAll('state');
    if (code.length !== 1 || state.length !== 1 || state[0] !== expectedState) return null;
    return code[0] === undefined || code[0].length === 0 ? null : code[0];
  } catch {
    return null;
  }
}
