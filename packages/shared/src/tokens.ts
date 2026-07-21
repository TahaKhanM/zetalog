/**
 * Design tokens fixed by the ZetaLog design spec (§8 — "Design language").
 *
 * These values are contractual: both the extension and the website consume
 * them, and no other file may hard-code palette hexes or font families.
 */

/** The five-colour ZetaLog palette. Use {@link color} roles, not raw entries. */
export const palette = {
  maroon: '#780000',
  red: '#c1121f',
  cream: '#fdf0d5',
  navy: '#003049',
  steelBlue: '#669bbc',
} as const;

export type PaletteColor = (typeof palette)[keyof typeof palette];

/**
 * Semantic colour roles. Red is reserved for new personal bests and
 * destructive actions — nothing else. Steel blue is for chart strokes and
 * secondary data.
 */
export const color = {
  display: palette.maroon,
  newPersonalBest: palette.red,
  destructive: palette.red,
  chartStroke: palette.steelBlue,
  secondaryData: palette.steelBlue,
  light: { background: palette.cream, text: palette.navy },
  dark: { background: palette.navy, text: palette.cream },
} as const;

/**
 * Typography contract. All fonts are self-hosted WOFF2 — no external font
 * requests from the extension or the site. No Inter/system-ui as primary.
 */
export const typography = {
  /** Wordmark, page titles, and PB callouts only. Maroon on cream. */
  display: {
    family: 'Archivo',
    width: 125,
    weightMin: 800,
    weightMax: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  /** All UI and body text. Navy on cream (light); cream on navy (dark). */
  body: {
    family: 'Spline Sans',
  },
  /**
   * Every numeral on every screen: scores, timers, leaderboards, chart axes.
   * Numerals are the visual hero — always tabular so columns of scores align.
   */
  numeric: {
    family: 'Azeret Mono',
    fontVariantNumeric: 'tabular-nums',
  },
} as const;
