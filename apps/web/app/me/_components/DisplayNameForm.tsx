'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { isValidDisplayName } from '@/lib/profile';

/**
 * Display-name onboarding / change. Validates locally with the same rule as the
 * server and DB, posts to /api/profile, and maps the 409 to a "taken" message.
 * On success it refreshes so the dashboard renders with the new name.
 */
export function DisplayNameForm({ current }: { current: string | null }): React.JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const valid = isValidDisplayName(value);

  async function submit(event: React.SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: value }),
      });
      if (response.status === 409) {
        setError('That name is taken. Try another.');
        return;
      }
      if (!response.ok) {
        setError('Could not save that name. Please try again.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="name-form">
      <label className="uni-filter" style={{ flex: 1 }}>
        <span className="uni-filter__label">Display name</span>
        <input
          className="field"
          value={value}
          maxLength={15}
          autoComplete="off"
          placeholder="3 to 15 characters"
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button type="submit" className="btn btn--primary" disabled={!valid || saving}>
        {saving ? 'Saving…' : current === null ? 'Choose name' : 'Save'}
      </button>
      {error !== null ? (
        <p className="text-danger name-form__msg" role="alert">
          {error}
        </p>
      ) : null}
      {saved && error === null ? <p className="meta name-form__msg">Saved.</p> : null}
    </form>
  );
}
