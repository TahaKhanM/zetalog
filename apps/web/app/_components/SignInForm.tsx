'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/browser';

/**
 * Sign-in: passwordless magic link (via Supabase Auth → Resend SMTP) and Google
 * OAuth. Both round-trip through `/auth/callback`, preserving the `next` path.
 * Shared by `/signin` and `/link`.
 */
export function SignInForm({ next }: { next: string }): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  function callbackUrl(): string {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendMagicLink(event: React.SyntheticEvent): Promise<void> {
    event.preventDefault();
    setStatus('sending');
    setError(null);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (otpError !== null) {
      setStatus('idle');
      setError('Could not send the link. Check the address and try again.');
      return;
    }
    setStatus('sent');
  }

  async function continueWithGoogle(): Promise<void> {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError !== null) {
      setError('Could not start Google sign-in. Please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="auth-sent">
        <p className="auth-sent__title num">Check your email</p>
        <p className="meta">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="auth-form">
      <form onSubmit={(event) => void sendMagicLink(event)} className="auth-form__stack">
        <label className="uni-filter">
          <span className="uni-filter__label">Email</span>
          <input
            className="field"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <button
        type="button"
        className="btn btn--ghost auth-form__google"
        onClick={() => void continueWithGoogle()}
      >
        Continue with Google
      </button>

      {error !== null ? (
        <p className="text-danger" role="alert" style={{ marginTop: '0.75rem' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
