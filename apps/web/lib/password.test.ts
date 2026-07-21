import { describe, expect, it } from 'vitest';

import { COMMON_PASSWORDS, MIN_PASSWORD_LENGTH, checkPassword, passwordStrength } from './password';

describe('checkPassword', () => {
  it('rejects passwords shorter than the 8-character minimum', () => {
    expect(checkPassword('short')).toEqual({ ok: false, reason: 'too-short' });
    expect(checkPassword('1234567')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('accepts a password of exactly the minimum length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(checkPassword('kV3&mzq!')).toEqual({ ok: true });
  });

  it('rejects entries from the embedded common-password list', () => {
    expect(checkPassword('password')).toEqual({ ok: false, reason: 'common' });
    expect(checkPassword('12345678')).toEqual({ ok: false, reason: 'common' });
    expect(checkPassword('qwertyuiop')).toEqual({ ok: false, reason: 'common' });
    expect(checkPassword('password123')).toEqual({ ok: false, reason: 'common' });
  });

  it('matches the common list case-insensitively', () => {
    expect(checkPassword('Password123')).toEqual({ ok: false, reason: 'common' });
    expect(checkPassword('QWERTYUIOP')).toEqual({ ok: false, reason: 'common' });
  });

  it('checks length before the common list (short common entries stay too-short)', () => {
    // '1234567' is famously common but under 8 chars — length is the first gate.
    expect(checkPassword('1234567')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('accepts long uncommon passphrases', () => {
    expect(checkPassword('correct horse battery staple')).toEqual({ ok: true });
  });
});

describe('COMMON_PASSWORDS', () => {
  it('only carries entries the length gate cannot already reject', () => {
    for (const entry of COMMON_PASSWORDS) {
      expect(entry.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it('is stored lowercase so the case-insensitive lookup works', () => {
    for (const entry of COMMON_PASSWORDS) {
      expect(entry).toBe(entry.toLowerCase());
    }
  });
});

describe('passwordStrength', () => {
  it('scores 0 with the policy failure for a too-short password', () => {
    expect(passwordStrength('short')).toEqual({ score: 0, label: 'Too short' });
  });

  it('scores 0 for a common password', () => {
    expect(passwordStrength('password123')).toEqual({ score: 0, label: 'Too common' });
  });

  it('scores 1 (fair) for a minimal passing password', () => {
    expect(passwordStrength('abcdefghij')).toEqual({ score: 1, label: 'Fair' });
  });

  it('scores 2 (good) for a longer or more varied password', () => {
    expect(passwordStrength('abcdefghijklmn')).toEqual({ score: 2, label: 'Good' });
    expect(passwordStrength('Abcdef9!hijk')).toEqual({ score: 2, label: 'Good' });
  });

  it('scores 3 (strong) for a long, varied password', () => {
    expect(passwordStrength('Tr0ub4dor&3 horse staple')).toEqual({ score: 3, label: 'Strong' });
  });

  it('never returns a score above 3', () => {
    expect(passwordStrength('aVeryLong&Complicated9Passphrase!WithEverything').score).toBe(3);
  });
});
