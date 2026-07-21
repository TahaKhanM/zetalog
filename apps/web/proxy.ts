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

export const proxyConfig = {
  matcher: [
    /*
     * Every request path except Next internals and static asset files, so the
     * session is refreshed site-wide without touching image/font requests.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
