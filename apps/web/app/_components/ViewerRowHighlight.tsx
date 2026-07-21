'use client';

import { useEffect } from 'react';

import { applyOwnRowHighlight } from '@/lib/own-row';
import { createClient } from '@/lib/supabase/browser';

/**
 * Personalises the cached leaderboard for the signed-in viewer, after
 * hydration. The board itself is a cacheable server render with no viewer
 * identity in it (so signed-out visitors cost zero auth work); this reads the
 * browser session locally — `getSession()`, no network round-trip — and
 * decorates the viewer's row. Renders nothing.
 */
export function ViewerRowHighlight({ showAddBadge }: { showAddBadge: boolean }): null {
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      applyOwnRowHighlight(document, data.session?.user.id ?? null, showAddBadge);
    });
    return () => {
      cancelled = true;
    };
  }, [showAddBadge]);

  return null;
}
