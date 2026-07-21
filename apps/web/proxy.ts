import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from './lib/supabase/middleware';

/**
 * Next.js 16 request proxy (formerly `middleware`). Two jobs on every request:
 * refresh the Supabase session so Server Components see a fresh token, and gate
 * the private areas. Unauthenticated hits on `/me` or `/admin` are redirected
 * to `/signin?next=…`; `/admin`'s `is_admin` check is enforced in the page
 * itself (the proxy only knows authentication, not authorization).
 */

/** Path prefixes that require an authenticated session. */
const PROTECTED_PREFIXES = ['/me', '/admin'] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { response, userId } = await updateSession(request);

  if (userId === null && isProtected(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/signin';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', request.nextUrl.pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    // Preserve any cookies the session refresh rotated onto the response.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  /*
   * Run ONLY where a session matters. The public boards (`/`, `/uni/[slug]`)
   * are cacheable, identity-free renders (they do their own client-side
   * personalisation), so they must NOT trigger a per-request auth round-trip.
   *
   *   /me, /admin        — auth-gated dashboards (the redirect above)
   *   /link, /verify     — session-dependent flows (handoff / OTP)
   *   /auth/:path*       — the OAuth callback + signout write session cookies
   *   /api/:path*        — cookie/bearer routes that read the session
   *
   * `:path*` (zero-or-more) matches the bare prefix too (e.g. `/me`).
   */
  matcher: [
    '/me/:path*',
    '/admin/:path*',
    '/link/:path*',
    '/verify/:path*',
    '/auth/:path*',
    '/api/:path*',
  ],
};
