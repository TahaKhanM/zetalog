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
  /** A capture failure — surfaces the "recorder needs an update" banner. */
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

  // CAPTURE-phase listener on the document, NOT a plain listener on the input.
  // Zetamac's own `input` handler (registered on the element at page init, so
  // before this content script's document_idle registration) accepts a correct
  // answer inside the same dispatch and clears the field synchronously via
  // jQuery `.val('')` — which fires no further input event. A same-target
  // listener registered after Zetamac's would therefore read "" on every
  // ACCEPTING keystroke, corrupting the final snapshot of every problem. The
  // document-level capture listener runs in the capture phase — strictly before
  // any target-phase handler regardless of registration order — so the
  // snapshot always sees the value the player actually typed.
  const onInput = (event: Event): void => {
    if (event.target !== answerEl) return;
    recorder.inputChanged(answerEl.value, at());
  };

  // Ordering audit (same hazard class as the input snapshot above): Zetamac
  // mutates the score text, problem text, and field — all synchronously —
  // inside its own `input` handler, but MutationObserver callbacks run as a
  // microtask AFTER that dispatch completes. By then the capture-phase snapshot
  // above has already recorded the accepting keystroke, so the derived
  // `accepted` event always FOLLOWS its `input` snapshot in the stream; and
  // within one callback the score check runs before the problem check, so the
  // accept also precedes the next `problem`. No ordering fix needed here.
  const observer = new MutationObserver(() => {
    if (finished) return;
    // Score before problem: the accepted event must precede the next problem
    // so the server can recompute the stream in order.
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
    doc.removeEventListener('input', onInput, true);
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

  doc.addEventListener('input', onInput, true);
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
