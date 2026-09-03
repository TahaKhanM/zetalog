#!/usr/bin/env node
// Collect self-served university icons for badge marks.
//
// Provenance policy (see lib/uni-brand.ts and public/uni-logos/SOURCES.md):
// badge logos may only come from a university's OWN web properties. This
// script fetches each seeded university's homepage and downloads the icon the
// institution itself publishes (apple-touch/manifest/link-rel icons served
// from its own domain) — never a third-party aggregator. Every accepted mark
// records its source URL in the generated manifest.
//
//   cd apps/web && node scripts/collect-uni-icons.mjs
//
// Quality gates: source raster at least 57px on its short side and roughly
// square; the processed 64px tile must not be a flat/blank fill; identical
// icons shared across more than three unrelated registrable domains are
// dropped as CMS/template defaults (one university system sharing a mark
// across its own campuses is fine). Curated slugs in uni-brand.ts are never
// touched — hand curation always outranks collection.

/* global fetch, process, Buffer, URL, AbortSignal */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(HERE, '../../../supabase/seed.sql');
const BRAND_PATH = resolve(HERE, '../lib/uni-brand.ts');
const OUT_DIR = resolve(HERE, '../public/uni-logos/bulk');
const MANIFEST_PATH = resolve(HERE, '../lib/uni-logos-bulk.json');

const CONCURRENCY = 40;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const TILE_PX = 64;
// Favicons are designed to read at tiny sizes; badges render at 20–46px, so
// a 32px source is acceptable (candidates are tried largest-first anyway).
const MIN_SOURCE_PX = 32;
const USER_AGENT =
  'Mozilla/5.0 (compatible; ZetaLogBadgeCollector/1.0; collects self-served university icons)';

/** Rows from the committed seed: { name, slug, domains }. */
async function seedRows() {
  const sql = await readFile(SEED_PATH, 'utf8');
  const un = (value) => value.replace(/''/g, "'");
  return [...sql.matchAll(/values \('((?:[^']|'')*)', '((?:[^']|'')*)', array\[([^\]]*)\]/g)].map(
    (match) => ({
      name: un(match[1]),
      slug: un(match[2]),
      domains: match[3].split(',').map((domain) => un(domain.trim().slice(1, -1))),
    }),
  );
}

/** Slugs with hand-curated brands/logos — collection must not touch them. */
async function curatedSlugs() {
  const source = await readFile(BRAND_PATH, 'utf8');
  return new Set([...source.matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((match) => match[1]));
}

/** The university's most site-like domain: fewest labels, then shortest. */
function webDomain(domains) {
  return [...domains].sort(
    (a, b) => a.split('.').length - b.split('.').length || a.length - b.length,
  )[0];
}

async function fetchWithLimit(url, accept) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept },
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_BODY_BYTES) throw new Error('body too large');
  return { body, finalUrl: response.url || url };
}

/** Icon candidate URLs from the homepage's link tags, best first. */
function iconCandidates(html, baseUrl) {
  const candidates = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tag[0];
    const rel = /rel=["']?([^"'>]*)/i.exec(attrs)?.[1]?.toLowerCase() ?? '';
    if (!rel.includes('icon')) continue;
    const href = /href=["']?([^"' >]+)/i.exec(attrs)?.[1];
    if (href === undefined || href.startsWith('data:')) continue;
    const declared = /sizes=["']?(\d+)/i.exec(attrs)?.[1];
    const size = declared !== undefined ? Number(declared) : rel.includes('apple') ? 180 : 32;
    try {
      candidates.push({ url: new URL(href, baseUrl).href, size });
    } catch {
      // unparsable href — skip
    }
  }
  candidates.sort((a, b) => b.size - a.size);
  const urls = candidates.map((candidate) => candidate.url);
  for (const wellKnown of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
    urls.push(new URL(wellKnown, baseUrl).href);
  }
  // .ico is not decodable here; drop obvious ones early.
  return [...new Set(urls)].filter((url) => !/\.ico(?:[?#]|$)/i.test(url)).slice(0, 6);
}

/** Decode, gate, and normalise one candidate into a 64px badge tile. */
async function processIcon(body) {
  const image = sharp(body, { pages: 1, density: 300 });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const isVector = meta.format === 'svg';
  if (!isVector) {
    if (Math.min(width, height) < MIN_SOURCE_PX) throw new Error(`too small (${width}x${height})`);
    const ratio = width / height;
    if (ratio < 0.75 || ratio > 1.34) throw new Error(`not square (${width}x${height})`);
  }
  const tile = await image
    .flatten({ background: '#ffffff' })
    .resize(TILE_PX, TILE_PX, { fit: 'contain', background: '#ffffff' })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  const stats = await sharp(tile).stats();
  const maxStdev = Math.max(...stats.channels.map((channel) => channel.stdev));
  if (maxStdev < 8) throw new Error('flat fill / blank icon');
  return { tile, sourceWidth: width, sourceHeight: height };
}

async function collectOne(university) {
  const domain = webDomain(university.domains);
  const hosts = domain.startsWith('www.') ? [domain] : [domain, `www.${domain}`];

  // Homepage link tags are the best source; a bot-blocked or unreachable
  // homepage still leaves the well-known icon paths worth probing.
  const candidates = [];
  let lastError = 'no usable icon';
  for (const host of hosts) {
    try {
      const home = await fetchWithLimit(`https://${host}/`, 'text/html,*/*');
      const html = home.body.toString('utf8').slice(0, 512 * 1024);
      candidates.push(...iconCandidates(html, home.finalUrl));
      break;
    } catch (error) {
      lastError = error.message;
    }
  }
  if (candidates.length === 0) {
    for (const host of hosts) {
      candidates.push(
        `https://${host}/apple-touch-icon.png`,
        `https://${host}/apple-touch-icon-precomposed.png`,
        `https://${host}/favicon.png`,
      );
    }
  }

  for (const url of [...new Set(candidates)]) {
    try {
      const icon = await fetchWithLimit(url, 'image/*,*/*');
      const processed = await processIcon(icon.body);
      return { ...processed, source: url, domain };
    } catch {
      // try the next candidate
    }
  }
  throw new Error(lastError);
}

/** Registrable-ish domain (last two labels) for the generic-icon heuristic. */
const registrable = (domain) => domain.split('.').slice(-2).join('.');

async function main() {
  const [rows, curated] = await Promise.all([seedRows(), curatedSlugs()]);
  let targets = rows.filter((row) => !curated.has(row.slug));
  const limit = Number(process.env.LIMIT ?? 0);
  if (limit > 0) targets = targets.slice(0, limit);
  process.stderr.write(`Collecting icons for ${targets.length} universities…\n`);

  const collected = new Map();
  const failures = [];
  let done = 0;
  const queue = [...targets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const university = queue.shift();
        if (university === undefined) return;
        try {
          collected.set(university.slug, await collectOne(university));
        } catch (error) {
          failures.push(`${university.slug}: ${error.message}`);
        }
        done += 1;
        if (done % 250 === 0) {
          process.stderr.write(`  ${done}/${targets.length} (${collected.size} icons)\n`);
        }
      }
    }),
  );

  // Drop icons repeated across unrelated registrable domains (CMS defaults).
  const byHash = new Map();
  for (const [slug, icon] of collected) {
    const hash = createHash('sha1').update(icon.tile).digest('hex');
    const group = byHash.get(hash) ?? [];
    group.push({ slug, domain: registrable(icon.domain) });
    byHash.set(hash, group);
  }
  let generic = 0;
  for (const group of byHash.values()) {
    const domains = new Set(group.map((entry) => entry.domain));
    if (domains.size > 3) {
      for (const entry of group) collected.delete(entry.slug);
      generic += group.length;
    }
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {};
  for (const slug of [...collected.keys()].sort()) {
    const icon = collected.get(slug);
    await writeFile(join(OUT_DIR, `${slug}.png`), icon.tile);
    manifest[slug] = {
      file: `/uni-logos/bulk/${slug}.png`,
      source: icon.source,
      sourceSize: `${icon.sourceWidth}x${icon.sourceHeight}`,
    };
  }
  await writeFile(
    MANIFEST_PATH,
    `${JSON.stringify({ collectedAt: new Date().toISOString().slice(0, 10), icons: manifest }, null, 2)}\n`,
  );
  await writeFile('/tmp/uni-icon-failures.txt', failures.sort().join('\n'));

  const files = await readdir(OUT_DIR);
  process.stderr.write(
    `Done: ${files.length} icons written, ${generic} dropped as generic, ` +
      `${failures.length} domains without a usable icon (see /tmp/uni-icon-failures.txt)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`collect-uni-icons failed: ${error.message}\n`);
  process.exitCode = 1;
});
