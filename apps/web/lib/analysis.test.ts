import type { GameEvent } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { WEAK_SPOT_MIN_SOLVED, buildAnalysis } from './analysis';
import type { GameRow } from './db/rows';

/** A minimal accepted GameRow with the given telemetry. */
function row(events: GameEvent[], status: GameRow['status'] = 'accepted'): GameRow {
  return {
    id: 'g',
    user_id: 'u',
    client_game_id: 'c',
    played_at: '2026-07-01T18:00:00.000Z',
    received_at: '2026-07-01T18:02:00.000Z',
    settings_fingerprint: 'add:2-100x2-100|sub:on|mul:2-12x2-100|div:on|t:120',
    rankable_duration: 120,
    claimed_score: 1,
    server_score: 1,
    status,
    telemetry: events,
    validation: {
      outcome: 'accepted',
      serverScore: 1,
      violations: [],
      flags: [],
      historyFlag: null,
      problemViolations: [],
      problemFlags: [],
    },
  };
}

/** One verified solve of `text` taking `solveMs`. */
function solveEvents(text: string, answer: number, solveMs: number): GameEvent[] {
  return [
    { kind: 'problem', at: 0, text },
    { kind: 'input', at: solveMs - 50, value: String(answer) },
    { kind: 'accepted', at: solveMs, answer },
  ];
}

describe('buildAnalysis', () => {
  it('returns null when no accepted game has any verified solve', () => {
    expect(buildAnalysis([])).toBeNull();
    expect(buildAnalysis([row([])])).toBeNull();
    expect(buildAnalysis([row(solveEvents('3 + 4', 7, 900), 'quarantined')])).toBeNull();
  });

  it('pools solves across accepted games only and reports totals', () => {
    const analysis = buildAnalysis([
      row(solveEvents('3 + 4', 7, 900)),
      row(solveEvents('8 × 4', 32, 2100)),
      row(solveEvents('9 + 9', 18, 1500), 'quarantined'), // excluded
    ]);
    expect(analysis?.gamesAnalysed).toBe(2);
    expect(analysis?.problemsAnalysed).toBe(2);
  });

  it('reports per-operation medians with display symbols and time shares', () => {
    const analysis = buildAnalysis([
      row([
        ...solveEvents('3 + 4', 7, 1000),
        { kind: 'problem', at: 2000, text: '12 ÷ 4' },
        { kind: 'input', at: 4900, value: '3' },
        { kind: 'accepted', at: 5000, answer: 3 },
      ]),
    ]);
    expect(analysis?.ops).toEqual([
      { op: '+', symbol: '+', solved: 1, medianMs: 1000, share: 0.25 },
      { op: '/', symbol: '÷', solved: 1, medianMs: 3000, share: 0.75 },
    ]);
  });

  it('surfaces times-table facts for multiplication and division', () => {
    const analysis = buildAnalysis([
      row([...solveEvents('12 × 7', 84, 2600), ...shift(solveEvents('84 ÷ 12', 7, 3400), 5000)]),
    ]);
    expect(analysis?.facts).toEqual([
      { op: '*', factor: 12, solved: 1, medianMs: 2600 },
      { op: '/', factor: 12, solved: 1, medianMs: 3400 },
    ]);
  });

  it('names weak spots only at sufficient sample size, with a ratio vs the fastest area', () => {
    const events: GameEvent[] = [];
    let at = 0;
    // 8 plain additions at 1000ms — the fast baseline.
    for (let i = 0; i < WEAK_SPOT_MIN_SOLVED; i += 1) {
      events.push(...shift(solveEvents('2 + 3', 5, 1000), at));
      at += 2000;
    }
    // 8 large divisions at 3000ms — the weak spot.
    for (let i = 0; i < WEAK_SPOT_MIN_SOLVED; i += 1) {
      events.push(...shift(solveEvents('63 ÷ 9', 7, 3000), at));
      at += 4000;
    }
    // 2 large multiplications at 9000ms — too few to name.
    for (let i = 0; i < 2; i += 1) {
      events.push(...shift(solveEvents('12 × 9', 108, 9000), at));
      at += 10000;
    }
    const analysis = buildAnalysis([row(events)]);
    expect(analysis?.weakSpots[0]).toEqual({
      key: 'div-large',
      label: '÷ by 7–12',
      solved: 8,
      medianMs: 3000,
      ratio: 3,
    });
    expect(analysis?.weakSpots.some((spot) => spot.key === 'mul-large')).toBe(false);
  });

  it('lists the toughest individual solves, slowest first', () => {
    const analysis = buildAnalysis([
      row([
        ...solveEvents('3 + 4', 7, 700),
        ...shift(solveEvents('96 ÷ 12', 8, 5200), 1000),
        ...shift(solveEvents('11 × 87', 957, 7800), 8000),
      ]),
    ]);
    expect(analysis?.toughest.map((t) => t.text)).toEqual(['11 × 87', '96 ÷ 12', '3 + 4']);
    expect(analysis?.toughest[0]?.solveMs).toBe(7800);
  });
});

/** Shift a solve's timestamps by `by` ms so pooled events stay monotonic. */
function shift(events: GameEvent[], by: number): GameEvent[] {
  return events.map((event) => ({ ...event, at: event.at + by }));
}
