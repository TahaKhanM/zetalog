'use client';

import { useState } from 'react';

import { MIN_PASSWORD_LENGTH, checkPassword, passwordStrength } from '@/lib/password';
import { isCompleteCode, normaliseCode, signInErrorMessage } from '@/lib/signin';
import { createClient } from '@/lib/supabase/browser';

/**
 * Change (or first-time set) a password from `/account`, using the same
 * code-based recovery rails as the sign-in form: a code goes to the primary
 * email, the code proves control, then the session saves the new password.
 * No current-password step — control of the inbox is the stronger check, and
 * it works identically for OAuth-only accounts setting their first password.
 */

type Step = 'idle' | 'code' | 'new-password' | 'done';

export function ChangePasswordForm({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}): React.JSX.Element {
  const [step, setStep] = useState<Step>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const actionLabel = hasPassword ? 'Change password' : 'Set a password';

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (sendError !== null) {
      setError(signInErrorMessage('recovery-send', sendError));
      return;
    }
    setCode('');
    setStep('code');
  }

  async function verifyCode(): Promise<void> {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'recovery',
    });
    setBusy(false);
    if (verifyError !== null) {
      setError(signInErrorMessage('verify', verifyError));
      return;
    }
    setPassword('');
    setConfirm('');
    setStep('new-password');
  }

  async function saveNewPassword(): Promise<void> {
    const policy = checkPassword(password);
    if (!policy.ok || password !== confirm) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError !== null) {
      setError(signInErrorMessage('update-password', updateError));
      return;
    }
    setPassword('');
    setConfirm('');
    setStep('done');
  }

  const feedback = (
    <>
      {notice !== null && error === null ? (
        <p className="meta" role="status" style={{ marginTop: '0.6rem' }}>
          {notice}
        </p>
      ) : null}
      {error !== null ? (
        <p className="text-danger" role="alert" style={{ marginTop: '0.6rem' }}>
          {error}
        </p>
      ) : null}
    </>
  );

  if (step === 'done') {
    return (
      <p className="meta" role="status" style={{ margin: 0 }}>
        Password saved. It works for signing in from now on.
      </p>
    );
  }

  if (step === 'code') {
    return (
      <form
        className="auth-form__stack"
        onSubmit={(event) => {
          event.preventDefault();
          void verifyCode();
        }}
      >
        <p className="meta" style={{ margin: 0 }}>
          We emailed a code to <strong>{email}</strong>. Enter it to continue.
        </p>
        <label className="uni-filter">
          <span className="uni-filter__label">Code</span>
          <input
            className="field num"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
            value={code}
            onChange={(event) => {
              setCode(normaliseCode(event.target.value));
            }}
          />
        </label>
        <div className="auth-form__row" style={{ marginTop: 0 }}>
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={busy || !isCompleteCode(code)}
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => {
              void sendCode().then(() => {
                setNotice('New code sent.');
              });
            }}
          >
            Send a new code
          </button>
        </div>
        {feedback}
      </form>
    );
  }

  if (step === 'new-password') {
    const policy = checkPassword(password);
    const mismatch = confirm !== '' && password !== confirm;
    const strength = password === '' ? null : passwordStrength(password);
    return (
      <form
        className="auth-form__stack"
        onSubmit={(event) => {
          event.preventDefault();
          void saveNewPassword();
        }}
      >
        <label className="uni-filter">
          <span className="uni-filter__label">New password</span>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        {strength !== null ? (
          <div className="strength" data-score={strength.score} role="status" aria-live="polite">
            <span className="strength__track" aria-hidden="true">
              <span className="strength__fill" />
            </span>
            <span className="strength__label">{strength.label}</span>
          </div>
        ) : null}
        <p className="auth-form__hint">
          At least {MIN_PASSWORD_LENGTH} characters. A few random words work well.
        </p>
        <label className="uni-filter">
          <span className="uni-filter__label">Confirm password</span>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
            }}
          />
        </label>
        {mismatch ? (
          <p className="auth-form__hint" role="alert">
            The passwords don&apos;t match yet.
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={busy || !policy.ok || password !== confirm}
        >
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {feedback}
      </form>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={busy}
        onClick={() => void sendCode()}
      >
        {busy ? 'Sending code…' : actionLabel}
      </button>
      {feedback}
    </div>
  );
}
