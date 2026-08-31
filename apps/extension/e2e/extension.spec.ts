import { execFileSync, execSync } from 'node:child_process';
import { type Server } from 'node:http';
import { createServer } from 'node:https';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
 * matches `https://arithmetic.zetamac.com/*`, so we launch Chromium with
 * `--host-resolver-rules="MAP arithmetic.zetamac.com 127.0.0.1:<port>"`. The
 * browser keeps the real hostname in the URL (the match pattern fires) but
 * resolves it to our local replica server — no live network, no Docker.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(dirname, '..');
// Release CI points this at the directory extracted from the final ZIP. Local
// runs leave it unset and exercise a fresh WXT build in the normal output dir.
const suppliedExtensionOutput = process.env.ZL_EXTENSION_OUTPUT;
const extensionOutput =
  suppliedExtensionOutput === undefined
    ? path.join(extensionRoot, '.output', 'chrome-mv3')
    : path.resolve(suppliedExtensionOutput);
const replicaDir = path.join(extensionRoot, 'test', 'replica');

const GAME_URL = 'https://arithmetic.zetamac.com/game';
const ABORT_GAME_URL = `${GAME_URL}?duration=10`;
const THEME_STORAGE_KEY = 'zl-theme';
const RETRY_ALARM = 'zl-sync-retry';

let server: Server;
let context: BrowserContext;
let worker: Worker;
let extensionId: string;
let tlsDir: string;

/** Serve the offline replica; `/game*` -> game.html, plus its module + css. */
async function startReplica(): Promise<{ server: Server; port: number }> {
  tlsDir = await mkdtemp(path.join(tmpdir(), 'zetalog-extension-e2e-'));
  const keyPath = path.join(tlsDir, 'key.pem');
  const certPath = path.join(tlsDir, 'cert.pem');
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=arithmetic.zetamac.com',
  ]);
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  const routes: Record<string, { file: string; type: string }> = {
    '/dist/app.js': { file: 'app.js', type: 'text/javascript' },
    '/app.css': { file: 'app.css', type: 'text/css' },
    '/left': { file: 'left.html', type: 'text/html' },
  };
  const srv = createServer({ key, cert }, (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://replica');
    const pathname = requestUrl.pathname;
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
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
        // Completed-game coverage stays fast at two seconds. The navigation
        // case gets a ten-second settings fixture so CI slowness cannot let it
        // accidentally cross the 80% completion threshold and become kept.
        const responseBody =
          route.file === 'game.html' && requestUrl.searchParams.get('duration') === '10'
            ? Buffer.from(body.toString('utf8').replace('"duration":2', '"duration":10'))
            : body;
        res.writeHead(200, { 'content-type': route.type });
        res.end(responseBody);
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
  await page.goto(ABORT_GAME_URL);
  await waitForGame(page);
  // A real player necessarily spends time reading the first problem. Give a
  // newly launched test browser the same brief window to finish the extension's
  // cold content-script/background handshake; the navigation remains immediate
  // after the accepted answer, which is the durability boundary under test.
  await page.waitForTimeout(250);
  await answer(page, 1);
  // Abort well before 80% of the 2s duration. This is a real navigation: the
  // content context disappears while the background worker owns persistence.
  await page.goto('https://arithmetic.zetamac.com/left');
  await page.waitForTimeout(250);
}

test.beforeAll(async () => {
  // A normal run builds current source. Release CI deliberately skips this and
  // loads the directory extracted from the immutable ZIP it will publish.
  if (suppliedExtensionOutput === undefined) {
    execSync('pnpm build', { cwd: extensionRoot, stdio: 'inherit' });
  }

  const started = await startReplica();
  server = started.server;

  // MV3 extension service workers only register under Chrome's *new* headless
  // (`--headless=new`); the legacy headless mode ignores extensions entirely. We
  // pass it explicitly (with `headless: false` so Playwright does not add the
  // old `--headless`), which loads the extension and starts its worker.
  context = await chromium.launchPersistentContext('', {
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionOutput}`,
      `--load-extension=${extensionOutput}`,
      `--host-resolver-rules=MAP arithmetic.zetamac.com 127.0.0.1:${String(started.port)}`,
    ],
  });

  worker =
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
  await rm(tlsDir, { recursive: true, force: true });
});

test('records games from the replica and reflects them in the popup', async () => {
  const consoleErrors: string[] = [];
  worker.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`worker: ${message.text()}`);
  });

  const game = await context.newPage();
  game.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`game: ${message.text()}`);
  });
  game.on('pageerror', (error) => consoleErrors.push(`game: ${error.message}`));

  // One aborted game (restart-quarantined), then five completed games (kept) —
  // enough kept games on one config to drive the trend into sparkline mode.
  await playAborted(game);
  for (let i = 0; i < 5; i += 1) {
    await playCompleted(game, 3);
  }
  await game.close();

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 720 });
  popup.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`popup: ${message.text()}`);
  });
  popup.on('pageerror', (error) => consoleErrors.push(`popup: ${error.message}`));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // Recorded score: the hero shows the latest kept game's recomputed verified
  // score (3) — recomputeScore over the captured events, not the scraped claimed
  // number. Here the clean 3-problem game makes them equal.
  await expect(popup.getByTestId('hero-score')).toHaveText('3');

  // Quarantine: the aborted game appears as a restart-quarantined row.
  const quarantinedRow = popup.locator('[data-testid="recent-games"] [data-status="quarantined"]');
  await expect(quarantinedRow).toHaveCount(1);
  await expect(quarantinedRow).toContainText('Restart');

  // Graph mode: five kept games on one config render the adaptive sparkline.
  await expect(popup.getByTestId('trend-sparkline')).toBeVisible();

  const evidenceDir = process.env.ZL_RELEASE_EVIDENCE_DIR;
  if (evidenceDir !== undefined) {
    await mkdir(evidenceDir, { recursive: true });
    // Evidence must show the settled interface, not a partially transparent
    // frame from the staggered entrance animation. This mirrors the Store
    // asset capture workflow without changing product motion.
    await popup.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; }',
    });
    await popup.screenshot({ path: path.join(evidenceDir, 'offline-game-popup.png') });
  }
  expect(consoleErrors).toEqual([]);

  // A signed-out installation with no revocation work has no periodic worker
  // wakeup; retries are represented by one-shot alarms only while work exists.
  const retryAlarm = await worker.evaluate(async (alarmName) => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { alarms: { get(name: string): Promise<unknown> } };
    };
    return extensionGlobal.chrome.alarms.get(alarmName);
  }, RETRY_ALARM);
  expect(retryAlarm).toBeUndefined();

  await popup.close();
});

test('migrates a pinned 1.0.0 popup theme into extension storage', async () => {
  await worker.evaluate(async (key) => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: { remove(name: string): Promise<void> } } };
    };
    await extensionGlobal.chrome.storage.local.remove(key);
  }, THEME_STORAGE_KEY);

  const popup = await context.newPage();
  // Seed the legacy origin before popup code starts. Loading once and then
  // writing localStorage races the already-mounted ThemeToggle effect, which
  // can legitimately migrate the value before a subsequent reload.
  await popup.addInitScript((key) => {
    globalThis.localStorage.setItem(key, 'dark');
  }, THEME_STORAGE_KEY);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect
    .poll(() => popup.evaluate(() => document.documentElement.dataset.theme))
    .toBe('dark');
  const migrated = await worker.evaluate(async (key) => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: {
        storage: { local: { get(name: string): Promise<Record<string, unknown>> } };
      };
    };
    return extensionGlobal.chrome.storage.local.get(key);
  }, THEME_STORAGE_KEY);
  expect(migrated).toEqual({ [THEME_STORAGE_KEY]: 'dark' });
  expect(
    await popup.evaluate((key) => globalThis.localStorage.getItem(key), THEME_STORAGE_KEY),
  ).toBeNull();

  await popup.close();
});
