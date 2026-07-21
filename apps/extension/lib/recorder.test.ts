import {
  ZETAMAC_DEFAULT_SETTINGS,
  gameRecordSchema,
  recomputeScore,
  type GameEvent,
} from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { createRecorder, type RecorderDeps } from './recorder.js';

const deps: RecorderDeps = {
  settings: ZETAMAC_DEFAULT_SETTINGS,
  startedAtMs: 1_700_000_000_000,
  id: '11111111-1111-4111-8111-111111111111',
};

function accepted(
  events: readonly GameEvent[],
): readonly Extract<GameEvent, { kind: 'accepted' }>[] {
  return events.filter((event) => event.kind === 'accepted');
}

describe('createRecorder — a clean two-problem game', () => {
  it('produces a schema-valid record the shared recomputer agrees with', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('34 + 66', 0);
    recorder.inputChanged('1', 300);
    recorder.inputChanged('10', 600);
    recorder.inputChanged('100', 900);
    recorder.scoreIncremented(900);
    recorder.problemShown('7 × 3', 950);
    recorder.inputChanged('2', 1200);
    recorder.inputChanged('21', 1500);
    recorder.scoreIncremented(1500);
    const record = recorder.finish(2000);

    expect(gameRecordSchema.safeParse(record).success).toBe(true);
    expect(record.id).toBe(deps.id);
    expect(record.startedAtMs).toBe(deps.startedAtMs);
    expect(record.settings).toBe(ZETAMAC_DEFAULT_SETTINGS);
    expect(record.playedMs).toBe(2000);
    expect(record.claimedScore).toBe(2);
    expect(recomputeScore(record.events).score).toBe(2);
  });

  it('emits events in problem → input → accepted order', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('34 + 66', 0);
    recorder.inputChanged('100', 900);
    recorder.scoreIncremented(900);
    const record = recorder.finish(1000);

    expect(record.events.map((event) => event.kind)).toEqual(['problem', 'input', 'accepted']);
  });
});

describe('createRecorder — accepted answer derivation', () => {
  it('derives the accepted answer from the last input value', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('34 + 66', 0);
    recorder.inputChanged('1', 100);
    recorder.inputChanged('10', 200);
    recorder.inputChanged('100', 300);
    recorder.scoreIncremented(300);
    const record = recorder.finish(1000);

    expect(accepted(record.events)).toEqual([{ kind: 'accepted', at: 300, answer: 100 }]);
  });

  it('trims surrounding whitespace before deriving the answer', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('12 + 3', 0);
    recorder.inputChanged('  15 ', 200);
    recorder.scoreIncremented(200);
    const record = recorder.finish(1000);

    expect(accepted(record.events)[0]?.answer).toBe(15);
  });
});

describe('createRecorder — claimedScore', () => {
  it('counts the accepted events', () => {
    const recorder = createRecorder(deps);
    for (let n = 0; n < 3; n++) {
      recorder.problemShown('2 + 2', n * 100);
      recorder.inputChanged('4', n * 100 + 50);
      recorder.scoreIncremented(n * 100 + 50);
    }
    const record = recorder.finish(1000);

    expect(record.claimedScore).toBe(3);
    expect(accepted(record.events)).toHaveLength(3);
  });
});

describe('createRecorder — aborted game', () => {
  it('records a valid zero-score record when the player never solves a problem', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('34 + 66', 0);
    recorder.inputChanged('9', 400);
    const record = recorder.finish(1200);

    expect(gameRecordSchema.safeParse(record).success).toBe(true);
    expect(record.claimedScore).toBe(0);
    expect(record.playedMs).toBe(1200);
    expect(accepted(record.events)).toHaveLength(0);
  });
});

describe('createRecorder — over-long input', () => {
  it('caps a recorded input value at the 12-character schema limit', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('2 + 2', 0);
    recorder.inputChanged('1234567890123456', 100);
    const record = recorder.finish(1000);

    const input = record.events.find((event) => event.kind === 'input');
    expect(input?.value).toBe('123456789012');
    expect(gameRecordSchema.safeParse(record).success).toBe(true);
  });

  it('falls back to 0 when the last input is not a finite number, keeping the record valid', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('2 + 2', 0);
    recorder.inputChanged('abc', 100);
    recorder.scoreIncremented(100);
    const record = recorder.finish(1000);

    expect(accepted(record.events)[0]?.answer).toBe(0);
    expect(gameRecordSchema.safeParse(record).success).toBe(true);
  });

  it('derives the accepted answer from the capped value', () => {
    const recorder = createRecorder(deps);
    recorder.problemShown('2 + 2', 0);
    recorder.inputChanged('999999999999999', 100);
    recorder.scoreIncremented(100);
    const record = recorder.finish(1000);

    expect(accepted(record.events)[0]?.answer).toBe(999_999_999_999);
  });
});
