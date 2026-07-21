/**
 * The ZetaLog web app. The popup's "Sync to leaderboard" button opens
 * `WEB_APP_URL + '/link'` in a new tab — this constant and that button are the
 * entire account-linking/sync seam (W4). Nothing else in the extension talks
 * to the network; the product is fully functional signed out (invariant 4).
 */
export const WEB_APP_URL = 'https://zetalog.vercel.app';
