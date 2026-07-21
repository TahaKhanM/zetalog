import { recomputeScore, type GameRecord } from '@zetalog/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { mountGamePage } from '../test/fixtures.js';
import { startCapture, type CaptureClock, type CaptureHooks } from './wiring.js';

/** A settable monotonic clock plus fixed wall-clock/uuid, injected into the capture. */
function makeClock(): { clock: CaptureClock; set: (ms: number) => void } {
  const state = { t: 0 };
  return {
    clock: {
      now: () => state.t,
      wallClock: () => 1_700_000_000_000,
      uuid: () => '22222222-2222-4222-8222-222222222222',
    },
    set: (ms: number) => {
      state.t = ms;
    },
  };
}

function makeHooks(): {
  hooks: CaptureHooks;
  completed: GameRecord[];
  failed: GameRecord[];
} {
  const completed: GameRecord[] = [];
  const failed: GameRecord[] = [];
  return {
    hooks: {
      onGameComplete: (record) => completed.push(record),
      onCaptureFailed: (record) => failed.push(record),
    },
    completed,
    failed,
  };
}

/** Wait for MutationObserver callbacks (microtasks) to run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function problemEl(): HTMLElement {
  const found = document.querySelector<HTMLElement>('#game span.problem');
  if (found === null) throw new Error('missing problem span');
  return found;
}
function answerEl(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>('#game input.answer');
  if (found === null) throw new Error('missing answer input');
  return found;
}
function scoreEl(): HTMLElement {
  const found = document.querySelector<HTMLElement>('#game > span.correct');
  if (found === null) throw new Error('missing score span');
  return found;
}

/** Simulate the player typing an answer that Zetamac accepts. */
function typeAnswer(value: string): void {
  const input = answerEl();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Simulate Zetamac advancing to the next problem after a correct answer. */
function advance(nextProblem: string, newScore: number): void {
  problemEl().textContent = nextProblem;
  answerEl().value = '';
  scoreEl().textContent = `Score: ${String(newScore)}`;
}

describe('startCapture — a full clean game', () => {
  beforeEach(() => {
    mountGamePage();
    problemEl().textContent = '34 + 66';
  });

  it('records the scripted game and hands a schema-valid record to onGameComplete', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed, failed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    set(900);
    typeAnswer('100');
    advance('20 + 5', 1);
    await flush();

    set(1500);
    typeAnswer('25');
    advance('9 + 9', 2);
    await flush();

    set(2000);
    answerEl().disabled = true;
    await flush();

    expect(failed).toHaveLength(0);
    expect(completed).toHaveLength(1);
    const record = completed[0];
    if (record === undefined) return;
    expect(record.claimedScore).toBe(2);
    expect(record.playedMs).toBe(2000);
    expect(record.startedAtMs).toBe(1_700_000_000_000);
    expect(record.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(record.events.map((e) => e.kind)).toEqual([
      'problem',
      'input',
      'accepted',
      'problem',
      'input',
      'accepted',
      'problem',
    ]);
    expect(recomputeScore(record.events).score).toBe(2);
  });

  it('records a repeated identical problem so both accepts recompute (Zetamac ~0.7% of games)', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();
    // beforeEach painted the first problem '34 + 66'.
    startCapture({ document, window, clock, hooks });

    set(900);
    typeAnswer('100');
    // Zetamac legitimately shows the SAME problem text again after a correct answer.
    advance('34 + 66', 1);
    await flush();

    set(1500);
    typeAnswer('100');
    advance('9 + 9', 2);
    await flush();

    set(2000);
    answerEl().disabled = true;
    await flush();

    const record = completed[0];
    if (record === undefined) throw new Error('no record');
    // The repeated problem must get its own `problem` event, so the second
    // accept has a problem to attach to.
    expect(record.events.map((e) => e.kind)).toEqual([
      'problem',
      'input',
      'accepted',
      'problem',
      'input',
      'accepted',
      'problem',
    ]);
    const recomputed = recomputeScore(record.events);
    expect(recomputed.score).toBe(2);
    expect(recomputed.anomalies).toEqual([]);
  });

  it('emits the accepted answer before the next problem (server-recomputable order)', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    set(500);
    typeAnswer('100');
    advance('20 + 5', 1);
    await flush();

    set(1000);
    answerEl().disabled = true;
    await flush();

    const record = completed[0];
    if (record === undefined) throw new Error('no record');
    const accepted = record.events.find((e) => e.kind === 'accepted');
    expect(accepted?.answer).toBe(100);
  });

  it('does not save twice when disabled fires more than once', async () => {
    const { clock } = makeClock();
    const { hooks, completed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    answerEl().disabled = true;
    await flush();
    answerEl().removeAttribute('disabled');
    answerEl().disabled = true;
    await flush();

    expect(completed).toHaveLength(1);
  });
});

describe('startCapture — page handler clears the input on accept (real Zetamac behaviour)', () => {
  beforeEach(() => {
    mountGamePage();
    problemEl().textContent = '34 + 66';
  });

  it('still snapshots the accepting keystroke when the page clears the field synchronously', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();

    // Zetamac's own handler (test/fixtures/zetamac-app.js): registered on the
    // input at page INIT — i.e. before the content script's document_idle
    // listener — it accepts inside the same bubble-phase `input` dispatch and
    // clears the field synchronously via problemGeng() → answer.val(''), which
    // fires no further input event. Any later-registered same-target listener
    // therefore reads "" on every accepting keystroke.
    const input = answerEl();
    input.addEventListener('input', () => {
      if (input.value.trim() === '100') {
        problemEl().textContent = '20 + 5';
        input.value = '';
        scoreEl().textContent = 'Score: 1';
      }
    });

    startCapture({ document, window, clock, hooks });

    set(900);
    typeAnswer('100');
    await flush();

    set(1200);
    answerEl().disabled = true;
    await flush();

    const record = completed[0];
    if (record === undefined) throw new Error('no record');
    const accepted = record.events.find((e) => e.kind === 'accepted');
    // The recorder must have snapshotted "100" BEFORE the page handler cleared
    // the field — the derived accept carries the real answer and the stream
    // recomputes to the verified score with zero anomalies.
    expect(accepted?.answer).toBe(100);
    const recomputed = recomputeScore(record.events);
    expect(recomputed.score).toBe(1);
    expect(recomputed.anomalies).toEqual([]);
  });
});

describe('startCapture — first problem arriving after start', () => {
  beforeEach(() => {
    mountGamePage();
    // Leave the problem span empty, as it is before init() paints the first problem.
  });

  it('captures the first problem from a mutation when the span starts empty', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    set(50);
    problemEl().textContent = '34 + 66';
    await flush();

    set(900);
    typeAnswer('100');
    advance('20 + 5', 1);
    await flush();

    set(1000);
    answerEl().disabled = true;
    await flush();

    const record = completed[0];
    if (record === undefined) throw new Error('no record');
    expect(record.events[0]).toEqual({ kind: 'problem', at: 50, text: '34 + 66' });
    expect(record.claimedScore).toBe(1);
  });
});

describe('startCapture — resilient score reading', () => {
  beforeEach(() => {
    mountGamePage();
    problemEl().textContent = '34 + 66';
  });

  it('treats a non-numeric starting score as zero and still counts solves', async () => {
    scoreEl().textContent = 'Score:'; // no digits yet
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    set(900);
    typeAnswer('100');
    advance('20 + 5', 1);
    await flush();

    set(1000);
    answerEl().disabled = true;
    await flush();

    expect(completed[0]?.claimedScore).toBe(1);
  });
});

describe('startCapture — stop()', () => {
  beforeEach(() => {
    mountGamePage();
    problemEl().textContent = '34 + 66';
  });

  it('detaches without saving and ignores later game events', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();
    const handle = startCapture({ document, window, clock, hooks });

    handle.stop();
    handle.stop(); // idempotent

    set(900);
    typeAnswer('100');
    advance('20 + 5', 1);
    answerEl().disabled = true;
    await flush();

    expect(completed).toHaveLength(0);
  });
});

describe('startCapture — mid-game exit', () => {
  beforeEach(() => {
    mountGamePage();
    problemEl().textContent = '34 + 66';
  });

  it('saves the partial game on pagehide before completion', async () => {
    const { clock, set } = makeClock();
    const { hooks, completed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    set(700);
    typeAnswer('100');
    advance('20 + 5', 1);
    await flush();

    set(1200);
    window.dispatchEvent(new Event('pagehide'));
    await flush();

    expect(completed).toHaveLength(1);
    expect(completed[0]?.claimedScore).toBe(1);
    expect(completed[0]?.playedMs).toBe(1200);
  });
});

describe('startCapture — capture failures', () => {
  it('reports a capture failure when the settings script is absent', () => {
    document.documentElement.innerHTML =
      '<body><div id="game"><span class="problem"></span><input class="answer" /><span class="correct">Score: 0</span></div></body>';
    const { clock } = makeClock();
    const { hooks, completed, failed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    expect(completed).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.events).toEqual([]);
  });

  it('reports a capture failure when a required element is missing', () => {
    mountGamePage();
    scoreEl().remove();
    const { clock } = makeClock();
    const { hooks, completed, failed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    expect(completed).toHaveLength(0);
    expect(failed).toHaveLength(1);
  });

  it('reports a capture failure when the embedded settings are malformed', () => {
    document.documentElement.innerHTML =
      '<body><div id="game"><span class="left">Seconds left: 120</span><span class="problem"></span><input class="answer" /><span class="correct">Score: 0</span></div><script type="module">init({not valid json})</script></body>';
    const { clock } = makeClock();
    const { hooks, completed, failed } = makeHooks();
    startCapture({ document, window, clock, hooks });

    expect(completed).toHaveLength(0);
    expect(failed).toHaveLength(1);
  });
});
