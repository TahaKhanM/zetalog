import { ZETAMAC_DEFAULT_SETTINGS, type GameRecord, type ZetamacSettings } from '@zetalog/shared';

import { createRecorder } from './recorder.js';
import { answerInput, problemSpan, scoreSpan, settingsScript, timerSpan } from './selectors.js';
import { parseGameSettings } from './settings.js';

/** Injected time/identity sources — keeps the recorder core pure and tests deterministic. */
export interface CaptureClock {
  /** Monotonic elapsed source (`performance.now()`). */
  readonly now: () => number;
  /** Wall-clock game start, taken once (`Date.now()`). */
  readonly wallClock: () => number;
  /** Fresh game id (`crypto.randomUUID()`). */
  readonly uuid: () => string;
}

/** Where finished games and capture failures are routed (the storage repository). */
export interface CaptureHooks {
  /** A completed (or mid-game-exited) game — the store applies quarantine + status. */
  readonly onGameComplete: (record: GameRecord) => void;
  /** A capture failure — surfaces the "recorder needs an update" banner (spec §3.1, §9). */
  readonly onCaptureFailed: (record: GameRecord) => void;
}

/** Everything a capture needs: the live page, its window, a clock, and the sinks. */
export interface CaptureEnv {
  readonly document: Document;
  readonly window: Window;
  readonly clock: CaptureClock;
  readonly hooks: CaptureHooks;
}

/** Teardown handle returned by {@link startCapture}. */
export interface CaptureHandle {
  /** Detach all listeners/observers without saving (idempotent). */
  readonly stop: () => void;
}

const NOOP_HANDLE: CaptureHandle = { stop: () => undefined };

/** Extract the running score from `Score: N` text; null when it does not match. */
function readScore(text: string): number | null {
  const match = /(\d+)/.exec(text);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/**
 * Attach the recorder to a live Zetamac game page. Resolves settings and the
 * required elements up front; any failure routes a placeholder record to
 * `onCaptureFailed` and captures nothing further (never a silent loss, never a
 * throw across the boundary). On success it observes the DOM and drives the
 * pure recorder, saving on game-over (`disabled`) or mid-game `pagehide`.
 */
export function startCapture(env: CaptureEnv): CaptureHandle {
  const { document: doc, window: win, clock, hooks } = env;

  function failCapture(settings: ZetamacSettings): CaptureHandle {
    hooks.onCaptureFailed({
      id: clock.uuid(),
      startedAtMs: clock.wallClock(),
      playedMs: 0,
      settings,
      events: [],
      claimedScore: 0,
    });
    return NOOP_HANDLE;
  }

  const script = settingsScript(doc);
  if (!script.ok) return failCapture(ZETAMAC_DEFAULT_SETTINGS);

  const settings = parseGameSettings(script.value.textContent);
  if (!settings.ok) return failCapture(ZETAMAC_DEFAULT_SETTINGS);

  const problem = problemSpan(doc);
  const answer = answerInput(doc);
  const score = scoreSpan(doc);
  const timer = timerSpan(doc);
  const gameRoot = doc.querySelector('#game');
  if (!problem.ok || !answer.ok || !score.ok || !timer.ok || gameRoot === null) {
    return failCapture(settings.value);
  }

  const problemEl = problem.value;
  const answerEl = answer.value;
  const scoreEl = score.value;

  const startPerf = clock.now();
  const at = (): number => clock.now() - startPerf;
  const recorder = createRecorder({
    settings: settings.value,
    startedAtMs: clock.wallClock(),
    id: clock.uuid(),
  });

  let lastScore = readScore(scoreEl.textContent) ?? 0;
  let lastProblem = problemEl.textContent.trim();
  if (lastProblem.length > 0) recorder.problemShown(lastProblem, at());

  let finished = false;

  const onInput = (): void => {
    recorder.inputChanged(answerEl.value, at());
  };

  const observer = new MutationObserver(() => {
    if (finished) return;
    // Score before problem: the accepted event must precede the next problem
    // so the server can recompute the stream in order (spec §5).
    const nextScore = readScore(scoreEl.textContent);
    const accepted = nextScore !== null && nextScore > lastScore;
    if (accepted) {
      recorder.scoreIncremented(at());
      lastScore = nextScore;
    }
    // Record the next problem whenever one is present. A score increment means
    // Zetamac accepted the answer and advanced to a fresh problem — detect that
    // via the accept/input-clear cycle, NOT text inequality, because Zetamac
    // legitimately repeats the same problem text back-to-back (~0.7% of default
    // 120s games). Gating on `!==` alone would drop the repeat's `problem`
    // event, leaving its accept an `accepted-without-problem` anomaly and
    // undercounting the recomputed score by one.
    const nextProblem = problemEl.textContent.trim();
    if (nextProblem.length > 0 && (accepted || nextProblem !== lastProblem)) {
      recorder.problemShown(nextProblem, at());
      lastProblem = nextProblem;
    }
    if (answerEl.disabled) finish();
  });

  function teardown(): void {
    observer.disconnect();
    answerEl.removeEventListener('input', onInput);
    win.removeEventListener('pagehide', onPageHide);
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    teardown();
    hooks.onGameComplete(recorder.finish(at()));
  }

  function onPageHide(): void {
    finish();
  }

  answerEl.addEventListener('input', onInput);
  win.addEventListener('pagehide', onPageHide);
  observer.observe(gameRoot, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });

  return {
    stop: () => {
      if (finished) return;
      finished = true;
      teardown();
    },
  };
}
