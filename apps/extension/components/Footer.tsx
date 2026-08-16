import type { JSX } from 'react';

interface FooterProps {
  /** Whether an account is currently linked. */
  readonly linked: boolean;
  /** A legacy/expired credential failed terminally and needs one user action. */
  readonly needsRelink?: boolean;
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
  /** Progress/result of the current interactive link attempt. */
  readonly linkState?: {
    readonly phase: 'idle' | 'linking' | 'success' | 'error';
    readonly message?: string;
  };
}

/**
 * The footer account affordance. Signed out, it offers "Sync to
 * leaderboard" (opens /link). Signed in, it shows the linked status (a steady
 * state, not a spinner), a leaderboard privacy checkbox, and an Unlink control —
 * a ghost/outlined treatment throughout, never a solid fill.
 */
export function Footer({
  linked,
  needsRelink = false,
  optedOut,
  onSync,
  onUnlink,
  onSetPrivacy,
  linkState = { phase: 'idle' },
}: FooterProps): JSX.Element {
  if (linked) {
    return (
      <footer className="zl-footer">
        <div className="zl-account">
          <span className="zl-account__status">
            <span className="zl-account__dot" aria-hidden="true" />
            {optedOut === true ? 'Linked, scores private' : 'Linked to leaderboard'}
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
        {linkState.message !== undefined ? (
          <p
            className={`zl-footer__note${linkState.phase === 'error' ? ' zl-footer__note--error' : ''}`}
            role={linkState.phase === 'error' ? 'alert' : undefined}
          >
            {linkState.message}
          </p>
        ) : null}
      </footer>
    );
  }

  return (
    <footer className="zl-footer">
      <button
        className="zl-sync"
        type="button"
        onClick={onSync}
        disabled={linkState.phase === 'linking'}
        aria-busy={linkState.phase === 'linking'}
      >
        {linkState.phase === 'linking'
          ? 'Opening secure sign-in…'
          : needsRelink
            ? 'Relink ZetaLog'
            : 'Sync to leaderboard'}
      </button>
      <p
        className={`zl-footer__note${linkState.phase === 'error' ? ' zl-footer__note--error' : ''}`}
        role={linkState.phase === 'error' ? 'alert' : undefined}
      >
        {linkState.message ??
          (needsRelink
            ? 'Your session expired. Relink once to resume automatic syncing.'
            : 'Works without an account')}
      </p>
    </footer>
  );
}
