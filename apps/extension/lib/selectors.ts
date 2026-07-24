import { err, ok, type Result } from '@zetalog/shared';

/**
 * Version of the Zetamac DOM contract this module encodes. Bump whenever a
 * selector changes so `capture_failed` records can be correlated with the
 * recorder revision that produced them.
 */
export const SELECTORS_VERSION = 1;

/** Which element a failed lookup was after — surfaced in `capture_failed` diagnostics. */
export type SelectorRole =
  'settings-script' | 'problem' | 'answer' | 'score' | 'timer' | 'end-banner';

/** A Zetamac element the recorder relies on was not present in the DOM. */
export interface SelectorError {
  readonly reason: 'not-found';
  readonly role: SelectorRole;
  readonly version: number;
}

function fail(role: SelectorRole): Result<never, SelectorError> {
  return err({ reason: 'not-found', role, version: SELECTORS_VERSION });
}

function findElement(
  root: ParentNode,
  selector: string,
  role: SelectorRole,
): Result<HTMLElement, SelectorError> {
  const element = root.querySelector(selector);
  return element instanceof HTMLElement ? ok(element) : fail(role);
}

/**
 * The inline module script that boots the game — the one whose text contains
 * the `init({...})` call carrying the full settings object. The sibling
 * `import { init }` statement is deliberately excluded (it has no `init(`).
 */
export function settingsScript(root: ParentNode): Result<HTMLScriptElement, SelectorError> {
  const scripts = root.querySelectorAll<HTMLScriptElement>('script[type="module"]');
  for (const script of scripts) {
    if (script.textContent.includes('init(')) return ok(script);
  }
  return fail('settings-script');
}

/** The live problem text, e.g. `34 + 66` (the trailing `=` is a separate text node). */
export function problemSpan(root: ParentNode): Result<HTMLElement, SelectorError> {
  return findElement(root, '#game span.problem', 'problem');
}

/** The answer box. Narrowed to `HTMLInputElement` so callers can read `.value`. */
export function answerInput(root: ParentNode): Result<HTMLInputElement, SelectorError> {
  const element = root.querySelector('#game input.answer');
  return element instanceof HTMLInputElement ? ok(element) : fail('answer');
}

/**
 * The live running-score span — the direct child `#game > span.correct`,
 * NOT the `.end p.correct` final-score paragraph inside the end banner.
 */
export function scoreSpan(root: ParentNode): Result<HTMLElement, SelectorError> {
  return findElement(root, '#game > span.correct', 'score');
}

/** The countdown span, e.g. `Seconds left: 42`. */
export function timerSpan(root: ParentNode): Result<HTMLElement, SelectorError> {
  return findElement(root, '#game span.left', 'timer');
}

/** The game-over banner shown when the timer reaches zero. */
export function endBanner(root: ParentNode): Result<HTMLElement, SelectorError> {
  return findElement(root, '.banner .end', 'end-banner');
}
