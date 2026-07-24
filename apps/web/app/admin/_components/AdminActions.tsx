'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Approve/Reject controls for one quarantined game. Approve promotes it to
 * accepted (it ranks); reject moves it to rejected (audit). Refreshes the queue
 * on success so the resolved card drops out.
 */
export function AdminActions({ gameId }: { gameId: string }): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'approve' | 'reject'): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/games/${gameId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        setError('Action failed. Refresh and try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-actions">
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={busy !== null}
        onClick={() => void act('approve')}
      >
        {busy === 'approve' ? 'Approving…' : 'Approve'}
      </button>
      <button
        type="button"
        className="btn btn--danger"
        disabled={busy !== null}
        onClick={() => void act('reject')}
      >
        {busy === 'reject' ? 'Rejecting…' : 'Reject'}
      </button>
      {error !== null ? (
        <span className="text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
