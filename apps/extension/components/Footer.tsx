import type { JSX } from 'react';

interface FooterProps {
  /** Whether an account is currently linked. */
  readonly linked: boolean;
  /** Signed-out affordance: opens the web app's /link page to connect an account. */
  readonly onSync: () => void;
  /** Signed-in affordance: forget the session and stop syncing (keeps local games). */
  readonly onUnlink: () => void;
}

/**
 * The footer account affordance (spec §3.4). Signed out, it offers "Sync to
 * leaderboard" (opens /link). Signed in, it shows the sync status and an Unlink
 * control — a ghost/outlined treatment throughout, never a solid fill (§8, CO-2).
 */
export function Footer({ linked, onSync, onUnlink }: FooterProps): JSX.Element {
  if (linked) {
    return (
      <footer className="zl-footer">
        <div className="zl-account">
          <span className="zl-account__status">
            <span className="zl-account__dot" aria-hidden="true" />
            Syncing to leaderboard
          </span>
          <button className="zl-btn" type="button" onClick={onUnlink}>
            Unlink
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="zl-footer">
      <button className="zl-sync" type="button" onClick={onSync}>
        Sync to leaderboard
      </button>
      <p className="zl-footer__note">Local-first — no account needed</p>
    </footer>
  );
}
