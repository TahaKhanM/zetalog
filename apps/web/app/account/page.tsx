import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { userIdFromCookies } from '@/lib/auth';
import { getProfile, getUniversityById } from '@/lib/db/queries';
import { formatRelativeTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

import { UniBadge } from '../_components/UniBadge';
import { DisplayNameForm } from '../me/_components/DisplayNameForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

/**
 * `/account` — identity and settings: display name, university badge, sign
 * out. Split from `/me` so the progress dashboard is purely about the numbers
 * and the header's name chip has a home of its own.
 */
export default async function AccountPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const userId = await userIdFromCookies(supabase);
  if (userId === null) redirect('/signin?next=/account');

  const profile = await getProfile(supabase, userId);
  const displayName = profile?.display_name ?? null;
  const university =
    profile?.university_id != null && profile.uni_verified_at != null
      ? await getUniversityById(supabase, profile.university_id)
      : null;

  return (
    <div className="me account">
      <header className="masthead me__head">
        <p className="masthead__eyebrow display">The register</p>
        <div className="masthead__row">
          <div>
            <h1 className="display board-title">Account</h1>
            <p className="meta">
              How you appear on the boards. Your numbers live in <Link href="/me">my progress</Link>
              .
            </p>
          </div>
        </div>
      </header>

      <section className="card card--pad me__section" aria-label="Display name">
        <h2 className="me__h2">Identity</h2>
        <DisplayNameForm current={displayName} />
      </section>

      <section className="me__section" aria-label="University badge">
        <h2 className="me__h2">University badge</h2>
        <div className="card card--pad badge-card">
          {university !== null && profile?.uni_verified_at != null ? (
            <>
              <div className="badge-card__id">
                <UniBadge slug={university.slug} name={university.name} size="profile" />
                <div>
                  <p className="badge-card__name">{university.name}</p>
                  <p className="meta" style={{ margin: 0 }}>
                    Verified {formatRelativeTime(profile.uni_verified_at, Date.now())}.
                  </p>
                </div>
              </div>
              <Link href="/verify" className="btn btn--ghost btn--sm">
                Change
              </Link>
            </>
          ) : (
            <>
              <p className="meta" style={{ margin: 0 }}>
                No university badge yet. Verify a UK university email to earn one.
              </p>
              <Link href="/verify" className="btn btn--primary btn--sm">
                Verify email
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="me__section" aria-label="Session">
        <h2 className="me__h2">Session</h2>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn--ghost btn--sm">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
