import { describe, expect, it } from 'vitest';

import { matchFromRpcRows } from './auth-identifier';

const row = {
  user_id: '11111111-1111-4111-8111-111111111111',
  primary_email: 'owner@example.com',
  has_password: true,
  providers: ['email', 'google'],
  matched_by: 'primary',
};

describe('matchFromRpcRows', () => {
  it('maps a single row to an IdentifierMatch', () => {
    expect(matchFromRpcRows([row])).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      primaryEmail: 'owner@example.com',
      hasPassword: true,
      providers: ['email', 'google'],
      matchedBy: 'primary',
    });
  });

  it('maps an alias row', () => {
    expect(matchFromRpcRows([{ ...row, matched_by: 'alias', has_password: false }])).toEqual(
      expect.objectContaining({ matchedBy: 'alias', hasPassword: false }),
    );
  });

  it('returns null for an empty result set', () => {
    expect(matchFromRpcRows([])).toBeNull();
  });

  it('throws on malformed rows (boundary is zod-validated)', () => {
    expect(() => matchFromRpcRows([{ ...row, matched_by: 'weird' }])).toThrow();
    expect(() => matchFromRpcRows([{ ...row, user_id: 42 }])).toThrow();
    expect(() => matchFromRpcRows('nonsense')).toThrow();
  });
});
