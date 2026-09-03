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
  const [menuOpen, setMenuOpen] = useState(false);

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
    // A website sign-in may finish in Chrome Identity's temporary auth window
    // while `/link` remains open. The first-party cookies are shared, but that
    // server-set cookie does not emit a Supabase auth event in this tab. Re-read
    // it when the tab regains focus so the account chip updates immediately.
    const refreshAfterExternalAuth = (): void => {
      void init();
    };
    window.addEventListener('focus', refreshAfterExternalAuth);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session === null) setAuth({ status: 'signed-out' });
      else void loadProfile(session.user.id);
    });
    return () => {
      active = false;
      window.removeEventListener('focus', refreshAfterExternalAuth);
      subscription.unsubscribe();
    };
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the menu is open, close it on Escape or a click outside the header.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    function onPointerDown(event: PointerEvent): void {
      const header = document.querySelector('.site-header__row');
      if (header !== null && !header.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);
  const closeMenu = (): void => {
    setMenuOpen(false);
  };

  // The links + account live in `.nav`, which is an inline row on desktop and a
  // drop-down panel on mobile (toggled by the burger). The theme toggle and the
  // burger stay in the header at every width, so the mobile bar is uncluttered.
  return (
    <>
      <nav id="site-menu" className="nav" data-open={menuOpen} aria-label="Primary">
        <Link
          href="/"
          className="nav__link"
          aria-current={isActive('/') ? 'page' : undefined}
          onClick={closeMenu}
        >
          Leaderboard
        </Link>
        <Link
          href="/me"
          className="nav__link"
          aria-current={isActive('/me') ? 'page' : undefined}
          onClick={closeMenu}
        >
          My progress
        </Link>
        <Link
          href="/how-it-works"
          className="nav__link"
          aria-current={isActive('/how-it-works') ? 'page' : undefined}
          onClick={closeMenu}
        >
          How it works
        </Link>
        <AuthChip auth={auth} active={isActive('/account')} onNavigate={closeMenu} />
      </nav>
      <div className="nav__controls">
        <ThemeToggle />
        <button
          type="button"
          className="nav__burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
        >
          <span className="nav__burger-box" data-open={menuOpen} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
    </>
  );
}

function AuthChip({
  auth,
  active,
  onNavigate,
}: {
  auth: AuthState;
  active: boolean;
  onNavigate: () => void;
}): React.JSX.Element {
  if (auth.status === 'loading') {
    return <span className="auth-chip auth-chip--loading" aria-hidden="true" />;
  }
  if (auth.status === 'signed-out') {
    return (
      <Link href="/signin" className="btn btn--primary btn--sm nav__signin" onClick={onNavigate}>
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
      onClick={onNavigate}
    >
      <Avatar name={auth.displayName ?? '?'} size={26} />
      <span className="auth-chip__name">{name}</span>
    </Link>
  );
}
