import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createIdentifierResolver } from '@/lib/auth-identifier';
import { getProfile, getUniversityById, getVerifiedAliasEmail } from '@/lib/db/queries';
import { formatRelativeTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { UniBadge } from '../_components/UniBadge';
import { DisplayNameForm } from '../me/_components/DisplayNameForm';
import { ChangePasswordForm } from './_components/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

/** Providers we can name nicely on the connections list. */
const PROVIDER_NAMES: Record<string, string> = {
  email: 'Email & password',
  google: 'Google',
  github: 'GitHub',
};

/**
 * `/account` — identity and settings: display name, connected sign-in methods
 * (primary email, providers, the verified uni alias), password management, the
 * university badge, and sign out. Split from `/me` so the progress dashboard
 * is purely about the numbers.
 */
export default async function AccountPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) redirect('/signin?next=/account');

  const service = createServiceClient();
  const primaryEmail = user.email ?? null;
  const [profile, aliasEmail, match] = await Promise.all([
    getProfile(supabase, user.id),
    getVerifiedAliasEmail(service, user.id),
    primaryEmail !== null ? createIdentifierResolver(service)(primaryEmail) : null,
  ]);

  const displayName = profile?.display_name ?? null;
  const hasPassword = match?.hasPassword ?? false;
  const providers = [
    ...new Set((user.identities ?? []).map((identity) => identity.provider)),
  ].filter((provider) => provider !== 'phone');
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
              How you appear on the boards and how you sign in. Your numbers live in{' '}
              <Link href="/me">my progress</Link>.
            </p>
          </div>
        </div>
      </header>

      <section className="card card--pad me__section" aria-label="Display name">
        <h2 className="me__h2">Identity</h2>
        <DisplayNameForm current={displayName} />
        <p className="meta analysis-note">
          3–15 characters: letters, digits, and underscores. This is the name on the boards.
        </p>
      </section>

      <section className="me__section" aria-label="Sign-in and security">
        <h2 className="me__h2">Sign-in &amp; security</h2>
        <div className="card card--pad">
          <ul className="conn-list">
            {primaryEmail !== null ? (
              <li className="conn">
                <div className="conn__body">
                  <span className="conn__name">{primaryEmail}</span>
                  <span className="meta">Primary email — receives codes and recovery.</span>
                </div>
                <span className="chip chip--badge">Primary</span>
              </li>
            ) : null}
            {aliasEmail !== null && aliasEmail !== primaryEmail?.toLowerCase() ? (
              <li className="conn">
                <div className="conn__body">
                  <span className="conn__name">{aliasEmail}</span>
                  <span className="meta">Verified university email — also signs you in.</span>
                </div>
                <span className="chip chip--badge">Alias</span>
              </li>
            ) : null}
            <li className="conn">
              <div className="conn__body">
                <span className="conn__name">Sign-in methods</span>
                <span className="meta">
                  {hasPassword && !providers.includes('email')
                    ? 'A password is set alongside the providers below.'
                    : 'Ways this account can sign in.'}
                </span>
              </div>
              <span className="conn__chips">
                {providers.map((provider) => (
                  <span key={provider} className="chip chip--badge">
                    {PROVIDER_NAMES[provider] ?? provider}
                  </span>
                ))}
                {providers.length === 0 ? <span className="meta">None yet</span> : null}
              </span>
            </li>
          </ul>
          <div className="conn__actions">
            {primaryEmail !== null ? (
              <ChangePasswordForm email={primaryEmail} hasPassword={hasPassword} />
            ) : null}
          </div>
        </div>
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
