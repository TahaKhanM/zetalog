'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/browser';
import { isCompleteCode, normaliseCode, signInErrorMessage } from '@/lib/signin';

/**
 * Sign-in: passwordless six-digit email code (Supabase Auth → Resend SMTP;
 * the email contains no links, so strict university mail filters have nothing
 * to flag) plus Google OAuth. Google round-trips through `/auth/callback`;
 * the code flow verifies in-page and then hard-navigates so the server sees
 * the new session. Shared by `/signin` and `/link`.
 */
export function SignInForm({ next }: { next: string }): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    setBusy('send');
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({ email });
    setBusy(null);
    if (sendError !== null) {
      setError(signInErrorMessage('send', sendError));
      return;
    }
    setCode('');
    setStep('code');
  }

  async function verifyCode(): Promise<void> {
    setBusy('verify');
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (verifyError !== null) {
      setBusy(null);
      setError(signInErrorMessage('verify', verifyError));
      return;
    }
    // Full navigation (not a client transition) so Server Components render
    // with the fresh auth cookies.
    window.location.assign(next);
  }

  async function continueWithGoogle(): Promise<void> {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError !== null) {
      setError('Could not start Google sign-in. Please try again.');
    }
  }

  if (step === 'code') {
    return (
      <div className="auth-form">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
          className="auth-form__stack"
        >
          <p className="meta">
            We emailed a sign-in code to <strong>{email}</strong>. Enter it below — codes expire
            after an hour.
          </p>
          <label className="uni-filter">
            <span className="uni-filter__label">Sign-in code</span>
            <input
              className="field num"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="12345678"
              required
              value={code}
              onChange={(event) => {
                setCode(normaliseCode(event.target.value));
              }}
            />
          </label>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy !== null || !isCompleteCode(code)}
          >
            {busy === 'verify' ? 'Verifying…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-form__row">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy !== null}
            onClick={() => {
              void sendCode().then(() => {
                setNotice('New code sent.');
              });
            }}
          >
            {busy === 'send' ? 'Sending…' : 'Send a new code'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy !== null}
            onClick={() => {
              setStep('email');
              setError(null);
              setNotice(null);
            }}
          >
            Use a different email
          </button>
        </div>

        {notice !== null && error === null ? (
          <p className="meta" role="status" style={{ marginTop: '0.75rem' }}>
            {notice}
          </p>
        ) : null}
        {error !== null ? (
          <p className="text-danger" role="alert" style={{ marginTop: '0.75rem' }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="auth-form">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
        className="auth-form__stack"
      >
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
        <button type="submit" className="btn btn--primary" disabled={busy !== null}>
          {busy === 'send' ? 'Sending…' : 'Email me a sign-in code'}
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
