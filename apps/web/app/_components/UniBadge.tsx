import { badgeFor } from '@/lib/uni-brand';

/**
 * University badge (CO-3 §3): the institution's official mark when we hold a
 * documented, officially-published asset (see lib/uni-brand.ts `logo` — with
 * its per-university monogram kill-switch), otherwise a monogram chip in the
 * university's brand colours. Colours/assets come exclusively from
 * `lib/uni-brand.ts`; sizes match the ledger-table and profile contexts.
 */
const BADGE_PX = { table: 20, profile: 28, masthead: 46 } as const;

export function UniBadge({
  slug,
  name,
  size = 'table',
}: {
  slug: string;
  name: string;
  size?: 'table' | 'profile' | 'masthead';
}): React.JSX.Element {
  const brand = badgeFor(slug, name);
  const className = size === 'table' ? 'uni-badge' : `uni-badge uni-badge--${size}`;
  if (brand.logo !== undefined) {
    return (
      <img
        src={brand.logo}
        alt={`${name} badge`}
        title={name}
        className={`${className} uni-badge--logo`}
        width={BADGE_PX[size]}
        height={BADGE_PX[size]}
      />
    );
  }
  return (
    <span
      className={className}
      style={{ backgroundColor: brand.bg, color: brand.fg }}
      title={name}
      aria-label={`${name} badge`}
    >
      {brand.monogram}
    </span>
  );
}
