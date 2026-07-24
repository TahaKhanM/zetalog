import { settingsFromFingerprint, type GameRecord } from '@zetalog/shared';

import { type RemoteGame } from './api.js';
import { type StoredGame } from './store.js';

/**
 * Rebuild a local {@link StoredGame} from a server game, so the extension can
 * show a linked account's history (including games played on another device or
 * before this install existed). Settings are reconstructed from the fingerprint
 * (lossless for display — see `settingsFromFingerprint`); the event stream is
 * not fetched, so focus analysis stays local, but the score, personal bests,
 * trend and sync status all appear. The `sync` state is the terminal
 * already-synced value so the queue never re-submits a backfilled game.
 */
export function remoteGameToStored(remote: RemoteGame): StoredGame {
  const settings = settingsFromFingerprint(remote.settingsFingerprint);
  const parsed = Date.parse(remote.playedAt);
  const at = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

  const record: GameRecord = {
    id: remote.clientGameId,
    startedAtMs: at,
    playedMs: settings.durationSeconds * 1000,
    settings,
    events: [],
    claimedScore: remote.claimedScore,
  };
  const base = {
    record,
    // The server's recomputed score is the authoritative one that ranks.
    verifiedScore: remote.serverScore,
    fingerprint: remote.settingsFingerprint,
    rankableDuration: remote.rankableDuration,
    savedAtMs: at,
  };

  if (remote.status === 'user_removed') {
    // Terminal removed state: `revoked` stops the queue re-deriving a delete.
    return {
      ...base,
      status: 'removed',
      sync: { state: 'revoked', outcome: 'user_removed', serverScore: remote.serverScore },
    };
  }
  // accepted / quarantined / rejected all stay `kept` locally (matching the
  // live submit flow, which never demotes status); the verdict shows via sync.
  return {
    ...base,
    status: 'kept',
    sync: { state: 'uploaded', outcome: remote.status, serverScore: remote.serverScore },
  };
}
