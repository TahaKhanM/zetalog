export const EXTENSION_LINK_INTENT = 'link-extension';

/**
 * Show extension-specific account guidance only for the authorize endpoint.
 * The intent query is user-controlled, so it must agree with the already-safe
 * local destination instead of changing unrelated sign-in screens by itself.
 */
export function isExtensionLinkIntent(value: string | string[] | undefined, next: string): boolean {
  const intent = Array.isArray(value) ? value[0] : value;
  if (intent !== EXTENSION_LINK_INTENT) return false;

  try {
    const origin = 'https://www.zetalog.co.uk';
    const destination = new URL(next, origin);
    return (
      destination.origin === origin && destination.pathname === '/api/extension/link/authorize'
    );
  } catch {
    return false;
  }
}
