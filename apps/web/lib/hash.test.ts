import { describe, expect, it } from 'vitest';

import { sha256Hex, timingSafeEqualHex } from './hash';

describe('sha256Hex', () => {
  it('matches the known SHA-256 digest of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and 64 lowercase hex chars', () => {
    const digest = sha256Hex('verify@ox.ac.uk');
    expect(digest).toBe(sha256Hex('verify@ox.ac.uk'));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different digests for different inputs', () => {
    expect(sha256Hex('000000')).not.toBe(sha256Hex('000001'));
  });
});

describe('timingSafeEqualHex', () => {
  it('is true for identical hex strings', () => {
    expect(timingSafeEqualHex(sha256Hex('a'), sha256Hex('a'))).toBe(true);
  });

  it('is false for different hex strings of equal length', () => {
    expect(timingSafeEqualHex(sha256Hex('a'), sha256Hex('b'))).toBe(false);
  });

  it('is false (never throws) for different-length inputs', () => {
    expect(timingSafeEqualHex('abcd', 'abcdef')).toBe(false);
  });
});
