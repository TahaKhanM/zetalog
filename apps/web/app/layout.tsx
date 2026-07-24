import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Self-hosted fonts (no external requests). Archivo needs the width axis for
// the 125%-stretch display; Azeret Mono carries every numeral at 400/500/700.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/spline-sans/400.css';
import '@fontsource/spline-sans/500.css';
import '@fontsource/spline-sans/600.css';
import '@fontsource/azeret-mono/400.css';
import '@fontsource/azeret-mono/500.css';
import '@fontsource/azeret-mono/700.css';

import './globals.css';
import { BrandMark } from './_components/BrandMark';
import { HeaderNav } from './_components/HeaderNav';

const GITHUB_URL = 'https://github.com/TahaKhanM/zetalog';

export const metadata: Metadata = {
  title: {
    default: 'ZetaLog · Zetamac leaderboards',
    template: '%s · ZetaLog',
  },
  description:
    'Frictionless Zetamac score tracking with server-validated, per-university leaderboards.',
  // Wire the tracked public/ icons so the browser tab and iOS home screen use them.
  icons: {
    icon: '/icon-512.png',
    apple: '/icon-180.png',
  },
};

/**
 * Applies a stored theme choice before first paint (CO-9). Inline and tiny on
 * purpose: anything async would flash the OS theme first. Absent or invalid
 * storage falls through to the CSS `prefers-color-scheme` default.
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('zl-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    // suppressHydrationWarning is attribute-scoped to <html>: the theme
    // bootstrap legitimately stamps data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <header className="site-header">
          <div className="shell site-header__row">
            <Link href="/" className="brand-link" aria-label="ZetaLog home">
              <BrandMark variant="lockup" />
            </Link>
            <HeaderNav />
          </div>
        </header>
        <main className="shell" style={{ paddingBlock: 'clamp(1.5rem, 5vw, 3rem)' }}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="shell site-footer__row">
            <span className="site-footer__brand">
              <span>Not affiliated with Zetamac.</span>
            </span>
            <span className="site-footer__links">
              <Link href="/how-it-works">How it works</Link>
              <Link href="/privacy">Privacy</Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
                GitHub
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
