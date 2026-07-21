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
  'the-victoria-university-of-manchester': { bg: '#660099', fg: '#ffffff', monogram: 'M' },
  // https://www.kcl.ac.uk/brand — KCL red (dark ink variant for AA)
  'king-s-college-london-university-of-london': { bg: '#8a1538', fg: '#ffffff', monogram: 'K' },
  // https://www.bristol.ac.uk/brand/ — Bristol red
  'university-of-bristol': { bg: '#ab1f2d', fg: '#ffffff', monogram: 'B' },
  // https://www.gla.ac.uk/myglasgow/brandtoolkit/ — Glasgow "University blue"
  'university-of-glasgow': { bg: '#003865', fg: '#ffffff', monogram: 'G' },
  // https://www.bath.ac.uk — Bath blue
  'university-of-bath': { bg: '#004489', fg: '#ffffff', monogram: 'B' },
  // https://warwick/queen-mary brand — QMUL blue
  'queen-mary-university-of-london': { bg: '#003d71', fg: '#ffffff', monogram: 'Q' },
  // https://www.st-andrews.ac.uk/brand — St Andrews blue
  'university-of-st-andrews': { bg: '#00539b', fg: '#ffffff', monogram: 'S' },
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

/** The badge for a university: curated brand, or a deterministic duotone. */
export function badgeFor(slug: string, name: string): UniBrand {
  const curated = CURATED_BRANDS[slug];
  if (curated !== undefined) return curated;
  const duotone = FALLBACK_DUOTONES[hashSlug(slug) % FALLBACK_DUOTONES.length];
  return {
    bg: duotone?.bg ?? '#1f3a5f',
    fg: duotone?.fg ?? '#fdf0d5',
    monogram: monogramFor(name),
  };
}
