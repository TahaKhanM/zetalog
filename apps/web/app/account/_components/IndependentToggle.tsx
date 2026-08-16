'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The "not at a university" choice. Setting it stops the badge
 * prompts; independent players appear on the global board only. Choosing a
 * university later clears the flag and goes to /verify.
 */
export function IndependentToggle({ independent }: { independent: boolean }): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function setFlag(value: boolean, thenVerify: boolean): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ independent: value }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      if (thenVerify) {
        window.location.assign('/verify');
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
      {independent ? (
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy}
          onClick={() => void setFlag(false, true)}
        >
          Choose a university
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() => void setFlag(true, false)}
        >
          I&apos;m not at a university
        </button>
      )}
      {error ? <span className="text-danger">Failed. Try again.</span> : null}
    </span>
  );
}
