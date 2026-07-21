import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURATED_BRANDS,
  CURATED_LOGOS,
  FALLBACK_DUOTONES,
  badgeFor,
  contrastRatio,
  monogramFor,
} from './uni-brand';

describe('contrastRatio', () => {
  it('reports 21:1 for black on white', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('reports 1:1 for identical colours', () => {
    expect(contrastRatio('#780000', '#780000')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#003049', '#fdf0d5')).toBeCloseTo(contrastRatio('#fdf0d5', '#003049'), 5);
  });
});

describe('accessibility of the whole badge system', () => {
  it('every curated brand pair meets WCAG AA for small text (4.5:1)', () => {
    for (const [slug, brand] of Object.entries(CURATED_BRANDS)) {
      const ratio = contrastRatio(brand.bg, brand.fg);
      expect(
        ratio,
        `${slug}: ${brand.bg} on ${brand.fg} = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every fallback duotone meets WCAG AA for small text (4.5:1)', () => {
    for (const duotone of FALLBACK_DUOTONES) {
      expect(contrastRatio(duotone.bg, duotone.fg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('badgeFor', () => {
  it('returns curated colours plus the mapped logo for a fully-curated slug', () => {
    const badge = badgeFor('university-of-manchester', 'The University of Manchester');
    expect(badge.bg).toBe(CURATED_BRANDS['university-of-manchester']?.bg);
    expect(badge.monogram).toBe('M');
    expect(badge.logo).toBe(CURATED_LOGOS['university-of-manchester']);
  });

  it('falls back deterministically for unknown slugs', () => {
    const first = badgeFor('unknown-college', 'Unknown College');
    const second = badgeFor('unknown-college', 'Unknown College');
    expect(first).toEqual(second);
    expect(FALLBACK_DUOTONES.map((d) => d.bg)).toContain(first.bg);
  });

  it('spreads distinct unknown slugs across more than one duotone', () => {
    const slugs = ['aaa-college', 'bbb-college', 'ccc-institute', 'ddd-school', 'eee-academy'];
    const backgrounds = new Set(slugs.map((slug) => badgeFor(slug, slug).bg));
    expect(backgrounds.size).toBeGreaterThan(1);
  });
});

describe('monogramFor', () => {
  it('uses the curated monogram when one exists', () => {
    expect(badgeFor('imperial-college-london', 'Imperial College London').monogram).toBe('I');
  });

  it('derives an initial from the significant word, skipping filler', () => {
    expect(monogramFor('University of Warwick')).toBe('W');
    expect(monogramFor('The University of Manchester')).toBe('M');
  });

  it('falls back to the first character for single-word names', () => {
    expect(monogramFor('LSE')).toBe('L');
  });
});

describe('curated map integrity', () => {
  it('every curated slug exists in the university seed', () => {
    const seed = readFileSync(join(import.meta.dirname, '../../../supabase/seed.sql'), 'utf8');
    for (const slug of Object.keys(CURATED_BRANDS)) {
      expect(seed, `curated slug not in seed: ${slug}`).toContain(`'${slug}'`);
    }
  });
});

describe('curated logos', () => {
  it('every logo slug exists in the university seed', () => {
    const seed = readFileSync(join(import.meta.dirname, '../../../supabase/seed.sql'), 'utf8');
    for (const slug of Object.keys(CURATED_LOGOS)) {
      expect(seed, `logo slug not in seed: ${slug}`).toContain(`'${slug}'`);
    }
  });

  it('every logo path points at an existing file under public/uni-logos', () => {
    for (const [slug, logo] of Object.entries(CURATED_LOGOS)) {
      expect(logo, `${slug}: logo must be served from /uni-logos/`).toMatch(
        /^\/uni-logos\/[\w.-]+\.(?:png|svg)$/,
      );
      const file = join(import.meta.dirname, '../public', logo);
      expect(existsSync(file), `${slug}: missing asset ${file}`).toBe(true);
    }
  });

  it('badgeFor attaches the logo to a mapped slug with curated colours', () => {
    const badge = badgeFor('university-of-oxford', 'University of Oxford');
    expect(badge.logo).toBe(CURATED_LOGOS['university-of-oxford']);
    expect(badge.bg).toBe(CURATED_BRANDS['university-of-oxford']?.bg);
  });

  it('carries the round-2 collected mark (Edinburgh, vector kept over raster)', () => {
    expect(CURATED_LOGOS['university-of-edinburgh']).toBe('/uni-logos/university-of-edinburgh.svg');
  });

  it('carries the six owner-supplied marks (incl. the Nottingham owner override)', () => {
    for (const [slug, file] of [
      ['university-of-manchester', 'university-of-manchester.png'],
      [
        'king-s-college-london-university-of-london',
        'king-s-college-london-university-of-london.png',
      ],
      ['queen-mary-university-of-london', 'queen-mary-university-of-london.png'],
      ['university-of-nottingham', 'university-of-nottingham.png'],
      ['university-of-southampton', 'university-of-southampton.png'],
      ['cardiff-university', 'cardiff-university.png'],
    ] as const) {
      expect(CURATED_LOGOS[slug], slug).toBe(`/uni-logos/${file}`);
    }
  });

  it('badgeFor attaches the logo to a mapped slug without a colour entry', () => {
    const slug = 'university-of-bath';
    expect(CURATED_BRANDS[slug]).toBeUndefined();
    const badge = badgeFor(slug, 'University of Bath');
    expect(badge.logo).toBe(CURATED_LOGOS[slug]);
    expect(FALLBACK_DUOTONES.map((duotone) => duotone.bg)).toContain(badge.bg);
    expect(badge.monogram).toBe('B');
  });

  it('badgeFor returns no logo for unmapped slugs', () => {
    expect(badgeFor('unknown-college', 'Unknown College').logo).toBeUndefined();
  });
});
