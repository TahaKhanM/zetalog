'use client';

import { useEffect, useState } from 'react';

/**
 * Paper/blackboard switch: a sliding pill with
 * stroke-drawn sun and moon marks — no emoji, so the icons render identically
 * on every platform and take the ink colours of the theme they sit in. The OS
 * preference is the default; a click pins `html[data-theme]` and persists it,
 * and the layout's inline bootstrap re-applies it before first paint.
 */

const STORAGE_KEY = 'zl-theme';

type Theme = 'light' | 'dark';

function effectiveTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function SunIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.2 14.1A8.3 8.3 0 0 1 9.9 3.8a8.3 8.3 0 1 0 10.3 10.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(effectiveTheme());
  }, []);

  function toggle(): void {
    if (theme === null) return;
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode storage failures only lose persistence, never the switch.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Dark theme"
      title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      className="theme-toggle"
      data-state={theme ?? 'unknown'}
      onClick={toggle}
      disabled={theme === null}
    >
      <span className="theme-toggle__icon theme-toggle__icon--sun">
        <SunIcon />
      </span>
      <span className="theme-toggle__icon theme-toggle__icon--moon">
        <MoonIcon />
      </span>
      <span className="theme-toggle__thumb" aria-hidden="true" />
    </button>
  );
}
