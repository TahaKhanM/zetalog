'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The leaderboard privacy choice. Opting out keeps your best scores off
 * every public board (global and university) while your own progress page keeps
 * working. It is off by default, so a new account is visible; the change takes
 * effect on the next board refresh.
 */
export function LeaderboardPrivacyToggle({ optedOut }: { optedOut: boolean }): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function setFlag(value: boolean): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leaderboardOptOut: value }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="conn__confirm">
      {optedOut ? (
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy}
          onClick={() => void setFlag(false)}
        >
          Show me on the leaderboard
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() => void setFlag(true)}
        >
          Keep my scores private
        </button>
      )}
      {error ? <span className="text-danger">Failed. Try again.</span> : null}
    </span>
  );
}
