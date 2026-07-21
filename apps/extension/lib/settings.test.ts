import { ZETAMAC_DEFAULT_SETTINGS } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import { gamePageDocument } from '../test/fixtures.js';
import { settingsScript } from './selectors.js';
import { parseGameSettings } from './settings.js';

/** The exact init() text as embedded on the live game page. */
function fixtureScriptText(): string {
  const script = settingsScript(gamePageDocument());
  if (!script.ok) throw new Error('fixture is missing its settings script');
  return script.value.textContent;
}

describe('parseGameSettings — real fixture', () => {
  it('parses the live default game page into the frozen default settings', () => {
    const result = parseGameSettings(fixtureScriptText());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(ZETAMAC_DEFAULT_SETTINGS);
  });
});

describe('parseGameSettings — duration', () => {
  it('defaults an omitted duration to 120 seconds', () => {
    const result = parseGameSettings('init({"add":false,"sub":false,"mul":false,"div":false})');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.durationSeconds).toBe(120);
  });

  it('honours a custom duration', () => {
    const result = parseGameSettings(
      'init({"add":false,"sub":false,"mul":false,"div":false,"duration":30})',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.durationSeconds).toBe(30);
  });
});

describe('parseGameSettings — disabled operations get default ranges', () => {
  it('backfills default ranges for all-false operations (a real Zetamac case)', () => {
    const result = parseGameSettings('init({"add":false,"sub":false,"mul":false,"div":false})');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.addLeft).toEqual(ZETAMAC_DEFAULT_SETTINGS.addLeft);
    expect(result.value.mulRight).toEqual(ZETAMAC_DEFAULT_SETTINGS.mulRight);
    expect(result.value.addEnabled).toBe(false);
    expect(result.value.mulEnabled).toBe(false);
  });
});

describe('parseGameSettings — errors', () => {
  it('rejects text with no init() call', () => {
    const result = parseGameSettings('console.log("not a game");');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('no-init-call');
  });

  it('rejects malformed JSON inside init()', () => {
    const result = parseGameSettings('init({add:true,})');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('malformed-json');
  });

  it('rejects a wrong-typed operation flag', () => {
    const result = parseGameSettings('init({"add":"yes","sub":true,"mul":true,"div":true})');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('invalid-shape');
  });

  it('errors when an enabled operation is missing its ranges', () => {
    const result = parseGameSettings('init({"add":true,"sub":false,"mul":false,"div":false})');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-ranges');
  });

  it('errors when an enabled multiplication op is missing part of its ranges', () => {
    const result = parseGameSettings(
      'init({"add":false,"sub":false,"mul":true,"div":false,"mul_left_min":2,"mul_left_max":12,"mul_right_min":2})',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-ranges');
  });

  it('rejects an inverted range (min greater than max) via final validation', () => {
    const result = parseGameSettings(
      'init({"add":true,"sub":false,"mul":false,"div":false,"add_left_min":100,"add_left_max":2,"add_right_min":2,"add_right_max":100})',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('invalid-shape');
  });
});
