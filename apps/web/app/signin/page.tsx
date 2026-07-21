import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '@/app/_components/SignInForm';
import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

type SearchParams = Record<string, string | string[] | undefined>;

function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/me';
}

/** `/signin` — six-digit email code + Google. Already-signed-in users skip straight on. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const supabase = await createClient();
  if ((await userIdFromCookies(supabase)) !== null) redirect(next);

  return (
    <div className="auth-page">
      <div className="card card--pad auth-card">
        <h1 className="display auth-card__title">Sign in</h1>
        <p className="meta auth-card__lede">
          Sync your Zetamac scores to the leaderboard. No password required.
        </p>
        {sp.error !== undefined ? (
          <p className="notice" role="alert" style={{ marginBottom: '1rem' }}>
            Sign-in didn&apos;t complete. Please try again.
          </p>
        ) : null}
        <SignInForm next={next} />
      </div>
    </div>
  );
}
