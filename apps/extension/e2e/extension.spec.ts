import { execSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

/**
 * Required extension e2e: the built MV3 extension, loaded into a real Chromium,
 * recording games on an OFFLINE replica of arithmetic.zetamac.com, asserted
 * through the actual popup.
 *
 * How the content script fires against the replica: the Zetamac content script
 * matches `*://arithmetic.zetamac.com/*`, so we launch Chromium with
 * `--host-resolver-rules="MAP arithmetic.zetamac.com 127.0.0.1:<port>"`. The
 * browser keeps the real hostname in the URL (the match pattern fires) but
 * resolves it to our local replica server — no live network, no Docker.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(dirname, '..');
const extensionOutput = path.join(extensionRoot, '.output', 'chrome-mv3');
const replicaDir = path.join(extensionRoot, 'test', 'replica');

const GAME_URL = 'http://arithmetic.zetamac.com/game';

let server: Server;
let context: BrowserContext;
let extensionId: string;

/** Serve the offline replica; `/game*` -> game.html, plus its module + css. */
function startReplica(): Promise<{ server: Server; port: number }> {
  const routes: Record<string, { file: string; type: string }> = {
    '/dist/app.js': { file: 'app.js', type: 'text/javascript' },
    '/app.css': { file: 'app.css', type: 'text/css' },
  };
  const srv = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://replica').pathname;
    const route =
      routes[pathname] ??
      (pathname.startsWith('/game') ? { file: 'game.html', type: 'text/html' } : null);
    if (route === null) {
      res.writeHead(404);
      res.end();
      return;
    }
    readFile(path.join(replicaDir, route.file))
      .then((body) => {
        res.writeHead(200, { 'content-type': route.type });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({ server: srv, port });
    });
  });
}

/** Compute the answer to a pretty problem like `12 + 34`, `40 – 8`, `6 × 7`, `24 ÷ 6`. */
function solve(text: string): string {
  const match = /^(\d+)\s*(\S)\s*(\d+)$/u.exec(text.trim());
  if (match === null) throw new Error(`unparseable problem: "${text}"`);
  const a = Number(match[1]);
  const b = Number(match[3]);
  switch (match[2]) {
    case '+':
      return String(a + b);
    case '×':
      return String(a * b);
    case '÷':
      return String(a / b);
    default:
      return String(a - b); // – en dash (subtraction)
  }
}

/** Wait for the replica game to be live (a problem is showing). */
async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (document.querySelector('#game .problem')?.textContent ?? '').length > 0,
    undefined,
    { timeout: 10_000 },
  );
}

/** Answer `count` problems correctly, waiting for each score increment. */
async function answer(page: Page, count: number): Promise<void> {
  const score = page.locator('#game > span.correct');
  for (let i = 0; i < count; i += 1) {
    const before = (await score.textContent()) ?? '';
    const problem = (await page.locator('#game .problem').textContent()) ?? '';
    await page.locator('#game input.answer').fill(solve(problem));
    await expect(score).not.toHaveText(before);
  }
}

/** Play a full game to the timer's end (a kept game). */
async function playCompleted(page: Page, answers: number): Promise<void> {
  await page.goto(GAME_URL);
  await waitForGame(page);
  await answer(page, answers);
  await expect(page.locator('#game input.answer')).toBeDisabled();
  await page.waitForTimeout(250); // let the content script persist the game
}

/** Play then abort mid-game (a restart-quarantined game). */
async function playAborted(page: Page): Promise<void> {
  await page.goto(GAME_URL);
  await waitForGame(page);
  await answer(page, 1);
  // Abort well before 80% of the 2s duration -> the recorder's pagehide path
  // finishes the game with a short playedMs -> restart quarantine. Dispatching
  // the event (rather than navigating) keeps the page alive so the async
  // storage write completes deterministically.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.waitForTimeout(250);
}

test.beforeAll(async () => {
  // Build the extension fresh so the e2e always runs the current code.
  execSync('pnpm build', { cwd: extensionRoot, stdio: 'inherit' });

  const started = await startReplica();
  server = started.server;

  // MV3 extension service workers only register under Chrome's *new* headless
  // (`--headless=new`); the legacy headless mode ignores extensions entirely. We
  // pass it explicitly (with `headless: false` so Playwright does not add the
  // old `--headless`), which loads the extension and starts its worker.
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionOutput}`,
      `--load-extension=${extensionOutput}`,
      `--host-resolver-rules=MAP arithmetic.zetamac.com 127.0.0.1:${String(started.port)}`,
      // The real site is HTTPS (a secure context, so `crypto.randomUUID` works);
      // our http replica is not, so mark its origin secure to match production.
      '--unsafely-treat-insecure-origin-as-secure=http://arithmetic.zetamac.com',
    ],
  });

  const worker: Worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

test('records games from the replica and reflects them in the popup', async () => {
  const game = await context.newPage();

  // One aborted game (restart-quarantined), then five completed games (kept) —
  // enough kept games on one config to drive the trend into sparkline mode.
  await playAborted(game);
  for (let i = 0; i < 5; i += 1) {
    await playCompleted(game, 3);
  }
  await game.close();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // Recorded score: the hero shows the latest kept game's score (3).
  await expect(popup.getByTestId('hero-score')).toHaveText('3');

  // Quarantine: the aborted game appears as a restart-quarantined row.
  const quarantinedRow = popup.locator('[data-testid="recent-games"] [data-status="quarantined"]');
  await expect(quarantinedRow).toHaveCount(1);
  await expect(quarantinedRow).toContainText('Restart');

  // Graph mode: five kept games on one config render the adaptive sparkline.
  await expect(popup.getByTestId('trend-sparkline')).toBeVisible();

  await popup.close();
});
