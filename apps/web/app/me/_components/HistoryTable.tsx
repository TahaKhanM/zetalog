'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { configLabel, formatRelativeTime } from '@/lib/format';
import type { GameStatus } from '@/lib/db/rows';
import type { MeGame } from '@/lib/me';

/**
 * Full game history with soft-delete. Each row shows the date, config, score,
 * a status chip (with quarantine/rejection reasons), and a Remove button for
 * accepted or quarantined games — which calls the revoke API, then refreshes so
 * the PB and chart recompute.
 */

const STATUS_META: Record<GameStatus, { label: string; className: string }> = {
  accepted: { label: 'Accepted', className: 'chip--accepted' },
  quarantined: { label: 'In review', className: 'chip--quarantined' },
  rejected: { label: 'Rejected', className: 'chip--rejected' },
  user_removed: { label: 'Removed', className: 'chip--removed' },
};

const REMOVABLE: ReadonlySet<GameStatus> = new Set(['accepted', 'quarantined']);

export function HistoryTable({ games }: { games: readonly MeGame[] }): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  async function remove(clientGameId: string): Promise<void> {
    setPending(clientGameId);
    setError(null);
    try {
      const response = await fetch(`/api/games/${clientGameId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('Could not remove that game. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error while removing the game.');
    } finally {
      setPending(null);
    }
  }

  if (games.length === 0) {
    return <p className="meta">No games recorded yet.</p>;
  }

  return (
    <div>
      {error !== null ? (
        <p className="notice" role="alert" style={{ marginBottom: '0.75rem' }}>
          {error}
        </p>
      ) : null}
      <div className="card table-wrap">
        <table className="ltable">
          <thead>
            <tr>
              <th scope="col">Played</th>
              <th scope="col">Config</th>
              <th className="ltable__score-h" scope="col">
                Score
              </th>
              <th scope="col">Status</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const meta = STATUS_META[game.status];
              return (
                <tr key={game.clientGameId}>
                  <td className="meta">{formatRelativeTime(game.playedAt, now)}</td>
                  <td>{configLabel(game.fingerprint)}</td>
                  <td className="ltable__num">{game.score}</td>
                  <td>
                    <span className={`chip ${meta.className}`}>{meta.label}</span>
                    {game.reasons.length > 0 ? (
                      <span className="history-reasons meta">{game.reasons.join(' · ')}</span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {REMOVABLE.has(game.status) ? (
                      <button
                        type="button"
                        className="btn btn--danger"
                        disabled={pending === game.clientGameId}
                        onClick={() => {
                          void remove(game.clientGameId);
                        }}
                      >
                        {pending === game.clientGameId ? 'Removing…' : 'Remove'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
