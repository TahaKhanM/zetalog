import type { OperandRange, ZetamacSettings } from './schemas';

/** Durations (seconds) whose default-config games rank on leaderboards. */
export const RANKABLE_DURATIONS = [30, 60, 120] as const;

/** One of the leaderboard-eligible game durations in seconds: 30, 60, or 120. */
export type RankableDuration = (typeof RANKABLE_DURATIONS)[number];

/**
 * The exact configuration Zetamac's settings form ships with.
 * Verified against https://arithmetic.zetamac.com/ on 2026-07-20; Plan 2's
 * recon task re-verifies against a saved DOM fixture.
 */
export const ZETAMAC_DEFAULT_SETTINGS: ZetamacSettings = {
  addEnabled: true,
  addLeft: { min: 2, max: 100 },
  addRight: { min: 2, max: 100 },
  subEnabled: true,
  mulEnabled: true,
  mulLeft: { min: 2, max: 12 },
  mulRight: { min: 2, max: 100 },
  divEnabled: true,
  durationSeconds: 120,
};

const range = (r: OperandRange): string => `${String(r.min)}-${String(r.max)}`;

/**
 * Canonical, human-readable key for a settings configuration. Games are
 * grouped by fingerprint in history and graphs. Ranges of disabled
 * operations do not contribute (Zetamac ignores them too).
 */
export function fingerprint(settings: ZetamacSettings): string {
  return [
    settings.addEnabled ? `add:${range(settings.addLeft)}x${range(settings.addRight)}` : 'add:off',
    settings.subEnabled ? 'sub:on' : 'sub:off',
    settings.mulEnabled ? `mul:${range(settings.mulLeft)}x${range(settings.mulRight)}` : 'mul:off',
    settings.divEnabled ? 'div:on' : 'div:off',
    `t:${String(settings.durationSeconds)}`,
  ].join('|');
}

/** Parse a `min-max` operand-range segment, or null if it is not well-formed. */
function parseRange(segment: string | undefined): OperandRange | null {
  if (segment === undefined) return null;
  const match = /^(\d+)-(\d+)$/.exec(segment);
  if (match === null) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  return min <= max ? { min, max } : null;
}

/**
 * Rebuild a {@link ZetamacSettings} from a {@link fingerprint} string. The
 * fingerprint captures every field that affects play and grouping — the ranges
 * of *disabled* operations are the only thing it drops, and those never matter
 * (Zetamac ignores them, so the reconstructed settings reproduce the same
 * fingerprint and the same label). Used to show a linked account's games in the
 * extension when only the stored fingerprint is available. Anything unparseable
 * falls back to the corresponding default, so the result is always valid.
 */
export function settingsFromFingerprint(key: string): ZetamacSettings {
  const segments = new Map<string, string>();
  for (const part of key.split('|')) {
    const colon = part.indexOf(':');
    if (colon > 0) segments.set(part.slice(0, colon), part.slice(colon + 1));
  }

  const parsePair = (
    value: string | undefined,
  ): { left: OperandRange; right: OperandRange } | null => {
    if (value === undefined || value === 'off') return null;
    const [leftText, rightText] = value.split('x');
    const left = parseRange(leftText);
    const right = parseRange(rightText);
    return left !== null && right !== null ? { left, right } : null;
  };

  const addPair = parsePair(segments.get('add'));
  const mulPair = parsePair(segments.get('mul'));
  const durationText = segments.get('t');
  const duration =
    durationText !== undefined && /^\d+$/.test(durationText) ? Number(durationText) : 0;

  return {
    addEnabled: addPair !== null,
    addLeft: addPair?.left ?? ZETAMAC_DEFAULT_SETTINGS.addLeft,
    addRight: addPair?.right ?? ZETAMAC_DEFAULT_SETTINGS.addRight,
    subEnabled: segments.get('sub') === 'on',
    mulEnabled: mulPair !== null,
    mulLeft: mulPair?.left ?? ZETAMAC_DEFAULT_SETTINGS.mulLeft,
    mulRight: mulPair?.right ?? ZETAMAC_DEFAULT_SETTINGS.mulRight,
    divEnabled: segments.get('div') === 'on',
    durationSeconds: duration > 0 ? duration : ZETAMAC_DEFAULT_SETTINGS.durationSeconds,
  };
}

/**
 * The leaderboard duration this game qualifies for, or null if any
 * operation/range differs from Zetamac defaults or the duration is not
 * 30/60/120.
 */
export function rankableDuration(settings: ZetamacSettings): RankableDuration | null {
  const atDefaultDuration = {
    ...settings,
    durationSeconds: ZETAMAC_DEFAULT_SETTINGS.durationSeconds,
  };
  if (fingerprint(atDefaultDuration) !== fingerprint(ZETAMAC_DEFAULT_SETTINGS)) return null;
  const matched = RANKABLE_DURATIONS.find((duration) => duration === settings.durationSeconds);
  return matched ?? null;
}
