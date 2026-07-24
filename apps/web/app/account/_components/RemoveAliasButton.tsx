'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Remove the verified university email. The alias and the badge are
 * one system, so the first click asks for confirmation and spells that out.
 * Re-verifying on /verify restores both.
 */
export function RemoveAliasButton(): React.JSX.Element {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function remove(): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/verify/alias', { method: 'DELETE' });
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

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn--danger"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Remove
      </button>
    );
  }

  return (
    <span className="conn__confirm">
      <span className="meta">Also removes your badge.</span>
      <button
        type="button"
        className="btn btn--danger"
        disabled={busy}
        onClick={() => void remove()}
      >
        {busy ? 'Removing' : 'Confirm'}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          setError(false);
        }}
      >
        Keep it
      </button>
      {error ? <span className="text-danger">Failed. Try again.</span> : null}
    </span>
  );
}
