import { describe, expect, it } from 'vitest';

import { extractDomain, findUniversityForEmail } from './uni';

describe('extractDomain', () => {
  it('lowercases the domain and ignores the local part', () => {
    expect(extractDomain('Ada.Lovelace@OX.AC.UK')).toBe('ox.ac.uk');
  });

  it('returns null when there is no single @', () => {
    expect(extractDomain('nope')).toBeNull();
    expect(extractDomain('a@b@c')).toBeNull();
  });

  it('returns null for an empty local part or domain', () => {
    expect(extractDomain('@ox.ac.uk')).toBeNull();
    expect(extractDomain('ada@')).toBeNull();
  });
});

describe('findUniversityForEmail', () => {
  const universities = [
    { id: 'ox', domains: ['ox.ac.uk'] },
    { id: 'imperial', domains: ['imperial.ac.uk', 'ic.ac.uk'] },
  ];

  it('matches an exact domain case-insensitively', () => {
    expect(findUniversityForEmail('student@OX.AC.UK', universities)?.id).toBe('ox');
  });

  it('matches any of a university’s domains', () => {
    expect(findUniversityForEmail('student@ic.ac.uk', universities)?.id).toBe('imperial');
  });

  it('does NOT match a subdomain of a registered domain', () => {
    expect(findUniversityForEmail('student@cs.ox.ac.uk', universities)).toBeNull();
  });

  it('does not match a domain that merely ends with a registered one', () => {
    expect(findUniversityForEmail('student@notox.ac.uk', universities)).toBeNull();
  });

  it('returns null for an unknown domain or malformed address', () => {
    expect(findUniversityForEmail('student@cam.ac.uk', universities)).toBeNull();
    expect(findUniversityForEmail('malformed', universities)).toBeNull();
  });
});
