# CO-3: "Examination paper" — the refined ZetaLog design language

**Source:** product-owner feedback after launch: still too saturated, doesn't use the
actual logo, restructure everything, lean into cream and maroon; university badges as
recognisable coloured marks, not text names.

Supersedes CO-2 §2 where they conflict; CO-2's hard rule (no solid brand-colour region
larger than a chip except wordmark/strokes) is RELAXED only as stated here. Palette hexes
and font roles (Archivo display / Spline Sans body / Azeret Mono numerals) are unchanged.

## 1. Direction

**Examination paper**: the surface IS cream — warm exam-paper stock, not a white app with
a cream wash. Maroon is the ink of authority (rules, headings, the wordmark); navy is the
working ink (body, numerals); steel blue is reserved strictly for chart strokes and quiet
metadata; red stays PB/destructive only. The feel: a beautifully set maths exam crossed
with a broadsheet results page. Restrained, editorial, unmistakably ZetaLog.

- **Light surfaces:** page `color-mix(in srgb, cream 78%, white)`; cards/tables are
  `color-mix(in srgb, cream 45%, white)` with **maroon hairlines** at 18% tint instead of
  grey borders. Ledger ruling: tables draw horizontal rules only (no vertical lines), rule
  colour maroon 14% tint. Paper grain: a subtle CSS noise/texture overlay (opacity ≤ 3%)
  on the page surface only.
- **Dark mode ("blackboard"):** unchanged navy-derived scheme from CO-2 but with cream
  ruling lines at 12% and the same structure. No new saturation.
- **Maroon usage (the CO-2 relaxation):** maroon may now paint structural INK — hairlines,
  ruling, section index numerals, the wordmark, small filled elements up to button size —
  but still never large area fills or banners. Buttons: primary = maroon outline + maroon
  text on paper (fill maroon only on hover/press with cream text).
- **The logo:** the actual mark (`Assets/icons/icon-*.png`, already in both apps' public
  dirs) appears at 22–28px beside the Archivo wordmark in the site header, site footer,
  popup header, and the auth/verify cards. Never stretched, never recoloured.

## 2. Restructure (both surfaces)

- **Site header:** logo mark + ARCHIVO wordmark left; nav right as quiet navy links with
  maroon underline on active. Sticky, paper background at 92% opacity + blur.
- **Home:** an editorial masthead — "THE LEADERBOARD" eyebrow in Archivo with a maroon
  rule, duration tabs set as large Azeret index numerals (120 / 60 / 30) rather than
  pill buttons; the board is a ruled ledger table: rank as small maroon index, name in
  Spline Sans medium, university badge (see §3), score right-aligned huge tabular Azeret.
  A quiet right rail carries stats (players, universities, games validated) as small
  numeral tiles.
- **/me:** identity card (logo-marked) with display name + badge + per-duration PBs as
  three numeral tiles; the progress chart on ruled paper (steel stroke, maroon PB
  markers); history as the same ledger table language.
- **Popup:** same paper language at 360px: cream paper, maroon ruling, hero score in
  Azeret 44px, logo mark top-left. Structure order unchanged (hero → trend → recent →
  banner → footer).
- Motion: one restrained entrance — staggered fade/rise on table rows and tiles
  (60–90ms steps, CSS only), respects `prefers-reduced-motion`.

## 3. University badges (replaces text-only names)

Monogram marks in official university brand colours — **never crests, shields, or
logos** (trademark + design invariant both stand):

- A `UniBadge` renders a rounded-square chip (18–22px in tables, 28px on profile):
  background = the university's primary brand colour, monogram = 1–2 letters in the
  university's secondary colour (or cream/white for contrast), Archivo 700.
- **Curated brand-colour map** for the prominent institutions (data module, e.g.
  `apps/web/lib/uni-brand.ts`, keyed by slug): Warwick purple `#3C1053` with white W,
  Imperial `#003E74` with white I, Oxford `#002147`, Cambridge `#A3C1AD` with navy
  monogram, UCL `#500778`, LSE `#E32219`? — the stream curates ~40 from published brand
  guidelines, each entry `{ bg, fg, monogram }`, with a source comment per entry.
- **Deterministic fallback** for everything else: hash the slug into one of 8 hand-tuned
  paper-compatible duotones (defined once, tested for WCAG AA contrast) + first-letter
  monogram. Every university therefore always renders a badge.
- Unverified viewers keep the dashed "+" affordance on their own row. Badge + full name
  appear together in tables (badge is not a replacement for the name — it precedes it).
- Contrast rule: every curated/fallback pair must pass AA for the monogram; a unit test
  computes contrast ratios over the whole map.

## 4. Enforcement

- Tints keep deriving via `color-mix` over the five `--zl-*`/`--color-zl-*` variables; the
  stray-hex tests stay. EXCEPTION: `uni-brand.ts` carries university brand hexes — scoped
  to that one module, covered by its own contrast test; the globals.css hex rule is
  unchanged (badge colours arrive via inline `style` from the data module, never CSS).
- Both apps screenshot-verified in light and dark before review sign-off.
