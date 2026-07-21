'use client';

import { useEffect, useRef, useState } from 'react';

import { lookupResponseSchema } from '@/lib/auth-modes';
import { MIN_PASSWORD_LENGTH, checkPassword, passwordStrength } from '@/lib/password';
import { isCompleteCode, normaliseCode, signInErrorMessage } from '@/lib/signin';
import { createClient } from '@/lib/supabase/browser';

/**
 * W8 email-first auth: one form serves sign-in, sign-up, recovery, and the
 * OTP-era set-password migration. The email step asks `/api/auth/lookup`
 * which flow to reveal; passwords sign in through `/api/auth/login` (which
 * also accepts a verified uni alias and sets the @supabase/ssr cookies
 * server-side); sign-up and recovery keep the code-only emails — a code is
 * asked for ONLY at account creation and password reset, never for sign-in.
 * OAuth (Google, GitHub) sits above the email flow and round-trips through
 * `/auth/callback`. Shared by `/signin` and `/link`.
 */

type RecoveryIntent = 'reset' | 'setup';

type Step =
  | { name: 'email' }
  | { name: 'password'; email: string }
  | { name: 'create'; email: string }
  | { name: 'signup-code'; email: string }
  | { name: 'oauth-only'; email: string; provider: string }
  | { name: 'recovery-code'; email: string; intent: RecoveryIntent }
  | { name: 'new-password'; email: string; intent: RecoveryIntent };

/** The typed error body every ZetaLog API route answers with. */
async function apiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', github: 'GitHub' };

/** Google's multicolour G mark (official button asset, inlined — no requests). */
function GoogleMark(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** GitHub's mark in currentColor, so it sits on both paper and blackboard. */
function GitHubMark(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/** Live policy/strength hint for the password fields (never logs anything). */
function StrengthMeter({ password }: { password: string }): React.JSX.Element | null {
  if (password === '') return null;
  const { score, label } = passwordStrength(password);
  return (
    <div className="strength" data-score={score} role="status" aria-live="polite">
      <span className="strength__track" aria-hidden="true">
        <span className="strength__fill" />
      </span>
      <span className="strength__label">{label}</span>
    </div>
  );
}

export function SignInForm({ next }: { next: string }): React.JSX.Element {
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Focus the revealed step's first field — screen-reader and keyboard users
  // land where the flow continues.
  const focusRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    focusRef.current?.focus();
  }, [step.name]);

  function moveTo(nextStep: Step): void {
    setError(null);
    setNotice(null);
    setStep(nextStep);
  }

  function backToEmail(): void {
    setPassword('');
    setConfirm('');
    setCode('');
    moveTo({ name: 'email' });
  }

  async function continueWithEmail(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const address = email.trim().toLowerCase();
      const response = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address }),
      });
      if (!response.ok) {
        setError(await apiErrorMessage(response));
        return;
      }
      const mode = lookupResponseSchema.parse(await response.json());
      setEmail(address);
      switch (mode.mode) {
        case 'signin':
          moveTo({ name: 'password', email: address });
          break;
        case 'signup':
          moveTo({ name: 'create', email: address });
          break;
        case 'oauth':
          moveTo({ name: 'oauth-only', email: address, provider: mode.provider });
          break;
        case 'set-password':
          await startRecovery(address, 'setup');
          break;
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword(): Promise<void> {
    if (step.name !== 'password') return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: step.email, password }),
      });
      if (!response.ok) {
        setBusy(false);
        setError(await apiErrorMessage(response));
        return;
      }
      // Full navigation (not a client transition) so Server Components render
      // with the fresh auth cookies the route just set.
      window.location.assign(next);
    } catch {
      setBusy(false);
      setError('Network error. Please try again.');
    }
  }

  async function createAccount(): Promise<void> {
    if (step.name !== 'create') return;
    const policy = checkPassword(password);
    if (!policy.ok || password !== confirm) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({ email: step.email, password });
    setBusy(false);
    if (signUpError !== null) {
      setError(signInErrorMessage('signup', signUpError));
      return;
    }
    setCode('');
    moveTo({ name: 'signup-code', email: step.email });
  }

  async function resendSignupCode(): Promise<void> {
    if (step.name !== 'signup-code') return;
    setError(null);
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: step.email,
    });
    if (resendError !== null) {
      setError(signInErrorMessage('send', resendError));
      return;
    }
    setNotice('New code sent.');
  }

  async function verifySignupCode(): Promise<void> {
    if (step.name !== 'signup-code') return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: step.email,
      token: code,
      type: 'signup',
    });
    if (verifyError !== null) {
      setBusy(false);
      setError(signInErrorMessage('verify', verifyError));
      return;
    }
    window.location.assign(next);
  }

  async function startRecovery(address: string, intent: RecoveryIntent): Promise<boolean> {
    setError(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(address);
    if (sendError !== null) {
      setError(signInErrorMessage('recovery-send', sendError));
      return false;
    }
    setCode('');
    moveTo({ name: 'recovery-code', email: address, intent });
    return true;
  }

  async function verifyRecoveryCode(): Promise<void> {
    if (step.name !== 'recovery-code') return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: step.email,
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
    moveTo({ name: 'new-password', email: step.email, intent: step.intent });
  }

  async function saveNewPassword(): Promise<void> {
    if (step.name !== 'new-password') return;
    const policy = checkPassword(password);
    if (!policy.ok || password !== confirm) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError !== null) {
      setBusy(false);
      setError(signInErrorMessage('update-password', updateError));
      return;
    }
    window.location.assign(next);
  }

  async function continueWithProvider(provider: 'google' | 'github'): Promise<void> {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError !== null) {
      setError(`Could not start ${PROVIDER_LABELS[provider] ?? provider} sign-in. Try again.`);
    }
  }

  const feedback = (
    <>
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
    </>
  );

  const changeEmail = (
    <button type="button" className="auth-chip__signout" disabled={busy} onClick={backToEmail}>
      Use a different email
    </button>
  );

  const passwordPair = (submitLabel: string, busyLabel: string, autoComplete: 'new-password') => {
    const policy = checkPassword(password);
    const mismatch = confirm !== '' && password !== confirm;
    return (
      <>
        <label className="uni-filter">
          <span className="uni-filter__label">Password</span>
          <input
            ref={focusRef}
            className="field"
            type="password"
            name="new-password"
            autoComplete={autoComplete}
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <StrengthMeter password={password} />
        <p className="auth-form__hint">
          At least {MIN_PASSWORD_LENGTH} characters. A few random words work well.
        </p>
        <label className="uni-filter">
          <span className="uni-filter__label">Confirm password</span>
          <input
            className="field"
            type="password"
            name="confirm-password"
            autoComplete={autoComplete}
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
          className="btn btn--primary"
          disabled={busy || !policy.ok || password !== confirm}
        >
          {busy ? busyLabel : submitLabel}
        </button>
      </>
    );
  };

  if (step.name === 'password') {
    return (
      <div className="auth-form">
        <form
          className="auth-form__stack"
          onSubmit={(event) => {
            event.preventDefault();
            void signInWithPassword();
          }}
        >
          <p className="meta">
            Signing in as <strong>{step.email}</strong>. {changeEmail}
          </p>
          <label className="uni-filter">
            <span className="uni-filter__label">Password</span>
            <input
              ref={focusRef}
              className="field"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={busy || password === ''}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="auth-form__forgot"
            disabled={busy}
            onClick={() => void startRecovery(step.email, 'reset')}
          >
            Forgot password?
          </button>
        </form>
        {feedback}
      </div>
    );
  }

  if (step.name === 'create') {
    return (
      <div className="auth-form">
        <form
          className="auth-form__stack"
          onSubmit={(event) => {
            event.preventDefault();
            void createAccount();
          }}
        >
          <p className="meta">
            New account for <strong>{step.email}</strong>. {changeEmail}
          </p>
          {passwordPair('Create account', 'Creating…', 'new-password')}
        </form>
        {feedback}
      </div>
    );
  }

  if (step.name === 'signup-code' || step.name === 'recovery-code') {
    const isSignup = step.name === 'signup-code';
    return (
      <div className="auth-form">
        <form
          className="auth-form__stack"
          onSubmit={(event) => {
            event.preventDefault();
            void (isSignup ? verifySignupCode() : verifyRecoveryCode());
          }}
        >
          <p className="meta">
            {!isSignup && step.intent === 'setup' ? (
              <>
                Let&apos;s finish setting up your password — your account predates them. We emailed
                a code to <strong>{step.email}</strong>.
              </>
            ) : (
              <>
                We emailed a code to <strong>{step.email}</strong>. Enter it below — codes expire
                after an hour.
              </>
            )}
          </p>
          <label className="uni-filter">
            <span className="uni-filter__label">
              {isSignup ? 'Sign-up code' : 'Password reset code'}
            </span>
            <input
              ref={focusRef}
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
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || !isCompleteCode(code)}
          >
            {busy ? 'Verifying…' : 'Continue'}
          </button>
        </form>
        <div className="auth-form__row">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              void (isSignup
                ? resendSignupCode()
                : startRecovery(step.email, step.intent).then((sent) => {
                    if (sent) setNotice('New code sent.');
                  }));
            }}
          >
            Send a new code
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={backToEmail}>
            Use a different email
          </button>
        </div>
        {feedback}
      </div>
    );
  }

  if (step.name === 'new-password') {
    return (
      <div className="auth-form">
        <form
          className="auth-form__stack"
          onSubmit={(event) => {
            event.preventDefault();
            void saveNewPassword();
          }}
        >
          <p className="meta">
            {step.intent === 'setup' ? 'Choose a password for ' : 'Choose a new password for '}
            <strong>{step.email}</strong>.
          </p>
          {passwordPair('Save password and sign in', 'Saving…', 'new-password')}
        </form>
        {feedback}
      </div>
    );
  }

  if (step.name === 'oauth-only') {
    const label = PROVIDER_LABELS[step.provider] ?? step.provider;
    return (
      <div className="auth-form">
        <p className="meta">
          <strong>{step.email}</strong> signs in with {label} — no password is set. {changeEmail}
        </p>
        <div className="auth-oauth" style={{ marginTop: '0.9rem' }}>
          {step.provider === 'github' ? (
            <button
              type="button"
              className="btn btn--ghost btn--oauth"
              onClick={() => void continueWithProvider('github')}
            >
              <GitHubMark /> Continue with GitHub
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--oauth"
              onClick={() => void continueWithProvider('google')}
            >
              <GoogleMark /> Continue with Google
            </button>
          )}
          <button
            type="button"
            className="auth-form__forgot"
            disabled={busy}
            onClick={() => void startRecovery(step.email, 'setup')}
          >
            Set a password instead
          </button>
        </div>
        {feedback}
      </div>
    );
  }

  return (
    <div className="auth-form">
      <div className="auth-oauth">
        <button
          type="button"
          className="btn btn--ghost btn--oauth"
          onClick={() => void continueWithProvider('google')}
        >
          <GoogleMark /> Continue with Google
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--oauth"
          onClick={() => void continueWithProvider('github')}
        >
          <GitHubMark /> Continue with GitHub
        </button>
      </div>

      <div className="auth-divider">
        <span>or continue with email</span>
      </div>

      <form
        className="auth-form__stack"
        onSubmit={(event) => {
          event.preventDefault();
          void continueWithEmail();
        }}
      >
        <label className="uni-filter">
          <span className="uni-filter__label">Email</span>
          <input
            ref={focusRef}
            className="field"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        {/* Only busy gates the button: `required` already blocks an empty
            submit, and a value-dependent `disabled` flickers during hydration. */}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>

      {feedback}
    </div>
  );
}
