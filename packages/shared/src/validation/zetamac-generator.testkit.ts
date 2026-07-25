/**
 * Test-only faithful port of Zetamac's problem generator, transcribed from
 * `apps/extension/test/fixtures/zetamac-app.js` (a captured copy of the real
 * game script). It exists so the statistical conformity rules in
 * `problems.ts` can be property-tested against genuine generator output:
 * legitimate play must never trip them.
 *
 * This file is deliberately excluded from coverage (see `vitest.config.ts`) —
 * it is a test fixture, not shipped code, and is never imported by `index.ts`.
 *
 * Determinism: the real generator uses `Math.random()`; here we inject a
 * seeded `mulberry32` PRNG so every simulated game is reproducible.
 */

import type { Operator } from '../problems';
import type { GameEvent, GameRecord, ZetamacSettings } from '../schemas';
import { recomputeScore, type RecomputedScore } from '../score';

/** A seeded 32-bit PRNG (mulberry32); returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixture L1–3: `rand(n) = floor(random * n)`, a uniform integer in [0, n). */
function rand(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/** Fixture L14–18: `randGen(min, max)` draws a uniform integer in [min, max]. */
function randInt(rng: () => number, range: { min: number; max: number }): number {
  return range.min + rand(rng, range.max - range.min + 1);
}

/** One generated problem: the glyph text the page would display, plus its answer. */
export interface GeneratedProblem {
  readonly pretty: string;
  readonly answer: number;
  readonly op: Operator;
}

/** Fixture L24–32: addition draws left ∈ add_left, right ∈ add_right. */
function pgAdd(settings: ZetamacSettings, rng: () => number): GeneratedProblem {
  const left = randInt(rng, settings.addLeft);
  const right = randInt(rng, settings.addRight);
  return { pretty: `${String(left)} + ${String(right)}`, answer: left + right, op: '+' };
}

/** Fixture L33–43: subtraction is the reverse of addition (uses the add ranges). */
function pgSub(settings: ZetamacSettings, rng: () => number): GeneratedProblem {
  const first = randInt(rng, settings.addLeft);
  const second = randInt(rng, settings.addRight);
  const left = first + second;
  const right = first;
  return { pretty: `${String(left)} – ${String(right)}`, answer: second, op: '-' };
}

/** Fixture L44–52: multiplication draws left ∈ mul_left, right ∈ mul_right. */
function pgMul(settings: ZetamacSettings, rng: () => number): GeneratedProblem {
  const left = randInt(rng, settings.mulLeft);
  const right = randInt(rng, settings.mulRight);
  return { pretty: `${String(left)} × ${String(right)}`, answer: left * right, op: '*' };
}

/**
 * Fixture L53–65: division is the reverse of multiplication. When the drawn
 * divisor `first` is 0, the generator returns `null` and `problemGen` re-rolls
 * (L79–85); we mirror that by returning `null` here.
 */
function pgDiv(settings: ZetamacSettings, rng: () => number): GeneratedProblem | null {
  const first = randInt(rng, settings.mulLeft);
  const second = randInt(rng, settings.mulRight);
  if (first === 0) return null;
  const left = first * second;
  const right = first;
  return { pretty: `${String(left)} ÷ ${String(right)}`, answer: second, op: '/' };
}

type Generator = (settings: ZetamacSettings, rng: () => number) => GeneratedProblem | null;

/** Fixture L66–78: only enabled operations join the `pgs` pool. */
function enabledGenerators(settings: ZetamacSettings): readonly Generator[] {
  const pgs: Generator[] = [];
  if (settings.addEnabled) pgs.push(pgAdd);
  if (settings.subEnabled) pgs.push(pgSub);
  if (settings.mulEnabled) pgs.push(pgMul);
  if (settings.divEnabled) pgs.push(pgDiv);
  return pgs;
}

/**
 * Fixture L79–85 (`problemGen`): pick a uniformly random enabled generator,
 * re-rolling while it returns `null` (the div-by-zero retry).
 */
export function nextProblem(
  settings: ZetamacSettings,
  rng: () => number,
  pgs: readonly Generator[] = enabledGenerators(settings),
): GeneratedProblem {
  for (;;) {
    const gen = pgs[rand(rng, pgs.length)];
    const problem = gen === undefined ? null : gen(settings, rng);
    if (problem !== null) return problem;
  }
}

/** Options for {@link simulateGame}. */
export interface SimulateOptions {
  /** Number of problems solved in the game. */
  readonly count: number;
  /** The claimed duration; the game is laid out to end within this window. */
  readonly durationSeconds: 30 | 60 | 120;
}

/**
 * Build a full {@link GameRecord} of legitimate play: `count` generator-drawn
 * problems, each solved at a human, jittered pace and typed digit-by-digit
 * (no entry bursts), with monotonically increasing timestamps that finish
 * inside the duration window. Returned alongside the {@link RecomputedScore}
 * that `recomputeScore` derives from the synthesized events.
 */
export function simulateGame(
  settings: ZetamacSettings,
  rng: () => number,
  options: SimulateOptions,
): { record: GameRecord; recomputed: RecomputedScore } {
  const { count, durationSeconds } = options;
  const windowMs = durationSeconds * 1000;
  // Average slice per problem, held below the window with headroom so jitter
  // never overruns; floored well above the 250ms human solve floor.
  const slice = Math.max(600, Math.floor((windowMs * 0.9) / Math.max(count, 1)));
  const events: GameEvent[] = [];
  let at = 0;

  for (let i = 0; i < count; i += 1) {
    const problem = nextProblem(settings, rng);
    events.push({ kind: 'problem', at, text: problem.pretty });

    const digits = String(problem.answer);
    // Reserve the front ~40% of the slice as think time before the first key,
    // then type each digit with a jittered inter-key interval.
    const thinkMs = 200 + Math.floor(rng() * (slice * 0.4));
    at += thinkMs;
    let typed = '';
    for (const digit of digits) {
      typed += digit;
      events.push({ kind: 'input', at, value: typed });
      at += 90 + Math.floor(rng() * 220);
    }
    events.push({ kind: 'accepted', at, answer: problem.answer });
    // Gap to the next problem: the remainder of the slice, jittered.
    at += 120 + Math.floor(rng() * 260);
  }

  const record: GameRecord = {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 1_750_000_000_000,
    playedMs: windowMs,
    settings,
    events,
    claimedScore: count,
  };
  return { record, recomputed: recomputeScore(events) };
}
