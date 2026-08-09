const CHROME_EXTENSION_ID = /^[a-p]{32}$/;

/** Return one canonical Chrome Web Store listing URL, or null for any other URL. */
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
      CHROME_EXTENSION_ID.test(extensionId);
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
