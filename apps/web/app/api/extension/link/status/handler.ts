import { extensionRedirectUriSchema, isAllowedExtensionRedirect } from '@/lib/extension-oauth';
import { apiError, apiJson } from '@/lib/http';

export const LINK_STATUS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Preflight the exact callback derived by Chrome before opening an interactive
 * auth window. This turns a stale Web Store id / deployment allowlist mismatch
 * into a useful error instead of a sign-in window that simply disappears.
 */
export function handleLinkStatus(
  request: Request,
  allowedRedirectUris: readonly string[],
): Response {
  const redirectUri = new URL(request.url).searchParams.get('redirect_uri');
  if (redirectUri === null || !extensionRedirectUriSchema.safeParse(redirectUri).success) {
    return apiError(
      400,
      'invalid-redirect',
      'Invalid extension callback.',
      LINK_STATUS_CORS_HEADERS,
    );
  }
  if (!isAllowedExtensionRedirect(redirectUri, allowedRedirectUris)) {
    return apiError(
      409,
      'extension-not-enabled',
      'This extension release is not enabled on ZetaLog yet.',
      LINK_STATUS_CORS_HEADERS,
    );
  }
  return apiJson(200, { supported: true }, LINK_STATUS_CORS_HEADERS);
}
