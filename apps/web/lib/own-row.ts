/**
 * Client-side personalisation of a cached leaderboard table.
 *
 * The public boards (`/`, `/uni/[slug]`) are cached server renders with no
 * viewer identity in them (so signed-out visitors cost zero auth work and the
 * HTML is shared across everyone). After hydration, the browser reads the
 * viewer's session and calls this to decorate their row: a `row-self`
 * highlight, plus — on the global board — the "add badge" affordance if they
 * have not verified a university yet. Pure DOM, no I/O, so it is unit-testable.
 */
export function applyOwnRowHighlight(
  container: HTMLElement | Document,
  viewerId: string | null,
  showAddBadge: boolean,
): void {
  if (viewerId === null) return;

  // Escape the id for an attribute selector. Viewer ids are UUIDs, but stay
  // defensive: prefer CSS.escape where present (browsers), else escape the two
  // characters that can break a double-quoted attribute value.
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(viewerId)
      : viewerId.replace(/["\\]/g, '\\$&');

  const row = container.querySelector(`tr[data-uid="${escaped}"]`);
  if (row === null) return;

  row.classList.add('row-self');

  // The badge affordance only makes sense on the global board (showAddBadge)
  // and only when the viewer has no university badge yet. Idempotent: skip if an
  // affordance is already present (e.g. a second call after a client refresh).
  if (!showAddBadge) return;
  if (row.querySelector('.chip--badge') !== null) return;
  if (row.querySelector('.chip--add') !== null) return;

  const player = row.querySelector('.player');
  if (player === null) return;

  const link = document.createElement('a');
  link.className = 'chip chip--add';
  link.href = '/verify';
  link.textContent = '＋ add badge';
  player.append(link);
}
