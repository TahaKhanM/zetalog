'use client';

import { LINK_FAILURE_MESSAGES, normalizeLinkFailure, type LinkFailure } from '@zetalog/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Phase = 'detecting' | 'idle' | 'missing' | 'waiting' | 'linked' | 'error';

/**
 * One-click entry point for the extension-owned OAuth/PKCE flow. This page
 * neither sends nor receives request identifiers, codes, verifiers, or tokens.
 */
export function LinkHandoff(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('detecting');
  const [failure, setFailure] = useState<LinkFailure>('internal');
  const [syncPending, setSyncPending] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>): void {
      if (event.origin !== window.location.origin || event.source !== window) return;
      if (typeof event.data !== 'object' || event.data === null) return;
      const message = event.data as {
        type?: unknown;
        error?: unknown;
        syncPending?: unknown;
      };
      if (message.type === 'zl-extension-ready') {
        setPhase((current) =>
          current === 'detecting' || current === 'missing' ? 'idle' : current,
        );
      }
      if (message.type === 'zl-link-complete') {
        setSyncPending(message.syncPending === true);
        setPhase('linked');
      }
      if (message.type === 'zl-link-failed') {
        setFailure(normalizeLinkFailure(message.error));
        setPhase('error');
      }
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'zl-extension-ping' }, window.location.origin);
    const detectionTimer = window.setTimeout(() => {
      setPhase((current) => (current === 'detecting' ? 'missing' : current));
    }, 1_200);
    return () => {
      window.clearTimeout(detectionTimer);
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
          {syncPending
            ? 'Extension connected. Saved scores are queued and will retry automatically.'
            : 'Extension connected. New games sync automatically. You can close this tab.'}
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
      <p className="auth-sent__title num">Connect ZetaLog</p>
      <p className="meta">
        One secure Chrome window will sign you in if needed, then connect this extension to the
        leaderboard.
      </p>
      <p style={{ marginTop: '1.25rem' }}>
        <button
          type="button"
          className="btn btn--primary"
          data-zetalog-link-button
          onClick={begin}
          disabled={phase === 'detecting' || phase === 'waiting'}
        >
          {phase === 'detecting'
            ? 'Checking extension…'
            : phase === 'missing'
              ? 'Try connecting extension'
              : phase === 'waiting'
                ? 'Complete secure sign-in…'
                : 'Connect extension and sync'}
        </button>
      </p>
      {phase === 'error' ? (
        <p className="text-danger" role="alert" style={{ marginTop: '0.75rem' }}>
          {LINK_FAILURE_MESSAGES[failure]}
        </p>
      ) : phase === 'missing' ? (
        <p className="meta" role="status" style={{ marginTop: '0.75rem' }}>
          The extension did not confirm its presence. If you already installed it, continue—the
          current Store version can still connect. Otherwise, install or enable it first.
        </p>
      ) : (
        <p className="meta" style={{ marginTop: '0.75rem' }}>
          {phase === 'waiting'
            ? 'Finish in the Chrome window. This page will update automatically.'
            : 'Your scores stay on this device until the connection succeeds.'}
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
