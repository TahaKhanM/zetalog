import { ZETAMAC_DEFAULT_SETTINGS, fingerprint } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { type RemoteGame } from './api.js';
import { remoteGameToStored } from './backfill.js';

const base: RemoteGame = {
  clientGameId: '11111111-1111-4111-8111-111111111111',
  playedAt: '2026-07-01T12:00:00.000Z',
  settingsFingerprint: fingerprint(ZETAMAC_DEFAULT_SETTINGS),
  rankableDuration: 120,
  claimedScore: 40,
  serverScore: 42,
  status: 'accepted',
};

describe('remoteGameToStored', () => {
  it('reconstructs a kept, uploaded game with the server score and settings', () => {
    const stored = remoteGameToStored(base);
    expect(stored.status).toBe('kept');
    expect(stored.verifiedScore).toBe(42);
    expect(stored.fingerprint).toBe(base.settingsFingerprint);
    expect(stored.rankableDuration).toBe(120);
    expect(stored.record.id).toBe(base.clientGameId);
    expect(stored.record.settings).toEqual(ZETAMAC_DEFAULT_SETTINGS);
    expect(stored.record.events).toEqual([]);
    expect(stored.record.playedMs).toBe(120_000);
    expect(stored.sync).toEqual({ state: 'uploaded', outcome: 'accepted', serverScore: 42 });
    expect(stored.savedAtMs).toBe(Date.parse(base.playedAt));
  });

  it.each(['quarantined', 'rejected'] as const)(
    'excludes a server-%s game from local statistics',
    (status) => {
      const stored = remoteGameToStored({ ...base, status });
      expect(stored.status).toBe('quarantined');
      expect(stored.sync?.state).toBe('uploaded');
      expect(stored.sync?.outcome).toBe(status);
    },
  );

  it('maps a user_removed game to a revoked, removed row', () => {
    const stored = remoteGameToStored({ ...base, status: 'user_removed' });
    expect(stored.status).toBe('removed');
    expect(stored.sync).toEqual({ state: 'revoked', outcome: 'user_removed', serverScore: 42 });
  });

  it('falls back to time zero for an unparseable date', () => {
    const stored = remoteGameToStored({ ...base, playedAt: 'not-a-date' });
    expect(stored.record.startedAtMs).toBe(0);
    expect(stored.savedAtMs).toBe(0);
  });
});
