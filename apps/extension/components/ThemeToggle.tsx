import { useEffect, useState, type JSX } from 'react';

/**
 * The popup's light/dark switch, matching the site's sliding pill.
 * The OS preference is the default; a click pins `html[data-theme]` and
 * persists it in extension storage, which main.tsx re-applies before first paint.
 */

export const THEME_STORAGE_KEY = 'zl-theme';

type Theme = 'light' | 'dark';

function parseTheme(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * Read the extension-wide preference, migrating the 1.0.0 popup-local value on
 * first use. The legacy value is removed only after the durable write lands,
 * so a transient storage failure cannot silently discard the user's choice.
 */
export async function readThemePreference(): Promise<Theme | null> {
  try {
    const stored = await browser.storage.local.get(THEME_STORAGE_KEY);
    const current = parseTheme(stored[THEME_STORAGE_KEY]);
    if (current !== null) return current;
  } catch {
    // A legacy popup preference may still be readable below.
  }

  let legacy: Theme | null;
  try {
    legacy = parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
  if (legacy === null) return null;

  try {
    await browser.storage.local.set({ [THEME_STORAGE_KEY]: legacy });
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Keep the legacy value so a later popup can retry the migration.
  }
  return legacy;
}

function effectiveTheme(stored: Theme | null): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  // matchMedia is absent in some test environments; default to light there.
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function SunIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function MoonIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.2 14.1A8.3 8.3 0 0 1 9.9 3.8a8.3 8.3 0 1 0 10.3 10.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    void readThemePreference()
      .then((stored) => {
        setTheme(effectiveTheme(stored));
      })
      .catch(() => {
        setTheme(effectiveTheme(null));
      });
  }, []);

  function toggle(): void {
    if (theme === null) return;
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    void browser.storage.local.set({ [THEME_STORAGE_KEY]: next }).catch(() => {
      // Storage failure only loses persistence, never the switch itself.
    });
    setTheme(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Dark theme"
      title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      className="zl-theme-toggle"
      data-state={theme ?? 'unknown'}
      onClick={toggle}
      disabled={theme === null}
    >
      <span className="zl-theme-toggle__icon zl-theme-toggle__icon--sun">
        <SunIcon />
      </span>
      <span className="zl-theme-toggle__icon zl-theme-toggle__icon--moon">
        <MoonIcon />
      </span>
      <span className="zl-theme-toggle__thumb" aria-hidden="true" />
    </button>
  );
}
