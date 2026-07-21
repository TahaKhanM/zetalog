import {
  ZETAMAC_DEFAULT_SETTINGS,
  fingerprint,
  type GameEvent,
  type GameRecord,
} from '@zetalog/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  RATE_LIMIT_MAX,
  RATE_WINDOW_MS,
  submitGame,
  type GameToInsert,
  type PersistedGame,
  type SubmitPort,
} from './submit';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '33333333-3333-4333-8333-333333333333';
const NOW_MS = 1_700_000_000_000;

/** A clean, human-paced event stream: `count` problems of "2 + 3", each solved
 *  in `solveMs` with the answer typed one digit at a time (no entry bursts). */
function cleanEvents(count: number, solveMs = 1500): GameEvent[] {
  const events: GameEvent[] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    events.push({ kind: 'problem', at, text: '2 + 3' });
    at += solveMs - 20;
    events.push({ kind: 'input', at, value: '5' });
    at += 20;
    events.push({ kind: 'accepted', at, answer: 5 });
    at += 700;
  }
  return events;
}

function record(over: Partial<GameRecord> = {}): GameRecord {
  return {
    id: GAME_ID,
    startedAtMs: 0,
    playedMs: 118_000,
    settings: ZETAMAC_DEFAULT_SETTINGS,
    events: cleanEvents(3),
    claimedScore: 3,
    ...over,
  };
}

interface PortOverrides {
  recentCount?: number;
  acceptedScores?: number[];
  persist?: (game: GameToInsert) => PersistedGame;
}

function makePort(over: PortOverrides = {}): {
  port: SubmitPort;
  inserted: GameToInsert[];
  countSpy: ReturnType<typeof vi.fn>;
  scoresSpy: ReturnType<typeof vi.fn>;
  insertSpy: ReturnType<typeof vi.fn>;
} {
  const inserted: GameToInsert[] = [];
  const countSpy = vi.fn(async () => Promise.resolve(over.recentCount ?? 0));
  const scoresSpy = vi.fn(async () => Promise.resolve(over.acceptedScores ?? []));
  const insertSpy = vi.fn(async (game: GameToInsert) => {
    inserted.push(game);
    return Promise.resolve(
      over.persist?.(game) ?? { id: 'row-1', outcome: game.status, serverScore: game.serverScore },
    );
  });
  return {
    port: {
      countGamesReceivedSince: countSpy,
      getAcceptedScores: scoresSpy,
      insertGame: insertSpy,
    },
    inserted,
    countSpy,
    scoresSpy,
    insertSpy,
  };
}

describe('submitGame — gating', () => {
  it('rejects a non-rankable game with 422 before any DB work', async () => {
    const { port, countSpy, insertSpy } = makePort();
    const nonDefault: GameRecord = record({
      settings: { ...ZETAMAC_DEFAULT_SETTINGS, durationSeconds: 45 },
    });
    const result = await submitGame(nonDefault, USER_ID, NOW_MS, port);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ error: { code: 'not-rankable' } });
    expect(countSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rate-limits once more than the hourly cap has been received', async () => {
    const { port, scoresSpy, insertSpy } = makePort({ recentCount: RATE_LIMIT_MAX + 1 });
    const result = await submitGame(record(), USER_ID, NOW_MS, port);
    expect(result.status).toBe(429);
    expect(result.body).toMatchObject({ error: { code: 'rate-limited' } });
    expect(scoresSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('allows a submission exactly at the cap and counts the hour window', async () => {
    const { port, countSpy } = makePort({ recentCount: RATE_LIMIT_MAX });
    const result = await submitGame(record(), USER_ID, NOW_MS, port);
    expect(result.status).toBe(201);
    expect(countSpy).toHaveBeenCalledWith(USER_ID, NOW_MS - RATE_WINDOW_MS);
  });
});

describe('submitGame — played_at derivation', () => {
  // A realistic client wall clock (June 2025, mirroring the shared fixtures),
  // received 90 seconds later.
  const STARTED_AT = 1_750_000_000_000;
  const RECEIVED_AT = STARTED_AT + 90_000;

  it('uses the client startedAtMs when it is plausible', async () => {
    const { port, inserted } = makePort();
    await submitGame(record({ startedAtMs: STARTED_AT }), USER_ID, RECEIVED_AT, port);
    expect(inserted[0]?.playedAt).toBe(new Date(STARTED_AT).toISOString());
  });

  it('falls back to the server clock when startedAtMs is in the future', async () => {
    const { port, inserted } = makePort();
    await submitGame(record({ startedAtMs: RECEIVED_AT + 60_000 }), USER_ID, RECEIVED_AT, port);
    expect(inserted[0]?.playedAt).toBe(new Date(RECEIVED_AT).toISOString());
  });

  it('falls back to the server clock for an implausibly old startedAtMs', async () => {
    const { port, inserted } = makePort();
    // 0 and anything before 2020-01-01 are treated as a broken client clock.
    await submitGame(record({ startedAtMs: 0 }), USER_ID, RECEIVED_AT, port);
    await submitGame(record({ startedAtMs: 1_500_000_000_000 }), USER_ID, RECEIVED_AT, port);
    expect(inserted[0]?.playedAt).toBe(new Date(RECEIVED_AT).toISOString());
    expect(inserted[1]?.playedAt).toBe(new Date(RECEIVED_AT).toISOString());
  });

  it('accepts startedAtMs exactly at the receive instant (boundary)', async () => {
    const { port, inserted } = makePort();
    await submitGame(record({ startedAtMs: RECEIVED_AT }), USER_ID, RECEIVED_AT, port);
    expect(inserted[0]?.playedAt).toBe(new Date(RECEIVED_AT).toISOString());
  });
});

describe('submitGame — judging and persistence', () => {
  it('accepts a clean human game and returns the server score', async () => {
    const { port, inserted } = makePort();
    const result = await submitGame(record(), USER_ID, NOW_MS, port);
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: 'row-1', outcome: 'accepted', serverScore: 3 });
    const row = inserted[0];
    expect(row).toBeDefined();
    expect(row?.status).toBe('accepted');
    expect(row?.serverScore).toBe(3);
    expect(row?.claimedScore).toBe(3);
    expect(row?.rankableDuration).toBe(120);
    expect(row?.clientGameId).toBe(GAME_ID);
    expect(row?.playedAt).toBe(new Date(NOW_MS).toISOString());
    expect(row?.settingsFingerprint).toBe(fingerprint(ZETAMAC_DEFAULT_SETTINGS));
    expect(row?.telemetry).toEqual(record().events);
    expect(row?.validation.outcome).toBe('accepted');
  });

  it('quarantines a super-human game (answer-floor) via judge', async () => {
    const { port, inserted } = makePort();
    const fast = record({ events: cleanEvents(3, 100), claimedScore: 3 });
    const result = await submitGame(fast, USER_ID, NOW_MS, port);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ outcome: 'quarantined' });
    expect(inserted[0]?.status).toBe('quarantined');
    expect(inserted[0]?.validation.flags.map((f) => f.rule)).toContain('answer-floor');
  });

  it('quarantines an implausible personal-best jump using history', async () => {
    const { port } = makePort({ acceptedScores: Array.from({ length: 10 }, () => 5) });
    // A clean stream scoring 3 is not a jump; craft a high clean score instead.
    const big = record({ events: cleanEvents(40), claimedScore: 40 });
    const result = await submitGame(big, USER_ID, NOW_MS, port);
    expect(result.body).toMatchObject({ outcome: 'quarantined' });
  });

  it('rejects a fabricated stream with non-monotonic timestamps', async () => {
    const { port, inserted } = makePort();
    const events: GameEvent[] = [
      { kind: 'problem', at: 1000, text: '2 + 3' },
      { kind: 'input', at: 500, value: '5' },
      { kind: 'accepted', at: 1500, answer: 5 },
    ];
    const result = await submitGame(record({ events, claimedScore: 1 }), USER_ID, NOW_MS, port);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ outcome: 'rejected' });
    expect(inserted[0]?.status).toBe('rejected');
  });

  it('is idempotent: on conflict it returns the existing row unchanged', async () => {
    const { port } = makePort({
      persist: () => ({ id: 'existing-row', outcome: 'accepted', serverScore: 3 }),
    });
    const result = await submitGame(record(), USER_ID, NOW_MS, port);
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: 'existing-row', outcome: 'accepted', serverScore: 3 });
  });

  it('passes the accepted-score history into judge', async () => {
    const { port, scoresSpy } = makePort({ acceptedScores: [10, 20] });
    await submitGame(record(), USER_ID, NOW_MS, port);
    expect(scoresSpy).toHaveBeenCalledWith(USER_ID, 120);
  });
});
