import { NextResponse } from 'next/server';

import { providerAvatarFrom } from '@/lib/provider-avatar';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * `GET /auth/callback` — exchanges the OAuth `?code` for a session (Google; also honours any legacy email links)
 * (spec §7) and redirects onward. `next` is validated to be an in-app path so
 * the callback can never be turned into an open redirect.
 *
 * CO-6: OAuth arrivals also adopt the provider's profile picture — but only
 * into an EMPTY `profiles.avatar_url`, so a custom-uploaded picture is never
 * overwritten by signing in again. Best-effort: a failed avatar sync must
 * never break sign-in, so its error is logged and the redirect proceeds.
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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error === null) {
      const avatar = providerAvatarFrom(data.user.user_metadata);
      if (avatar !== null) {
        const { error: avatarError } = await createServiceClient()
          .from('profiles')
          .update({ avatar_url: avatar })
          .eq('id', data.user.id)
          .is('avatar_url', null);
        if (avatarError !== null) {
          console.error(`provider avatar sync failed: ${avatarError.message}`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth`);
}
