import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

/**
 * Real browser-owned link flow. The local server implements the already
 * full-stack-tested OAuth contract, while this suite proves the otherwise
 * untested seam: popup click → chrome.identity.launchWebAuthFlow → S256 PKCE
 * exchange → background-owned credential storage → linked popup state.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(dirname, '..');
const extensionOutput = path.join(extensionRoot, '.output', 'chrome-mv3');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = `zlx_${'a'.repeat(43)}`;

let server: Server;
let baseUrl: string;
let context: BrowserContext;
let extensionId: string;
let observedChallenge: string | null = null;
let observedRedirect: string | null = null;

function hasWebsiteSession(req: import('node:http').IncomingMessage): boolean {
  return (
    req.headers.cookie?.split(';').some((cookie) => cookie.trim() === 'zl-test-session=1') ?? false
  );
}

function cors(res: import('node:http').ServerResponse): void {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
}

async function startProtocolReplica(): Promise<{ server: Server; baseUrl: string }> {
  const started = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://replica');
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (requestUrl.pathname === '/api/extension/link/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ supported: true }));
      return;
    }
    if (requestUrl.pathname === '/api/extension/link/authorize') {
      observedChallenge = requestUrl.searchParams.get('code_challenge');
      observedRedirect = requestUrl.searchParams.get('redirect_uri');
      if (!hasWebsiteSession(req)) {
        const next = encodeURIComponent(`${requestUrl.pathname}${requestUrl.search}`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><html lang="en"><body><h1>Sign in to ZetaLog</h1><a href="/test-signin?next=${next}">Continue sign-in</a></body></html>`,
        );
        return;
      }
      const callback = new URL(observedRedirect ?? 'https://invalid.example');
      callback.searchParams.set('code', `zla_${'b'.repeat(43)}`);
      callback.searchParams.set('state', requestUrl.searchParams.get('state') ?? 'missing');
      res.writeHead(303, { location: callback.toString() }).end();
      return;
    }
    if (requestUrl.pathname === '/test-signin') {
      const next = requestUrl.searchParams.get('next');
      if (!next?.startsWith('/api/extension/link/authorize?')) {
        res.writeHead(400).end();
        return;
      }
      res
        .writeHead(303, {
          location: next,
          'set-cookie': 'zl-test-session=1; Path=/; HttpOnly; SameSite=Lax',
        })
        .end();
      return;
    }
    if (requestUrl.pathname === '/api/extension/link/token' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          codeVerifier: string;
          redirectUri: string;
        };
        const derived = createHash('sha256').update(body.codeVerifier).digest('base64url');
        if (derived !== observedChallenge || body.redirectUri !== observedRedirect) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'invalid-grant' } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ credential: CREDENTIAL, userId: USER_ID }));
      });
      return;
    }
    if (requestUrl.pathname === '/api/profile') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ leaderboardOptOut: false }));
      return;
    }
    if (requestUrl.pathname === '/api/games' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ games: [] }));
      return;
    }
    if (requestUrl.pathname === '/me') {
      res.writeHead(hasWebsiteSession(req) ? 200 : 401, {
        'content-type': 'text/html; charset=utf-8',
      });
      res.end(
        hasWebsiteSession(req)
          ? '<!doctype html><html lang="en"><body><h1>Website account signed in</h1></body></html>'
          : '<!doctype html><html lang="en"><body><h1>Website account signed out</h1></body></html>',
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'not-found' } }));
  });
  await new Promise<void>((resolve) => started.listen(0, '127.0.0.1', resolve));
  const address = started.address();
  if (address === null || typeof address === 'string') throw new Error('replica did not bind');
  return { server: started, baseUrl: `http://127.0.0.1:${String(address.port)}` };
}

test.beforeAll(async () => {
  const replica = await startProtocolReplica();
  server = replica.server;
  baseUrl = replica.baseUrl;

  execSync('pnpm build', {
    cwd: extensionRoot,
    stdio: 'inherit',
    env: { ...process.env, WXT_WEB_APP_URL: baseUrl },
  });
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionOutput}`,
      `--load-extension=${extensionOutput}`,
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

test('signing in through Chrome Identity also signs in normal website tabs', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const authWindowPromise = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Sync to leaderboard' }).click();
  const authWindow = await authWindowPromise;
  await expect(authWindow.getByRole('heading', { name: 'Sign in to ZetaLog' })).toBeVisible();
  await authWindow.getByRole('link', { name: 'Continue sign-in' }).click();

  await expect(popup.getByText('Linked to leaderboard')).toBeVisible({ timeout: 20_000 });
  expect(observedRedirect).toBe(`https://${extensionId}.chromiumapp.org/zetalog-link`);
  expect(observedChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);

  const stored = await context.serviceWorkers()[0]?.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: { get(key: string): Promise<Record<string, unknown>> } } };
    };
    return extensionGlobal.chrome.storage.local.get('zl:v1:session');
  });
  expect(JSON.stringify(stored)).toContain(CREDENTIAL);
  expect(JSON.stringify(stored)).not.toContain('refresh_token');

  // The website login happened inside Chrome Identity. Its first-party cookie
  // must remain available to an ordinary tab after the auth window closes.
  const website = await context.newPage();
  const websiteResponse = await website.goto(`${baseUrl}/me`);
  expect(websiteResponse?.status()).toBe(200);
  await expect(website.getByRole('heading', { name: 'Website account signed in' })).toBeVisible();
  await website.close();
  await popup.close();
});
