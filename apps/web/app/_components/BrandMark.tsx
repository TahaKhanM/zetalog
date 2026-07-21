/**
 * The actual ZetaLog mark (CO-3 §1): the icon from Assets, never stretched,
 * never recoloured. `lockup` pairs it with the Archivo wordmark for the
 * header/footer; `mark` renders the icon alone (auth cards).
 */
export function BrandMark({
  variant,
  size = 24,
}: {
  variant: 'lockup' | 'mark';
  size?: number;
}): React.JSX.Element {
  // Plain <img>: a fixed-pixel static asset; next/image adds nothing at 24px.
  const img = (
    <img src="/icon-96.png" alt="" width={size} height={size} className="brand-mark__img" />
  );
  if (variant === 'mark') return img;
  return (
    <span className="brand-lockup">
      {img}
      <span className="wordmark">ZetaLog</span>
    </span>
  );
}
