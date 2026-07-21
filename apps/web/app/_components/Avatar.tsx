/**
 * A profile picture: the uploaded image when present, otherwise a monogram
 * tile in the accent ink (CO-6). Sizes match the contexts they appear in —
 * table rows, the header chip, and the account card.
 */
export function Avatar({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}): React.JSX.Element {
  if (url !== null) {
    return (
      // Plain <img>: a tiny, already-optimised square from our own bucket.
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="avatar avatar--img"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar avatar--monogram num"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
