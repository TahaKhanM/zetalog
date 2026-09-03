import { describe, expect, it } from 'vitest';

import { domainSuffixes, extractDomain, findUniversityForEmail } from './uni';

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

describe('domainSuffixes', () => {
  it('lists the domain and every label-boundary suffix down to two labels', () => {
    expect(domainSuffixes('mail.med.harvard.edu')).toEqual([
      'mail.med.harvard.edu',
      'med.harvard.edu',
      'harvard.edu',
    ]);
    expect(domainSuffixes('umsystem.edu')).toEqual(['umsystem.edu']);
  });

  it('agrees with findUniversityForEmail: a registered domain matches iff it is a suffix', () => {
    const registered = ['harvard.edu', 'med.harvard.edu', 'notharvard.edu', 'ox.ac.uk'];
    const emailDomain = 'mail.med.harvard.edu';
    const viaSuffixes = registered.filter((r) => domainSuffixes(emailDomain).includes(r));
    const viaMatcher = registered.filter(
      (r) => findUniversityForEmail(`a@${emailDomain}`, [{ domains: [r] }]) !== null,
    );
    expect(viaSuffixes).toEqual(viaMatcher);
    expect(viaSuffixes).toEqual(['harvard.edu', 'med.harvard.edu']);
  });

  it('falls back to the bare domain when it has a single label', () => {
    expect(domainSuffixes('localhost')).toEqual(['localhost']);
  });
});

describe('findUniversityForEmail', () => {
  const universities = [
    { id: 'ox', domains: ['ox.ac.uk'] },
    { id: 'imperial', domains: ['imperial.ac.uk', 'ic.ac.uk'] },
    { id: 'harvard', domains: ['harvard.edu'] },
    { id: 'harvard-med', domains: ['med.harvard.edu'] },
  ];

  it('matches an exact domain case-insensitively', () => {
    expect(findUniversityForEmail('student@OX.AC.UK', universities)?.id).toBe('ox');
  });

  it('matches any of a university’s domains', () => {
    expect(findUniversityForEmail('student@ic.ac.uk', universities)?.id).toBe('imperial');
  });

  it('matches a subdomain at a label boundary', () => {
    expect(findUniversityForEmail('student@cs.ox.ac.uk', universities)?.id).toBe('ox');
    expect(findUniversityForEmail('student@college.harvard.edu', universities)?.id).toBe('harvard');
  });

  it('does not match a lookalike that merely ends with the registered labels', () => {
    expect(findUniversityForEmail('student@notox.ac.uk', universities)).toBeNull();
    expect(findUniversityForEmail('student@ox.ac.uk.evil.example', universities)).toBeNull();
  });

  it('prefers the longest (most specific) registered domain when several match', () => {
    expect(findUniversityForEmail('student@med.harvard.edu', universities)?.id).toBe('harvard-med');
    expect(findUniversityForEmail('student@mail.med.harvard.edu', universities)?.id).toBe(
      'harvard-med',
    );
    expect(findUniversityForEmail('student@fas.harvard.edu', universities)?.id).toBe('harvard');
  });

  it('compares registered domains case-insensitively', () => {
    const mixed = [{ id: 'mit', domains: ['MIT.EDU'] }];
    expect(findUniversityForEmail('student@mit.edu', mixed)?.id).toBe('mit');
    expect(findUniversityForEmail('student@CS.MIT.EDU', mixed)?.id).toBe('mit');
  });

  it('returns null for an unknown domain or malformed address', () => {
    expect(findUniversityForEmail('student@cam.ac.uk', universities)).toBeNull();
    expect(findUniversityForEmail('malformed', universities)).toBeNull();
  });
});
