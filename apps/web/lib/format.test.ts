import { ZETAMAC_DEFAULT_SETTINGS, fingerprint } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { configLabel, formatRelativeTime, formatSolveMs, parseDurationSeconds } from './format';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('says "just now" within the last minute', () => {
    expect(formatRelativeTime(ago(5 * SECOND), NOW)).toBe('just now');
  });

  it('counts minutes with correct pluralisation', () => {
    expect(formatRelativeTime(ago(1 * MINUTE), NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(9 * MINUTE), NOW)).toBe('9 minutes ago');
  });

  it('counts hours', () => {
    expect(formatRelativeTime(ago(1 * HOUR), NOW)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(5 * HOUR), NOW)).toBe('5 hours ago');
  });

  it('counts days up to a week', () => {
    expect(formatRelativeTime(ago(1 * DAY), NOW)).toBe('1 day ago');
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6 days ago');
  });

  it('falls back to an absolute UTC date beyond a week', () => {
    expect(formatRelativeTime(ago(30 * DAY), NOW)).toBe('20 Jun 2026');
  });

  it('treats future timestamps as "just now" (clock skew safety)', () => {
    expect(formatRelativeTime(ago(-5 * MINUTE), NOW)).toBe('just now');
  });
});

describe('formatSolveMs', () => {
  it('renders solve times as seconds with one decimal', () => {
    expect(formatSolveMs(900)).toBe('0.9s');
    expect(formatSolveMs(2450)).toBe('2.5s');
  });

  it('drops the decimal at ten seconds and above', () => {
    expect(formatSolveMs(10_000)).toBe('10s');
    expect(formatSolveMs(12_800)).toBe('13s');
  });
});

describe('parseDurationSeconds', () => {
  it('reads the duration out of a fingerprint', () => {
    expect(parseDurationSeconds(fingerprint(ZETAMAC_DEFAULT_SETTINGS))).toBe(120);
  });

  it('returns null when there is no duration token', () => {
    expect(parseDurationSeconds('add:off|sub:off')).toBeNull();
  });
});

describe('configLabel', () => {
  it('labels the default configuration by duration', () => {
    expect(configLabel(fingerprint(ZETAMAC_DEFAULT_SETTINGS))).toBe('Default · 120s');
    expect(configLabel(fingerprint({ ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 30 }))).toBe(
      'Default · 30s',
    );
  });

  it('lists enabled operation symbols for a custom configuration', () => {
    const addOnly = fingerprint({
      ...ZETAMAC_DEFAULT_SETTINGS,
      subEnabled: false,
      mulEnabled: false,
      divEnabled: false,
      durationSeconds: 45,
    });
    expect(configLabel(addOnly)).toBe('+ · 45s');
  });

  it('shows every operation when all are enabled but ranges differ from default', () => {
    const wideAdd = fingerprint({
      ...ZETAMAC_DEFAULT_SETTINGS,
      addLeft: { min: 1, max: 9 },
    });
    expect(configLabel(wideAdd)).toBe('+ − × ÷ · 120s');
  });
});
