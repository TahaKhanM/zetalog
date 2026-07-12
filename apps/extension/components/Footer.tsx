import type { JSX } from 'react';

interface FooterProps {
  /** Opens the web app's /link page — the entire account/sync seam (W4). */
  readonly onSync: () => void;
}

/** The footer sync affordance. Signed-out is the only state this stream ships (spec §3.4). */
export function Footer({ onSync }: FooterProps): JSX.Element {
  return (
    <footer className="zl-footer">
      <button className="zl-sync" type="button" onClick={onSync}>
        Sync to leaderboard
      </button>
      <p className="zl-footer__note">Local-first — no account needed</p>
    </footer>
  );
}
