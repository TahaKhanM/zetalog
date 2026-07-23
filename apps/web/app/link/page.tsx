import type { Metadata } from 'next';

import { LinkHandoff } from '@/app/_components/LinkHandoff';
import { SignInForm } from '@/app/_components/SignInForm';
import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Link the extension' };

/**
 * `/link` — the extension opens this to link an account. Signed-out users see
 * the sign-in form (returning here); signed-in users see the handoff state that
 * the extension picks up (its internals are W4's LinkHandoff).
 */
export default async function LinkPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const signedIn = (await userIdFromCookies(supabase)) !== null;

  return (
    <div className="auth-page">
      <div className="card card--pad auth-card">
        <h1 className="display auth-card__title">Link extension</h1>
        {signedIn ? (
          <LinkHandoff />
        ) : (
          <>
            <p className="meta auth-card__lede">
              Sign in to connect this browser&apos;s ZetaLog extension to your account.
            </p>
            <SignInForm next="/link" />
          </>
        )}
      </div>
    </div>
  );
}
