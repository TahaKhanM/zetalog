import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureFailedBanner } from './CaptureFailedBanner.js';
import { Header } from './Header.js';
import { readThemePreference, THEME_STORAGE_KEY } from './ThemeToggle.js';

const stored: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(stored)) Reflect.deleteProperty(stored, key);
  window.localStorage.clear();
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({ ...stored })),
        set: vi.fn((values: Record<string, unknown>) => {
          Object.assign(stored, values);
          return Promise.resolve();
        }),
      },
    },
  });
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Header', () => {
  it('renders the wordmark and the theme switch', () => {
    render(<Header />);
    expect(screen.getByText('ZetaLog')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Dark theme' })).toBeTruthy();
  });
});

describe('ThemeToggle', () => {
  it('migrates the 1.0.0 popup-local preference into extension storage once', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(await readThemePreference()).toBe('dark');
    expect(stored[THEME_STORAGE_KEY]).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('keeps the extension-wide preference authoritative over a stale legacy value', async () => {
    stored[THEME_STORAGE_KEY] = 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(await readThemePreference()).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('pins the opposite theme on click and persists it', async () => {
    // jsdom lacks matchMedia; effectiveTheme falls back to light there.
    render(<Header />);
    const toggle = screen.getByRole('switch', { name: 'Dark theme' });
    await waitFor(() => {
      expect(toggle.hasAttribute('disabled')).toBe(false);
    });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => {
      expect(stored[THEME_STORAGE_KEY]).toBe('dark');
    });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => {
      expect(stored[THEME_STORAGE_KEY]).toBe('light');
    });
  });
});

describe('CaptureFailedBanner', () => {
  it('renders the recorder-update message', () => {
    render(<CaptureFailedBanner />);
    expect(screen.getByText(/Recorder needs an update/i)).toBeTruthy();
  });
});
