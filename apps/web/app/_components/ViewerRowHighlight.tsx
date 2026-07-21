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
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const decoration = applyOwnRowHighlight(
        document,
        data.session?.user.id ?? null,
        showAddBadge,
      );
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
