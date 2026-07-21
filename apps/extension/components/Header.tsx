import type { JSX } from 'react';

/** Popup masthead: the icon mark plus the Archivo wordmark (spec §3.3, §8). */
export function Header(): JSX.Element {
  return (
    <header className="zl-header">
      <img className="zl-header__mark" src="/icon-48.png" alt="" width={22} height={22} />
      <h1 className="zl-wordmark">ZetaLog</h1>
      <span className="zl-header__tag">Local</span>
    </header>
  );
}
