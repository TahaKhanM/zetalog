import type { GameEvent, GameRecord, ZetamacSettings } from '@zetalog/shared';

/** Maximum characters stored per input snapshot — matches `gameEventSchema` (`value.max(12)`). */
const MAX_INPUT_LENGTH = 12;

/**
 * Resolved facts a recorder needs up front. The content script injects these
 * (Date.now wall-clock start, crypto.randomUUID id) so the core stays pure
 * and fully deterministic in tests.
 */
export interface RecorderDeps {
  readonly settings: ZetamacSettings;
  /** Wall-clock game start (`Date.now()`), stored verbatim on the record. */
  readonly startedAtMs: number;
  /** Stable game id (`crypto.randomUUID()`). */
  readonly id: string;
}

/**
 * A pure, DOM-free state machine that turns recorder observations into a
 * `GameRecord`. All timestamps (`at`) are monotonic and relative to game start
 * (`performance.now()` deltas); the caller supplies them.
 */
export interface Recorder {
  /** A new problem became visible. */
  problemShown(text: string, at: number): void;
  /** The answer box changed — recorded as a full value snapshot, capped at 12 chars. */
  inputChanged(value: string, at: number): void;
  /** Zetamac auto-advanced: the running score went up. Emits `accepted` for the last input. */
  scoreIncremented(at: number): void;
  /** End the game and produce the record. `playedMs` is the elapsed time passed here. */
  finish(at: number): GameRecord;
}

/** Derive a schema-valid integer answer from an input snapshot. */
function toAnswer(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/** Create a recorder for one game. */
export function createRecorder(deps: RecorderDeps): Recorder {
  const events: GameEvent[] = [];
  let lastInputValue = '';
  let claimedScore = 0;

  return {
    problemShown(text, at) {
      events.push({ kind: 'problem', at, text });
    },
    inputChanged(value, at) {
      const capped = value.length > MAX_INPUT_LENGTH ? value.slice(0, MAX_INPUT_LENGTH) : value;
      lastInputValue = capped;
      events.push({ kind: 'input', at, value: capped });
    },
    scoreIncremented(at) {
      claimedScore += 1;
      events.push({ kind: 'accepted', at, answer: toAnswer(lastInputValue) });
    },
    finish(at) {
      return {
        id: deps.id,
        startedAtMs: deps.startedAtMs,
        playedMs: at,
        settings: deps.settings,
        events: [...events],
        claimedScore,
      };
    },
  };
}
