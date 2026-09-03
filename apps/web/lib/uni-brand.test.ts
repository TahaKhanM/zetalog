import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BULK_LOGO_DENYLIST,
  CURATED_BRANDS,
  CURATED_LOGOS,
  badgeFor,
  contrastRatio,
  fallbackColours,
  monogramFor,
} from './uni-brand';
import BULK_LOGOS from './uni-logos-bulk.json';

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

  it('every fallback colour pair meets WCAG AA regardless of the slug-derived hue', () => {
    // Sweep enough distinct slugs to cover the whole hue wheel.
    for (let i = 0; i < 720; i += 1) {
      const { bg, fg } = fallbackColours(`sweep-slug-${String(i)}`);
      expect(contrastRatio(bg, fg), `${bg} on ${fg}`).toBeGreaterThanOrEqual(4.5);
      expect(bg).toMatch(/^#[0-9a-f]{6}$/);
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
    expect(first.bg).toBe(fallbackColours('unknown-college').bg);
  });

  it('gives distinct universities their own fallback colours', () => {
    const slugs = ['aaa-college', 'bbb-college', 'ccc-institute', 'ddd-school', 'eee-academy'];
    const backgrounds = new Set(slugs.map((slug) => badgeFor(slug, slug).bg));
    expect(backgrounds.size).toBe(slugs.length);
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

  it('skips leading punctuation and quotes from dataset quirks', () => {
    expect(monogramFor('"Colegio Salesianos"')).toBe('C');
    expect(monogramFor('(ESIH) École Supérieure')).toBe('E');
  });

  it('monograms non-Latin names in their own script', () => {
    expect(monogramFor('成均館大学校')).toBe('成');
    expect(monogramFor('Приазовський університет')).toBe('П');
  });
});

describe('every seeded university renders a legible badge', () => {
  const seed = readFileSync(join(import.meta.dirname, '../../../supabase/seed.sql'), 'utf8');
  const rows = [...seed.matchAll(/values \('((?:[^']|'')*)', '((?:[^']|'')*)', array\[/g)].map(
    (match) => ({
      name: (match[1] ?? '').replace(/''/g, "'"),
      slug: (match[2] ?? '').replace(/''/g, "'"),
    }),
  );

  it('covers the full seed', () => {
    expect(rows.length).toBeGreaterThan(3000);
  });

  it('yields AA-contrast colours and a letter/digit monogram for all of them', () => {
    for (const { slug, name } of rows) {
      const badge = badgeFor(slug, name);
      const ratio = contrastRatio(badge.bg, badge.fg);
      expect(
        ratio,
        `${slug}: ${badge.bg}/${badge.fg} = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        badge.monogram,
        `${slug} (${name}): monogram ${JSON.stringify(badge.monogram)}`,
      ).toMatch(/^[\p{L}\p{N}]$/u);
      expect(badge.monogram).toBe(badge.monogram.toUpperCase());
    }
  });

  it('never leaves a university with a placeholder slug', () => {
    for (const { slug } of rows) {
      expect(slug, `placeholder slug for a university`).not.toMatch(/^university(-\d+)?$/);
    }
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
    expect(badge.bg).toBe(fallbackColours(slug).bg);
    expect(badge.monogram).toBe('B');
  });

  it('badgeFor returns no logo for unmapped slugs', () => {
    expect(badgeFor('unknown-college', 'Unknown College').logo).toBeUndefined();
  });

  it('keeps the five US schools without a usable official square mark on monogram chips', () => {
    for (const slug of [
      'columbia-university',
      'new-york-university',
      'georgia-institute-of-technology',
      'university-of-california-los-angeles',
      'university-of-washington',
    ]) {
      expect(CURATED_LOGOS[slug], slug).toBeUndefined();
      expect(CURATED_BRANDS[slug], slug).toBeDefined();
      // Bulk collection must never override this curated decision.
      expect(badgeFor(slug, slug).logo, slug).toBeUndefined();
    }
  });
});

describe('bulk-collected marks', () => {
  const icons = Object.entries(BULK_LOGOS.icons) as [string, { file: string; source: string }][];

  it('collected a substantial share of the seed', () => {
    expect(icons.length).toBeGreaterThan(500);
  });

  it('every icon has a served file, a same-provenance source URL, and a seeded slug', () => {
    const seed = readFileSync(join(import.meta.dirname, '../../../supabase/seed.sql'), 'utf8');
    for (const [slug, icon] of icons) {
      expect(icon.file, slug).toBe(`/uni-logos/bulk/${slug}.png`);
      expect(existsSync(join(import.meta.dirname, '../public', icon.file)), slug).toBe(true);
      expect(icon.source, slug).toMatch(/^https:\/\//);
      expect(seed, `bulk slug not in seed: ${slug}`).toContain(`'${slug}'`);
    }
  });

  it('never carries a slug that is hand-curated', () => {
    for (const [slug] of icons) {
      expect(CURATED_LOGOS[slug], slug).toBeUndefined();
      expect(CURATED_BRANDS[slug], slug).toBeUndefined();
    }
  });

  it('badgeFor serves the collected mark for an uncurated slug', () => {
    const [slug, icon] = icons.find(([candidate]) => !BULK_LOGO_DENYLIST.has(candidate)) ?? [];
    expect(slug).toBeDefined();
    if (slug !== undefined && icon !== undefined) {
      expect(badgeFor(slug, slug).logo).toBe(icon.file);
    }
  });
});
