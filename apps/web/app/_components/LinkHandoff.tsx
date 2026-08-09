'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Phase = 'idle' | 'waiting' | 'linked' | 'error';

/**
 * One-click entry point for the extension-owned OAuth/PKCE flow. This page
 * neither sends nor receives request identifiers, codes, verifiers, or tokens.
 */
export function LinkHandoff(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>): void {
      if (event.origin !== window.location.origin || event.source !== window) return;
      if (typeof event.data !== 'object' || event.data === null) return;
      const type = (event.data as { type?: unknown }).type;
      if (type === 'zl-link-complete') setPhase('linked');
      if (type === 'zl-link-failed') setPhase('error');
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  function begin(): void {
    // The content script separately requires a trusted click on this element
    // before it may open Chrome Identity. This handler only updates page UI.
    setPhase('waiting');
  }

  if (phase === 'linked') {
    return (
      <div className="auth-sent">
        <p className="auth-sent__title num">Linked</p>
        <p className="meta">
          Extension connected. New games sync automatically. You can close this tab.
        </p>
        <p style={{ marginTop: '1.25rem' }}>
          <Link href="/me" className="btn btn--ghost btn--sm">
            Open my progress
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-sent">
      <p className="auth-sent__title num">Signed in</p>
      <p className="meta">
        Connect this browser’s ZetaLog extension. Recorded games will then sync on their own.
      </p>
      <p style={{ marginTop: '1.25rem' }}>
        <button
          type="button"
          className="btn btn--primary"
          data-zetalog-link-button
          onClick={begin}
          disabled={phase === 'waiting'}
        >
          {phase === 'waiting' ? 'Opening secure sign-in…' : 'Link the ZetaLog extension'}
        </button>
      </p>
      {phase === 'error' ? (
        <p className="text-danger" role="alert" style={{ marginTop: '0.75rem' }}>
          ZetaLog could not open its secure sign-in window. Please try again; your recorded scores
          are safe.
        </p>
      ) : (
        <p className="meta" style={{ marginTop: '0.75rem' }}>
          {phase === 'waiting'
            ? 'Complete the secure sign-in window, then return to ZetaLog.'
            : 'This button works only when this page was opened by the extension.'}
        </p>
      )}
      <p style={{ marginTop: '1.25rem' }}>
        <Link href="/me" className="btn btn--ghost btn--sm">
          Open my progress
        </Link>
      </p>
    </div>
  );
}
