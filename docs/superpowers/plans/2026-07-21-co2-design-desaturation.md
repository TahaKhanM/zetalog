# CO-2: Numeral font swap + desaturated color application

**Source:** product-owner feedback during the build: "The design looks overly saturated.
Change the font for the numbers from the 0 with the crosses in them to something
different."

**Rule:** This supersedes spec §8 and all stream briefs where they conflict. The five
palette hexes are unchanged as brand anchors; what changes is the numeral face and how
much saturated color the UI applies.

## 1. Numeral font: Azeret Mono (replaces Spline Sans Mono)

- Verified by glyph specimen (controller, 2026-07-21): Spline Sans Mono has a slashed
  zero — rejected. IBM Plex Mono and JetBrains Mono have dotted zeros — same problem.
  **Azeret Mono has a completely plain zero**, tabular spacing by construction, and its
  wide geometric forms harmonize with Archivo at 125% width.
- All numerals (scores, timers, ranks, leaderboards, chart axes, timestamps):
  `font-family: 'Azeret Mono'` + `font-variant-numeric: tabular-nums`. Weights: 400 for
  body-scale numerals, 500 for tables, 700 for hero scores/PBs.
- Dependency: `@fontsource/azeret-mono@^5.3.0` replaces `@fontsource/spline-sans-mono`
  in both apps (self-hosted WOFF2 — the no-external-font-requests rule stands). Spline
  Sans (body/UI text) is unchanged. Archivo display rules are unchanged.
- `packages/shared/src/tokens.ts` `typography.numeric.family` = `'Azeret Mono'`
  (controller commits this on the trunk).

## 2. Desaturation rules (color APPLICATION, not palette values)

Principle: neutrals carry the layout; brand color communicates identity and state. The
previous direction painted too much surface with saturated color.

- **Light surfaces:** page background is no longer solid cream — use
  `color-mix(in srgb, var(--zl-cream) 30%, white)` for the page, white for cards/tables,
  cream-tinted borders (`color-mix(in srgb, var(--zl-cream) 60%, white)`). Body text:
  navy softened to `color-mix(in srgb, var(--zl-navy) 85%, white)`; headings full navy.
- **Dark surfaces:** background `color-mix(in srgb, var(--zl-navy) 72%, black)`, cards
  `color-mix(in srgb, var(--zl-navy) 88%, black)`; text cream at 90% opacity, headings
  full cream.
- **Maroon:** wordmark, page titles, PB callouts, top-3 rank numerals — text only. No
  solid maroon fills or banners. Warning/banner surfaces = maroon 8% tint background
  with maroon text.
- **Red (#c1121f):** role unchanged (new PB, destructive) but as TEXT/BORDER only —
  never a fill larger than a focus ring or chip outline.
- **Steel blue:** chart strokes at 85% opacity on light (full on dark); chips/badges =
  steel-blue 12% tint fill + steel-blue text; secondary metadata text
  `color-mix(in srgb, var(--zl-steel) 70%, var(--surface-text))`.
- **Hard rule:** no solid brand-color region larger than a badge chip anywhere except
  the wordmark and chart strokes.

## 3. Enforcement updates

- The web `tokens-sync` test keeps asserting the five raw hexes; tints are `color-mix`
  over those variables, so no new hex literals may appear (extend the test to fail on
  any other 6-digit hex literal in globals.css apart from the five).
- Extension popup and web pages both apply these rules; screenshots at review must show
  mostly-neutral surfaces with color doing accent work only.
