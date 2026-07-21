import { describe, expect, it } from 'vitest';

import { parseProblem, solve } from '../problems';
import type { GameEvent, GameRecord, ZetamacSettings } from '../schemas';
import { recomputeScore, type RecomputedScore } from '../score';
import { ZETAMAC_DEFAULT_SETTINGS } from '../zetamac';
import {
  checkProblems,
  producibleUnderSettings,
  ENTROPY_MIN_PROBLEMS,
  MIX_MIN_PROBLEMS,
  type ProblemConformity,
} from './problems';
import { mulberry32, simulateGame } from './zetamac-generator.testkit';

/**
 * Build a faithful recorder stream from a list of displayed problem texts:
 * each becomes a `problem` event, the true answer typed in one `input`, then
 * an `accepted`. Timings are monotonic and human-plausible so only the
 * problem-conformity rules are exercised.
 */
function gameFrom(
  texts: readonly string[],
  settings: ZetamacSettings = ZETAMAC_DEFAULT_SETTINGS,
): { record: GameRecord; recomputed: RecomputedScore } {
  const events: GameEvent[] = [];
  let at = 0;
  for (const text of texts) {
    events.push({ kind: 'problem', at, text });
    at += 800;
    const parsed = parseProblem(text);
    const answer = parsed.ok ? solve(parsed.value) : 0;
    events.push({ kind: 'input', at, value: String(answer) });
    at += 200;
    events.push({ kind: 'accepted', at, answer });
    at += 700;
  }
  const record: GameRecord = {
    id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
    startedAtMs: 1_750_000_000_000,
    playedMs: 120_000,
    settings,
    events,
    claimedScore: texts.length,
  };
  return { record, recomputed: recomputeScore(events) };
}

function judgeTexts(texts: readonly string[], settings?: ZetamacSettings): ProblemConformity {
  const { record, recomputed } = gameFrom(texts, settings);
  return checkProblems(record, recomputed);
}

const P = (problem: {
  left: number;
  op: string;
  right: number;
}): Parameters<typeof producibleUnderSettings>[0] => ({
  left: problem.left,
  op: problem.op as '+' | '-' | '*' | '/',
  right: problem.right,
});

/** `n` distinct, producible problems for one operation (all within default ranges). */
function opTexts(op: '+' | '-' | '*' | '/', n: number): string[] {
  return Array.from({ length: n }, (_unused, i) => {
    switch (op) {
      case '+':
        return `${String(2 + i)} + 3`; // left varies in [2,100] for i < 99
      case '-':
        return `${String(6 + i)} – 4`; // right = 4 (∈ addLeft), answer = 2 + i (∈ addRight)
      case '*':
        return `2 × ${String(2 + i)}`; // right varies in [2,100]
      case '/':
        return `${String(4 + 2 * i)} ÷ 2`; // divisor 2, quotient 2 + i (∈ mulRight)
    }
  });
}

/** `perOp` distinct problems for every operation, so all four op shares are equal. */
function balancedTexts(perOp: number): string[] {
  return [
    ...opTexts('+', perOp),
    ...opTexts('-', perOp),
    ...opTexts('*', perOp),
    ...opTexts('/', perOp),
  ];
}

function flagRules(result: ProblemConformity): string[] {
  return result.flags.map((flag) => flag.rule);
}

describe('producibleUnderSettings — range conformity', () => {
  const s = ZETAMAC_DEFAULT_SETTINGS;

  it('accepts an addition within both operand ranges', () => {
    expect(producibleUnderSettings(P({ left: 34, op: '+', right: 66 }), s)).toBe(true);
    expect(producibleUnderSettings(P({ left: 2, op: '+', right: 100 }), s)).toBe(true);
  });

  it('rejects an addition with an operand outside the range', () => {
    expect(producibleUnderSettings(P({ left: 1, op: '+', right: 5 }), s)).toBe(false);
    expect(producibleUnderSettings(P({ left: 5, op: '+', right: 101 }), s)).toBe(false);
  });

  it('rejects addition when the add operation is disabled', () => {
    expect(
      producibleUnderSettings(P({ left: 3, op: '+', right: 4 }), { ...s, addEnabled: false }),
    ).toBe(false);
  });

  it('accepts a subtraction that is the reverse of a producible addition', () => {
    // 91 - 4: right = first = 4 in addLeft, left-right = 87 = second in addRight.
    expect(producibleUnderSettings(P({ left: 91, op: '-', right: 4 }), s)).toBe(true);
  });

  it('rejects a subtraction whose answer is below the addRight floor', () => {
    // 4 - 3 has answer 1, but addRight.min is 2 → impossible.
    expect(producibleUnderSettings(P({ left: 4, op: '-', right: 3 }), s)).toBe(false);
    // 2 - 2 has answer 0 → impossible.
    expect(producibleUnderSettings(P({ left: 2, op: '-', right: 2 }), s)).toBe(false);
  });

  it('rejects a subtraction whose subtrahend is outside addLeft', () => {
    // right = 101 exceeds addLeft.max = 100.
    expect(producibleUnderSettings(P({ left: 200, op: '-', right: 101 }), s)).toBe(false);
  });

  it('rejects subtraction when the sub operation is disabled', () => {
    expect(
      producibleUnderSettings(P({ left: 91, op: '-', right: 4 }), { ...s, subEnabled: false }),
    ).toBe(false);
  });

  it('accepts a multiplication within both factor ranges', () => {
    expect(producibleUnderSettings(P({ left: 12, op: '*', right: 100 }), s)).toBe(true);
    expect(producibleUnderSettings(P({ left: 2, op: '*', right: 2 }), s)).toBe(true);
  });

  it('rejects a multiplication whose left factor exceeds mulLeft.max', () => {
    // Default mulLeft is [2,12]; a legit product never shows left > 12.
    expect(producibleUnderSettings(P({ left: 13, op: '*', right: 5 }), s)).toBe(false);
    expect(producibleUnderSettings(P({ left: 50, op: '*', right: 50 }), s)).toBe(false);
  });

  it('rejects multiplication when the mul operation is disabled', () => {
    expect(
      producibleUnderSettings(P({ left: 3, op: '*', right: 4 }), { ...s, mulEnabled: false }),
    ).toBe(false);
  });

  it('accepts a division that is the reverse of a producible multiplication', () => {
    // 96 / 12: right = first = 12 in mulLeft, quotient 8 = second in mulRight.
    expect(producibleUnderSettings(P({ left: 96, op: '/', right: 12 }), s)).toBe(true);
  });

  it('rejects a division whose quotient is below the mulRight floor', () => {
    // 2 / 2 has quotient 1, but mulRight.min is 2 → impossible.
    expect(producibleUnderSettings(P({ left: 2, op: '/', right: 2 }), s)).toBe(false);
  });

  it('rejects a non-integer or non-divisible division', () => {
    // 7 / 2 is not an integer quotient → impossible for Zetamac.
    expect(producibleUnderSettings(P({ left: 7, op: '/', right: 2 }), s)).toBe(false);
  });

  it('rejects a division whose divisor exceeds mulLeft.max', () => {
    // right = 13 exceeds mulLeft.max = 12.
    expect(producibleUnderSettings(P({ left: 26, op: '/', right: 13 }), s)).toBe(false);
  });

  it('rejects a division by zero', () => {
    expect(producibleUnderSettings(P({ left: 0, op: '/', right: 0 }), s)).toBe(false);
  });

  it('rejects division when the div operation is disabled', () => {
    expect(
      producibleUnderSettings(P({ left: 96, op: '/', right: 12 }), { ...s, divEnabled: false }),
    ).toBe(false);
  });
});

describe('checkProblems — range conformity is a hard violation', () => {
  it('reports no violation for an all-conforming game', () => {
    const result = judgeTexts(['34 + 66', '7 × 12', '96 ÷ 12', '91 – 4']);
    expect(result.violations).toEqual([]);
  });

  it('emits a range-nonconforming violation when a problem is out of range', () => {
    const result = judgeTexts(['34 + 66', '50 × 50']);
    expect(result.violations.map((v) => v.rule)).toContain('range-nonconforming');
  });

  it('counts every nonconforming problem in the violation detail', () => {
    const result = judgeTexts(['13 × 2', '14 × 2', '15 × 2']);
    const violation = result.violations[0];
    expect(violation?.rule).toBe('range-nonconforming');
    expect(violation?.detail).toContain('3');
  });

  it('ignores outcomes whose text cannot be parsed (handled upstream as anomalies)', () => {
    const recomputed: RecomputedScore = {
      score: 0,
      outcomes: [
        { text: 'not a problem', shownAt: 0, acceptedAt: 100, solveMs: 100, verified: false },
      ],
      anomalies: [],
      inputIntervalsMs: [],
      entryBursts: 0,
    };
    const record: GameRecord = {
      id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
      startedAtMs: 1_750_000_000_000,
      playedMs: 120_000,
      settings: ZETAMAC_DEFAULT_SETTINGS,
      events: [],
      claimedScore: 0,
    };
    expect(checkProblems(record, recomputed).violations).toEqual([]);
  });
});

describe('checkProblems — operation-mix plausibility', () => {
  it('flags a game where only one of four enabled operations ever appears', () => {
    // 30 distinct additions with all four ops enabled: P(no sub/mul/div) is
    // astronomically small, so the mix is implausible.
    const result = judgeTexts(opTexts('+', MIX_MIN_PROBLEMS));
    expect(flagRules(result)).toContain('operation-mix');
  });

  it('flags a long game missing one enabled operation entirely', () => {
    // 100 problems across add/sub/mul with division enabled but never shown:
    // at this sample size a completely absent op deviates beyond the bound.
    const texts = [...opTexts('+', 34), ...opTexts('-', 33), ...opTexts('*', 33)];
    const result = judgeTexts(texts);
    const flag = result.flags.find((f) => f.rule === 'operation-mix');
    expect(flag).toBeDefined();
    expect(flag?.detail).toContain('/ at 0%');
  });

  it('does not flag a balanced four-operation game', () => {
    const result = judgeTexts(balancedTexts(10)); // 40 problems, 25% each
    expect(flagRules(result)).not.toContain('operation-mix');
  });

  it('does not run below the minimum sample size', () => {
    const result = judgeTexts(opTexts('+', MIX_MIN_PROBLEMS - 1));
    expect(flagRules(result)).not.toContain('operation-mix');
  });

  it('does not flag a legitimate single-operation game (mul only)', () => {
    // Only mul enabled ⇒ 100% mul is exactly the expected share, not a deviation.
    const mulOnly = {
      ...ZETAMAC_DEFAULT_SETTINGS,
      addEnabled: false,
      subEnabled: false,
      divEnabled: false,
    };
    const result = judgeTexts(opTexts('*', 40), mulOnly);
    expect(flagRules(result)).not.toContain('operation-mix');
  });

  it('skips the mix test when the divisor range spans zero (generator re-rolls)', () => {
    // mulLeft.min = 0 lets pg_div return null and re-roll, so the op draw is not
    // exactly uniform; the mix rule conservatively abstains rather than false-flag.
    const zeroDivisor = {
      ...ZETAMAC_DEFAULT_SETTINGS,
      mulLeft: { min: 0, max: 5 },
    };
    const result = judgeTexts(opTexts('+', MIX_MIN_PROBLEMS), zeroDivisor);
    expect(flagRules(result)).not.toContain('operation-mix');
  });
});

describe('checkProblems — repetition / entropy', () => {
  it('flags "2 + 2 forever" against the wide default operand space', () => {
    const result = judgeTexts(Array.from({ length: 30 }, () => '2 + 2'));
    expect(flagRules(result)).toContain('low-entropy');
  });

  it('flags heavy repetition even when the operation mix is balanced', () => {
    // Four distinct problems (one per op), each repeated 8×: balanced ops, but
    // only four distinct values across 32 draws from a ~21,780-value space.
    const cycle = ['2 + 2', '6 – 4', '2 × 2', '4 ÷ 2'];
    const texts = Array.from({ length: 32 }, (_unused, i) => cycle[i % 4] ?? '');
    const result = judgeTexts(texts);
    expect(flagRules(result)).toContain('low-entropy');
    expect(flagRules(result)).not.toContain('operation-mix');
  });

  it('does not flag a game of distinct problems', () => {
    const result = judgeTexts(balancedTexts(8)); // 32 distinct problems
    expect(flagRules(result)).not.toContain('low-entropy');
  });

  it('does not run below the minimum sample size', () => {
    const result = judgeTexts(Array.from({ length: ENTROPY_MIN_PROBLEMS - 1 }, () => '2 + 2'));
    expect(flagRules(result)).not.toContain('low-entropy');
  });

  it('does not flag a legitimate narrow mul-only game (small operand space)', () => {
    // A 30s mul-only game with a narrow 2..12 × 2..12 space legitimately repeats
    // some products; the birthday bound is computed against THAT small space.
    const narrowMul = {
      ...ZETAMAC_DEFAULT_SETTINGS,
      addEnabled: false,
      subEnabled: false,
      divEnabled: false,
      mulLeft: { min: 2, max: 12 },
      mulRight: { min: 2, max: 12 },
      durationSeconds: 30,
    } as const;
    const { record, recomputed } = simulateGame(narrowMul, mulberry32(20260721), {
      count: 32,
      durationSeconds: 30,
    });
    const result = checkProblems(record, recomputed);
    expect(flagRules(result)).not.toContain('low-entropy');
    expect(result.violations).toEqual([]);
  });

  it('does not flag an add-only game (multiplication space absent)', () => {
    const addOnly = {
      ...ZETAMAC_DEFAULT_SETTINGS,
      subEnabled: false,
      mulEnabled: false,
      divEnabled: false,
    };
    const result = judgeTexts(opTexts('+', 20), addOnly);
    expect(flagRules(result)).not.toContain('low-entropy');
  });

  it('abstains when the operand space is too small to distinguish repetition', () => {
    // A 2..3 × 2..3 mul space has only four distinct problems, so even heavy
    // repetition is not rare enough to flag: the birthday threshold exceeds n.
    const tinyMul = {
      ...ZETAMAC_DEFAULT_SETTINGS,
      addEnabled: false,
      subEnabled: false,
      divEnabled: false,
      mulLeft: { min: 2, max: 3 },
      mulRight: { min: 2, max: 3 },
    };
    const cycle = ['2 × 2', '2 × 3', '3 × 2', '3 × 3'];
    const texts = Array.from({ length: 20 }, (_unused, i) => cycle[i % 4] ?? '');
    const result = judgeTexts(texts, tinyMul);
    expect(flagRules(result)).not.toContain('low-entropy');
    expect(result.violations).toEqual([]);
  });

  it('does not flag when no operation is enabled (degenerate space)', () => {
    const noneEnabled = {
      ...ZETAMAC_DEFAULT_SETTINGS,
      addEnabled: false,
      subEnabled: false,
      mulEnabled: false,
      divEnabled: false,
    };
    const result = judgeTexts(
      Array.from({ length: 20 }, () => '2 + 2'),
      noneEnabled,
    );
    expect(flagRules(result)).not.toContain('low-entropy');
    // Every problem is non-producible, so the hard range check still fires.
    expect(result.violations.map((v) => v.rule)).toContain('range-nonconforming');
  });
});

describe('checkProblems — problem-switch anomaly', () => {
  function withRawEvents(events: GameEvent[]): ProblemConformity {
    const record: GameRecord = {
      id: '5f0f1f7a-3c1e-4b2f-9d4a-8a4a0f9b2c3d',
      startedAtMs: 1_750_000_000_000,
      playedMs: 120_000,
      settings: ZETAMAC_DEFAULT_SETTINGS,
      events,
      claimedScore: 0,
    };
    return checkProblems(record, recomputeScore(events));
  }

  it('flags consecutive problem events with no accepted between them', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '2 + 2' },
      { kind: 'problem', at: 100, text: '3 + 3' }, // re-rendered before solving
      { kind: 'input', at: 900, value: '6' },
      { kind: 'accepted', at: 1000, answer: 6 },
    ];
    const result = withRawEvents(events);
    expect(flagRules(result)).toContain('problem-switch');
  });

  it('records the switch count in the flag detail', () => {
    const events: GameEvent[] = [
      { kind: 'problem', at: 0, text: '2 + 2' },
      { kind: 'problem', at: 50, text: '3 + 3' },
      { kind: 'problem', at: 100, text: '4 + 4' },
      { kind: 'input', at: 900, value: '8' },
      { kind: 'accepted', at: 1000, answer: 8 },
    ];
    const result = withRawEvents(events);
    const flag = result.flags.find((f) => f.rule === 'problem-switch');
    expect(flag?.detail).toContain('2'); // two unsolved re-renders
  });

  it('does not flag a clean game where every problem is solved before the next', () => {
    const { record, recomputed } = gameFrom(['2 + 2', '3 + 3', '4 + 4']);
    expect(flagRules(checkProblems(record, recomputed))).not.toContain('problem-switch');
  });
});
