/** A small, accessible loading state while a route waits for server data. */
export default function Loading(): React.JSX.Element {
  return (
    <div className="card card--pad empty" role="status" aria-live="polite">
      <p className="empty__title num">Loading…</p>
      <p className="meta">Getting the latest scores.</p>
    </div>
  );
}
