'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/browser';

/** The final account-erasure confirmation; the API verifies it independently. */
export function DeleteAccountButton(): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeAccount(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: value }),
      });
      if (!response.ok) {
        setError(
          response.status === 400
            ? 'Type DELETE exactly to confirm account deletion.'
            : 'Could not delete your account. Please try again.',
        );
        return;
      }
      // Clear browser-held auth material as well as deleting the server account.
      // The deletion already succeeded, so a network failure during local cleanup
      // must not turn a successful destructive action into an apparent failure.
      try {
        await createClient().auth.signOut();
      } finally {
        window.location.assign('/');
      }
    } catch {
      setError('Network error while deleting your account. Please try again.');
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
          setError(null);
        }}
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="auth-form__stack" style={{ maxWidth: '28rem' }}>
      <p className="meta" style={{ margin: 0 }}>
        This permanently removes your account and uploaded game data. Type <strong>DELETE</strong>{' '}
        to continue.
      </p>
      <label className="uni-filter">
        <span className="uni-filter__label">Confirmation</span>
        <input
          className="field"
          value={value}
          autoFocus
          autoComplete="off"
          aria-describedby="delete-account-help"
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </label>
      <div className="conn__actions">
        <button
          type="button"
          className="btn btn--danger"
          disabled={busy || value !== 'DELETE'}
          onClick={() => void removeAccount()}
        >
          {busy ? 'Deleting…' : 'Permanently delete account'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setValue('');
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
      <span id="delete-account-help" className="sr-only">
        This action cannot be undone.
      </span>
      {error !== null ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
