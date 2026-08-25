import { z } from 'zod';

/**
 * Chrome exposes extension OAuth callbacks at this exact origin shape. Keeping
 * the extension id in the server environment lets releases rotate it without
 * accepting arbitrary Chromium-app redirects.
 */
const chromiumAppRedirectPattern = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/zetalog-link$/;

export const pkceChallengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
export const pkceVerifierSchema = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);
export const oauthStateSchema = z.string().regex(/^[A-Za-z0-9_-]{16,512}$/);

export const extensionRedirectUriSchema = z
  .string()
  .refine(
    (value) => chromiumAppRedirectPattern.test(value),
    'must be an exact https://<extension-id>.chromiumapp.org/zetalog-link URL',
  );

/** Parse the comma-separated, server-only redirect allowlist. */
export function parseExtensionRedirectUris(value: string): string[] {
  return z
    .array(extensionRedirectUriSchema)
    .min(1)
    .refine((uris) => new Set(uris).size === uris.length, 'redirect URLs must be unique')
    .parse(value.split(',').map((uri) => uri.trim()));
}

/** Exact-string matching deliberately rejects URL normalisation tricks. */
export function isAllowedExtensionRedirect(
  redirectUri: string,
  allowedRedirectUris: readonly string[],
): boolean {
  return (
    extensionRedirectUriSchema.safeParse(redirectUri).success &&
    allowedRedirectUris.includes(redirectUri)
  );
}

/** Put a one-time authorization code on an already-validated callback URL. */
export function authorizationCallbackUrl(redirectUri: string, code: string, state: string): string {
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', state);
  return callback.toString();
}
