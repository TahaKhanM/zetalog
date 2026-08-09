'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { createClient } from '@/lib/supabase/browser';

/**
 * Personalises the cached leaderboard for the signed-in viewer, after
 * hydration. The board itself is a cacheable server render with no viewer
 * identity in it (so signed-out visitors cost zero auth work); this reads the
 * browser session locally, reads only the viewer's own display name under RLS,
 * and finds the matching public row. This avoids publishing raw account UUIDs
 * in the cached HTML just to implement a cosmetic own-row highlight.
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
      // Users who chose "not at a university" opted out of the badge
      // flow; do not offer the affordance to them.
      let offerBadge = showAddBadge;
      let displayName: string | null = null;
      if (userId !== null) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, independent')
          .eq('id', userId)
          .maybeSingle();
        const ownProfile = profile as { display_name?: unknown; independent?: unknown } | null;
        displayName = typeof ownProfile?.display_name === 'string' ? ownProfile.display_name : null;
        if (ownProfile?.independent === true) {
          offerBadge = false;
        }
      }
      if (cancelled) return;
      setBadgeMount(decorateOwnRow(document, displayName, offerBadge));
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

function decorateOwnRow(
  container: Document,
  displayName: string | null,
  showAddBadge: boolean,
): HTMLElement | null {
  if (displayName === null) return null;
  const name = [...container.querySelectorAll<HTMLElement>('.player__name')].find(
    (node) => node.textContent === displayName,
  );
  const row = name?.closest('tr');
  if (row === null || row === undefined) return null;
  row.classList.add('row-self');
  if (!showAddBadge || row.querySelector('.chip--badge, .uni-badge, .chip--add') !== null) {
    return null;
  }
  const player = row.querySelector('.player');
  return player instanceof HTMLElement ? player : null;
}
