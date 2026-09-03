import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTRY_ORDER,
  assertSlugStability,
  parseSeedPairs,
  renderSeedSql,
  slugify,
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
