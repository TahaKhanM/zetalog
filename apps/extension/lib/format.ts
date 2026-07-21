const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Compact relative age of a past timestamp, e.g. "just now", "5m ago",
 * "2h ago", "3d ago", "1w ago". Future timestamps read as "just now" so
 * clock skew never surfaces a negative age in the popup.
 */
export function relativeTime(fromMs: number, nowMs: number): string {
  const diff = nowMs - fromMs;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${String(Math.floor(diff / MINUTE))}m ago`;
  if (diff < DAY) return `${String(Math.floor(diff / HOUR))}h ago`;
  if (diff < WEEK) return `${String(Math.floor(diff / DAY))}d ago`;
  return `${String(Math.floor(diff / WEEK))}w ago`;
}
