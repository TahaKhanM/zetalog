# ZetaLog Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete pure domain core of ZetaLog in `packages/shared`: schemas, Zetamac settings fingerprinting, score recomputation from event streams, quarantine rules, and the validation pipeline that decides `accepted | quarantined | rejected`.

**Architecture:** Everything here is a pure function — no I/O, no clocks, no randomness (spec §11). The extension pre-flags locally with the same functions the server uses to judge authoritatively. Zod schemas define the wire format at every boundary.

**Tech Stack:** TypeScript 5.9 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), zod ^4.4.3, vitest ^4.1.10, fast-check ^4.9.0.

## Global Constraints

- Quality bar: spec §11. No `any`, no non-null assertions, no `@ts-expect-error` without an explanatory comment. Errors are values (`Result`), never silent catches.
- `pnpm verify` (format → lint zero-warnings → typecheck → test → build) must pass before **every** commit. Coverage thresholds in `packages/shared/vitest.config.ts` are 100% branches/functions/lines/statements — write code so every branch is genuinely reachable by a test (e.g. prefer guards hit by real inputs over unreachable `throw`/`?? fallback`).
- Mid-task, run a single test file without coverage: `pnpm --filter @zetalog/shared exec vitest run src/<file>.test.ts`. The full gate before commit: `pnpm verify`.
- All exported symbols carry TSDoc. Conventional Commits.
- Only two runtime/dev dependencies may be added by this plan: `zod@^4.4.3` (Task 1), `fast-check@^4.9.0` (Task 4). Nothing else.
- Zetamac default settings (verified against https://arithmetic.zetamac.com/ on 2026-07-20): addition `2–100` + `2–100`; multiplication `2–12` × `2–100`; subtraction/division are the reverses (no own ranges); all four operations enabled; durations offered 30/60/120/300/600 with 120 preselected. Rankable durations: 30, 60, 120.
- Quarantine constants (spec §3.2): restart when played < 80% of duration; outlier when ≥5 kept games on the fingerprint and score < 40% of the median of the last 10 kept.
- ESM with `.js` import specifiers (`moduleResolution: bundler`, `verbatimModuleSyntax`): import sibling modules as `./module.js`.

---

### Task 1: Wire-format schemas (`schemas.ts`)

**Files:**

- Modify: `packages/shared/package.json` (add `"dependencies": { "zod": "^4.4.3" }`)
- Create: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Interfaces:**

- Consumes: nothing (first domain module).
- Produces: `operandRangeSchema`, `zetamacSettingsSchema`, `gameEventSchema`, `gameRecordSchema` (zod schemas) and inferred types `OperandRange`, `ZetamacSettings`, `GameEvent`, `GameRecord`. Every later task imports these types from `./schemas.js`.

- [ ] **Step 1: Add zod and write the failing test**

Run: `pnpm --filter @zetalog/shared add zod@^4.4.3`

Create `packages/shared/src/schemas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { gameEventSchema, gameRecordSchema, zetamacSettingsSchema } from './schemas.js';

const defaultSettings = {
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

describe('zetamacSettingsSchema', () => {
  it('accepts the Zetamac default settings', () => {
    expect(zetamacSettingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
  });

  it('rejects an inverted operand range', () => {
    const inverted = { ...defaultSettings, addLeft: { min: 100, max: 2 } };
    expect(zetamacSettingsSchema.safeParse(inverted).success).toBe(false);
  });

  it('rejects a non-integer duration', () => {
    expect(
      zetamacSettingsSchema.safeParse({ ...defaultSettings, durationSeconds: 1.5 }).success,
    ).toBe(false);
  });
});

describe('gameEventSchema', () => {
  it.each([
    { kind: 'problem', at: 0, text: '2 + 2 = ' },
    { kind: 'key', at: 512.25, key: '4' },
    { kind: 'key', at: 600, key: 'Backspace' },
    { kind: 'accepted', at: 750.5, answer: 4 },
  ])('accepts a valid $kind event', (event) => {
    expect(gameEventSchema.parse(event)).toEqual(event);
  });

  it('rejects an unknown kind', () => {
    expect(gameEventSchema.safeParse({ kind: 'paste', at: 1 }).success).toBe(false);
  });

  it('rejects a negative timestamp', () => {
    expect(gameEventSchema.safeParse({ kind: 'key', at: -1, key: '4' }).success).toBe(false);
  });

  it('rejects a key outside digits/Backspace/minus', () => {
    expect(gameEventSchema.safeParse({ kind: 'key', at: 1, key: 'a' }).success).toBe(false);
  });
});

describe('gameRecordSchema', () => {
  it('accepts a complete record', () => {
    const record = {
      id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
      startedAtMs: 1_750_000_000_000,
      playedMs: 120_000,
      settings: defaultSettings,
      events: [
        { kind: 'problem', at: 0, text: '3 + 4 = ' },
        { kind: 'key', at: 400, key: '7' },
        { kind: 'accepted', at: 450, answer: 7 },
      ],
      claimedScore: 1,
    };
    expect(gameRecordSchema.parse(record)).toEqual(record);
  });

  it('rejects a malformed id', () => {
    const bad = {
      id: 'not-a-uuid',
      startedAtMs: 0,
      playedMs: 0,
      settings: defaultSettings,
      events: [],
      claimedScore: 0,
    };
    expect(gameRecordSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/schemas.test.ts`
Expected: FAIL — cannot resolve `./schemas.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/schemas.ts`:

```typescript
import { z } from 'zod';

/** Monotonic per-game timestamp in milliseconds (from `performance.now()`), never negative. */
const timestampMs = z.number().finite().nonnegative();

/** Inclusive operand range as configured on the Zetamac settings form. */
export const operandRangeSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
  .refine((range) => range.min <= range.max, { message: 'min must not exceed max' });

/**
 * A full Zetamac configuration. Subtraction and division have no ranges of
 * their own on Zetamac — they are the reverses of addition and multiplication.
 */
export const zetamacSettingsSchema = z.object({
  addEnabled: z.boolean(),
  addLeft: operandRangeSchema,
  addRight: operandRangeSchema,
  subEnabled: z.boolean(),
  mulEnabled: z.boolean(),
  mulLeft: operandRangeSchema,
  mulRight: operandRangeSchema,
  divEnabled: z.boolean(),
  durationSeconds: z.number().int().positive(),
});

/** Keys Zetamac's answer box can receive: digits, Backspace, and minus. */
const keySchema = z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', '-']);

/**
 * One recorder observation. `problem` = a new problem was displayed;
 * `key` = a keystroke in the answer box; `accepted` = Zetamac auto-advanced
 * because the typed answer was correct.
 */
export const gameEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('problem'), at: timestampMs, text: z.string().min(1) }),
  z.object({ kind: z.literal('key'), at: timestampMs, key: keySchema }),
  z.object({ kind: z.literal('accepted'), at: timestampMs, answer: z.number().int() }),
]);

/**
 * A complete recorded game — the unit the extension stores locally and
 * submits for validation. `claimedScore` is what the page displayed; the
 * server never trusts it (spec §5).
 */
export const gameRecordSchema = z.object({
  id: z.uuid(),
  startedAtMs: z.number().int().nonnegative(),
  playedMs: z.number().finite().nonnegative(),
  settings: zetamacSettingsSchema,
  events: z.array(gameEventSchema),
  claimedScore: z.number().int().nonnegative(),
});

export type OperandRange = z.infer<typeof operandRangeSchema>;
export type ZetamacSettings = z.infer<typeof zetamacSettingsSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameRecord = z.infer<typeof gameRecordSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/schemas.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Export from index and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  gameEventSchema,
  gameRecordSchema,
  operandRangeSchema,
  zetamacSettingsSchema,
  type GameEvent,
  type GameRecord,
  type OperandRange,
  type ZetamacSettings,
} from './schemas.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add zod schemas for events, records, and settings"
```

---

### Task 2: Zetamac defaults and fingerprinting (`zetamac.ts`)

**Files:**

- Create: `packages/shared/src/zetamac.ts`
- Test: `packages/shared/src/zetamac.test.ts`

**Interfaces:**

- Consumes: `type ZetamacSettings` from `./schemas.js`.
- Produces: `ZETAMAC_DEFAULT_SETTINGS: ZetamacSettings`, `RANKABLE_DURATIONS: readonly [30, 60, 120]`, `type RankableDuration = 30 | 60 | 120`, `fingerprint(settings: ZetamacSettings): string`, `rankableDuration(settings: ZetamacSettings): RankableDuration | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/zetamac.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { ZETAMAC_DEFAULT_SETTINGS, fingerprint, rankableDuration } from './zetamac.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/zetamac.test.ts`
Expected: FAIL — cannot resolve `./zetamac.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/zetamac.ts`:

```typescript
import type { OperandRange, ZetamacSettings } from './schemas.js';

/** Durations (seconds) whose default-config games rank on leaderboards (spec §1). */
export const RANKABLE_DURATIONS = [30, 60, 120] as const;

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

const range = (r: OperandRange): string => `${r.min}-${r.max}`;

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
    `t:${settings.durationSeconds}`,
  ].join('|');
}

/**
 * The leaderboard duration this game qualifies for, or null if any
 * operation/range differs from Zetamac defaults or the duration is not
 * 30/60/120 (spec §3.1).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/zetamac.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  RANKABLE_DURATIONS,
  ZETAMAC_DEFAULT_SETTINGS,
  fingerprint,
  rankableDuration,
  type RankableDuration,
} from './zetamac.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared
git commit -m "feat(shared): add Zetamac defaults, fingerprinting, and rankable-duration rule"
```

---

### Task 3: Result type and problem arithmetic (`result.ts`, `problems.ts`)

**Files:**

- Create: `packages/shared/src/result.ts`
- Create: `packages/shared/src/problems.ts`
- Test: `packages/shared/src/problems.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `type Result<T, E>`, `ok(value)`, `err(error)` from `./result.js`; `type Operator = '+' | '-' | '*' | '/'`, `interface Problem { left: number; op: Operator; right: number }`, `interface ProblemParseError { reason: 'malformed'; text: string }`, `parseProblem(text: string): Result<Problem, ProblemParseError>`, `solve(problem: Problem): number` from `./problems.js`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/problems.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { parseProblem, solve } from './problems.js';

describe('parseProblem', () => {
  it.each([
    ['34 + 66 = ', { left: 34, op: '+', right: 66 }],
    ['91 – 4 =', { left: 91, op: '-', right: 4 }],
    ['91 − 4', { left: 91, op: '-', right: 4 }],
    ['7 × 12 = ', { left: 7, op: '*', right: 12 }],
    ['96 ÷ 12 = ', { left: 96, op: '/', right: 12 }],
    ['3*4', { left: 3, op: '*', right: 4 }],
  ])('parses %j', (text, expected) => {
    expect(parseProblem(text)).toEqual({ ok: true, value: expected });
  });

  it.each(['', 'hello', '3 +', '+ 4', '3 ? 4', '3 + 4 + 5'])('rejects %j as malformed', (text) => {
    expect(parseProblem(text)).toEqual({ ok: false, error: { reason: 'malformed', text } });
  });
});

describe('solve', () => {
  it.each([
    [{ left: 34, op: '+', right: 66 }, 100],
    [{ left: 91, op: '-', right: 4 }, 87],
    [{ left: 7, op: '*', right: 12 }, 84],
    [{ left: 96, op: '/', right: 12 }, 8],
  ] as const)('solves %j to %d', (problem, answer) => {
    expect(solve(problem)).toBe(answer);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/problems.test.ts`
Expected: FAIL — cannot resolve `./problems.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/result.ts`:

```typescript
/**
 * A typed success-or-failure value. Fallible domain operations return this
 * instead of throwing (spec §11 — "errors are values").
 */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Wrap a success value. */
export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

/** Wrap a failure value. */
export function err<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}
```

Create `packages/shared/src/problems.ts`:

```typescript
import { err, ok, type Result } from './result.js';

export type Operator = '+' | '-' | '*' | '/';

/** A parsed Zetamac problem, e.g. "34 + 66 = " → { left: 34, op: '+', right: 66 }. */
export interface Problem {
  readonly left: number;
  readonly op: Operator;
  readonly right: number;
}

export interface ProblemParseError {
  readonly reason: 'malformed';
  readonly text: string;
}

/**
 * Matches "<int> <op> <int>" with an optional trailing "= ". The operator is
 * captured loosely (any single non-space character) so unknown symbols fail
 * at the alias lookup below rather than silently not matching.
 */
const PROBLEM_PATTERN = /^\s*(\d+)\s*(\S)\s*(\d+)\s*=?\s*$/u;

/** Maps every glyph Zetamac may render to a canonical operator. */
const OPERATOR_ALIASES: Readonly<Record<string, Operator>> = {
  '+': '+',
  '-': '-',
  '−': '-', // minus sign
  '–': '-', // en dash
  '*': '*',
  x: '*',
  '×': '*', // multiplication sign
  '/': '/',
  '÷': '/', // division sign
};

/**
 * Parse a problem as displayed by Zetamac. Returns a typed error for any
 * text the recorder scraped that does not look like a binary problem — the
 * caller records it as an anomaly, never guesses.
 */
export function parseProblem(text: string): Result<Problem, ProblemParseError> {
  const match = PROBLEM_PATTERN.exec(text);
  const leftRaw = match?.[1];
  const opRaw = match?.[2];
  const rightRaw = match?.[3];
  if (leftRaw === undefined || opRaw === undefined || rightRaw === undefined) {
    return err({ reason: 'malformed', text });
  }
  const op = OPERATOR_ALIASES[opRaw];
  if (op === undefined) {
    return err({ reason: 'malformed', text });
  }
  return ok({ left: Number(leftRaw), op, right: Number(rightRaw) });
}

/** The unique correct answer to a problem. Division on Zetamac is always exact. */
export function solve(problem: Problem): number {
  switch (problem.op) {
    case '+':
      return problem.left + problem.right;
    case '-':
      return problem.left - problem.right;
    case '*':
      return problem.left * problem.right;
    case '/':
      return problem.left / problem.right;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/problems.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export { err, ok, type Result } from './result.js';
export {
  parseProblem,
  solve,
  type Operator,
  type Problem,
  type ProblemParseError,
} from './problems.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared
git commit -m "feat(shared): add Result type and Zetamac problem parsing/solving"
```

---

### Task 4: Score recomputation (`score.ts`)

**Files:**

- Modify: `packages/shared/package.json` (add devDependency `fast-check@^4.9.0`)
- Create: `packages/shared/src/score.ts`
- Test: `packages/shared/src/score.test.ts`

**Interfaces:**

- Consumes: `type GameEvent` from `./schemas.js`; `parseProblem`, `solve` from `./problems.js`.
- Produces: `interface ProblemOutcome { text: string; shownAt: number; acceptedAt: number; solveMs: number; verified: boolean }`, `interface ScoreAnomaly { kind: 'accepted-without-problem' | 'unparseable-problem' | 'answer-mismatch'; at: number }`, `interface RecomputedScore { score: number; outcomes: readonly ProblemOutcome[]; anomalies: readonly ScoreAnomaly[]; keyIntervalsMs: readonly number[] }`, `recomputeScore(events: readonly GameEvent[]): RecomputedScore`.

- [ ] **Step 1: Add fast-check and write the failing test**

Run: `pnpm --filter @zetalog/shared add -D fast-check@^4.9.0`

Create `packages/shared/src/score.test.ts`:

```typescript
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { recomputeScore } from './score.js';
import type { GameEvent } from './schemas.js';

/** A clean two-problem game: 3 + 4 = 7 (typed "7"), 9 * 2 = 18 (typed "1", "8"). */
const cleanGame: GameEvent[] = [
  { kind: 'problem', at: 0, text: '3 + 4 = ' },
  { kind: 'key', at: 400, key: '7' },
  { kind: 'accepted', at: 450, answer: 7 },
  { kind: 'problem', at: 500, text: '9 × 2 = ' },
  { kind: 'key', at: 900, key: '1' },
  { kind: 'key', at: 1000, key: '8' },
  { kind: 'accepted', at: 1050, answer: 18 },
];

describe('recomputeScore', () => {
  it('counts only verified answers and reports solve times', () => {
    const result = recomputeScore(cleanGame);
    expect(result.score).toBe(2);
    expect(result.anomalies).toEqual([]);
    expect(result.outcomes.map((o) => o.solveMs)).toEqual([450, 550]);
    expect(result.keyIntervalsMs).toEqual([500, 100]);
  });

  it('honours Backspace when reconstructing the typed answer', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4 = ' },
      { kind: 'key', at: 100, key: '9' },
      { kind: 'key', at: 200, key: 'Backspace' },
      { kind: 'key', at: 300, key: '7' },
      { kind: 'accepted', at: 350, answer: 7 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(1);
    expect(result.anomalies).toEqual([]);
  });

  it('flags an accepted event whose typed digits do not solve the problem', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4 = ' },
      { kind: 'key', at: 100, key: '9' },
      { kind: 'accepted', at: 150, answer: 7 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(0);
    expect(result.anomalies).toEqual([{ kind: 'answer-mismatch', at: 150 }]);
  });

  it('flags an accepted event with no preceding problem', () => {
    const result = recomputeScore([{ kind: 'accepted', at: 10, answer: 1 }]);
    expect(result.score).toBe(0);
    expect(result.anomalies).toEqual([{ kind: 'accepted-without-problem', at: 10 }]);
  });

  it('flags an unparseable problem text', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: 'garbage' },
      { kind: 'accepted', at: 100, answer: 1 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(0);
    expect(result.anomalies).toEqual([{ kind: 'unparseable-problem', at: 100 }]);
  });

  it('returns zero for an empty event stream', () => {
    expect(recomputeScore([])).toEqual({
      score: 0,
      outcomes: [],
      anomalies: [],
      keyIntervalsMs: [],
    });
  });

  it('property: score never exceeds the number of accepted events', () => {
    const eventArb: fc.Arbitrary<GameEvent> = fc.oneof(
      fc.record({
        kind: fc.constant('problem' as const),
        at: fc.nat(),
        text: fc.string({ minLength: 1 }),
      }),
      fc.record({
        kind: fc.constant('key' as const),
        at: fc.nat(),
        key: fc.constantFrom('0' as const, '7' as const, 'Backspace' as const),
      }),
      fc.record({ kind: fc.constant('accepted' as const), at: fc.nat(), answer: fc.integer() }),
    );
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        const accepted = events.filter((e) => e.kind === 'accepted').length;
        expect(recomputeScore(events).score).toBeLessThanOrEqual(accepted);
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/score.test.ts`
Expected: FAIL — cannot resolve `./score.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/score.ts`:

```typescript
import { parseProblem, solve } from './problems.js';
import type { GameEvent } from './schemas.js';

/** One problem the player advanced past, with timing and verification. */
export interface ProblemOutcome {
  readonly text: string;
  readonly shownAt: number;
  readonly acceptedAt: number;
  readonly solveMs: number;
  /** True iff the reconstructed typed digits equal the true answer, and the reported answer agrees. */
  readonly verified: boolean;
}

/** An event-stream irregularity. Any anomaly is a consistency violation downstream. */
export interface ScoreAnomaly {
  readonly kind: 'accepted-without-problem' | 'unparseable-problem' | 'answer-mismatch';
  readonly at: number;
}

/** The server-side truth recomputed from raw events (spec §5 step 1). */
export interface RecomputedScore {
  /** Count of verified outcomes — the only score that ranks. */
  readonly score: number;
  readonly outcomes: readonly ProblemOutcome[];
  readonly anomalies: readonly ScoreAnomaly[];
  /** Gaps between consecutive keystrokes across the whole game, for cadence analysis. */
  readonly keyIntervalsMs: readonly number[];
}

/**
 * Replay an event stream and recompute the score from first principles.
 * Total function: malformed streams produce anomalies, never throws.
 */
export function recomputeScore(events: readonly GameEvent[]): RecomputedScore {
  let current: { readonly text: string; readonly at: number } | null = null;
  let buffer = '';
  let lastKeyAt: number | null = null;
  const outcomes: ProblemOutcome[] = [];
  const anomalies: ScoreAnomaly[] = [];
  const keyIntervalsMs: number[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'problem': {
        current = { text: event.text, at: event.at };
        buffer = '';
        break;
      }
      case 'key': {
        if (lastKeyAt !== null) keyIntervalsMs.push(event.at - lastKeyAt);
        lastKeyAt = event.at;
        buffer = event.key === 'Backspace' ? buffer.slice(0, -1) : buffer + event.key;
        break;
      }
      case 'accepted': {
        if (current === null) {
          anomalies.push({ kind: 'accepted-without-problem', at: event.at });
          break;
        }
        const parsed = parseProblem(current.text);
        if (!parsed.ok) {
          anomalies.push({ kind: 'unparseable-problem', at: event.at });
        } else {
          const answer = solve(parsed.value);
          const verified = Number(buffer) === answer && event.answer === answer;
          if (!verified) anomalies.push({ kind: 'answer-mismatch', at: event.at });
          outcomes.push({
            text: current.text,
            shownAt: current.at,
            acceptedAt: event.at,
            solveMs: event.at - current.at,
            verified,
          });
        }
        current = null;
        buffer = '';
        break;
      }
    }
  }

  return {
    score: outcomes.filter((outcome) => outcome.verified).length,
    outcomes,
    anomalies,
    keyIntervalsMs,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/score.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  recomputeScore,
  type ProblemOutcome,
  type RecomputedScore,
  type ScoreAnomaly,
} from './score.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): recompute scores from event streams with anomaly tracking"
```

---

### Task 5: Quarantine rules (`quarantine.ts`)

**Files:**

- Create: `packages/shared/src/quarantine.ts`
- Test: `packages/shared/src/quarantine.test.ts`

**Interfaces:**

- Consumes: nothing new (self-contained arithmetic).
- Produces: constants `RESTART_PLAYED_FRACTION = 0.8`, `OUTLIER_MIN_HISTORY = 5`, `OUTLIER_WINDOW = 10`, `OUTLIER_MEDIAN_FRACTION = 0.4`; `type QuarantineReason = 'restart' | 'outlier'`; `interface QuarantineInput { score: number; playedMs: number; durationSeconds: number; recentKeptScores: readonly number[] }`; `median(values: readonly number[]): number`; `evaluateQuarantine(input: QuarantineInput): QuarantineReason | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/quarantine.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { evaluateQuarantine, median } from './quarantine.js';

const base = {
  score: 80,
  playedMs: 120_000,
  durationSeconds: 120,
  recentKeptScores: [] as number[],
};

describe('median', () => {
  it('returns the middle value for odd-length input', () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it('averages the two middle values for even-length input', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it('returns NaN for empty input', () => {
    expect(median([])).toBeNaN();
  });
});

describe('evaluateQuarantine — restart rule', () => {
  it('quarantines a game that played under 80% of its duration', () => {
    expect(evaluateQuarantine({ ...base, playedMs: 95_999 })).toBe('restart');
  });

  it('keeps a game at exactly the 80% boundary', () => {
    expect(evaluateQuarantine({ ...base, playedMs: 96_000 })).toBeNull();
  });
});

describe('evaluateQuarantine — outlier rule', () => {
  const history = [90, 88, 92, 85, 91]; // median 90

  it('quarantines a score under 40% of the median with enough history', () => {
    expect(evaluateQuarantine({ ...base, score: 35, recentKeptScores: history })).toBe('outlier');
  });

  it('keeps a score at exactly 40% of the median', () => {
    expect(evaluateQuarantine({ ...base, score: 36, recentKeptScores: history })).toBeNull();
  });

  it('never quarantines with fewer than five kept games', () => {
    expect(
      evaluateQuarantine({ ...base, score: 1, recentKeptScores: [90, 90, 90, 90] }),
    ).toBeNull();
  });

  it('considers only the ten most recent kept games', () => {
    // Window median is 100 (threshold 40); the full 30-game median would be 10
    // (threshold 4). A score of 35 is an outlier only if the window is used.
    const recent = [...Array<number>(10).fill(100), ...Array<number>(20).fill(10)];
    expect(evaluateQuarantine({ ...base, score: 35, recentKeptScores: recent })).toBe('outlier');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/quarantine.test.ts`
Expected: FAIL — cannot resolve `./quarantine.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/quarantine.ts`:

```typescript
/** A game counts as a restart when it played under this fraction of its duration (spec §3.2). */
export const RESTART_PLAYED_FRACTION = 0.8;

/** Minimum kept games on a fingerprint before the outlier rule activates. */
export const OUTLIER_MIN_HISTORY = 5;

/** The outlier rule looks at this many most-recent kept games. */
export const OUTLIER_WINDOW = 10;

/** Scores under this fraction of the window median are quarantined. */
export const OUTLIER_MEDIAN_FRACTION = 0.4;

export type QuarantineReason = 'restart' | 'outlier';

export interface QuarantineInput {
  readonly score: number;
  /** Wall-clock time the game actually ran, in milliseconds. */
  readonly playedMs: number;
  readonly durationSeconds: number;
  /** Kept (not quarantined/removed) scores on the same settings fingerprint, most recent first. */
  readonly recentKeptScores: readonly number[];
}

/** Median of a list; NaN for empty input. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted.at(mid);
  const lower = sorted.at(sorted.length % 2 === 0 ? mid - 1 : mid);
  if (upper === undefined || lower === undefined) return Number.NaN;
  return (upper + lower) / 2;
}

/**
 * Decide whether a finished game is auto-quarantined (spec §3.2). Both the
 * extension (pre-flag) and the server (authoritative mirror) call this with
 * identical inputs. Quarantine is always restorable — callers must never
 * delete on the strength of this verdict.
 */
export function evaluateQuarantine(input: QuarantineInput): QuarantineReason | null {
  if (input.playedMs < RESTART_PLAYED_FRACTION * input.durationSeconds * 1000) {
    return 'restart';
  }
  if (input.recentKeptScores.length >= OUTLIER_MIN_HISTORY) {
    const window = input.recentKeptScores.slice(0, OUTLIER_WINDOW);
    if (input.score < OUTLIER_MEDIAN_FRACTION * median(window)) {
      return 'outlier';
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/quarantine.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  OUTLIER_MEDIAN_FRACTION,
  OUTLIER_MIN_HISTORY,
  OUTLIER_WINDOW,
  RESTART_PLAYED_FRACTION,
  evaluateQuarantine,
  median,
  type QuarantineInput,
  type QuarantineReason,
} from './quarantine.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared
git commit -m "feat(shared): add restart and outlier quarantine rules"
```

---

### Task 6: Physiology checks (`validation/physiology.ts`)

**Files:**

- Create: `packages/shared/src/validation/physiology.ts`
- Test: `packages/shared/src/validation/physiology.test.ts`

**Interfaces:**

- Consumes: `type RecomputedScore` from `../score.js`.
- Produces: constants `MIN_HUMAN_SOLVE_MS = 250`, `FAST_SOLVE_FLAG_FRACTION = 0.3`, `MIN_KEYS_FOR_CADENCE = 30`, `MIN_CADENCE_VARIATION = 0.12`; `interface PhysiologyFlag { rule: 'answer-floor' | 'cadence-uniformity'; detail: string }`; `coefficientOfVariation(values: readonly number[]): number`; `checkPhysiology(recomputed: RecomputedScore): readonly PhysiologyFlag[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/validation/physiology.test.ts`:

```typescript
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ProblemOutcome, RecomputedScore } from '../score.js';
import { checkPhysiology, coefficientOfVariation } from './physiology.js';

function outcome(solveMs: number): ProblemOutcome {
  return { text: '3 + 4 = ', shownAt: 0, acceptedAt: solveMs, solveMs, verified: true };
}

function recomputed(overrides: Partial<RecomputedScore>): RecomputedScore {
  return { score: 0, outcomes: [], anomalies: [], keyIntervalsMs: [], ...overrides };
}

describe('coefficientOfVariation', () => {
  it('is zero for a constant series', () => {
    expect(coefficientOfVariation([100, 100, 100])).toBe(0);
  });

  it('is zero when the mean is zero', () => {
    expect(coefficientOfVariation([0, 0])).toBe(0);
  });

  it('property: scale-invariant for positive series', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 2, maxLength: 50 }),
        fc.integer({ min: 2, max: 9 }),
        (values, k) => {
          const scaled = values.map((v) => v * k);
          expect(coefficientOfVariation(scaled)).toBeCloseTo(coefficientOfVariation(values), 10);
        },
      ),
    );
  });
});

describe('checkPhysiology — answer floor', () => {
  it('flags when 30% or more of solved problems beat the human floor', () => {
    const outcomes = [
      outcome(100),
      outcome(120),
      outcome(400),
      outcome(500),
      outcome(600),
      outcome(700),
    ];
    const flags = checkPhysiology(recomputed({ outcomes }));
    expect(flags.map((f) => f.rule)).toContain('answer-floor');
  });

  it('does not flag ordinary fast play under the threshold fraction', () => {
    const outcomes = [
      outcome(200),
      outcome(400),
      outcome(500),
      outcome(600),
      outcome(700),
      outcome(800),
      outcome(900),
    ];
    expect(checkPhysiology(recomputed({ outcomes }))).toEqual([]);
  });

  it('does not flag a game with no verified outcomes', () => {
    expect(checkPhysiology(recomputed({}))).toEqual([]);
  });
});

describe('checkPhysiology — cadence uniformity', () => {
  it('flags 30+ near-identical inter-key intervals', () => {
    const keyIntervalsMs = Array<number>(40).fill(150);
    const flags = checkPhysiology(recomputed({ keyIntervalsMs }));
    expect(flags.map((f) => f.rule)).toContain('cadence-uniformity');
  });

  it('ignores cadence with fewer than 30 keystrokes', () => {
    const keyIntervalsMs = Array<number>(29).fill(150);
    expect(checkPhysiology(recomputed({ keyIntervalsMs }))).toEqual([]);
  });

  it('does not flag human-variance typing', () => {
    const keyIntervalsMs = Array.from({ length: 40 }, (_, i) => 120 + (i % 7) * 35);
    expect(checkPhysiology(recomputed({ keyIntervalsMs }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/validation/physiology.test.ts`
Expected: FAIL — cannot resolve `./physiology.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/validation/physiology.ts`:

```typescript
import type { RecomputedScore } from '../score.js';

/** Below this per-problem solve time we consider the answer super-human (spec §5 step 2). */
export const MIN_HUMAN_SOLVE_MS = 250;

/** Flag when at least this fraction of solved problems beat {@link MIN_HUMAN_SOLVE_MS}. */
export const FAST_SOLVE_FLAG_FRACTION = 0.3;

/** Cadence analysis needs at least this many inter-key intervals to be meaningful. */
export const MIN_KEYS_FOR_CADENCE = 30;

/** Human typing shows a coefficient of variation well above this; scripts do not. */
export const MIN_CADENCE_VARIATION = 0.12;

export interface PhysiologyFlag {
  readonly rule: 'answer-floor' | 'cadence-uniformity';
  readonly detail: string;
}

/** Standard deviation divided by mean; zero for constant or zero-mean series. */
export function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Physiological plausibility screening. Flags are grounds for quarantine
 * and human review — never automatic rejection, because exceptional humans
 * exist (spec §5).
 */
export function checkPhysiology(recomputed: RecomputedScore): readonly PhysiologyFlag[] {
  const flags: PhysiologyFlag[] = [];

  const solved = recomputed.outcomes.filter((outcome) => outcome.verified);
  if (solved.length > 0) {
    const fast = solved.filter((outcome) => outcome.solveMs < MIN_HUMAN_SOLVE_MS).length;
    if (fast / solved.length >= FAST_SOLVE_FLAG_FRACTION) {
      flags.push({
        rule: 'answer-floor',
        detail: `${fast}/${solved.length} problems solved faster than ${MIN_HUMAN_SOLVE_MS}ms`,
      });
    }
  }

  const intervals = recomputed.keyIntervalsMs;
  if (intervals.length >= MIN_KEYS_FOR_CADENCE) {
    const variation = coefficientOfVariation(intervals);
    if (variation < MIN_CADENCE_VARIATION) {
      flags.push({
        rule: 'cadence-uniformity',
        detail: `inter-key coefficient of variation ${variation.toFixed(4)} over ${intervals.length} intervals`,
      });
    }
  }

  return flags;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/validation/physiology.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  FAST_SOLVE_FLAG_FRACTION,
  MIN_CADENCE_VARIATION,
  MIN_HUMAN_SOLVE_MS,
  MIN_KEYS_FOR_CADENCE,
  checkPhysiology,
  coefficientOfVariation,
  type PhysiologyFlag,
} from './validation/physiology.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared
git commit -m "feat(shared): add physiological plausibility checks"
```

---

### Task 7: Consistency checks (`validation/consistency.ts`)

**Files:**

- Create: `packages/shared/src/validation/consistency.ts`
- Test: `packages/shared/src/validation/consistency.test.ts`

**Interfaces:**

- Consumes: `type GameRecord` from `../schemas.js`; `type RecomputedScore` from `../score.js`.
- Produces: `DURATION_TOLERANCE_MS = 2000`; `interface ConsistencyViolation { rule: 'non-monotonic-timestamps' | 'exceeds-duration' | 'claimed-score-mismatch' | 'event-anomalies'; detail: string }`; `checkConsistency(record: GameRecord, recomputed: RecomputedScore): readonly ConsistencyViolation[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/validation/consistency.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { GameRecord } from '../schemas.js';
import type { RecomputedScore } from '../score.js';
import { ZETAMAC_DEFAULT_SETTINGS } from '../zetamac.js';
import { checkConsistency } from './consistency.js';

function record(overrides: Partial<GameRecord>): GameRecord {
  return {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 0,
    playedMs: 120_000,
    settings: ZETAMAC_DEFAULT_SETTINGS,
    events: [
      { kind: 'problem', at: 0, text: '3 + 4 = ' },
      { kind: 'key', at: 400, key: '7' },
      { kind: 'accepted', at: 450, answer: 7 },
    ],
    claimedScore: 1,
    ...overrides,
  };
}

function recomputed(overrides: Partial<RecomputedScore>): RecomputedScore {
  return { score: 1, outcomes: [], anomalies: [], keyIntervalsMs: [], ...overrides };
}

describe('checkConsistency', () => {
  it('passes a clean record', () => {
    expect(checkConsistency(record({}), recomputed({}))).toEqual([]);
  });

  it('flags decreasing timestamps', () => {
    const bad = record({
      events: [
        { kind: 'problem', at: 500, text: '3 + 4 = ' },
        { kind: 'key', at: 100, key: '7' },
      ],
    });
    const rules = checkConsistency(bad, recomputed({ score: 0 })).map((v) => v.rule);
    expect(rules).toContain('non-monotonic-timestamps');
  });

  it('flags events beyond the configured duration plus tolerance', () => {
    const bad = record({ events: [{ kind: 'problem', at: 122_001, text: '3 + 4 = ' }] });
    const rules = checkConsistency(bad, recomputed({ score: 0 })).map((v) => v.rule);
    expect(rules).toContain('exceeds-duration');
  });

  it('accepts an event exactly at the tolerance boundary', () => {
    const edge = record({ events: [{ kind: 'problem', at: 122_000, text: '3 + 4 = ' }] });
    expect(
      checkConsistency(edge, recomputed({ score: 0, anomalies: [] })).map((v) => v.rule),
    ).not.toContain('exceeds-duration');
  });

  it('handles an empty event stream without violations beyond score mismatch', () => {
    const empty = record({ events: [], claimedScore: 0 });
    expect(checkConsistency(empty, recomputed({ score: 0 }))).toEqual([]);
  });

  it('flags a claimed score that disagrees with the recomputation', () => {
    const rules = checkConsistency(record({ claimedScore: 99 }), recomputed({ score: 1 })).map(
      (v) => v.rule,
    );
    expect(rules).toContain('claimed-score-mismatch');
  });

  it('flags event-stream anomalies reported by the recomputation', () => {
    const anomalous = recomputed({ anomalies: [{ kind: 'answer-mismatch', at: 450 }], score: 1 });
    const rules = checkConsistency(record({}), anomalous).map((v) => v.rule);
    expect(rules).toContain('event-anomalies');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zetalog/shared exec vitest run src/validation/consistency.test.ts`
Expected: FAIL — cannot resolve `./consistency.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/validation/consistency.ts`:

```typescript
import type { GameRecord } from '../schemas.js';
import type { RecomputedScore } from '../score.js';

/** Recorder jitter allowance beyond the configured duration (spec §5 step 3). */
export const DURATION_TOLERANCE_MS = 2000;

export interface ConsistencyViolation {
  readonly rule:
    'non-monotonic-timestamps' | 'exceeds-duration' | 'claimed-score-mismatch' | 'event-anomalies';
  readonly detail: string;
}

/**
 * Structural integrity checks over a submitted record. Timestamp and
 * duration violations indicate a fabricated stream and reject outright;
 * a claimed-score mismatch merely records that the page disagreed — the
 * recomputed score is authoritative either way (spec §5).
 */
export function checkConsistency(
  record: GameRecord,
  recomputed: RecomputedScore,
): readonly ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];

  let previousAt = 0;
  let monotonic = true;
  for (const event of record.events) {
    if (event.at < previousAt) {
      monotonic = false;
      break;
    }
    previousAt = event.at;
  }
  if (!monotonic) {
    violations.push({ rule: 'non-monotonic-timestamps', detail: 'event timestamps decrease' });
  }

  const limitMs = record.settings.durationSeconds * 1000 + DURATION_TOLERANCE_MS;
  const lastEvent = record.events.at(-1);
  if (lastEvent !== undefined && lastEvent.at > limitMs) {
    violations.push({
      rule: 'exceeds-duration',
      detail: `last event at ${lastEvent.at}ms exceeds the ${limitMs}ms window`,
    });
  }

  if (record.claimedScore !== recomputed.score) {
    violations.push({
      rule: 'claimed-score-mismatch',
      detail: `claimed ${record.claimedScore}, recomputed ${recomputed.score}`,
    });
  }

  if (recomputed.anomalies.length > 0) {
    violations.push({
      rule: 'event-anomalies',
      detail: `${recomputed.anomalies.length} event-stream anomalies`,
    });
  }

  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zetalog/shared exec vitest run src/validation/consistency.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  DURATION_TOLERANCE_MS,
  checkConsistency,
  type ConsistencyViolation,
} from './validation/consistency.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared
git commit -m "feat(shared): add structural consistency checks"
```

---

### Task 8: History rule and the verdict (`validation/history.ts`, `validation/verdict.ts`)

**Files:**

- Create: `packages/shared/src/validation/history.ts`
- Create: `packages/shared/src/validation/verdict.ts`
- Test: `packages/shared/src/validation/history.test.ts`
- Test: `packages/shared/src/validation/verdict.test.ts`

**Interfaces:**

- Consumes: `type GameRecord` from `../schemas.js`; `recomputeScore` from `../score.js`; `checkConsistency`, `type ConsistencyViolation` from `./consistency.js`; `checkPhysiology`, `type PhysiologyFlag` from `./physiology.js`.
- Produces: constants `PB_JUMP_MIN_HISTORY = 10`, `PB_JUMP_ABSOLUTE_MARGIN = 15`, `PB_JUMP_RELATIVE_MARGIN = 0.25`; `interface HistoryContext { acceptedScores: readonly number[] }`; `checkHistory(score: number, context: HistoryContext): 'pb-jump' | null`; `type ValidationOutcome = 'accepted' | 'quarantined' | 'rejected'`; `interface Verdict { outcome: ValidationOutcome; serverScore: number; violations: readonly ConsistencyViolation[]; flags: readonly PhysiologyFlag[]; historyFlag: 'pb-jump' | null }`; `judge(record: GameRecord, history: HistoryContext): Verdict`. Plan 3's API route wraps `judge` — this is the seam between domain and server.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/validation/history.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { checkHistory } from './history.js';

describe('checkHistory', () => {
  const tenGames = { acceptedScores: [50, 55, 60, 52, 58, 61, 49, 57, 62, 54] }; // best 62

  it('returns null with fewer than ten accepted games', () => {
    expect(checkHistory(200, { acceptedScores: [10, 12] })).toBeNull();
  });

  it('flags a score far above the personal best', () => {
    expect(checkHistory(95, tenGames)).toBe('pb-jump'); // 62 + max(15, 15.5) = 77.5
  });

  it('allows a plausible new personal best inside the margin', () => {
    expect(checkHistory(70, tenGames)).toBeNull();
  });

  it('allows a score exactly at the margin boundary', () => {
    expect(checkHistory(77.5, tenGames)).toBeNull();
  });
});
```

Create `packages/shared/src/validation/verdict.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { GameEvent, GameRecord } from '../schemas.js';
import { ZETAMAC_DEFAULT_SETTINGS } from '../zetamac.js';
import { judge } from './verdict.js';

/** A clean, human-plausible one-problem game. */
function cleanRecord(): GameRecord {
  return {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 1_750_000_000_000,
    playedMs: 120_000,
    settings: ZETAMAC_DEFAULT_SETTINGS,
    events: [
      { kind: 'problem', at: 0, text: '3 + 4 = ' },
      { kind: 'key', at: 900, key: '7' },
      { kind: 'accepted', at: 1000, answer: 7 },
    ],
    claimedScore: 1,
  };
}

const noHistory = { acceptedScores: [] as number[] };

describe('judge', () => {
  it('accepts a clean record and reports the recomputed score', () => {
    const verdict = judge(cleanRecord(), noHistory);
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.serverScore).toBe(1);
    expect(verdict.violations).toEqual([]);
    expect(verdict.flags).toEqual([]);
    expect(verdict.historyFlag).toBeNull();
  });

  it('rejects a record with non-monotonic timestamps', () => {
    const record = cleanRecord();
    const events: GameEvent[] = [
      { kind: 'problem', at: 1000, text: '3 + 4 = ' },
      { kind: 'key', at: 100, key: '7' },
      { kind: 'accepted', at: 1100, answer: 7 },
    ];
    const verdict = judge({ ...record, events }, noHistory);
    expect(verdict.outcome).toBe('rejected');
  });

  it('quarantines superhuman solve times instead of rejecting', () => {
    const record = cleanRecord();
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4 = ' },
      { kind: 'key', at: 50, key: '7' },
      { kind: 'accepted', at: 60, answer: 7 },
    ];
    const verdict = judge({ ...record, events }, noHistory);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.flags.map((f) => f.rule)).toContain('answer-floor');
  });

  it('quarantines an implausible PB jump', () => {
    const history = { acceptedScores: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
    // One verified problem = score 1, far above... build a 40-problem game instead.
    const events: GameEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      const base = i * 2500;
      events.push({ kind: 'problem', at: base, text: '3 + 4 = ' });
      events.push({ kind: 'key', at: base + 800 + (i % 5) * 90, key: '7' });
      events.push({ kind: 'accepted', at: base + 1000 + (i % 7) * 80, answer: 7 });
    }
    const record = { ...cleanRecord(), events, claimedScore: 40 };
    const verdict = judge(record, history);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.historyFlag).toBe('pb-jump');
  });

  it('uses the recomputed score even when the claim disagrees, without rejecting', () => {
    const record = { ...cleanRecord(), claimedScore: 50 };
    const verdict = judge(record, noHistory);
    expect(verdict.serverScore).toBe(1);
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.violations.map((v) => v.rule)).toContain('claimed-score-mismatch');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zetalog/shared exec vitest run src/validation/history.test.ts src/validation/verdict.test.ts`
Expected: FAIL — cannot resolve `./history.js` / `./verdict.js`.

- [ ] **Step 3: Write the implementations**

Create `packages/shared/src/validation/history.ts`:

```typescript
/** The PB-jump rule needs this many accepted games before it activates (spec §5 step 4). */
export const PB_JUMP_MIN_HISTORY = 10;

/** A new score may exceed the personal best by this many points... */
export const PB_JUMP_ABSOLUTE_MARGIN = 15;

/** ...or by this fraction of the personal best, whichever is larger. */
export const PB_JUMP_RELATIVE_MARGIN = 0.25;

/** The user's accepted scores at the same rankable duration. */
export interface HistoryContext {
  readonly acceptedScores: readonly number[];
}

/**
 * Statistical smell test: a score massively above everything the user has
 * ever posted goes to human review rather than auto-accepting (spec §5).
 */
export function checkHistory(score: number, context: HistoryContext): 'pb-jump' | null {
  if (context.acceptedScores.length < PB_JUMP_MIN_HISTORY) return null;
  const best = Math.max(...context.acceptedScores);
  const margin = Math.max(PB_JUMP_ABSOLUTE_MARGIN, PB_JUMP_RELATIVE_MARGIN * best);
  return score > best + margin ? 'pb-jump' : null;
}
```

Create `packages/shared/src/validation/verdict.ts`:

```typescript
import type { GameRecord } from '../schemas.js';
import { recomputeScore } from '../score.js';
import { checkConsistency, type ConsistencyViolation } from './consistency.js';
import { checkHistory, type HistoryContext } from './history.js';
import { checkPhysiology, type PhysiologyFlag } from './physiology.js';

export type ValidationOutcome = 'accepted' | 'quarantined' | 'rejected';

/** The complete result of judging one submission (spec §5). */
export interface Verdict {
  readonly outcome: ValidationOutcome;
  /** The recomputed score — the only score that ever ranks. */
  readonly serverScore: number;
  readonly violations: readonly ConsistencyViolation[];
  readonly flags: readonly PhysiologyFlag[];
  readonly historyFlag: 'pb-jump' | null;
}

/** Violations that indicate a fabricated stream and reject outright. */
const REJECTING_RULES: ReadonlySet<ConsistencyViolation['rule']> = new Set([
  'non-monotonic-timestamps',
  'exceeds-duration',
]);

/**
 * The full validation pipeline: recompute, then structural, physiological,
 * and historical checks. Pure — the server supplies history from the
 * database; the extension may call it with local history to pre-flag.
 *
 * Outcome policy: fabrication evidence rejects; plausibility doubts
 * quarantine for human review; everything else is accepted. A
 * claimed-score mismatch alone does not reject because the recomputed
 * score is authoritative regardless of what the page displayed.
 */
export function judge(record: GameRecord, history: HistoryContext): Verdict {
  const recomputed = recomputeScore(record.events);
  const violations = checkConsistency(record, recomputed);
  const flags = checkPhysiology(recomputed);
  const historyFlag = checkHistory(recomputed.score, history);

  const rejected = violations.some((violation) => REJECTING_RULES.has(violation.rule));
  const outcome: ValidationOutcome = rejected
    ? 'rejected'
    : flags.length > 0 || historyFlag !== null
      ? 'quarantined'
      : 'accepted';

  return { outcome, serverScore: recomputed.score, violations, flags, historyFlag };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zetalog/shared exec vitest run src/validation/history.test.ts src/validation/verdict.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/shared/src/index.ts`:

```typescript
export {
  PB_JUMP_ABSOLUTE_MARGIN,
  PB_JUMP_MIN_HISTORY,
  PB_JUMP_RELATIVE_MARGIN,
  checkHistory,
  type HistoryContext,
} from './validation/history.js';
export { judge, type ValidationOutcome, type Verdict } from './validation/verdict.js';
```

Run: `pnpm verify` — expected green.

```bash
git add packages/shared
git commit -m "feat(shared): add history rule and the validation verdict pipeline"
```

---

### Task 9: Coverage audit and API surface review

**Files:**

- Modify: `packages/shared/src/index.ts` (ordering/grouping only, if needed)
- Modify: `README.md` (mark domain core complete in Status)

- [ ] **Step 1: Run the full coverage gate and inspect the report**

Run: `pnpm --filter @zetalog/shared test`
Expected: PASS with the coverage summary showing 100% statements/branches/functions/lines. If any file is below 100%, the uncovered branch is either dead code (delete it) or a missing test (write it) — never an exclusion comment.

- [ ] **Step 2: Audit the public surface**

Run: `pnpm --filter @zetalog/shared exec tsc --noEmit` and read `src/index.ts` top to bottom. Every export must be consumed by a planned consumer (Plan 2 recorder/popup: schemas, fingerprint, `rankableDuration`, `evaluateQuarantine`, `recomputeScore`; Plan 3 API: `gameRecordSchema`, `judge`). Remove anything exported "just in case" (YAGNI) — internal helpers like `OPERATOR_ALIASES` must not leak.

- [ ] **Step 3: Update README status and commit**

In `README.md`, replace the Status paragraph's last sentence with: "The domain core (`packages/shared`) is complete; the extension (Plan 2) is next — see `docs/superpowers/plans/2026-07-20-zetalog-roadmap.md`."

Run: `pnpm verify` — expected green.

```bash
git add packages/shared README.md
git commit -m "chore(shared): audit domain-core API surface and coverage"
```

---

## Self-review notes

- **Spec coverage:** §3.1 fingerprint/rankable → Task 2; §3.2 quarantine → Task 5; §5 steps 1–4 → Tasks 4, 6, 7, 8 (rate limiting is server-side I/O, deliberately Plan 3); §11 gates are global constraints. Event schema (§3.1 capture shape) → Task 1.
- **Coverage discipline:** every guard in the plan's code is reachable by a listed test (empty-input paths, `?.` fallbacks, alias-lookup failure via the loose `\S` operator class). No unreachable `throw`s.
- **Type consistency:** interfaces in "Produces" blocks match the code verbatim; later tasks import exactly those names.
