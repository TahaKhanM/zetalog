import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseProblem, solve } from '../problems';
import type { GameEvent, GameRecord, ZetamacSettings } from '../schemas';
import { ZETAMAC_DEFAULT_SETTINGS } from '../zetamac';
import { checkProblems } from './problems';
import { judge } from './verdict';
import { mulberry32, simulateGame } from './zetamac-generator.testkit';

/**
 * The threat model in one place: a cheater who rewrites the DISPLAYED
 * problems produces a stream where every answer matches its problem and every
 * physiological/consistency check passes — yet the game was never Zetamac's.
 * These fixtures therefore use CLEAN, human-paced timing so the only thing that
 * can catch them is the problem-conformity layer.
 */

const noHistory = { acceptedScores: [] as number[] };

/**
 * Build a human-paced record from displayed problem texts: each solved in
 * ~1.5s, typed digit-by-digit with jitter, so physiology and consistency stay
 * clean and only the problem-stream rules can react.
 */
function attackRecord(
  texts: readonly string[],
  settings: ZetamacSettings = ZETAMAC_DEFAULT_SETTINGS,
): GameRecord {
  const events: GameEvent[] = [];
  let at = 0;
  texts.forEach((text, index) => {
    events.push({ kind: 'problem', at, text });
    const parsed = parseProblem(text);
    const answer = parsed.ok ? solve(parsed.value) : 0;
    at += 700 + ((index * 137) % 500); // varied think time, always > floor
    let typed = '';
    for (const digit of String(answer)) {
      typed += digit;
      events.push({ kind: 'input', at, value: typed });
      at += 150 + ((index * 53) % 160); // varied inter-key cadence
    }
    events.push({ kind: 'accepted', at, answer });
    at += 300 + ((index * 91) % 200);
  });
  return {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 1_750_000_000_000,
    playedMs: 120_000,
    settings,
    events,
    claimedScore: texts.length,
  };
}

describe('attack battery — never accepted', () => {
  it('(a) trivial-swap: every problem rewritten to "2 + 2" is not accepted', () => {
    const record = attackRecord(Array.from({ length: 40 }, () => '2 + 2'));
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).not.toBe('accepted');
    // In range, so quarantined (entropy + mix), not hard-rejected.
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.problemFlags.map((f) => f.rule)).toEqual(
      expect.arrayContaining(['operation-mix', 'low-entropy']),
    );
  });

  it('(a3) "2 + 2" nineteen times — a plausible 30-second game — is quarantined', () => {
    const record = attackRecord(Array.from({ length: 19 }, () => '2 + 2'));
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.problemFlags.map((f) => f.rule)).toContain('low-entropy');
  });

  it('(e) all-easy operands with a uniform op mix are quarantined, never accepted', () => {
    // The reviewer's bypass: 60 distinct in-range problems, 15 per op, every
    // operand pinned to the low end of its range. Range, mix, and entropy all
    // pass; only the operand-marginal rule can catch it.
    const texts: string[] = [];
    for (let k = 2; k <= 16; k += 1) texts.push(`2 + ${String(k)}`);
    for (let k = 4; k <= 18; k += 1) texts.push(`${String(k)} – 2`);
    for (let k = 2; k <= 16; k += 1) texts.push(`2 × ${String(k)}`);
    for (let k = 2; k <= 16; k += 1) texts.push(`${String(2 * k)} ÷ 2`);
    const record = attackRecord(texts);
    const verdict = judge(record, noHistory);
    expect(verdict.serverScore).toBe(60);
    expect(verdict.problemViolations).toEqual([]);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.problemFlags.map((f) => f.rule)).toContain('operand-marginal');
  });

  it('(a2) trivial-swap to in-range small mul products is quarantined, never accepted', () => {
    // "all 2×2..3×3, default settings claimed": in range, so caught
    // statistically (heavy repetition + only mul appears), never accepted.
    const cycle = ['2 × 2', '2 × 3', '3 × 2', '3 × 3'];
    const record = attackRecord(Array.from({ length: 40 }, (_u, i) => cycle[i % 4] ?? ''));
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).not.toBe('accepted');
    expect(verdict.problemFlags.map((f) => f.rule)).toContain('low-entropy');
  });

  it('(b) shrunken-range mul: a left factor above the default cap of 12 is rejected', () => {
    // Default mul_left is [2,12]; a tampered "50 × 50" (or any left > 12) is
    // impossible under the generator ⇒ hard reject.
    const record = attackRecord(Array.from({ length: 40 }, () => '50 × 50'));
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).toBe('rejected');
    expect(verdict.problemViolations.map((v) => v.rule)).toContain('range-nonconforming');
  });

  it('(b2) shrunken-range div: quotient-1 divisions are impossible and rejected', () => {
    // Division answers are drawn from mul_right (floor 2), so "2 ÷ 2" (quotient 1)
    // can never be generated — a hallmark of a shrunk/trivialised stream.
    const record = attackRecord(Array.from({ length: 40 }, () => '2 ÷ 2'));
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).toBe('rejected');
    expect(verdict.problemViolations.map((v) => v.rule)).toContain('range-nonconforming');
  });

  it('(b3) shrunken-range sub: below-floor answers are impossible and rejected', () => {
    // Subtraction answers come from add_right (floor 2), so "3 - 2" (answer 1) is
    // impossible under default settings.
    const record = attackRecord(Array.from({ length: 40 }, () => '3 – 2'));
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).toBe('rejected');
  });

  it('problem-switch: rewriting unsolved problems is flagged for review', () => {
    const events: GameEvent[] = [];
    let at = 0;
    for (let i = 0; i < 20; i += 1) {
      events.push({ kind: 'problem', at, text: '34 + 66' });
      at += 200;
      events.push({ kind: 'problem', at, text: '2 + 2' }); // rewritten before solving
      at += 800;
      events.push({ kind: 'input', at, value: '4' });
      at += 100;
      events.push({ kind: 'accepted', at, answer: 4 });
      at += 500;
    }
    const record: GameRecord = {
      id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
      startedAtMs: 1_750_000_000_000,
      playedMs: 120_000,
      settings: ZETAMAC_DEFAULT_SETTINGS,
      events,
      claimedScore: 20,
    };
    const verdict = judge(record, noHistory);
    expect(verdict.outcome).toBe('quarantined');
    expect(verdict.problemFlags.map((f) => f.rule)).toContain('problem-switch');
  });
});

describe('attack battery — legitimate simulated games are accepted', () => {
  const configs: { name: string; settings: ZetamacSettings; count: number }[] = [
    {
      name: 'default 30s',
      settings: { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 30 },
      count: 22,
    },
    {
      name: 'default 60s',
      settings: { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 60 },
      count: 34,
    },
    { name: 'default 120s', settings: ZETAMAC_DEFAULT_SETTINGS, count: 55 },
    {
      name: 'mul-only 60s',
      settings: {
        ...ZETAMAC_DEFAULT_SETTINGS,
        addEnabled: false,
        subEnabled: false,
        divEnabled: false,
        durationSeconds: 60,
      },
      count: 34,
    },
    {
      name: 'add-only narrow 30s',
      settings: {
        ...ZETAMAC_DEFAULT_SETTINGS,
        subEnabled: false,
        mulEnabled: false,
        divEnabled: false,
        addLeft: { min: 2, max: 20 },
        addRight: { min: 2, max: 20 },
        durationSeconds: 30,
      },
      count: 22,
    },
  ];

  for (const { name, settings, count } of configs) {
    it(`accepts a legitimate ${name} game`, () => {
      const duration = settings.durationSeconds as 30 | 60 | 120;
      const { record } = simulateGame(settings, mulberry32(0xc0ffee + count), {
        count,
        durationSeconds: duration,
      });
      const verdict = judge(record, noHistory);
      expect(verdict.outcome).toBe('accepted');
      expect(verdict.serverScore).toBe(count);
    });
  }
});

describe('property: legitimate simulated games are never rejected', () => {
  const durations = [30, 60, 120] as const;

  it('never produces a hard problem violation across 10k seeded games', () => {
    let hardRejectedByNewRules = 0;
    let rejectedOverall = 0;
    let statisticallyFlagged = 0;
    let marginalFlagged = 0;

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), (seed) => {
        const rng = mulberry32(seed);
        const duration = durations[seed % 3] ?? 120;
        // A spread of realistic configurations, all producing in-range streams.
        const variant = seed % 4;
        const base = { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: duration };
        const settings: ZetamacSettings =
          variant === 0
            ? base
            : variant === 1
              ? { ...base, addEnabled: false, subEnabled: false, divEnabled: false }
              : variant === 2
                ? { ...base, mulEnabled: false, divEnabled: false }
                : {
                    ...base,
                    mulLeft: { min: 2, max: 12 },
                    mulRight: { min: 2, max: 12 },
                    addEnabled: false,
                    subEnabled: false,
                  };
        // A human problem count for the duration, so the synthetic timeline fits
        // the window (an overrun would trip consistency, not the new rules).
        const count = 12 + (seed % Math.max(1, Math.floor(duration / 2.2)));
        const { record, recomputed } = simulateGame(settings, rng, {
          count,
          durationSeconds: duration,
        });

        const problem = checkProblems(record, recomputed);
        if (problem.violations.length > 0) hardRejectedByNewRules += 1;
        if (problem.flags.length > 0) statisticallyFlagged += 1;
        if (problem.flags.some((f) => f.rule === 'operand-marginal')) marginalFlagged += 1;
        if (judge(record, noHistory).outcome === 'rejected') rejectedOverall += 1;

        // The hard invariant: legitimate generator output is never impossible,
        // so the new problem-conformity rules never hard-reject it.
        return problem.violations.length === 0;
      }),
      { numRuns: 10_000, seed: 20260721 },
    );

    expect(hardRejectedByNewRules).toBe(0);
    // These faithful games also survive the whole pipeline end to end.
    expect(rejectedOverall).toBe(0);
    // The statistical flags must also be rare on legitimate play (α = 1e-4).
    expect(statisticallyFlagged).toBeLessThan(10);
    // The operand-marginal rule specifically must stay clean on real play.
    expect(marginalFlagged).toBeLessThan(10);
  });
});
