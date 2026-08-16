import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Footer } from './Footer.js';

afterEach(cleanup);

describe('Footer', () => {
  it('signed out: shows the sync CTA and invokes onSync', () => {
    const onSync = vi.fn();
    render(
      <Footer
        linked={false}
        optedOut={null}
        onSync={onSync}
        onUnlink={vi.fn()}
        onSetPrivacy={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Sync to leaderboard'));
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unlink')).toBeNull();
  });

  it('signed in: shows the linked status and Unlink, invoking onUnlink', () => {
    const onUnlink = vi.fn();
    render(
      <Footer
        linked={true}
        optedOut={false}
        onSync={vi.fn()}
        onUnlink={onUnlink}
        onSetPrivacy={vi.fn()}
      />,
    );
    expect(screen.getByText('Linked to leaderboard')).toBeTruthy();
    expect(screen.queryByText('Sync to leaderboard')).toBeNull();
    fireEvent.click(screen.getByText('Unlink'));
    expect(onUnlink).toHaveBeenCalledTimes(1);
  });

  it('signed in: toggles leaderboard privacy via the checkbox', () => {
    const onSetPrivacy = vi.fn();
    render(
      <Footer
        linked={true}
        optedOut={false}
        onSync={vi.fn()}
        onUnlink={vi.fn()}
        onSetPrivacy={onSetPrivacy}
      />,
    );
    fireEvent.click(screen.getByText('Keep my scores off the leaderboard'));
    expect(onSetPrivacy).toHaveBeenCalledWith(true);
  });

  it('signed in and private: reflects the hidden status', () => {
    render(
      <Footer
        linked={true}
        optedOut={true}
        onSync={vi.fn()}
        onUnlink={vi.fn()}
        onSetPrivacy={vi.fn()}
      />,
    );
    expect(screen.getByText('Linked, scores private')).toBeTruthy();
  });

  it('disables the sync button while secure sign-in is opening', () => {
    render(
      <Footer
        linked={false}
        optedOut={null}
        onSync={vi.fn()}
        onUnlink={vi.fn()}
        onSetPrivacy={vi.fn()}
        linkState={{ phase: 'linking', message: 'Finish sign-in in Chrome.' }}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Opening secure sign-in…' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Finish sign-in in Chrome.')).toBeTruthy();
  });

  it('shows an actionable failed-link message as an alert', () => {
    render(
      <Footer
        linked={false}
        optedOut={null}
        onSync={vi.fn()}
        onUnlink={vi.fn()}
        onSetPrivacy={vi.fn()}
        linkState={{ phase: 'error', message: 'Update the extension and retry.' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Update the extension');
  });

  it('keeps a successful initial-sync notice visible after linking', () => {
    render(
      <Footer
        linked
        optedOut={false}
        onSync={vi.fn()}
        onUnlink={vi.fn()}
        onSetPrivacy={vi.fn()}
        linkState={{ phase: 'success', message: 'Connected and synced.' }}
      />,
    );
    expect(screen.getByText('Connected and synced.')).toBeTruthy();
  });
});
