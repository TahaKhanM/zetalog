import { describe, expect, it } from 'vitest';

import { gamePageDocument, parseHtml as parse } from '../test/fixtures.js';
import {
  SELECTORS_VERSION,
  answerInput,
  endBanner,
  problemSpan,
  scoreSpan,
  settingsScript,
  timerSpan,
} from './selectors.js';

function gameDocument(): Document {
  return gamePageDocument();
}

describe('SELECTORS_VERSION', () => {
  it('is pinned to 1', () => {
    expect(SELECTORS_VERSION).toBe(1);
  });
});

describe('settingsScript', () => {
  it('finds the module script whose text contains the init() call', () => {
    const result = settingsScript(gameDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tagName).toBe('SCRIPT');
    expect(result.value.textContent).toContain('init(');
    expect(result.value.textContent).toContain('"add":true');
  });

  it('ignores module scripts that only import init without calling it', () => {
    const doc = parse(`<script type="module">import { init } from '/dist/app.js';</script>`);
    const result = settingsScript(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      reason: 'not-found',
      role: 'settings-script',
      version: SELECTORS_VERSION,
    });
  });
});

describe('problemSpan', () => {
  it('finds #game span.problem', () => {
    const result = problemSpan(gameDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.className).toBe('problem');
  });

  it('returns a typed not-found error when the span is absent', () => {
    const result = problemSpan(parse('<div></div>'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.role).toBe('problem');
    expect(result.error.reason).toBe('not-found');
  });
});

describe('answerInput', () => {
  it('finds #game input.answer as an HTMLInputElement', () => {
    const result = answerInput(gameDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(HTMLInputElement);
  });

  it('returns a typed error when the input is absent', () => {
    const result = answerInput(parse('<div id="game"></div>'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.role).toBe('answer');
  });
});

describe('scoreSpan', () => {
  it('finds the direct-child span.correct, not the end banner p.correct', () => {
    const result = scoreSpan(gameDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tagName).toBe('SPAN');
    expect(result.value.textContent).toBe('Score: 0');
  });
});

describe('timerSpan', () => {
  it('finds #game span.left', () => {
    const result = timerSpan(gameDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.className).toBe('left');
  });
});

describe('endBanner', () => {
  it('finds the .banner .end container', () => {
    const result = endBanner(gameDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.className).toBe('end');
  });
});
