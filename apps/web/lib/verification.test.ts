import { describe, expect, it, vi } from 'vitest';

import { sha256Hex } from './hash';
import {
  CODE_TTL_MS,
  MAX_VERIFICATION_ATTEMPTS,
  expiresAtMs,
  generateCode,
  hashCode,
  verifyCode,
} from './verification';

describe('generateCode', () => {
  it('draws from the full 000000–999999 space and zero-pads', () => {
    expect(generateCode(() => 0)).toBe('000000');
    expect(generateCode(() => 42)).toBe('000042');
    expect(generateCode(() => 999999)).toBe('999999');
  });

  it('requests exactly one million possible codes from the random source', () => {
    const random = vi.fn(() => 7);
    generateCode(random);
    expect(random).toHaveBeenCalledWith(1_000_000);
  });
});

describe('hashCode', () => {
  it('stores only the SHA-256 of the code, never the code', () => {
    expect(hashCode('123456')).toBe(sha256Hex('123456'));
  });
});

describe('expiresAtMs', () => {
  it('adds the 15-minute TTL to the issue time', () => {
    expect(expiresAtMs(1_000)).toBe(1_000 + CODE_TTL_MS);
    expect(CODE_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe('verifyCode', () => {
  const code = '246810';
  const base = {
    submittedCode: code,
    storedHash: hashCode(code),
    expiresAtMs: 10_000,
    attempts: 0,
    nowMs: 5_000,
  };

  it('accepts the correct code before expiry', () => {
    expect(verifyCode(base)).toEqual({ status: 'ok' });
  });

  it('rejects a wrong code and reports the attempts remaining', () => {
    expect(verifyCode({ ...base, submittedCode: '000000' })).toEqual({
      status: 'incorrect',
      attemptsRemaining: MAX_VERIFICATION_ATTEMPTS - 1,
    });
  });

  it('never reports negative attempts remaining on the final wrong try', () => {
    expect(
      verifyCode({ ...base, submittedCode: '000000', attempts: MAX_VERIFICATION_ATTEMPTS - 1 }),
    ).toEqual({ status: 'incorrect', attemptsRemaining: 0 });
  });

  it('reports expiry once now passes expires_at, even for the correct code', () => {
    expect(verifyCode({ ...base, nowMs: 10_001 })).toEqual({ status: 'expired' });
  });

  it('locks out once the attempt cap is reached', () => {
    expect(verifyCode({ ...base, attempts: MAX_VERIFICATION_ATTEMPTS })).toEqual({
      status: 'locked',
    });
  });

  it('treats expiry as taking precedence over a full attempt count', () => {
    expect(verifyCode({ ...base, nowMs: 10_001, attempts: MAX_VERIFICATION_ATTEMPTS })).toEqual({
      status: 'expired',
    });
  });
});
