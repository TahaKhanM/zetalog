/**
 * University badge brands (CO-3 §3): monogram marks in official brand
 * colours — never crests, shields, or logos (trademark + design invariant).
 *
 * `CURATED_BRANDS` is keyed by the seed's university slug. Each entry's
 * background is the institution's published primary brand colour; the
 * monogram colour is chosen from the same identity for WCAG AA contrast
 * (enforced by test over the whole map — see uni-brand.test.ts). This module
 * is the single sanctioned home for non-palette hexes (CO-3 §4).
 */

export interface UniBrand {
  /** Chip background — the university's primary brand colour. */
  readonly bg: string;
  /** Monogram ink. */
  readonly fg: string;
  /** 1–2 letter monogram. */
  readonly monogram: string;
  /**
   * Optional official logo asset under /public/uni-logos/, collected from the
   * institution's OWN published brand/press assets (source URL documented in
   * uni-logos/SOURCES.md). Rendered in place of the monogram when present;
   * deleting this field instantly reverts the university to its monogram —
   * the takedown kill-switch. Never sourced from third-party platforms.
   */
  readonly logo?: string;
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (index: number): number => {
    const raw = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two #rrggbb colours (1–21, symmetric). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/**
 * Curated official brand colours, keyed by seed slug. Sources are the
 * institutions' published visual-identity pages (verified 2026-07-21; URL per
 * entry). Monogram ink deviates to black/white/cream only where the brand's
 * own pairing would fail AA.
 */
export const CURATED_BRANDS: Readonly<Record<string, UniBrand>> = {
  // https://www.ox.ac.uk/public-affairs/style-guide — "Oxford blue" Pantone 282
  'university-of-oxford': { bg: '#002147', fg: '#fdf0d5', monogram: 'O' },
  // https://www.cam.ac.uk/brand-resources — "Cambridge blue" with dark ink
  'university-of-cambridge': { bg: '#a3c1ad', fg: '#003049', monogram: 'C' },
  // https://www.imperial.ac.uk/brand-style-guide/ — "Imperial blue"
  'imperial-college-london': { bg: '#003e74', fg: '#ffffff', monogram: 'I' },
  // https://warwick.ac.uk/about/brand/ — "Aubergine"
  'university-of-warwick': { bg: '#3c1053', fg: '#ffffff', monogram: 'W' },
  // https://www.ucl.ac.uk/brand/ — "UCL purple"
  'university-college-london-university-of-london': {
    bg: '#500778',
    fg: '#ffffff',
    monogram: 'U',
  },
  // https://www.lse.ac.uk (brand red; black ink for AA)
  'london-school-of-economics-and-political-science-university-of-london': {
    bg: '#e32219',
    fg: '#000000',
    monogram: 'L',
  },
  // https://www.durham.ac.uk — "Palatinate purple"
  'university-of-durham': { bg: '#68246d', fg: '#ffffff', monogram: 'D' },
  // https://www.ed.ac.uk/brand — Edinburgh dark blue
  'university-of-edinburgh': { bg: '#041e42', fg: '#fdf0d5', monogram: 'E' },
  // https://www.manchester.ac.uk brand purple
  'university-of-manchester': { bg: '#660099', fg: '#ffffff', monogram: 'M' },
  // Pantone 485C per brandcolorcode.com/kings-college-london (black ink for AA)
  'king-s-college-london-university-of-london': { bg: '#e12726', fg: '#000000', monogram: 'K' },
  // Pantone 187 per bristol.ac.uk/style-guides/brand-identity
  'university-of-bristol': { bg: '#a6192e', fg: '#ffffff', monogram: 'B' },
  // PMS 2955 #003865 per gla.ac.uk/myglasgow/staff/brandtoolkit/colour
  'university-of-glasgow': { bg: '#003865', fg: '#ffffff', monogram: 'G' },
};

/**
 * Official logo assets, keyed by seed slug, served from `/public/uni-logos/`.
 * Every asset is a square avatar-style mark collected from the university's
 * OWN web properties (self-served favicon/touch/manifest icons or brand
 * pages) — provenance for each file is documented in
 * `public/uni-logos/SOURCES.md`. Never sourced from LinkedIn, Wikipedia, or
 * any other third party.
 *
 * Consulted by {@link badgeFor} independently of `CURATED_BRANDS`, so a
 * university can carry a logo without a colour entry (its duotone monogram
 * remains the fallback identity behind the mark).
 *
 * Kill-switch: removing a slug's entry here (the asset can stay on disk)
 * instantly reverts that university to its monogram chip — use for takedown
 * requests or a mark that turns out to be illegible at badge size.
 */
export const CURATED_LOGOS: Readonly<Record<string, string>> = {
  'university-of-oxford': '/uni-logos/university-of-oxford.svg',
  'university-of-cambridge': '/uni-logos/university-of-cambridge.png',
  'imperial-college-london': '/uni-logos/imperial-college-london.svg',
  'university-of-warwick': '/uni-logos/university-of-warwick.png',
  'university-college-london-university-of-london':
    '/uni-logos/university-college-london-university-of-london.png',
  'london-school-of-economics-and-political-science-university-of-london':
    '/uni-logos/london-school-of-economics-and-political-science-university-of-london.png',
  'university-of-durham': '/uni-logos/university-of-durham.png',
  'university-of-bristol': '/uni-logos/university-of-bristol.png',
  'university-of-glasgow': '/uni-logos/university-of-glasgow.png',
  'university-of-bath': '/uni-logos/university-of-bath.png',
  'university-of-st-andrews': '/uni-logos/university-of-st-andrews.png',
  'university-of-leeds': '/uni-logos/university-of-leeds.png',
  'the-university-of-sheffield': '/uni-logos/the-university-of-sheffield.png',
  'university-of-birmingham': '/uni-logos/university-of-birmingham.png',
  'university-of-exeter': '/uni-logos/university-of-exeter.png',
};

/**
 * Paper-compatible duotones for everything without a curated entry: dark,
 * bookish inks with cream monograms, all AA-safe by construction (tested).
 * Hand-tuned; order is stable — changing it changes fallback assignments.
 */
export const FALLBACK_DUOTONES: readonly { readonly bg: string; readonly fg: string }[] = [
  { bg: '#1f3a5f', fg: '#fdf0d5' }, // ink blue
  { bg: '#4a1d3f', fg: '#fdf0d5' }, // mulberry
  { bg: '#1e4d3b', fg: '#fdf0d5' }, // college green
  { bg: '#5c3317', fg: '#fdf0d5' }, // oak
  { bg: '#3d2b56', fg: '#fdf0d5' }, // violet ink
  { bg: '#284b63', fg: '#fdf0d5' }, // slate
  { bg: '#6b2737', fg: '#fdf0d5' }, // claret
  { bg: '#37423d', fg: '#fdf0d5' }, // blackboard green
];

/** Words that never carry a university's identity. */
const FILLER = new Set(['the', 'university', 'of', 'college', 'school', 'institute', 'and']);

/** Monogram: initial of the first significant word of the common name. */
export function monogramFor(name: string): string {
  const words = name.split(/[\s,]+/).filter((word) => word.length > 0);
  const significant = words.find((word) => !FILLER.has(word.toLowerCase())) ?? words[0] ?? '?';
  return (significant[0] ?? '?').toUpperCase();
}

/** Deterministic small hash for fallback assignment (stable across runs). */
function hashSlug(slug: string): number {
  let hash = 5381;
  for (const char of slug) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * The badge for a university: curated brand colours (or a deterministic
 * duotone), plus the official logo when `CURATED_LOGOS` carries one.
 */
export function badgeFor(slug: string, name: string): UniBrand {
  const curated = CURATED_BRANDS[slug];
  const duotone = FALLBACK_DUOTONES[hashSlug(slug) % FALLBACK_DUOTONES.length];
  const base: UniBrand = curated ?? {
    bg: duotone?.bg ?? '#1f3a5f',
    fg: duotone?.fg ?? '#fdf0d5',
    monogram: monogramFor(name),
  };
  const logo = CURATED_LOGOS[slug];
  return logo === undefined ? base : { ...base, logo };
}
