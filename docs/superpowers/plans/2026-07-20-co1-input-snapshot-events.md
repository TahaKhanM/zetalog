# CO-1: Input-snapshot events (supersedes `key` events in the domain-core plan)

**Why:** Live recon (fixtures in `apps/extension/test/fixtures/`, notes in that directory's
`README.md`) shows Zetamac exposes answer entry as `input` events carrying the input's full
current value — there is no per-key signal, and Zetamac's own `/log` payload records
progressive value snapshots. Recording value snapshots is lossless and matches the DOM;
deriving synthetic keystrokes would be lossy guesswork.

**Rule:** Where this change order conflicts with `2026-07-20-domain-core.md`, this document
governs. Everything not mentioned here is unchanged.

## Task 1 (`schemas.ts`) — replace the `key` event with an `input` event

The `keySchema` constant is deleted. The event union becomes:

```typescript
/**
 * One recorder observation. `problem` = a new problem was displayed;
 * `input` = the answer box changed (full value snapshot, as Zetamac's own
 * log records it); `accepted` = Zetamac auto-advanced because the typed
 * answer was correct.
 */
export const gameEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('problem'), at: timestampMs, text: z.string().min(1) }),
  z.object({ kind: z.literal('input'), at: timestampMs, value: z.string().max(12) }),
  z.object({ kind: z.literal('accepted'), at: timestampMs, answer: z.number().int() }),
]);
```

In `schemas.test.ts`, the event cases become:

```typescript
it.each([
  { kind: 'problem', at: 0, text: '2 + 2' },
  { kind: 'input', at: 512.25, value: '4' },
  { kind: 'input', at: 600, value: '' },
  { kind: 'accepted', at: 750.5, answer: 4 },
])('accepts a valid $kind event', (event) => {
  expect(gameEventSchema.parse(event)).toEqual(event);
});

it('rejects an unknown kind', () => {
  expect(gameEventSchema.safeParse({ kind: 'paste', at: 1 }).success).toBe(false);
});

it('rejects a negative timestamp', () => {
  expect(gameEventSchema.safeParse({ kind: 'input', at: -1, value: '4' }).success).toBe(false);
});

it('rejects an input value longer than 12 characters', () => {
  expect(gameEventSchema.safeParse({ kind: 'input', at: 1, value: '1234567890123' }).success).toBe(
    false,
  );
});
```

The record test's events become:

```typescript
      events: [
        { kind: 'problem', at: 0, text: '3 + 4' },
        { kind: 'input', at: 400, value: '7' },
        { kind: 'accepted', at: 450, answer: 7 },
      ],
```

## Task 4 (`score.ts`) — reconstruct from value snapshots

`RecomputedScore.keyIntervalsMs` is renamed to `inputIntervalsMs` and gains `entryBursts`.
Full replacement for `score.ts`:

```typescript
import { parseProblem, solve } from './problems.js';
import type { GameEvent } from './schemas.js';

/** One problem the player advanced past, with timing and verification. */
export interface ProblemOutcome {
  readonly text: string;
  readonly shownAt: number;
  readonly acceptedAt: number;
  readonly solveMs: number;
  /** True iff the final input value equals the true answer, and the reported answer agrees. */
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
  /** Gaps between consecutive input events across the whole game, for cadence analysis. */
  readonly inputIntervalsMs: readonly number[];
  /** Input events whose value grew by more than one character — paste-like entry. */
  readonly entryBursts: number;
}

/**
 * Replay an event stream and recompute the score from first principles.
 * Total function: malformed streams produce anomalies, never throws.
 */
export function recomputeScore(events: readonly GameEvent[]): RecomputedScore {
  let current: { readonly text: string; readonly at: number } | null = null;
  let lastValue = '';
  let lastInputAt: number | null = null;
  let entryBursts = 0;
  const outcomes: ProblemOutcome[] = [];
  const anomalies: ScoreAnomaly[] = [];
  const inputIntervalsMs: number[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'problem': {
        current = { text: event.text, at: event.at };
        lastValue = '';
        break;
      }
      case 'input': {
        if (lastInputAt !== null) inputIntervalsMs.push(event.at - lastInputAt);
        lastInputAt = event.at;
        if (event.value.length - lastValue.length > 1) entryBursts += 1;
        lastValue = event.value;
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
          const verified = lastValue.trim() === String(answer) && event.answer === answer;
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
        lastValue = '';
        break;
      }
    }
  }

  return {
    score: outcomes.filter((outcome) => outcome.verified).length,
    outcomes,
    anomalies,
    inputIntervalsMs,
    entryBursts,
  };
}
```

Full replacement for `score.test.ts`:

```typescript
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GameEvent } from './schemas.js';
import { recomputeScore } from './score.js';

/** A clean two-problem game: 3 + 4 = 7 (typed "7"), 9 × 2 = 18 (typed "1", "18"). */
const cleanGame: GameEvent[] = [
  { kind: 'problem', at: 0, text: '3 + 4' },
  { kind: 'input', at: 400, value: '7' },
  { kind: 'accepted', at: 450, answer: 7 },
  { kind: 'problem', at: 500, text: '9 × 2' },
  { kind: 'input', at: 900, value: '1' },
  { kind: 'input', at: 1000, value: '18' },
  { kind: 'accepted', at: 1050, answer: 18 },
];

describe('recomputeScore', () => {
  it('counts only verified answers and reports solve times', () => {
    const result = recomputeScore(cleanGame);
    expect(result.score).toBe(2);
    expect(result.anomalies).toEqual([]);
    expect(result.outcomes.map((o) => o.solveMs)).toEqual([450, 550]);
    expect(result.inputIntervalsMs).toEqual([500, 100]);
    expect(result.entryBursts).toBe(0);
  });

  it('handles corrections (backspace) via shrinking value snapshots', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 100, value: '9' },
      { kind: 'input', at: 200, value: '' },
      { kind: 'input', at: 300, value: '7' },
      { kind: 'accepted', at: 350, answer: 7 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(1);
    expect(result.anomalies).toEqual([]);
    expect(result.entryBursts).toBe(0);
  });

  it('counts a paste-like burst when the value grows by more than one character', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '9 × 2' },
      { kind: 'input', at: 100, value: '18' },
      { kind: 'accepted', at: 150, answer: 18 },
    ];
    const result = recomputeScore(events);
    expect(result.score).toBe(1);
    expect(result.entryBursts).toBe(1);
  });

  it('flags an accepted event whose final value does not solve the problem', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 100, value: '9' },
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
      { kind: 'input', at: 50, value: '1' },
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
      inputIntervalsMs: [],
      entryBursts: 0,
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
        kind: fc.constant('input' as const),
        at: fc.nat(),
        value: fc.constantFrom('', '7', '18'),
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

The Task 4 index export block becomes:

```typescript
export {
  recomputeScore,
  type ProblemOutcome,
  type RecomputedScore,
  type ScoreAnomaly,
} from './score.js';
```

(unchanged names — only the interface's fields changed).

## Task 6 (`validation/physiology.ts`) — rename intervals field, add entry-burst rule

`checkPhysiology` reads `recomputed.inputIntervalsMs` (not `keyIntervalsMs`), the flag union
gains `'entry-burst'`, and cadence constants apply to input intervals. Replacements:

- Constant rename: `MIN_KEYS_FOR_CADENCE` → `MIN_INPUTS_FOR_CADENCE` (value stays 30).
- `PhysiologyFlag.rule` union becomes `'answer-floor' | 'cadence-uniformity' | 'entry-burst'`.
- Add after the cadence block in `checkPhysiology`:

```typescript
if (recomputed.entryBursts > 0) {
  flags.push({
    rule: 'entry-burst',
    detail: `${recomputed.entryBursts} paste-like input bursts`,
  });
}
```

- The cadence block reads `const intervals = recomputed.inputIntervalsMs;` and its detail
  string says `inter-input coefficient of variation`.
- In `physiology.test.ts`: the `recomputed` helper becomes

```typescript
function recomputed(overrides: Partial<RecomputedScore>): RecomputedScore {
  return {
    score: 0,
    outcomes: [],
    anomalies: [],
    inputIntervalsMs: [],
    entryBursts: 0,
    ...overrides,
  };
}
```

every `keyIntervalsMs` reference becomes `inputIntervalsMs`, and add:

```typescript
describe('checkPhysiology — entry bursts', () => {
  it('flags any paste-like burst', () => {
    const flags = checkPhysiology(recomputed({ entryBursts: 2 }));
    expect(flags.map((f) => f.rule)).toContain('entry-burst');
  });
});
```

- The Task 6 index export block exports `MIN_INPUTS_FOR_CADENCE` instead of
  `MIN_KEYS_FOR_CADENCE`.

## Task 7 (`validation/consistency.test.ts`) — event literals only

In the `record()` helper, events become:

```typescript
    events: [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 400, value: '7' },
      { kind: 'accepted', at: 450, answer: 7 },
    ],
```

and the non-monotonic case uses `{ kind: 'input', at: 100, value: '7' }`. The `recomputed()`
helper becomes the CO-1 shape (`inputIntervalsMs: [], entryBursts: 0`).

## Task 8 (`validation/verdict.test.ts`) — event literals only

`cleanRecord()` events become:

```typescript
    events: [
      { kind: 'problem', at: 0, text: '3 + 4' },
      { kind: 'input', at: 900, value: '7' },
      { kind: 'accepted', at: 1000, answer: 7 },
    ],
```

The non-monotonic case uses `{ kind: 'input', at: 100, value: '7' }` between the two other
events; the superhuman case uses `{ kind: 'input', at: 50, value: '7' }`; the 40-problem
PB-jump builder pushes `{ kind: 'input', at: base + 800 + (i % 5) * 90, value: '7' }`.
