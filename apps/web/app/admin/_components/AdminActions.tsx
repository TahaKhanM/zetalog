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
  const [reason, setReason] = useState('');

  async function act(action: 'approve' | 'reject'): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/games/${gameId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
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
      <label className="uni-filter" style={{ flex: '1 1 100%' }}>
        <span className="uni-filter__label">Review reason</span>
        <input
          className="field"
          value={reason}
          maxLength={500}
          placeholder="Evidence considered and reason for this decision"
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={busy !== null || reason.trim().length < 3}
        onClick={() => void act('approve')}
      >
        {busy === 'approve' ? 'Approving…' : 'Approve'}
      </button>
      <button
        type="button"
        className="btn btn--danger"
        disabled={busy !== null || reason.trim().length < 3}
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
