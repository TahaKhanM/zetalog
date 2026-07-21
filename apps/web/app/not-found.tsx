import Link from 'next/link';

/** Collegiate-clean 404 in the fixed design language. */
export default function NotFound(): React.JSX.Element {
  return (
    <div className="page-404">
      <p className="num page-404__code">404</p>
      <h1 className="display" style={{ fontSize: '1.5rem' }}>
        Not found
      </h1>
      <p className="meta" style={{ marginTop: '0.5rem' }}>
        That page, university, or board does not exist.
      </p>
      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/" className="btn btn--ghost">
          Back to the leaderboard
        </Link>
      </p>
    </div>
  );
}
