'use client';

import { useEffect, useState } from 'react';

/**
 * Paper/blackboard switch (CO-9). The OS preference is the default; a click
 * pins an explicit theme on `html[data-theme]` and persists it. The layout's
 * inline bootstrap script re-applies the stored choice before first paint, so
 * there is no flash. State starts unknown and resolves in an effect — the
 * server render and the client's first render agree, keeping hydration clean.
 */

const STORAGE_KEY = 'zl-theme';

type Theme = 'light' | 'dark';

function effectiveTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

  const label = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
      disabled={theme === null}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  );
}
