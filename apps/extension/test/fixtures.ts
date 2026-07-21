import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Absolute path to the recon fixtures captured from arithmetic.zetamac.com. */
const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

/** Read a fixture file's text by name (e.g. `zetamac-game-page.html`). */
export function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

/** The live game-page DOM as captured during recon — ground truth for selectors. */
export function gamePageHtml(): string {
  return readFixture('zetamac-game-page.html');
}

/** Parse an HTML string into a full `Document` (jsdom), as the content script sees it. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** The parsed game-page document, ready for selector/wiring tests. */
export function gamePageDocument(): Document {
  return parseHtml(gamePageHtml());
}

/**
 * Render the live game page into a document (the global jsdom document by
 * default) so wiring tests can attach real MutationObservers and dispatch
 * real `input` events. The inline module script is inert but its text — the
 * `init({...})` settings — is preserved for the parser to read.
 */
export function mountGamePage(doc: Document = document): void {
  doc.documentElement.innerHTML = parseHtml(gamePageHtml()).documentElement.innerHTML;
}
