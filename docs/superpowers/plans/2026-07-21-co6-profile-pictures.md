# CO-6: Profile pictures and the prominent header

**Source:** product-owner feedback after CO-5: the profile and sign-in buttons still
read as weird/quiet; add profile pictures with an upload flow; split the leaderboard
row into photo · name · badge · stats.

## 1. Avatars (end to end)

- Storage: public `avatars` bucket (300 KiB cap, webp/jpeg/png only), one object per
  user keyed by user id. No client storage policies — writes go through the API with
  the service role, keeping invariant 2's shape.
- `profiles.avatar_url` (≤500 chars) carries the public URL with a cache-busting
  version query; `leaderboard_entries` exposes it (avatars are public by definition,
  so the minimal-projection rule holds).
- `POST/DELETE /api/profile/avatar` (cookie auth): declared content-type must be one
  of the three image types, body ≤ 300 KiB, and the magic bytes must match the
  declared type — the header is never trusted. Tested handler core; service-role
  wiring uploads (upsert) and stamps the profile column.
- The client does the heavy lifting: centre-crop to square + downscale to 256px on a
  canvas, upload as webp — no server image-processing dependency, no big uploads.
- `Avatar` renders the picture or a monogram tile in the accent ink; it appears in
  the header chip, the `/me` identity chip, the `/account` uploader, and the boards.
- Preflight guard: `img { max-width: 100% }` squashes fixed-size avatars in narrow
  table cells — `.avatar` sets `max-width: none` deliberately.

## 2. Header prominence

- Signed out: the Sign in button is the design's one standing solid-accent fill
  (button-sized, so still within CO-3's rule) — maroon/cream on paper, steel/navy on
  the blackboard. `.btn.nav__signin` outranks the outline `.btn--primary`.
- Signed in: the account pill carries the real avatar (26px) + name in a bordered,
  shadowed capsule. Nav-link underline treatment is scoped to `.nav__link` so pills
  and buttons in the nav never inherit it.

## 3. Board row anatomy

Rank · photo (28px) · name · university badge · games · best — the badge moved after
the name (owner order), each numeral column keeping the CO-5 one-size-per-column
discipline.
