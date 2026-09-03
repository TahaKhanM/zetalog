import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '@/app/_components/SignInForm';
import { userIdFromCookies } from '@/lib/auth';
import { isExtensionLinkIntent } from '@/lib/extension-link-intent';
import { createClient } from '@/lib/supabase/server';

import { safeNext } from './safe-next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/signin` — email-first auth: password sign-in (uni aliases welcome),
 * sign-up with a one-time emailed code, Google/GitHub OAuth, and password
 * recovery. Already-signed-in users skip straight on.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const linkingExtension = isExtensionLinkIntent(sp.intent, next);
  const supabase = await createClient();
  if ((await userIdFromCookies(supabase)) !== null) redirect(next);

  return (
    <div className="auth-page">
      <div className="card card--pad auth-card">
        <h1 className="display auth-card__title">
          {linkingExtension ? 'Create an account or sign in' : 'Log in or sign up'}
        </h1>
        {linkingExtension ? (
          <p className="notice auth-card__lede">
            Linking requires a free ZetaLog account. Create one below, or sign in if you already
            have one. We&apos;ll return you to the extension automatically.
          </p>
        ) : null}
        {sp.error !== undefined ? (
          <p className="notice" role="alert" style={{ marginBottom: '1rem' }}>
            Sign-in didn&apos;t complete. Please try again.
          </p>
        ) : null}
        <SignInForm next={next} extensionLink={linkingExtension} />
      </div>
    </div>
  );
}
