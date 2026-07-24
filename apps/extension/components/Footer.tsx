import type { JSX } from 'react';

interface FooterProps {
  /** Whether an account is currently linked. */
  readonly linked: boolean;
  /**
   * The leaderboard opt-out for the linked account: `true` hidden, `false`
   * visible, `null` while it is still being read.
   */
  readonly optedOut: boolean | null;
  /** Signed-out affordance: opens the web app's /link page to connect an account. */
  readonly onSync: () => void;
  /** Signed-in affordance: forget the session and stop syncing (keeps local games). */
  readonly onUnlink: () => void;
  /** Signed-in affordance: hide from (or show on) the public leaderboards. */
  readonly onSetPrivacy: (optOut: boolean) => void;
}

/**
 * The footer account affordance. Signed out, it offers "Sync to
 * leaderboard" (opens /link). Signed in, it shows the sync status, a leaderboard
 * privacy checkbox, and an Unlink control — a ghost/outlined treatment
 * throughout, never a solid fill.
 */
export function Footer({
  linked,
  optedOut,
  onSync,
  onUnlink,
  onSetPrivacy,
}: FooterProps): JSX.Element {
  if (linked) {
    return (
      <footer className="zl-footer">
        <div className="zl-account">
          <span className="zl-account__status">
            <span className="zl-account__dot" aria-hidden="true" />
            {optedOut === true ? 'Linked, scores private' : 'Syncing to leaderboard'}
          </span>
          <button className="zl-btn" type="button" onClick={onUnlink}>
            Unlink
          </button>
        </div>
        {optedOut !== null ? (
          <label className="zl-privacy">
            <input
              type="checkbox"
              className="zl-privacy__box"
              checked={optedOut}
              onChange={(event) => {
                onSetPrivacy(event.target.checked);
              }}
            />
            <span>Keep my scores off the leaderboard</span>
          </label>
        ) : null}
      </footer>
    );
  }

  return (
    <footer className="zl-footer">
      <button className="zl-sync" type="button" onClick={onSync}>
        Sync to leaderboard
      </button>
      <p className="zl-footer__note">Works without an account</p>
    </footer>
  );
}
