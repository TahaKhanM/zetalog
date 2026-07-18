import { ZETAMAC_DEFAULT_SETTINGS, fingerprint } from '@zetalog/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoredGame } from '../lib/store.js';
import { RecentGames, syncTag } from './RecentGames.js';

afterEach(cleanup);

const NOW = 1_700_000_000_000;
let seq = 0;

function game(over: Partial<StoredGame> & { score?: number } = {}): StoredGame {
  seq += 1;
  const { score, ...rest } = over;
  return {
    record: {
      id: `id-${String(seq)}`,
      startedAtMs: NOW,
      playedMs: 120_000,
      settings: ZETAMAC_DEFAULT_SETTINGS,
      events: [],
      claimedScore: score ?? 50,
    },
    fingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
    rankableDuration: 120,
    status: 'kept',
    savedAtMs: NOW,
    ...rest,
  };
}

function row(status: string): HTMLElement {
  const found = screen.getByTestId('recent-games').querySelector(`[data-status="${status}"]`);
  if (found === null) throw new Error(`no row with status ${status}`);
  return found as HTMLElement;
}

describe('RecentGames', () => {
  it('greys and strikes non-kept scores but not kept ones', () => {
    render(
      <RecentGames
        games={[
          game({ status: 'kept' }),
          game({ status: 'quarantined', quarantineReason: 'outlier' }),
        ]}
        nowMs={NOW}
        onRestore={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(row('kept').className).not.toContain('zl-game--inactive');
    expect(row('quarantined').className).toContain('zl-game--inactive');
    expect(within(row('quarantined')).getByText('Outlier')).toBeTruthy();
  });

  it('fires onRestore for a quarantined game', () => {
    const onRestore = vi.fn();
    const quarantined = game({ status: 'quarantined', quarantineReason: 'restart' });
    render(
      <RecentGames games={[quarantined]} nowMs={NOW} onRestore={onRestore} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Restore'));
    expect(onRestore).toHaveBeenCalledWith(quarantined.record.id);
  });

  it('fires onRemove for a kept game via the destructive button', () => {
    const onRemove = vi.fn();
    const kept = game({ status: 'kept' });
    render(<RecentGames games={[kept]} nowMs={NOW} onRestore={vi.fn()} onRemove={onRemove} />);
    const remove = screen.getByText('Remove');
    expect(remove.className).toContain('zl-btn--danger');
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith(kept.record.id);
  });

  it('offers Restore but not Remove on an already-removed game', () => {
    render(
      <RecentGames
        games={[game({ status: 'removed' })]}
        nowMs={NOW}
        onRestore={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.getByText('Restore')).toBeTruthy();
  });

  it('shows an em dash and a flag for a capture_failed row', () => {
    render(
      <RecentGames
        games={[game({ status: 'capture_failed', score: 0 })]}
        nowMs={NOW}
        onRestore={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const failed = row('capture_failed');
    expect(within(failed).getByText('—')).toBeTruthy();
    expect(within(failed).getByText('Capture failed')).toBeTruthy();
  });

  it('renders no sync chip when a game has no sync bookkeeping (signed out)', () => {
    render(<RecentGames games={[game()]} nowMs={NOW} onRestore={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByText(/Syncing|Synced|Sync failed|Under review/)).toBeNull();
  });

  it('shows a pending, synced, under-review, and failed chip by sync state', () => {
    render(
      <RecentGames
        games={[
          game({ sync: { state: 'pending' } }),
          game({ sync: { state: 'uploaded', outcome: 'accepted', serverScore: 40 } }),
          game({ sync: { state: 'uploaded', outcome: 'quarantined' } }),
          game({ sync: { state: 'failed' } }),
        ]}
        nowMs={NOW}
        onRestore={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Syncing…')).toBeTruthy();
    expect(screen.getByText('Synced')).toBeTruthy();
    expect(screen.getByText('Under review')).toBeTruthy();
    expect(screen.getByText('Sync failed')).toBeTruthy();
  });
});

describe('syncTag', () => {
  it('maps every sync state to a chip, or null when absent', () => {
    expect(syncTag(game())).toBeNull();
    expect(syncTag(game({ sync: { state: 'pending' } }))?.tone).toBe('pending');
    expect(syncTag(game({ sync: { state: 'failed' } }))?.tone).toBe('fail');
    expect(syncTag(game({ sync: { state: 'uploaded', outcome: 'rejected' } }))).toEqual({
      label: 'Rejected',
      tone: 'fail',
    });
    expect(syncTag(game({ sync: { state: 'uploaded', outcome: 'user_removed' } }))).toEqual({
      label: 'Synced',
      tone: 'ok',
    });
    expect(syncTag(game({ sync: { state: 'uploaded' } }))).toEqual({ label: 'Synced', tone: 'ok' });
  });
});
