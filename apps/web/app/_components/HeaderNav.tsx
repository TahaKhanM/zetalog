'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/browser';

import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';

/**
 * Header nav + auth chip. Client-side on purpose: it reads the session in an
 * effect (never during render), so the root layout stays static-safe and the
 * zero-env build never touches `clientEnv`. Links are set as an exam-paper
 * index — small maroon numerals before quiet titles; the account chip carries
 * a monogram avatar and links to `/account`.
 */

type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly displayName: string | null };

function stringOf(row: Record<string, unknown> | null, key: string): string | null {
  const value = row?.[key];
  return typeof value === 'string' ? value : null;
}

export function HeaderNav(): React.JSX.Element {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Session (not getUser) drives a display-only chip: it is properly typed
    // `Session | null`, and RLS still guards the profile read. Not an authz call.
    async function loadProfile(userId: string): Promise<void> {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();
      if (active) {
        setAuth({ status: 'signed-in', displayName: stringOf(data, 'display_name') });
      }
    }

    async function init(): Promise<void> {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session === null) {
        setAuth({ status: 'signed-out' });
        return;
      }
      await loadProfile(session.user.id);
    }

    void init();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session === null) setAuth({ status: 'signed-out' });
      else void loadProfile(session.user.id);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="nav">
      <Link href="/" className="nav__link" aria-current={isActive('/') ? 'page' : undefined}>
        <span className="nav__index num" aria-hidden="true">
          01
        </span>
        Leaderboard
      </Link>
      <Link href="/me" className="nav__link" aria-current={isActive('/me') ? 'page' : undefined}>
        <span className="nav__index num" aria-hidden="true">
          02
        </span>
        My progress
      </Link>
      <AuthChip auth={auth} active={isActive('/account')} />
      <ThemeToggle />
    </nav>
  );
}

function AuthChip({ auth, active }: { auth: AuthState; active: boolean }): React.JSX.Element {
  if (auth.status === 'loading') {
    return <span className="auth-chip auth-chip--loading" aria-hidden="true" />;
  }
  if (auth.status === 'signed-out') {
    return (
      <Link href="/signin" className="btn btn--primary btn--sm nav__signin">
        Sign in
      </Link>
    );
  }
  const name = auth.displayName ?? 'Set a name';
  return (
    <Link
      href="/account"
      className={`auth-chip${active ? ' auth-chip--active' : ''}`}
      title="Account settings"
    >
      <Avatar name={auth.displayName ?? '?'} size={26} />
      <span className="auth-chip__name">{name}</span>
    </Link>
  );
}
