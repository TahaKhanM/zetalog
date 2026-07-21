import { describe, expect, it } from 'vitest';

import { relativeTime } from './format.js';

const NOW = 1_700_000_000_000;
const ago = (ms: number): string => relativeTime(NOW - ms, NOW);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('relativeTime', () => {
  it('reads as "just now" under a minute (including the boundary)', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59 * SECOND)).toBe('just now');
  });

  it('counts whole minutes up to an hour', () => {
    expect(ago(MINUTE)).toBe('1m ago');
    expect(ago(59 * MINUTE)).toBe('59m ago');
  });

  it('counts whole hours up to a day', () => {
    expect(ago(HOUR)).toBe('1h ago');
    expect(ago(23 * HOUR)).toBe('23h ago');
  });

  it('counts whole days up to a week', () => {
    expect(ago(DAY)).toBe('1d ago');
    expect(ago(6 * DAY)).toBe('6d ago');
  });

  it('counts whole weeks beyond that', () => {
    expect(ago(WEEK)).toBe('1w ago');
    expect(ago(3 * WEEK)).toBe('3w ago');
  });

  it('treats a future timestamp as "just now" rather than a negative age', () => {
    expect(relativeTime(NOW + HOUR, NOW)).toBe('just now');
  });
});
