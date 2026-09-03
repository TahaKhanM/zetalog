import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  COUNTRY_ORDER,
  assertSlugStability,
  mergeSwot,
  normalizeName,
  parseSeedPairs,
  renderSeedSql,
  slugify,
  swotEduDomains,
  tarFiles,
  universitiesFromDataset,
} from './generate-seed.mjs';

test('assigns GB slugs before US so existing GB slugs stay stable', () => {
  assert.deepEqual([...COUNTRY_ORDER], ['GB', 'US']);
});

test('slugify lowercases, strips diacritics, and collapses non-alphanumerics', () => {
  assert.equal(slugify("King's College London"), 'king-s-college-london');
  assert.equal(slugify('  University of York  '), 'university-of-york');
});

const fixture = [
  { name: 'University of York', alpha_two_code: 'GB', domains: ['york.ac.uk'] },
  { name: 'University of York', alpha_two_code: 'US', domains: ['york.edu'] },
  { name: 'Massachusetts Institute of Technology', alpha_two_code: 'US', domains: ['MIT.EDU'] },
  { name: 'Open University', alpha_two_code: 'GB', domains: ['open.ac.uk', 'ou.ac.uk'] },
  { name: 'Open University', alpha_two_code: 'GB', domains: ['open.ac.uk'] },
  { name: 'Ignored', alpha_two_code: 'FR', domains: ['ignored.fr'] },
];

test('merges same-name rows within a country and ignores other countries', () => {
  const unis = universitiesFromDataset(fixture);
  assert.equal(unis.length, 4);
  assert.deepEqual(
    unis.map((u) => ({ name: u.name, country: u.country, slug: u.slug, domains: u.domains })),
    [
      {
        name: 'Open University',
        country: 'GB',
        slug: 'open-university',
        domains: ['open.ac.uk', 'ou.ac.uk'],
      },
      {
        name: 'University of York',
        country: 'GB',
        slug: 'university-of-york',
        domains: ['york.ac.uk'],
      },
      {
        name: 'Massachusetts Institute of Technology',
        country: 'US',
        slug: 'massachusetts-institute-of-technology',
        domains: ['mit.edu'],
      },
      {
        name: 'University of York',
        country: 'US',
        slug: 'university-of-york-2',
        domains: ['york.edu'],
      },
    ],
  );
});

test('a US name that slugifies to an existing GB slug does not steal it', () => {
  const previous = renderSeedSql([
    {
      name: 'University of York',
      slug: 'university-of-york',
      domains: ['york.ac.uk'],
      country: 'GB',
    },
  ]);
  const next = universitiesFromDataset(fixture);
  assert.equal(
    next.find((u) => u.country === 'GB' && u.name === 'University of York')?.slug,
    'university-of-york',
  );
  assert.doesNotThrow(() => assertSlugStability(previous, next));
});

test('assertSlugStability fails loudly when a committed slug is remapped', () => {
  const previous = [
    "insert into public.universities (name, slug, domains) values ('University of York', 'university-of-york', array['york.ac.uk']::text[]) on conflict (slug) do nothing;",
  ].join('\n');
  assert.throws(
    () =>
      assertSlugStability(previous, [
        {
          name: 'York College (US)',
          slug: 'university-of-york',
          domains: ['york.edu'],
          country: 'US',
        },
      ]),
    /university-of-york/,
  );
});

test('a name that slugifies to nothing falls back to the primary domain', () => {
  const unis = universitiesFromDataset(
    [
      {
        alpha_two_code: 'US',
        name: '成均館大学校',
        domains: ['skku.edu'],
      },
    ],
    new Map(),
  );
  assert.equal(unis[0]?.slug, 'skku-edu');
});

test('normalizeName collapses punctuation and diacritics for cross-dataset identity', () => {
  assert.equal(
    normalizeName('University of Massachusetts—Amherst'),
    normalizeName('University of Massachusetts Amherst'),
  );
  assert.equal(normalizeName("King's College"), 'king s college');
});

/** Build a minimal ustar archive for parser tests. */
function tarOf(files) {
  const blocks = [];
  for (const [path, content] of files) {
    const header = Buffer.alloc(512);
    header.write(path, 0, 'utf8');
    const body = Buffer.from(content, 'utf8');
    header.write(body.length.toString(8).padStart(11, '0'), 124, 'utf8');
    header[156] = '0'.charCodeAt(0);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

test('swotEduDomains maps reversed paths to .edu domains with one name per line', () => {
  const tar = tarOf([
    ['swot-master/lib/domains/edu/harvard.txt', 'Harvard University\n'],
    ['swot-master/lib/domains/edu/harvard/college.txt', 'Harvard College\n'],
    [
      'swot-master/lib/domains/edu/cuny.txt',
      'CUNY Hunter\nCity University of New York (CUNY) System\n',
    ],
    ['swot-master/lib/domains/uk/ac/ox.txt', 'University of Oxford\n'],
    ['swot-master/README.md', 'not a domain'],
  ]);
  const domains = swotEduDomains(tar);
  assert.deepEqual([...domains.entries()].sort(), [
    ['college.harvard.edu', ['Harvard College']],
    ['cuny.edu', ['CUNY Hunter', 'City University of New York (CUNY) System']],
    ['harvard.edu', ['Harvard University']],
  ]);
  assert.equal([...tarFiles(tar)].length, 5);
});

test('swotEduDomains drops URL/domain/email junk lines and empty files', () => {
  const tar = tarOf([
    [
      'swot-master/lib/domains/edu/nscc.txt',
      'Nashville State Community College\nhttps://www.nscc.edu\n',
    ],
    ['swot-master/lib/domains/edu/ssc.txt', 'South Suburban College\nssc.edu\nadmin@ssc.edu\n'],
    ['swot-master/lib/domains/edu/scit.txt', 'https://www.scit.edu/\n'],
    ['swot-master/lib/domains/edu/esade.txt', 'ESADE\n'],
  ]);
  const domains = swotEduDomains(tar);
  assert.deepEqual([...domains.entries()].sort(), [
    ['esade.edu', ['ESADE']],
    ['nscc.edu', ['Nashville State Community College']],
    ['ssc.edu', ['South Suburban College']],
  ]);
});

test('mergeSwot skips covered domains, attaches by name, and adds system entries', () => {
  const base = [
    {
      name: 'University of Oxford',
      country: 'GB',
      domains: ['ox.ac.uk'],
      slug: 'university-of-oxford',
    },
    {
      name: 'Harvard University',
      country: 'US',
      domains: ['harvard.edu'],
      slug: 'harvard-university',
    },
    {
      name: 'University of Missouri',
      country: 'US',
      domains: ['missouri.edu'],
      slug: 'university-of-missouri',
    },
  ];
  const swot = new Map([
    ['college.harvard.edu', ['Harvard University']], // suffix-covered -> skip
    ['umsystem.edu', ['University of Missouri']], // name match -> attach
    ['alaska.edu', ['University of Alaska - Anchorage', 'University of Alaska (System)']],
    ['brevard.edu', ['Brevard College']],
    ['students.brevard.edu', ['Brevard College']], // covered once brevard.edu lands
  ]);
  const { merged, added } = mergeSwot(base, swot);

  assert.deepEqual(merged.find((u) => u.slug === 'university-of-missouri')?.domains, [
    'missouri.edu',
    'umsystem.edu',
  ]);
  assert.deepEqual(merged.find((u) => u.slug === 'harvard-university')?.domains, ['harvard.edu']);
  assert.deepEqual(added, [
    { name: 'Brevard College', country: 'US', domains: ['brevard.edu'] },
    { name: 'University of Alaska (System)', country: 'US', domains: ['alaska.edu'] },
  ]);
});

test('universitiesFromDataset slugs swot additions after both country passes', () => {
  const swot = new Map([['york.edu', ['University of York']]]);
  const unis = universitiesFromDataset(fixture, swot);
  // Hipo US "University of York" already owns york.edu -> covered, no third entry.
  assert.equal(unis.filter((u) => u.name === 'University of York').length, 2);

  const fresh = universitiesFromDataset(
    fixture.filter((r) => r.alpha_two_code !== 'US'),
    new Map([['york.edu', ['University of York']]]),
  );
  // The GB school keeps its slug; the swot addition gets the collision suffix.
  assert.equal(
    fresh.find((u) => u.country === 'GB' && u.name === 'University of York')?.slug,
    'university-of-york',
  );
  assert.equal(fresh.find((u) => u.country === 'US')?.slug, 'university-of-york-2');
});

test('renderSeedSql upserts so re-seeding refreshes domains in place', () => {
  const sql = renderSeedSql([
    {
      name: 'Harvard University',
      slug: 'harvard-university',
      domains: ['harvard.edu'],
      country: 'US',
    },
  ]);
  assert.match(
    sql,
    /on conflict \(slug\) do update set name = excluded\.name, domains = excluded\.domains, country = excluded\.country;/,
  );
});

test('assertSlugStability warns (not throws) when a committed slug leaves the seed', () => {
  const previous = renderSeedSql([
    { name: 'Gone University', slug: 'gone-university', domains: ['gone.edu'], country: 'US' },
  ]);
  let warned = '';
  assert.doesNotThrow(() =>
    assertSlugStability(previous, [], (message) => {
      warned = message;
    }),
  );
  assert.match(warned, /gone-university/);
});

test('parseSeedPairs unescapes SQL quotes in both insert shapes', () => {
  const sql = `
insert into public.universities (name, slug, domains) values ('City St George''s, University of London', 'city-st-george-s-university-of-london', array['citystgeorges.ac.uk']::text[]) on conflict (slug) do nothing;
insert into public.universities (name, slug, domains, country) values ('Harvard University', 'harvard-university', array['harvard.edu']::text[], 'US') on conflict (slug) do nothing;
`;
  assert.deepEqual(
    [...parseSeedPairs(sql).entries()],
    [
      ['city-st-george-s-university-of-london', "City St George's, University of London"],
      ['harvard-university', 'Harvard University'],
    ],
  );
});
