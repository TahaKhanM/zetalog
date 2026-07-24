import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CaptureFailedBanner } from './CaptureFailedBanner.js';
import { Header } from './Header.js';
import { THEME_STORAGE_KEY } from './ThemeToggle.js';

afterEach(cleanup);

describe('Header', () => {
  it('renders the wordmark and the theme switch', () => {
    render(<Header />);
    expect(screen.getByText('ZetaLog')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Dark theme' })).toBeTruthy();
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('pins the opposite theme on click and persists it', () => {
    // jsdom lacks matchMedia; effectiveTheme falls back to light there.
    render(<Header />);
    const toggle = screen.getByRole('switch', { name: 'Dark theme' });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});

describe('CaptureFailedBanner', () => {
  it('renders the recorder-update message', () => {
    render(<CaptureFailedBanner />);
    expect(screen.getByText(/Recorder needs an update/i)).toBeTruthy();
  });
});
