#!/usr/bin/env node
// Generate supabase/seed.sql from the open university-domains dataset.
//
// Dependency-free (Node >= 24, global fetch). Deterministic: the same input
// always produces byte-identical output, so the generated seed.sql is a
// reviewable, committed artifact. Re-run only to refresh against upstream.
//
//   node supabase/scripts/generate-seed.mjs
//
// Pipeline: fetch -> filter to GB -> merge rows sharing a name (union domains)
// -> lowercase/dedupe/sort domains -> slugify with collision suffixes ->
// emit idempotent `insert ... on conflict (slug) do nothing`.

/* global fetch, process */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'seed.sql');

/** Escape a string for a single-quoted SQL literal. */
const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

/**
 * Slugify a university name: lowercase ASCII, non-alphanumerics collapsed to a
 * single hyphen, no leading/trailing hyphens.
 */
function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Unexpected dataset shape: expected a JSON array');
  }

  // Merge entries sharing a name; union their domains (a university can appear
  // multiple times with different verification domains).
  const byName = new Map();
  for (const row of rows) {
    if (row?.alpha_two_code !== 'GB') continue;
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

  // Deterministic order: sort by name (locale-independent) before slugging so
  // collision suffixes are stable across runs.
  const universities = [...byName.entries()]
    .map(([name, domainSet]) => ({ name, domains: [...domainSet].sort() }))
    .filter((u) => u.domains.length > 0)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Assign slugs, disambiguating collisions with a numeric suffix.
  const slugCounts = new Map();
  for (const uni of universities) {
    const base = slugify(uni.name) || 'university';
    const seen = slugCounts.get(base) ?? 0;
    uni.slug = seen === 0 ? base : `${base}-${seen + 1}`;
    slugCounts.set(base, seen + 1);
  }

  const header = [
    '-- ZetaLog UK university seed data. GENERATED FILE — do not edit by hand.',
    '-- Regenerate: node supabase/scripts/generate-seed.mjs',
    `-- Source: ${SOURCE_URL}`,
    `-- Universities: ${universities.length}`,
    '-- Idempotent: re-running is a no-op for existing slugs.',
    '',
  ].join('\n');

  const statements = universities.map((uni) => {
    const domains = uni.domains.map(sqlString).join(', ');
    return (
      `insert into public.universities (name, slug, domains) values (` +
      `${sqlString(uni.name)}, ${sqlString(uni.slug)}, array[${domains}]::text[]) ` +
      `on conflict (slug) do nothing;`
    );
  });

  const output = `${header}${statements.join('\n')}\n`;
  await writeFile(OUT_PATH, output, 'utf8');

  process.stderr.write(`Wrote ${universities.length} universities to ${OUT_PATH}\n`);
}

main().catch((error) => {
  process.stderr.write(`generate-seed failed: ${error.message}\n`);
  process.exitCode = 1;
});
