'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/browser';

/**
 * Header nav + auth chip. Client-side on purpose: it reads the session in an
 * effect (never during render), so the root layout stays static-safe and the
 * zero-env build never touches `clientEnv`. The chip shows a sign-in link when
 * signed out, or the display name + sign-out when signed in.
 */

type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly displayName: string | null };

function displayNameOf(row: Record<string, unknown> | null): string | null {
  const value = row?.display_name;
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
      if (active) setAuth({ status: 'signed-in', displayName: displayNameOf(data) });
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
      <Link href="/" aria-current={isActive('/') ? 'page' : undefined}>
        Leaderboard
      </Link>
      <Link href="/me" aria-current={isActive('/me') ? 'page' : undefined}>
        My progress
      </Link>
      <AuthChip auth={auth} />
    </nav>
  );
}

function AuthChip({ auth }: { auth: AuthState }): React.JSX.Element {
  if (auth.status === 'loading') {
    return <span className="auth-chip auth-chip--loading" aria-hidden="true" />;
  }
  if (auth.status === 'signed-out') {
    return (
      <Link href="/signin" className="btn btn--ghost btn--sm">
        Sign in
      </Link>
    );
  }
  return (
    <span className="auth-chip">
      <Link href="/account" className="auth-chip__name" title="Account settings">
        {auth.displayName ?? 'Set a name'}
      </Link>
    </span>
  );
}
