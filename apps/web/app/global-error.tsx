'use client';

/** Last-resort fallback if the root layout itself cannot render. */
export default function RootGlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <main className="shell" style={{ paddingBlock: '3rem' }}>
          <div className="card card--pad empty" role="alert">
            <h1 className="empty__title num">Couldn&apos;t load ZetaLog</h1>
            <p className="meta">Please check your connection and try again.</p>
            <p style={{ marginTop: '1.25rem' }}>
              <button type="button" className="btn btn--primary" onClick={reset}>
                Try again
              </button>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
