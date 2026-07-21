'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Two-step university verification (spec §7): request a code for a uni email,
 * then confirm the 6 digits. Every API failure maps to a specific, plain
 * message — unknown domain, rate limited (3/hour), daily capacity, wrong code
 * (with attempts left), expired, or locked out.
 */

interface ApiError {
  code: string;
  message: string;
  attemptsRemaining?: number;
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
      attemptsRemaining?: number;
    };
    return {
      code: body.error?.code ?? 'error',
      message: body.error?.message ?? 'Something went wrong.',
      ...(typeof body.attemptsRemaining === 'number'
        ? { attemptsRemaining: body.attemptsRemaining }
        : {}),
    };
  } catch {
    return { code: 'error', message: 'Something went wrong.' };
  }
}

type Step =
  { name: 'email' } | { name: 'code'; email: string } | { name: 'done'; university: string };

export function VerifyFlow(): React.JSX.Element {
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: React.SyntheticEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/verify/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setCode('');
        setStep({ name: 'code', email });
        return;
      }
      setError((await readError(response)).message);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: React.SyntheticEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        const body = (await response.json()) as { university?: { name?: string } };
        setStep({ name: 'done', university: body.university?.name ?? 'your university' });
        return;
      }
      const failure = await readError(response);
      setError(failure.message);
      if (failure.code === 'no-pending') setStep({ name: 'email' });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step.name === 'done') {
    return (
      <div className="auth-sent">
        <p className="auth-sent__title num">Badge granted</p>
        <p className="meta">
          You&apos;re verified for <strong>{step.university}</strong>. It now shows on your
          leaderboard rows — and you can now sign in with this email too.
        </p>
        <p style={{ marginTop: '1.25rem', display: 'flex', gap: '0.6rem' }}>
          <Link href="/me" className="btn btn--ghost btn--sm">
            My progress
          </Link>
          <Link href="/" className="btn btn--ghost btn--sm">
            Leaderboard
          </Link>
        </p>
      </div>
    );
  }

  if (step.name === 'code') {
    return (
      <form onSubmit={(event) => void confirmCode(event)} className="auth-form__stack">
        <p className="meta">
          Enter the 6-digit code we emailed to <strong>{step.email}</strong>.
        </p>
        <input
          className="field code-input num"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          }}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button
          type="button"
          className="auth-chip__signout"
          onClick={() => {
            setError(null);
            setStep({ name: 'email' });
          }}
        >
          Use a different email
        </button>
        {error !== null ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form onSubmit={(event) => void requestCode(event)} className="auth-form__stack">
      <p className="meta">
        Enter your UK university email. We&apos;ll send a code; the address is used only to verify
        and is never shown.
      </p>
      <label className="uni-filter">
        <span className="uni-filter__label">University email</span>
        <input
          className="field"
          type="email"
          required
          autoComplete="email"
          placeholder="you@university.ac.uk"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </label>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Sending…' : 'Send code'}
      </button>
      {error !== null ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
