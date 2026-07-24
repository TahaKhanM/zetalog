import {
  ZETAMAC_DEFAULT_SETTINGS,
  err,
  ok,
  zetamacSettingsSchema,
  type OperandRange,
  type Result,
  type ZetamacSettings,
} from '@zetalog/shared';
import { z } from 'zod';

/** Why a game page's embedded settings could not be turned into `ZetamacSettings`. */
export interface SettingsParseError {
  readonly reason: 'no-init-call' | 'malformed-json' | 'invalid-shape' | 'missing-ranges';
  /** Human-readable diagnostic, surfaced only in logs / `capture_failed` records. */
  readonly detail?: string;
}

/**
 * The flat object Zetamac passes to `init()`. Operation flags are required
 * booleans; every operand range and the duration are optional numbers
 * (Zetamac omits `duration` when it is the default 120). Unknown keys are
 * ignored — we only read what we understand.
 */
const rawSettingsSchema = z.object({
  add: z.boolean(),
  sub: z.boolean(),
  mul: z.boolean(),
  div: z.boolean(),
  add_left_min: z.number().optional(),
  add_left_max: z.number().optional(),
  add_right_min: z.number().optional(),
  add_right_max: z.number().optional(),
  mul_left_min: z.number().optional(),
  mul_left_max: z.number().optional(),
  mul_right_min: z.number().optional(),
  mul_right_max: z.number().optional(),
  duration: z.number().optional(),
});

type RawSettings = z.infer<typeof rawSettingsSchema>;

/** Matches `init({ ...flat object... })`; the settings object is never nested. */
const INIT_CALL_PATTERN = /init\(\s*(\{[^{}]*\})\s*\)/u;

/** Zetamac's default duration when the `duration` field is omitted. */
const DEFAULT_DURATION_SECONDS = 120;

function err_<T>(
  reason: SettingsParseError['reason'],
  detail?: string,
): Result<T, SettingsParseError> {
  return err(detail === undefined ? { reason } : { reason, detail });
}

/**
 * Resolve one operation's operand ranges. An enabled operation must carry all
 * four bounds (else `missing-ranges`); a disabled operation inherits the frozen
 * defaults so its fingerprint stays stable regardless of stale form values.
 */
function resolveRanges(
  enabled: boolean,
  bounds: {
    readonly leftMin: number | undefined;
    readonly leftMax: number | undefined;
    readonly rightMin: number | undefined;
    readonly rightMax: number | undefined;
  },
  defaults: { readonly left: OperandRange; readonly right: OperandRange },
): Result<{ readonly left: OperandRange; readonly right: OperandRange }, SettingsParseError> {
  if (!enabled) return ok(defaults);
  const { leftMin, leftMax, rightMin, rightMax } = bounds;
  if (
    leftMin === undefined ||
    leftMax === undefined ||
    rightMin === undefined ||
    rightMax === undefined
  ) {
    return err_('missing-ranges');
  }
  return ok({ left: { min: leftMin, max: leftMax }, right: { min: rightMin, max: rightMax } });
}

function toSettings(raw: RawSettings): Result<ZetamacSettings, SettingsParseError> {
  const add = resolveRanges(
    raw.add,
    {
      leftMin: raw.add_left_min,
      leftMax: raw.add_left_max,
      rightMin: raw.add_right_min,
      rightMax: raw.add_right_max,
    },
    { left: ZETAMAC_DEFAULT_SETTINGS.addLeft, right: ZETAMAC_DEFAULT_SETTINGS.addRight },
  );
  if (!add.ok) return add;

  const mul = resolveRanges(
    raw.mul,
    {
      leftMin: raw.mul_left_min,
      leftMax: raw.mul_left_max,
      rightMin: raw.mul_right_min,
      rightMax: raw.mul_right_max,
    },
    { left: ZETAMAC_DEFAULT_SETTINGS.mulLeft, right: ZETAMAC_DEFAULT_SETTINGS.mulRight },
  );
  if (!mul.ok) return mul;

  const candidate = {
    addEnabled: raw.add,
    addLeft: add.value.left,
    addRight: add.value.right,
    subEnabled: raw.sub,
    mulEnabled: raw.mul,
    mulLeft: mul.value.left,
    mulRight: mul.value.right,
    divEnabled: raw.div,
    durationSeconds: raw.duration ?? DEFAULT_DURATION_SECONDS,
  };

  const validated = zetamacSettingsSchema.safeParse(candidate);
  if (!validated.success) return err_('invalid-shape', validated.error.message);
  return ok(validated.data);
}

/**
 * Parse the settings a Zetamac game page embeds in its `init({...})` call.
 * Total function: every failure mode is a typed `Result` error, never a throw.
 */
export function parseGameSettings(scriptText: string): Result<ZetamacSettings, SettingsParseError> {
  const match = INIT_CALL_PATTERN.exec(scriptText);
  const json = match?.[1];
  if (json === undefined) return err_('no-init-call');

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    // JSON.parse only ever throws a SyntaxError; String() captures it without a dead branch.
    return err_('malformed-json', String(error));
  }

  const raw = rawSettingsSchema.safeParse(parsed);
  if (!raw.success) return err_('invalid-shape', raw.error.message);

  return toSettings(raw.data);
}
