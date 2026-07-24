import type { JSX } from 'react';

import { ThemeToggle } from './ThemeToggle.js';

/** Popup masthead: the icon mark, the Archivo wordmark and the theme switch. */
export function Header(): JSX.Element {
  return (
    <header className="zl-header">
      <img className="zl-header__mark" src="/icon-48.png" alt="" width={22} height={22} />
      <h1 className="zl-wordmark">ZetaLog</h1>
      <span className="zl-header__spacer" />
      <ThemeToggle />
    </header>
  );
}
