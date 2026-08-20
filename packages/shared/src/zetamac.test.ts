import { describe, expect, it } from 'vitest';

import { zetamacSettingsSchema } from './schemas';
import {
  ZETAMAC_DEFAULT_SETTINGS,
  fingerprint,
  rankableDuration,
  settingsFromFingerprint,
} from './zetamac';

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

describe('settingsFromFingerprint', () => {
  it('round-trips the default settings exactly', () => {
    const restored = settingsFromFingerprint(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
    expect(restored).toEqual(ZETAMAC_DEFAULT_SETTINGS);
  });

  it.each([
    [
      'a custom multiplication range',
      { ...ZETAMAC_DEFAULT_SETTINGS, mulLeft: { min: 2, max: 20 } },
    ],
    ['a custom addition range', { ...ZETAMAC_DEFAULT_SETTINGS, addRight: { min: 1, max: 9 } }],
    ['a short duration', { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 30 }],
    ['disabled addition', { ...ZETAMAC_DEFAULT_SETTINGS, addEnabled: false }],
    ['disabled subtraction', { ...ZETAMAC_DEFAULT_SETTINGS, subEnabled: false }],
    ['disabled multiplication', { ...ZETAMAC_DEFAULT_SETTINGS, mulEnabled: false }],
    ['disabled division', { ...ZETAMAC_DEFAULT_SETTINGS, divEnabled: false }],
  ] as const)('reproduces the same fingerprint for %s', (_label, settings) => {
    const restored = settingsFromFingerprint(fingerprint(settings));
    expect(zetamacSettingsSchema.safeParse(restored).success).toBe(true);
    // The fingerprint is what groups games and drives the label, so an exact
    // fingerprint match means an exact reconstruction for display.
    expect(fingerprint(restored)).toBe(fingerprint(settings));
  });

  it('carries a disabled operation with default ranges', () => {
    const restored = settingsFromFingerprint(
      fingerprint({ ...ZETAMAC_DEFAULT_SETTINGS, addEnabled: false }),
    );
    expect(restored.addEnabled).toBe(false);
    expect(restored.addLeft).toEqual(ZETAMAC_DEFAULT_SETTINGS.addLeft);
    expect(restored.subEnabled).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['a segment with no colon', 'add|sub:on'],
    ['a colon-led segment', ':oops'],
    ['a range missing its second bound', 'add:2-100|sub:on|mul:off|div:on|t:120'],
    ['a malformed range', 'add:2-x2-100|sub:on|mul:off|div:on|t:120'],
    ['an inverted range', 'add:100-2x2-100|sub:on|mul:off|div:on|t:120'],
    ['a non-numeric duration', 'add:off|sub:on|mul:off|div:on|t:soon'],
    ['a zero duration', 'add:off|sub:on|mul:off|div:on|t:0'],
  ] as const)('falls back to valid settings for %s', (_label, key) => {
    const restored = settingsFromFingerprint(key);
    expect(zetamacSettingsSchema.safeParse(restored).success).toBe(true);
    expect(restored.durationSeconds).toBeGreaterThan(0);
  });

  it('defaults an unparseable duration to the standard 120s', () => {
    expect(settingsFromFingerprint('t:0').durationSeconds).toBe(120);
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
