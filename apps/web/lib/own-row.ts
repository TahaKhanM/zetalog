/**
 * Client-side personalisation of a cached leaderboard table.
 *
 * The public boards (`/`, `/uni/[slug]`) are cached server renders with no
 * viewer identity in them (so signed-out visitors cost zero auth work and the
 * HTML is shared across everyone). After hydration, the browser reads the
 * viewer's session and calls this to decorate their row with the `row-self`
 * highlight and report where the "add badge" affordance belongs. The caller
 * (`ViewerRowHighlight`) portals a real next/link `Link` into that mount, so
 * the affordance keeps client-side navigation — this helper stays pure DOM
 * (no I/O, unit-testable) and never fabricates anchors itself.
 */

/** What the viewer's row needs beyond the class flip. */
export interface OwnRowDecoration {
  /**
   * The viewer's `.player` element to mount the "＋ add badge" affordance
   * into, or null when no affordance applies (signed out, not on the board,
   * badge already earned, badges hidden, or an affordance already mounted).
   */
  readonly badgeMount: HTMLElement | null;
}

const NO_DECORATION: OwnRowDecoration = { badgeMount: null };

export function applyOwnRowHighlight(
  container: HTMLElement | Document,
  viewerId: string | null,
  showAddBadge: boolean,
): OwnRowDecoration {
  if (viewerId === null) return NO_DECORATION;

  // Escape the id for an attribute selector. Viewer ids are UUIDs, but stay
  // defensive: prefer CSS.escape where present (browsers), else escape the two
  // characters that can break a double-quoted attribute value.
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(viewerId)
      : viewerId.replace(/["\\]/g, '\\$&');

  const row = container.querySelector(`tr[data-uid="${escaped}"]`);
  if (row === null) return NO_DECORATION;

  row.classList.add('row-self');

  // The badge affordance only makes sense on the global board (showAddBadge)
  // and only when the viewer has no university badge yet. Idempotent: report no
  // mount if an affordance is already present (e.g. a second call after a
  // client-side refresh re-ran the effect).
  if (!showAddBadge) return NO_DECORATION;
  if (row.querySelector('.chip--badge') !== null) return NO_DECORATION;
  if (row.querySelector('.chip--add') !== null) return NO_DECORATION;

  const player = row.querySelector('.player');
  return { badgeMount: player instanceof HTMLElement ? player : null };
}
