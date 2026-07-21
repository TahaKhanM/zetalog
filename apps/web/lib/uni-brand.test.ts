import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURATED_BRANDS,
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
  it('returns the curated brand for a known slug', () => {
    const badge = badgeFor('university-of-warwick', 'University of Warwick');
    expect(badge).toEqual(CURATED_BRANDS['university-of-warwick']);
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
