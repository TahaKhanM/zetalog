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
import { HeaderNav } from './_components/HeaderNav';

const GITHUB_URL = 'https://github.com/zetalog/zetalog';

export const metadata: Metadata = {
  title: {
    default: 'ZetaLog — Zetamac leaderboards',
    template: '%s — ZetaLog',
  },
  description:
    'Frictionless Zetamac score tracking with server-validated, per-university leaderboards.',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="shell site-header__row">
            <Link href="/" className="wordmark">
              ZetaLog
            </Link>
            <HeaderNav />
          </div>
        </header>
        <main className="shell" style={{ paddingBlock: 'clamp(1.5rem, 5vw, 3rem)' }}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="shell site-footer__row">
            <span>Not affiliated with Zetamac.</span>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
