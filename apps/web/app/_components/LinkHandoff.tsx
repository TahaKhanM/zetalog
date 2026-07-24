'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isLinkAck, isLinkReady, linkPingMessage, linkSessionMessage } from '@/lib/link';
import { createClient } from '@/lib/supabase/browser';

/**
 * Extension link handoff. As soon as the extension announces itself (the
 * content script the browser runs only on this origin answers the presence
 * ping), this reads the current Supabase session and `window.postMessage`s its
 * tokens, scoped to this exact origin — so signing in links the extension with
 * no extra click. The content script forwards the tokens to the extension and
 * posts back a `zl-link-ack`, which flips this to the "Linked" state. A manual
 * button remains for the case where the extension is detected late; if no ack
 * arrives, a fallback note explains it was not detected. Tokens are posted only
 * to this window at its own origin — never to a third party.
 */

/** How long to wait for the extension's ack before showing the fallback note. */
const ACK_TIMEOUT_MS = 2500;

type Phase = 'idle' | 'waiting' | 'linked' | 'not-detected' | 'error';

export function LinkHandoff(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [present, setPresent] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin || event.source !== window) return;
      if (isLinkReady(event.data)) {
        setPresent(true);
        return;
      }
      if (!isLinkAck(event.data)) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setPhase('linked');
    }
    window.addEventListener('message', onMessage);
    // Presence handshake: the content script answers this ping (and announces
    // itself unprompted on load), so either mount order lights the chip.
    window.postMessage(linkPingMessage(), window.location.origin);
    return () => {
      window.removeEventListener('message', onMessage);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const link = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session === null) {
      setPhase('error');
      return;
    }
    window.postMessage(
      linkSessionMessage(session.access_token, session.refresh_token),
      window.location.origin,
    );
    setPhase('waiting');
    timerRef.current = setTimeout(() => {
      setPhase((current) => (current === 'waiting' ? 'not-detected' : current));
    }, ACK_TIMEOUT_MS);
  }, []);

  // Auto-link the moment the extension is detected, so signing in is enough.
  // Guarded on `idle` so it fires once; the manual button covers late detection.
  useEffect(() => {
    if (present && phase === 'idle') void link();
  }, [present, phase, link]);

  if (phase === 'linked') {
    return (
      <div className="auth-sent">
        <p className="auth-sent__title num">Linked</p>
        <p className="meta">
          Extension connected. New games sync on their own. You can close this tab.
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
        Connecting this browser&apos;s ZetaLog extension to your account. Your recorded games sync
        to the leaderboard on their own.
      </p>
      <p style={{ marginTop: '1.25rem' }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void link()}
          disabled={phase === 'waiting'}
        >
          {phase === 'waiting' ? 'Linking…' : 'Link the ZetaLog extension'}
        </button>
      </p>
      <p className="meta" role="status" style={{ marginTop: '0.75rem' }}>
        {present ? (
          <span className="chip chip--accepted">Extension detected</span>
        ) : (
          <>No extension detected yet. If you just installed or updated it, refresh this page.</>
        )}
      </p>
      {phase === 'not-detected' && !present ? (
        <p className="meta" role="status" style={{ marginTop: '0.5rem' }}>
          Still nothing after clicking: check the ZetaLog extension is installed and enabled in your
          browser, then refresh this page and try again.
        </p>
      ) : null}
      {phase === 'error' ? (
        <p className="text-danger" role="alert" style={{ marginTop: '0.75rem' }}>
          Your session could not be read. Please refresh and sign in again.
        </p>
      ) : null}
    </div>
  );
}
