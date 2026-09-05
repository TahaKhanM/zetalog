/**
 * The actual ZetaLog mark: the icon from Assets, never stretched,
 * never recoloured. `lockup` pairs it with the Archivo wordmark for the
 * header/footer; `mark` renders the icon alone (auth cards).
 */
export function BrandMark({
  variant,
  size = 32,
}: {
  variant: 'lockup' | 'mark';
  size?: number;
}): React.JSX.Element {
  // Plain <img>: a small static asset with an explicit, non-shrinking size.
  const img = (
    <img
      src="/icon-96.png"
      alt=""
      width={size}
      height={size}
      className="brand-mark__img"
      style={{ '--brand-size': `${String(size)}px` } as React.CSSProperties}
    />
  );
  if (variant === 'mark') return img;
  return (
    <span className="brand-lockup">
      {img}
      <span className="wordmark">ZetaLog</span>
    </span>
  );
}
