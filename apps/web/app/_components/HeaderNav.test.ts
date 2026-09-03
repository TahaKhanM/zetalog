// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/link' }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: auth.unsubscribe } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: auth.maybeSingle }) }) }),
  }),
}));
vi.mock('./Avatar', () => ({
  Avatar: () => createElement('span', { 'aria-hidden': 'true' }),
}));
vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => createElement('button', { type: 'button' }, 'Theme'),
}));

import { HeaderNav } from './HeaderNav';

describe('HeaderNav', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    auth.session = null;
    auth.getSession.mockImplementation(() => Promise.resolve({ data: { session: auth.session } }));
    auth.maybeSingle.mockResolvedValue({ data: { display_name: 'Taylor' } });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('refreshes its website session after an extension auth window closes', async () => {
    act(() => {
      root.render(createElement(HeaderNav));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.nav__signin')?.textContent).toBe('Sign in');

    auth.session = { user: { id: 'user-1' } };
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(container.querySelector('.auth-chip__name')?.textContent).toBe('Taylor');
    expect(auth.getSession).toHaveBeenCalledTimes(2);
  });
});
