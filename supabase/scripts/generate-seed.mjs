#!/usr/bin/env node
// Generate supabase/seed.sql from the open university-domains dataset.
//
// Dependency-free (Node >= 24, global fetch). Deterministic: the same input
// always produces byte-identical output, so the generated seed.sql is a
// reviewable, committed artifact. Re-run only to refresh against upstream.
//
//   node supabase/scripts/generate-seed.mjs
//
// Pipeline: fetch -> filter to GB then US -> merge rows sharing a name within
// a country (union domains) -> lowercase/dedupe/sort domains -> slugify with
// collision suffixes in two passes (GB first, then US, continuing counters so
// existing GB slugs stay stable) -> emit idempotent
// `insert ... on conflict (slug) do nothing`.

/* global fetch, process */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SOURCE_URL =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

export const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'seed.sql');

/** GB first is a correctness constraint: US entries continue the collision counters. */
export const COUNTRY_ORDER = Object.freeze(['GB', 'US']);

export const ALLOWED_COUNTRIES = new Set(COUNTRY_ORDER);

/** Escape a string for a single-quoted SQL literal. */
export const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

/**
 * Slugify a university name: lowercase ASCII, non-alphanumerics collapsed to a
 * single hyphen, no leading/trailing hyphens.
 */
export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Merge dataset rows for one country: same name unions domains. Sorted by name
 * so collision suffixes are stable across runs.
 */
export function mergeCountry(rows, country) {
  const byName = new Map();
  for (const row of rows) {
    if (row?.alpha_two_code !== country) continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;

    const domainSet = byName.get(name) ?? new Set();
    for (const domain of Array.isArray(row.domains) ? row.domains : []) {
      if (typeof domain !== 'string') continue;
      const normalized = domain.trim().toLowerCase();
      if (normalized) domainSet.add(normalized);
    }
    byName.set(name, domainSet);
  }

  return [...byName.entries()]
    .map(([name, domainSet]) => ({
      name,
      country,
      domains: [...domainSet].sort(),
    }))
    .filter((u) => u.domains.length > 0)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Assign slugs, disambiguating collisions with a numeric suffix. `slugCounts`
 * is shared across country passes so a later country cannot steal an earlier
 * country's slug.
 */
export function assignSlugs(universities, slugCounts) {
  return universities.map((uni) => {
    const base = slugify(uni.name) || 'university';
    const seen = slugCounts.get(base) ?? 0;
    const slug = seen === 0 ? base : `${base}-${seen + 1}`;
    slugCounts.set(base, seen + 1);
    return { ...uni, slug };
  });
}

/** GB universities first (today's slugs), then US, continuing collision counters. */
export function universitiesFromDataset(rows) {
  if (!Array.isArray(rows)) {
    throw new Error('Unexpected dataset shape: expected a JSON array');
  }
  const slugCounts = new Map();
  const all = [];
  for (const country of COUNTRY_ORDER) {
    all.push(...assignSlugs(mergeCountry(rows, country), slugCounts));
  }
  return all;
}

const INSERT_PAIR = /values \('((?:[^']|'')*)', '((?:[^']|'')*)'/g;

const unescapeSql = (value) => value.replace(/''/g, "'");

/** Parse committed `(slug, name)` pairs from either insert shape. */
export function parseSeedPairs(sql) {
  const pairs = new Map();
  for (const match of sql.matchAll(INSERT_PAIR)) {
    const name = match[1];
    const slug = match[2];
    if (name === undefined || slug === undefined) continue;
    pairs.set(unescapeSql(slug), unescapeSql(name));
  }
  return pairs;
}

/**
 * Fail loudly if any previously committed `(slug, name)` pair would change.
 * Inserts are `on conflict (slug) do nothing`, so a stolen slug would silently
 * mis-map the existing university in production.
 */
export function assertSlugStability(previousSql, universities) {
  const previous = parseSeedPairs(previousSql);
  if (previous.size === 0 && /insert into public\.universities/i.test(previousSql)) {
    throw new Error('Slug stability check could not parse any (slug, name) pairs from seed.sql');
  }
  const next = new Map(universities.map((uni) => [uni.slug, uni.name]));
  const broken = [];
  for (const [slug, name] of previous) {
    const nextName = next.get(slug);
    if (nextName !== name) {
      broken.push(
        `  ${slug}: committed ${JSON.stringify(name)}, got ${
          nextName === undefined ? '<missing>' : JSON.stringify(nextName)
        }`,
      );
    }
  }
  if (broken.length > 0) {
    throw new Error(
      `Slug stability violated: committed (slug, name) pairs must be unchanged.\n${broken.join('\n')}`,
    );
  }
}

/** Render the committed seed.sql artifact. */
export function renderSeedSql(universities, sourceUrl = SOURCE_URL) {
  const gb = universities.filter((uni) => uni.country === 'GB').length;
  const us = universities.filter((uni) => uni.country === 'US').length;
  const header = [
    '-- ZetaLog university seed data (GB and US). GENERATED FILE — do not edit by hand.',
    '-- Regenerate: node supabase/scripts/generate-seed.mjs',
    `-- Source: ${sourceUrl}`,
    `-- Universities: ${universities.length} (GB: ${gb}, US: ${us})`,
    '-- Idempotent: re-running is a no-op for existing slugs.',
    '',
  ].join('\n');

  const statements = universities.map((uni) => {
    const domains = uni.domains.map(sqlString).join(', ');
    return (
      `insert into public.universities (name, slug, domains, country) values (` +
      `${sqlString(uni.name)}, ${sqlString(uni.slug)}, array[${domains}]::text[], ${sqlString(uni.country)}) ` +
      `on conflict (slug) do nothing;`
    );
  });

  return `${header}${statements.join('\n')}\n`;
}

export async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  const rows = await response.json();
  const universities = universitiesFromDataset(rows);

  let previous = '';
  try {
    previous = await readFile(OUT_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous.length > 0) {
    assertSlugStability(previous, universities);
  }

  const output = renderSeedSql(universities);
  await writeFile(OUT_PATH, output, 'utf8');

  const gb = universities.filter((uni) => uni.country === 'GB').length;
  const us = universities.filter((uni) => uni.country === 'US').length;
  process.stderr.write(
    `Wrote ${universities.length} universities (GB: ${gb}, US: ${us}) to ${OUT_PATH}\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`generate-seed failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
