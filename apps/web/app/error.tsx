'use client';

/** A recoverable fallback for unexpected route/data failures. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <div className="card card--pad empty" role="alert">
      <h1 className="empty__title num">Couldn&apos;t load this page</h1>
      <p className="meta">Your data has not been changed. Check your connection and try again.</p>
      <p style={{ marginTop: '1.25rem' }}>
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
      </p>
    </div>
  );
}
