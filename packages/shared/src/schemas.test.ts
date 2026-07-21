import { describe, expect, it } from 'vitest';

import { gameEventSchema, gameRecordSchema, zetamacSettingsSchema } from './schemas';

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
    expect(
      gameEventSchema.safeParse({ kind: 'input', at: 1, value: '1234567890123' }).success,
    ).toBe(false);
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
        { kind: 'problem', at: 0, text: '3 + 4' },
        { kind: 'input', at: 400, value: '7' },
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
