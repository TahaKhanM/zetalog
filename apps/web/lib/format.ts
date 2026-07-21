import { ZETAMAC_DEFAULT_SETTINGS, fingerprint } from '@zetalog/shared';

/**
 * Presentation helpers for the dashboard and admin queue: human relative times
 * and a readable label for a settings fingerprint. Pure — the clock is passed
 * in so output is deterministic.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const absoluteDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function ago(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * A relative time like "just now", "5 minutes ago", "3 days ago", falling back
 * to an absolute UTC date ("20 Jun 2026") beyond a week. Future timestamps read
 * as "just now" so clock skew never shows a negative age.
 */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const diff = nowMs - Date.parse(iso);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return ago(Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return ago(Math.floor(diff / HOUR), 'hour');
  if (diff < WEEK) return ago(Math.floor(diff / DAY), 'day');
  return absoluteDate.format(new Date(Date.parse(iso)));
}

/** The configured duration (seconds) encoded in a fingerprint, or null. */
export function parseDurationSeconds(fingerprintStr: string): number | null {
  const token = fingerprintStr.split('|').find((part) => part.startsWith('t:'));
  if (token === undefined) return null;
  const seconds = Number(token.slice(2));
  return Number.isFinite(seconds) ? seconds : null;
}

const OPERATION_SYMBOLS: readonly { prefix: string; disabled: string; symbol: string }[] = [
  { prefix: 'add:', disabled: 'add:off', symbol: '+' },
  { prefix: 'sub:', disabled: 'sub:off', symbol: '−' },
  { prefix: 'mul:', disabled: 'mul:off', symbol: '×' },
  { prefix: 'div:', disabled: 'div:off', symbol: '÷' },
];

/**
 * A short, human label for a settings fingerprint. Default Zetamac config reads
 * "Default · 120s"; anything else lists its enabled operation symbols and
 * duration, e.g. "+ − × ÷ · 45s".
 */
export function configLabel(fingerprintStr: string): string {
  const duration = parseDurationSeconds(fingerprintStr);
  const durationLabel = duration === null ? '?' : `${String(duration)}s`;

  if (
    duration !== null &&
    fingerprintStr === fingerprint({ ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: duration })
  ) {
    return `Default · ${durationLabel}`;
  }

  const parts = fingerprintStr.split('|');
  const symbols = OPERATION_SYMBOLS.filter(({ prefix, disabled }) => {
    const part = parts.find((candidate) => candidate.startsWith(prefix));
    return part !== undefined && part !== disabled;
  }).map(({ symbol }) => symbol);

  const operations = symbols.length > 0 ? symbols.join(' ') : 'Custom';
  return `${operations} · ${durationLabel}`;
}
