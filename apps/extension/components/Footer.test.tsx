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

  it('signed in: shows the syncing status and Unlink, invoking onUnlink', () => {
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
    expect(screen.getByText('Syncing to leaderboard')).toBeTruthy();
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
});
