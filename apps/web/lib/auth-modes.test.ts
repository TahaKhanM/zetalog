import { describe, expect, it } from 'vitest';

import {
  adjudicateAliasClaim,
  classifyLookup,
  lookupResponseSchema,
  type IdentifierMatch,
} from './auth-modes';

const base = {
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  primaryEmail: 'owner@example.com',
} as const;

function match(partial: Partial<IdentifierMatch>): IdentifierMatch {
  return { ...base, hasPassword: false, providers: ['email'], matchedBy: 'primary', ...partial };
}

describe('classifyLookup', () => {
  it('classifies an unknown address as signup', () => {
    expect(classifyLookup(null)).toEqual({ mode: 'signup' });
  });

  it('classifies an account with a password as signin', () => {
    expect(classifyLookup(match({ hasPassword: true }))).toEqual({ mode: 'signin' });
  });

  it('classifies a verified alias of a password account as signin', () => {
    expect(classifyLookup(match({ hasPassword: true, matchedBy: 'alias' }))).toEqual({
      mode: 'signin',
    });
  });

  it('classifies a passwordless OAuth account as oauth with the provider hint', () => {
    expect(classifyLookup(match({ providers: ['google'] }))).toEqual({
      mode: 'oauth',
      provider: 'google',
    });
    expect(classifyLookup(match({ providers: ['github'] }))).toEqual({
      mode: 'oauth',
      provider: 'github',
    });
  });

  it('prefers a supported provider hint when several OAuth identities exist', () => {
    expect(classifyLookup(match({ providers: ['discord', 'github'] }))).toEqual({
      mode: 'oauth',
      provider: 'github',
    });
  });

  it('ignores the email identity when hunting for the provider hint', () => {
    expect(classifyLookup(match({ providers: ['email', 'google'] }))).toEqual({
      mode: 'oauth',
      provider: 'google',
    });
  });

  it('an account with BOTH a password and OAuth identities is signin (password wins)', () => {
    expect(classifyLookup(match({ hasPassword: true, providers: ['email', 'google'] }))).toEqual({
      mode: 'signin',
    });
  });

  it('classifies a passwordless email-only account as set-password (OTP-era migration)', () => {
    expect(classifyLookup(match({ providers: ['email'] }))).toEqual({ mode: 'set-password' });
  });

  it('falls back to set-password when a passwordless account has no identities at all', () => {
    expect(classifyLookup(match({ providers: [] }))).toEqual({ mode: 'set-password' });
  });
});

describe('lookupResponseSchema', () => {
  it('accepts every mode the API can return', () => {
    expect(lookupResponseSchema.parse({ mode: 'signin' })).toEqual({ mode: 'signin' });
    expect(lookupResponseSchema.parse({ mode: 'signup' })).toEqual({ mode: 'signup' });
    expect(lookupResponseSchema.parse({ mode: 'set-password' })).toEqual({ mode: 'set-password' });
    expect(lookupResponseSchema.parse({ mode: 'oauth', provider: 'github' })).toEqual({
      mode: 'oauth',
      provider: 'github',
    });
  });

  it('rejects unknown modes and a missing provider on oauth', () => {
    expect(lookupResponseSchema.safeParse({ mode: 'magic' }).success).toBe(false);
    expect(lookupResponseSchema.safeParse({ mode: 'oauth' }).success).toBe(false);
  });
});

describe('adjudicateAliasClaim', () => {
  const requesterId = base.userId;
  const otherId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('allows a fresh, unclaimed address', () => {
    expect(adjudicateAliasClaim({ requesterId, match: null })).toBe('ok');
  });

  it("allows verifying the requester's own primary email", () => {
    expect(adjudicateAliasClaim({ requesterId, match: match({}) })).toBe('ok');
  });

  it("rejects another account's primary email", () => {
    expect(adjudicateAliasClaim({ requesterId, match: match({ userId: otherId }) })).toBe('taken');
  });

  it("rejects another user's verified alias", () => {
    expect(
      adjudicateAliasClaim({ requesterId, match: match({ userId: otherId, matchedBy: 'alias' }) }),
    ).toBe('taken');
  });

  it("reports the requester's own verified alias as already-verified", () => {
    expect(adjudicateAliasClaim({ requesterId, match: match({ matchedBy: 'alias' }) })).toBe(
      'already-verified',
    );
  });
});
