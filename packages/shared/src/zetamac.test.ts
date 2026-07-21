import { describe, expect, it } from 'vitest';

import { ZETAMAC_DEFAULT_SETTINGS, fingerprint, rankableDuration } from './zetamac';

describe('fingerprint', () => {
  it('is stable for identical settings', () => {
    expect(fingerprint(ZETAMAC_DEFAULT_SETTINGS)).toBe(
      fingerprint({ ...ZETAMAC_DEFAULT_SETTINGS }),
    );
  });

  it('distinguishes changed ranges', () => {
    const custom = { ...ZETAMAC_DEFAULT_SETTINGS, mulLeft: { min: 2, max: 20 } };
    expect(fingerprint(custom)).not.toBe(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
  });

  it('collapses ranges of disabled operations', () => {
    const a = { ...ZETAMAC_DEFAULT_SETTINGS, addEnabled: false, addLeft: { min: 1, max: 5 } };
    const b = { ...ZETAMAC_DEFAULT_SETTINGS, addEnabled: false, addLeft: { min: 9, max: 99 } };
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('distinguishes a disabled subtraction flag', () => {
    const disabled = { ...ZETAMAC_DEFAULT_SETTINGS, subEnabled: false };
    expect(fingerprint(disabled)).not.toBe(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
  });

  it('distinguishes a disabled multiplication flag', () => {
    const disabled = { ...ZETAMAC_DEFAULT_SETTINGS, mulEnabled: false };
    expect(fingerprint(disabled)).not.toBe(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
  });

  it('distinguishes durations', () => {
    const short = { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 30 };
    expect(fingerprint(short)).not.toBe(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
  });
});

describe('rankableDuration', () => {
  it('returns 120 for untouched defaults', () => {
    expect(rankableDuration(ZETAMAC_DEFAULT_SETTINGS)).toBe(120);
  });

  it.each([30, 60] as const)('returns %d for default ranges at that duration', (duration) => {
    expect(rankableDuration({ ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: duration })).toBe(
      duration,
    );
  });

  it('returns null for a non-rankable duration', () => {
    expect(rankableDuration({ ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 300 })).toBeNull();
  });

  it('returns null when a range is customised', () => {
    const custom = { ...ZETAMAC_DEFAULT_SETTINGS, addLeft: { min: 2, max: 12 } };
    expect(rankableDuration(custom)).toBeNull();
  });

  it('returns null when an operation is disabled', () => {
    expect(rankableDuration({ ...ZETAMAC_DEFAULT_SETTINGS, divEnabled: false })).toBeNull();
  });
});
