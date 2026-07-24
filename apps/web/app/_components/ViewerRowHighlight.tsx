'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { applyOwnRowHighlight } from '@/lib/own-row';
import { createClient } from '@/lib/supabase/browser';

/**
 * Personalises the cached leaderboard for the signed-in viewer, after
 * hydration. The board itself is a cacheable server render with no viewer
 * identity in it (so signed-out visitors cost zero auth work); this reads the
 * browser session locally — `getSession()`, no network round-trip — highlights
 * the viewer's row, and portals a real next/link "＋ add badge" affordance into
 * it when eligible (Link, not a raw anchor, so navigation stays client-side
 * with prefetch).
 */
export function ViewerRowHighlight({
  showAddBadge,
}: {
  showAddBadge: boolean;
}): React.JSX.Element | null {
  const [badgeMount, setBadgeMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id ?? null;
      // Users who chose "not at a university" (CO-11) opted out of the badge
      // flow; do not offer the affordance to them.
      let offerBadge = showAddBadge;
      if (userId !== null && offerBadge) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('independent')
          .eq('id', userId)
          .maybeSingle();
        if ((profile as { independent?: unknown } | null)?.independent === true) {
          offerBadge = false;
        }
      }
      // The single side effect happens here, so one staleness check suffices.
      if (cancelled) return;
      const decoration = applyOwnRowHighlight(document, userId, offerBadge);
      setBadgeMount(decoration.badgeMount);
    });
    return () => {
      cancelled = true;
    };
  }, [showAddBadge]);

  if (badgeMount === null) return null;
  return createPortal(
    <Link href="/verify" className="chip chip--add">
      ＋ add badge
    </Link>,
    badgeMount,
  );
}
