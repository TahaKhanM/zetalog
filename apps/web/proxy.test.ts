import { describe, expect, it } from 'vitest';

import { config } from './proxy';

/**
 * The proxy matcher is the perf boundary: it must cover EVERY route that reads
 * the session server-side (so rotated refresh cookies are always persisted by
 * the proxy — `lib/supabase/server.ts` drops cookie writes by design) and no
 * public route (the cacheable boards must never trigger an auth round-trip).
 *
 * /signin belongs in the list: its page calls `userIdFromCookies` (a getUser
 * that can rotate an expired session's refresh token) to skip already-signed-in
 * users. Without the proxy, that rotation is burned unpersisted — the churn
 * class behind intermittent signed-in bounces.
 */
describe('proxy config.matcher', () => {
  it('covers exactly the session-bearing routes and no public board', () => {
    expect(config.matcher).toEqual([
      '/me/:path*',
      '/admin/:path*',
      '/link/:path*',
      '/verify/:path*',
      '/signin/:path*',
      '/auth/:path*',
      '/api/:path*',
    ]);
  });
});
