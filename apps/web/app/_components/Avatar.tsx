/**
 * A monogram identity tile in the accent ink: the display name's first
 * letter on a soft accent square. Profile PHOTOS were removed deliberately —
 * user-uploaded images are a moderation liability and a storage cost — so this
 * is the only avatar the product renders.
 */
export function Avatar({ name, size }: { name: string; size: number }): React.JSX.Element {
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
