'use client';

import Link from 'next/link';

/**
 * Extension link handoff (spec §3.4). W4 replaces the internals of this
 * component with the real `externally_connectable` token handoff to the
 * extension; it is kept isolated so that swap touches nothing else. For now it
 * renders the signed-in confirmation the extension polls for.
 */
export function LinkHandoff(): React.JSX.Element {
  return (
    <div className="auth-sent">
      <p className="auth-sent__title num">Signed in</p>
      <p className="meta">
        You can return to the ZetaLog extension — it will pick up your session automatically.
      </p>
      <p style={{ marginTop: '1.25rem' }}>
        <Link href="/me" className="btn btn--ghost btn--sm">
          Open my progress
        </Link>
      </p>
    </div>
  );
}
