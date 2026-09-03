const CHROME_EXTENSION_ID = /^[a-p]{32}$/;

/** The published Chrome Web Store item and its browser-owned OAuth callback. */
export const OFFICIAL_CHROME_EXTENSION_ID = 'bjleafpcpockiiblhkoddgomhkloaiab';
export const OFFICIAL_CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/zetalog/${OFFICIAL_CHROME_EXTENSION_ID}`;
export const OFFICIAL_EXTENSION_REDIRECT_URI = `https://${OFFICIAL_CHROME_EXTENSION_ID}.chromiumapp.org/zetalog-link`;

/**
 * Return the canonical official Store listing URL, or null for any other URL.
 * Requiring the published item ID prevents stale deployment configuration from
 * sending new users to an older ZetaLog package.
 */
export function chromeWebStoreUrl(value: string | undefined): string | null {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const extensionId = segments.at(-1);
    const listingPath =
      segments[0] === 'detail' &&
      (segments.length === 2 || segments.length === 3) &&
      extensionId !== undefined &&
      CHROME_EXTENSION_ID.test(extensionId) &&
      extensionId === OFFICIAL_CHROME_EXTENSION_ID;
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'chromewebstore.google.com' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      !listingPath
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
