#!/usr/bin/env node
// Generate supabase/seed.sql from two open datasets.
//
// Dependency-free (Node >= 24, global fetch). Deterministic: the same input
// always produces byte-identical output, so the generated seed.sql is a
// reviewable, committed artifact. Re-run only to refresh against upstream.
//
//   node supabase/scripts/generate-seed.mjs
//
// Sources:
//   1. Hipo world-universities dataset — GB and US institutions with domains.
//   2. JetBrains swot — the academic-domain registry education-discount
//      programmes verify student emails against. Its `.edu` tree fills the
//      Hipo gaps that lock real students out: system-wide mail domains
//      (umsystem.edu, alaska.edu, cuny.edu) and institutions Hipo omits.
//
// Pipeline: fetch -> Hipo GB then US (merge rows sharing a name within a
// country, union domains) -> slugify with collision suffixes (GB first, then
// US, continuing counters so committed slugs stay stable) -> merge swot .edu
// domains (skip ones the registry already covers via label-boundary suffix,
// attach to an existing US entry when the institution name matches, otherwise
// add a new entry) -> emit `insert ... on conflict (slug) do update`, so
// re-seeding refreshes existing rows' domains in place.

/* global fetch, process, Buffer */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const SOURCE_URL =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

export const SWOT_URL = 'https://codeload.github.com/JetBrains/swot/tar.gz/refs/heads/master';

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
    // Non-Latin names slugify to nothing; fall back to the primary domain so
    // legacy international .edu holders get a meaningful, collision-free slug.
    const base = slugify(uni.name) || slugify(uni.domains[0] ?? '') || 'university';
    const seen = slugCounts.get(base) ?? 0;
    const slug = seen === 0 ? base : `${base}-${seen + 1}`;
    slugCounts.set(base, seen + 1);
    return { ...uni, slug };
  });
}

/**
 * Name key for cross-dataset identity: diacritics stripped, lowercased,
 * punctuation collapsed to single spaces. "University of Massachusetts—Amherst"
 * and "University of Massachusetts Amherst" collide on purpose.
 */
export function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Minimal ustar reader for the swot tarball: yields `{ path, body }` for
 * regular files, honouring the ustar prefix field and GNU long-name entries.
 */
export function* tarFiles(tarBuffer) {
  let offset = 0;
  let longName = null;
  while (offset + 512 <= tarBuffer.length) {
    const block = tarBuffer.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) break;
    const readString = (start, length) => {
      const raw = block.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
    };
    const size = parseInt(readString(124, 12).trim(), 8) || 0;
    const type = String.fromCharCode(block[156] ?? 0);
    const prefix = readString(345, 155);
    const path =
      longName ?? (prefix === '' ? readString(0, 100) : `${prefix}/${readString(0, 100)}`);
    longName = null;
    const body = tarBuffer.subarray(offset + 512, offset + 512 + size);
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0+$/, '');
    } else if (type === '0' || type === '\0') {
      yield { path, body };
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}

/**
 * A swot line that is a URL, bare domain, or email address rather than an
 * institution name (contributor artifacts in a hand-edited dataset).
 */
const isJunkName = (line) => /^https?:\/\//i.test(line) || (!/\s/.test(line) && /[.@]/.test(line));

/**
 * The swot `.edu` registry: domain -> institution names. Paths under
 * `lib/domains/` encode the domain in reverse (`edu/harvard/college.txt` is
 * `college.harvard.edu`); each file lists one institution name per line
 * (system-wide domains list every campus). Files with no usable name are
 * skipped.
 */
export function swotEduDomains(tarBuffer) {
  const domains = new Map();
  for (const { path, body } of tarFiles(tarBuffer)) {
    const match = /^[^/]+\/lib\/domains\/(.+)\.txt$/.exec(path);
    if (match === null) continue;
    const domain = match[1].split('/').reverse().join('.').toLowerCase();
    if (!domain.endsWith('.edu')) continue;
    const names = body
      .toString('utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !isJunkName(line));
    if (names.length > 0) domains.set(domain, names);
  }
  return domains;
}

/** Sort key that visits parent domains before their subdomains. */
const reversedLabels = (domain) => domain.split('.').reverse().join('.');

/**
 * Fold swot `.edu` domains into the registry. A domain the registry already
 * matches (exactly or as a label-boundary suffix) is skipped; an uncovered
 * one attaches to the existing US entry whose name matches, or becomes a new
 * US entry. Multi-name files (whole university systems) prefer the name
 * containing "System" so a shared mail domain is not attributed to one
 * campus. Returns `{ merged, added }` without mutating the input.
 */
export function mergeSwot(universities, swotDomains) {
  const registered = new Set(universities.flatMap((uni) => uni.domains));
  const isCovered = (domain) => {
    const labels = domain.split('.');
    for (let start = 0; start < labels.length - 1; start += 1) {
      if (registered.has(labels.slice(start).join('.'))) return true;
    }
    return false;
  };

  const usNameByNorm = new Map();
  for (const uni of universities) {
    if (uni.country === 'US') usNameByNorm.set(normalizeName(uni.name), uni.name);
  }

  const attachments = new Map();
  const additions = new Map();
  const order = [...swotDomains.keys()].sort((a, b) =>
    reversedLabels(a) < reversedLabels(b) ? -1 : reversedLabels(a) > reversedLabels(b) ? 1 : 0,
  );
  for (const domain of order) {
    if (isCovered(domain)) continue;
    const names = swotDomains.get(domain) ?? [];
    const chosen = names.find((name) => /\bsystem\b/i.test(name)) ?? names[0];
    if (chosen === undefined) continue;
    const existingName = usNameByNorm.get(normalizeName(chosen));
    const bucket = existingName === undefined ? additions : attachments;
    const key = existingName ?? chosen;
    const set = bucket.get(key) ?? new Set();
    set.add(domain);
    bucket.set(key, set);
    registered.add(domain);
  }

  const merged = universities.map((uni) => {
    const extra = uni.country === 'US' ? attachments.get(uni.name) : undefined;
    return extra === undefined
      ? uni
      : { ...uni, domains: [...new Set([...uni.domains, ...extra])].sort() };
  });
  const added = [...additions.entries()]
    .map(([name, set]) => ({ name, country: 'US', domains: [...set].sort() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { merged, added };
}

/**
 * GB universities first (committed slugs), then US, continuing collision
 * counters; swot-only entries are slugged last so neither upstream can steal
 * a committed slug.
 */
export function universitiesFromDataset(rows, swotDomains = new Map()) {
  if (!Array.isArray(rows)) {
    throw new Error('Unexpected dataset shape: expected a JSON array');
  }
  const slugCounts = new Map();
  const all = [];
  for (const country of COUNTRY_ORDER) {
    all.push(...assignSlugs(mergeCountry(rows, country), slugCounts));
  }
  const { merged, added } = mergeSwot(all, swotDomains);
  return [...merged, ...assignSlugs(added, slugCounts)];
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
 * Fail loudly if any previously committed slug would be REMAPPED to a
 * different name: rows upsert on slug, so a stolen slug would silently
 * rewrite the existing university in production. A committed slug that
 * merely disappears from the regenerated seed (an upstream rename or a
 * domain migrating between sources) is only warned about — the production
 * row persists untouched, which is harmless.
 */
export function assertSlugStability(previousSql, universities, warn) {
  const previous = parseSeedPairs(previousSql);
  if (previous.size === 0 && /insert into public\.universities/i.test(previousSql)) {
    throw new Error('Slug stability check could not parse any (slug, name) pairs from seed.sql');
  }
  const next = new Map(universities.map((uni) => [uni.slug, uni.name]));
  const broken = [];
  const missing = [];
  for (const [slug, name] of previous) {
    const nextName = next.get(slug);
    if (nextName === undefined) missing.push(slug);
    else if (nextName !== name) {
      broken.push(`  ${slug}: committed ${JSON.stringify(name)}, got ${JSON.stringify(nextName)}`);
    }
  }
  if (broken.length > 0) {
    throw new Error(
      `Slug stability violated: committed (slug, name) pairs must be unchanged.\n${broken.join('\n')}`,
    );
  }
  if (missing.length > 0) {
    warn?.(
      `Note: ${missing.length} committed slug(s) left the regenerated seed (existing rows persist): ${missing.join(', ')}\n`,
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
    `-- Sources: ${sourceUrl}`,
    `--          ${SWOT_URL}`,
    `-- Universities: ${universities.length} (GB: ${gb}, US: ${us})`,
    '-- Idempotent: re-running refreshes existing slugs in place (upsert on slug).',
    '',
  ].join('\n');

  const statements = universities.map((uni) => {
    const domains = uni.domains.map(sqlString).join(', ');
    return (
      `insert into public.universities (name, slug, domains, country) values (` +
      `${sqlString(uni.name)}, ${sqlString(uni.slug)}, array[${domains}]::text[], ${sqlString(uni.country)}) ` +
      `on conflict (slug) do update set name = excluded.name, domains = excluded.domains, country = excluded.country;`
    );
  });

  return `${header}${statements.join('\n')}\n`;
}

export async function main() {
  const [datasetResponse, swotResponse] = await Promise.all([fetch(SOURCE_URL), fetch(SWOT_URL)]);
  if (!datasetResponse.ok) {
    throw new Error(`Fetch failed: ${datasetResponse.status} ${datasetResponse.statusText}`);
  }
  if (!swotResponse.ok) {
    throw new Error(`Swot fetch failed: ${swotResponse.status} ${swotResponse.statusText}`);
  }
  const rows = await datasetResponse.json();
  const swot = swotEduDomains(gunzipSync(Buffer.from(await swotResponse.arrayBuffer())));
  // A sudden collapse means the tarball layout changed — refuse to emit a
  // seed that would silently shrink coverage.
  if (swot.size < 2000) {
    throw new Error(`Swot parse suspicious: only ${swot.size} .edu domains found`);
  }
  const universities = universitiesFromDataset(rows, swot);

  let previous = '';
  try {
    previous = await readFile(OUT_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous.length > 0) {
    assertSlugStability(previous, universities, (message) => process.stderr.write(message));
  }

  const output = renderSeedSql(universities);
  await writeFile(OUT_PATH, output, 'utf8');

  const gb = universities.filter((uni) => uni.country === 'GB').length;
  const us = universities.filter((uni) => uni.country === 'US').length;
  const domainCount = universities.reduce((sum, uni) => sum + uni.domains.length, 0);
  process.stderr.write(
    `Wrote ${universities.length} universities (GB: ${gb}, US: ${us}; ${domainCount} domains) to ${OUT_PATH}\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`generate-seed failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
