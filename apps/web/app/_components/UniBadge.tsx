import { badgeFor } from '@/lib/uni-brand';

/**
 * University monogram badge (CO-3 §3): a rounded-square chip in the
 * institution's brand colours — never a crest. Colours come exclusively from
 * `lib/uni-brand.ts` (AA-gated by test) via inline style; the size variants
 * match the ledger-table and profile contexts. Badge precedes the name in
 * tables — it never replaces it.
 */
export function UniBadge({
  slug,
  name,
  size = 'table',
}: {
  slug: string;
  name: string;
  size?: 'table' | 'profile';
}): React.JSX.Element {
  const brand = badgeFor(slug, name);
  return (
    <span
      className={size === 'profile' ? 'uni-badge uni-badge--profile' : 'uni-badge'}
      style={{ backgroundColor: brand.bg, color: brand.fg }}
      title={name}
      aria-label={`${name} badge`}
    >
      {brand.monogram}
    </span>
  );
}
