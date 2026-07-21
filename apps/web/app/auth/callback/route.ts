import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * `GET /auth/callback` — exchanges the OAuth/magic-link `?code` for a session
 * (spec §7) and redirects onward. `next` is validated to be an in-app path so
 * the callback can never be turned into an open redirect.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNext = searchParams.get('next');
  const next =
    requestedNext !== null && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/me';

  if (code !== null) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error === null) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth`);
}
