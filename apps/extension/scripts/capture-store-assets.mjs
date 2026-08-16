import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(dirname, '..');
const repositoryRoot = path.resolve(extensionRoot, '../..');
const extensionOutput = path.join(extensionRoot, '.output', 'chrome-mv3');
const outputDir = path.join(repositoryRoot, 'docs', 'store', 'assets');
const howItWorksOutputDir = path.join(repositoryRoot, 'apps', 'web', 'public', 'how-it-works');
const iconPath = path.join(repositoryRoot, 'Assets', 'icons', 'icon-512.png');
const USER_ID = '11111111-1111-4111-8111-111111111111';

const palette = {
  maroon: '#780000',
  red: '#c1121f',
  cream: '#fdf0d5',
  navy: '#003049',
  steel: '#669bbc',
};

const defaultSettings = {
  addEnabled: true,
  addLeft: { min: 2, max: 100 },
  addRight: { min: 2, max: 100 },
  subEnabled: true,
  mulEnabled: true,
  mulLeft: { min: 2, max: 12 },
  mulRight: { min: 2, max: 100 },
  divEnabled: true,
  durationSeconds: 120,
};

function settingsFor(durationSeconds) {
  return { ...defaultSettings, durationSeconds };
}

function fingerprint(durationSeconds) {
  return [
    'add:2-100x2-100',
    'sub:on',
    'mul:2-12x2-100',
    'div:on',
    `t:${String(durationSeconds)}`,
  ].join('|');
}

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function focusEvents() {
  const events = [];
  let at = 0;
  for (let index = 0; index < 8; index += 1) {
    const answer = 27 + index;
    events.push({ kind: 'problem', at, text: `${String(15 + index)} + 12` });
    at += 620;
    events.push({ kind: 'input', at, value: String(answer) });
    at += 80;
    events.push({ kind: 'accepted', at, answer });
    at += 250;
  }
  for (let index = 0; index < 8; index += 1) {
    const right = 7 + (index % 6);
    const answer = 8 * right;
    events.push({ kind: 'problem', at, text: `8 × ${String(right)}` });
    at += 1_850;
    events.push({ kind: 'input', at, value: String(answer) });
    at += 250;
    events.push({ kind: 'accepted', at, answer });
    at += 300;
  }
  return events;
}

function game({
  index,
  score,
  minutesAgo,
  duration = 120,
  status = 'kept',
  quarantineReason,
  removedFrom,
  sync = { state: 'uploaded', outcome: 'accepted', serverScore: score },
  events = [],
}) {
  return {
    record: {
      id: uuid(index),
      startedAtMs: Date.now() - minutesAgo * 60_000 - duration * 1_000,
      playedMs: duration * 1_000,
      settings: settingsFor(duration),
      events,
      claimedScore: score,
    },
    ownerUserId: USER_ID,
    verifiedScore: score,
    fingerprint: fingerprint(duration),
    rankableDuration: duration,
    status,
    ...(quarantineReason === undefined ? {} : { quarantineReason }),
    ...(removedFrom === undefined ? {} : { removedFrom }),
    savedAtMs: Date.now() - minutesAgo * 60_000,
    ...(sync === null ? {} : { sync }),
  };
}

function storeGames() {
  return [
    game({ index: 1, score: 38, minutesAgo: 1_100 }),
    game({ index: 2, score: 42, minutesAgo: 920 }),
    game({ index: 3, score: 45, minutesAgo: 760 }),
    game({ index: 4, score: 49, minutesAgo: 590 }),
    game({ index: 5, score: 52, minutesAgo: 410 }),
    game({ index: 6, score: 55, minutesAgo: 250 }),
    game({
      index: 7,
      score: 40,
      minutesAgo: 100,
      status: 'removed',
      removedFrom: 'kept',
      sync: { state: 'revoked', outcome: 'user_removed', serverScore: 40 },
    }),
    game({
      index: 8,
      score: 44,
      minutesAgo: 70,
      status: 'quarantined',
      quarantineReason: 'restart',
      sync: null,
    }),
    game({
      index: 9,
      score: 50,
      minutesAgo: 40,
      status: 'quarantined',
      quarantineReason: 'outlier',
      sync: { state: 'uploaded', outcome: 'quarantined', serverScore: 50 },
    }),
    game({ index: 10, score: 29, minutesAgo: 35, duration: 60 }),
    game({ index: 11, score: 14, minutesAgo: 25, duration: 30 }),
    game({ index: 12, score: 58, minutesAgo: 10, events: focusEvents() }),
  ];
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
  });
  response.end(JSON.stringify(body));
}

async function startApiReplica() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://store-assets');
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }
    if (url.pathname === '/api/profile' && request.method === 'GET') {
      sendJson(response, 200, { leaderboardOptOut: false });
      return;
    }
    if (url.pathname === '/api/games' && request.method === 'GET') {
      sendJson(response, 200, { games: [] });
      return;
    }
    sendJson(response, 404, { error: { code: 'not-found' } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('API replica did not bind');
  return { server, baseUrl: `http://127.0.0.1:${String(address.port)}` };
}

async function dataUrl(filePath, mimeType) {
  return `data:${mimeType};base64,${(await readFile(filePath)).toString('base64')}`;
}

async function findFont(prefix) {
  const assetsDir = path.join(extensionOutput, 'assets');
  const match = (await readdir(assetsDir)).find(
    (name) => name.startsWith(prefix) && name.endsWith('.woff2'),
  );
  if (match === undefined) throw new Error(`Built font not found: ${prefix}`);
  return dataUrl(path.join(assetsDir, match), 'font/woff2');
}

async function renderComposition({
  browser,
  backgroundPath,
  popupPath,
  outputPath,
  title,
  detail,
  address = 'arithmetic.zetamac.com',
  backgroundPosition = 'center',
}) {
  const [background, popup, icon, archivo, spline] = await Promise.all([
    dataUrl(backgroundPath, 'image/jpeg'),
    dataUrl(popupPath, 'image/png'),
    dataUrl(iconPath, 'image/png'),
    findFont('archivo-'),
    findFont('spline-sans-'),
  ]);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          @font-face { font-family: Archivo; src: url('${archivo}') format('woff2'); font-weight: 100 900; }
          @font-face { font-family: Spline; src: url('${spline}') format('woff2'); font-weight: 400 700; }
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
          body { position: relative; background: linear-gradient(155deg, ${palette.cream} 0%, #fff9ec 62%, #f7fafb 62%, #f7fafb 100%); color: ${palette.navy}; font-family: Spline, sans-serif; }
          .top-rule { position: absolute; top: 0; left: 0; width: 822px; height: 7px; background: ${palette.maroon}; }
          .right-panel { position: absolute; top: 0; right: 0; width: 458px; height: 800px; background: color-mix(in srgb, ${palette.navy} 6%, white); border-left: 1px solid rgba(0,48,73,.1); }
          .brand { position: absolute; left: 58px; top: 34px; display: flex; align-items: center; gap: 12px; }
          .brand img { width: 42px; height: 42px; border-radius: 10px; }
          .wordmark { font-family: Archivo, sans-serif; font-size: 31px; font-weight: 850; color: ${palette.maroon}; letter-spacing: -.02em; }
          .copy { position: absolute; left: 58px; top: 103px; width: 705px; padding-left: 19px; border-left: 5px solid ${palette.red}; }
          h1 { margin: 0 0 7px; font-family: Archivo, sans-serif; font-size: 42px; line-height: 1.04; letter-spacing: -.035em; }
          p { margin: 0; width: 650px; font-size: 18px; line-height: 1.4; color: rgba(0,48,73,.74); }
          .browser { position: absolute; left: 58px; top: 238px; width: 690px; height: 484px; overflow: hidden; border: 1px solid rgba(0,48,73,.2); border-radius: 12px; background: white; box-shadow: 0 18px 44px rgba(0,48,73,.16); }
          .browser-bar { height: 44px; display: flex; align-items: center; gap: 12px; padding: 0 15px; background: color-mix(in srgb, ${palette.navy} 6%, white); border-bottom: 1px solid rgba(0,48,73,.12); }
          .browser-dots { display: flex; gap: 6px; }
          .browser-dots span { width: 9px; height: 9px; border-radius: 50%; background: rgba(0,48,73,.2); }
          .address { display: flex; align-items: center; height: 26px; min-width: 300px; padding: 0 13px; border: 1px solid rgba(0,48,73,.12); border-radius: 7px; background: white; color: rgba(0,48,73,.58); font-size: 12px; }
          .background { display: block; width: 100%; height: 440px; object-fit: cover; object-position: ${backgroundPosition}; }
          .popup-shell { position: absolute; top: 70px; right: 48px; width: 400px; height: 660px; padding: 19px; background: rgba(255,255,255,.78); border: 1px solid rgba(102,155,188,.42); box-shadow: 0 24px 64px rgba(0,48,73,.2); backdrop-filter: blur(6px); }
          .popup { display: block; width: 360px; height: 620px; object-fit: cover; object-position: top; border: 1px solid rgba(0,48,73,.16); box-shadow: 0 8px 24px rgba(0,48,73,.18); }
        </style>
      </head>
      <body>
        <div class="top-rule"></div>
        <div class="right-panel"></div>
        <div class="brand"><img src="${icon}" alt=""><span class="wordmark">ZetaLog</span></div>
        <section class="copy">
          <h1>${title}</h1>
          <p>${detail}</p>
        </section>
        <div class="browser">
          <div class="browser-bar">
            <div class="browser-dots"><span></span><span></span><span></span></div>
            <div class="address">${address}</div>
          </div>
          <img class="background" src="${background}" alt="Zetamac game">
        </div>
        <div class="popup-shell"><img class="popup" src="${popup}" alt="ZetaLog extension popup"></div>
      </body>
    </html>
  `);
  await page.screenshot({ path: outputPath, type: 'jpeg', quality: 96 });
  await page.close();
}

async function renderPromoTile(browser, outputPath) {
  const [icon, archivo, spline] = await Promise.all([
    dataUrl(iconPath, 'image/png'),
    findFont('archivo-'),
    findFont('spline-sans-'),
  ]);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          @font-face { font-family: Archivo; src: url('${archivo}') format('woff2'); font-weight: 100 900; }
          @font-face { font-family: Spline; src: url('${spline}') format('woff2'); font-weight: 400 700; }
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
          body { position: relative; background: linear-gradient(150deg, ${palette.cream} 0%, #fff9ec 68%, #eef5f7 68%, #eef5f7 100%); color: ${palette.navy}; font-family: Spline, sans-serif; }
          .field { position: absolute; right: -64px; bottom: -70px; width: 300px; height: 180px; border-radius: 50%; background: rgba(102,155,188,.12); transform: rotate(-8deg); }
          .top-rule { position: absolute; left: 0; right: 0; top: 0; height: 8px; background: ${palette.maroon}; }
          .index { position: absolute; left: 0; top: 8px; bottom: 0; width: 9px; background: ${palette.red}; }
          .icon { position: absolute; left: 38px; top: 56px; width: 92px; height: 92px; border-radius: 22px; box-shadow: 0 12px 28px rgba(120,0,0,.16); }
          .wordmark { position: absolute; left: 151px; top: 64px; font-family: Archivo, sans-serif; font-size: 47px; font-weight: 850; letter-spacing: -.035em; color: ${palette.maroon}; }
          .tagline { position: absolute; left: 154px; top: 120px; width: 238px; font-size: 17px; line-height: 1.35; font-weight: 500; }
          .chart { position: absolute; left: 39px; right: 38px; bottom: 42px; height: 52px; border-bottom: 2px solid rgba(0,48,73,.18); }
          .chart svg { width: 100%; height: 100%; overflow: visible; }
          .label { position: absolute; left: 40px; bottom: 18px; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: rgba(0,48,73,.58); }
          .rank { position: absolute; right: 38px; bottom: 14px; padding: 4px 8px; border: 1px solid rgba(120,0,0,.26); border-radius: 999px; background: rgba(255,255,255,.46); color: ${palette.maroon}; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="field"></div>
        <div class="top-rule"></div>
        <div class="index"></div>
        <img class="icon" src="${icon}" alt="">
        <div class="wordmark">ZetaLog</div>
        <div class="tagline">Track Zetamac scores. Rank worldwide.</div>
        <div class="chart">
          <svg viewBox="0 0 363 52" fill="none" aria-hidden="true">
            <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${palette.steel}" stop-opacity=".2"/><stop offset="1" stop-color="${palette.steel}" stop-opacity="0"/></linearGradient></defs>
            <path d="M2 45 C 48 46, 57 36, 88 37 S 139 30, 166 31 S 213 18, 245 22 S 301 8, 361 5 L361 52 L2 52 Z" fill="url(#chartFill)"/>
            <path d="M2 45 C 48 46, 57 36, 88 37 S 139 30, 166 31 S 213 18, 245 22 S 301 8, 361 5" stroke="${palette.steel}" stroke-width="4" stroke-linecap="round"/>
            <circle cx="88" cy="37" r="4" fill="${palette.maroon}"/>
            <circle cx="245" cy="22" r="4" fill="${palette.maroon}"/>
            <circle cx="361" cy="5" r="5" fill="${palette.red}"/>
          </svg>
        </div>
        <div class="label">World leaderboard</div>
        <div class="rank">Rank ↑</div>
      </body>
    </html>
  `);
  await page.screenshot({ path: outputPath, type: 'jpeg', quality: 98 });
  await page.close();
}

async function main() {
  await Promise.all([
    mkdir(outputDir, { recursive: true }),
    mkdir(howItWorksOutputDir, { recursive: true }),
  ]);
  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'zetalog-store-assets-'));
  const api = await startApiReplica();
  let context;
  try {
    execSync('pnpm build', {
      cwd: extensionRoot,
      stdio: 'inherit',
      env: { ...process.env, WXT_WEB_APP_URL: api.baseUrl },
    });

    context = await chromium.launchPersistentContext(path.join(temporaryDir, 'browser-profile'), {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionOutput}`,
        `--load-extension=${extensionOutput}`,
      ],
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(
      async ({ games, userId }) => {
        const extension = globalThis;
        await extension.chrome.storage.local.set({
          'zl:v1:games': games,
          'zl:v1:prefs': { selectedFingerprint: null, range: 'all' },
          'zl:v1:session': {
            kind: 'extension',
            token: `zlx_${'a'.repeat(43)}`,
            userId,
          },
          'zl:v2:authState': { needsRelink: false },
        });
      },
      { games: storeGames(), userId: USER_ID },
    );

    const zetamac = await context.newPage();
    await zetamac.setViewportSize({ width: 1280, height: 800 });
    await zetamac.goto('https://arithmetic.zetamac.com/', { waitUntil: 'domcontentloaded' });
    const start = zetamac.getByRole('button', { name: 'Start' });
    if (await start.isVisible()) {
      await start.click();
      await zetamac.waitForLoadState('domcontentloaded');
      await zetamac.locator('#game').waitFor({ state: 'visible', timeout: 10_000 });
    }
    const backgroundPath = path.join(temporaryDir, 'zetamac.jpg');
    await zetamac.screenshot({ path: backgroundPath, type: 'jpeg', quality: 96 });

    const leaderboard = await context.newPage();
    await leaderboard.setViewportSize({ width: 1280, height: 800 });
    await leaderboard.addInitScript(() => globalThis.localStorage.setItem('zl-theme', 'dark'));
    await leaderboard.goto(`https://www.zetalog.co.uk/?d=120&capture=${String(Date.now())}`, {
      waitUntil: 'domcontentloaded',
    });
    await leaderboard.getByRole('heading', { name: 'Global leaderboard' }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    // Next keeps background requests open, so networkidle is not reliable.
    // Give images and self-hosted fonts a short, bounded moment to settle.
    await leaderboard.waitForTimeout(1_200);
    const leaderboardPath = path.join(temporaryDir, 'live-leaderboard.jpg');
    await leaderboard.screenshot({ path: leaderboardPath, type: 'jpeg', quality: 96 });

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 620 });
    await popup.addInitScript(() => globalThis.localStorage.setItem('zl-theme', 'light'));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByTestId('hero-score').waitFor({ state: 'visible' });
    await popup.getByText('Linked to leaderboard').waitFor({ state: 'visible' });
    await popup.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; }',
    });
    await popup.evaluate(() => globalThis.scrollTo(0, 0));

    const topPopupPath = path.join(temporaryDir, 'popup-top.png');
    await popup.screenshot({ path: topPopupPath, type: 'png' });

    await popup.evaluate(() => {
      const recent = globalThis.document.querySelector('[data-testid="recent-games"]');
      globalThis.scrollTo(
        0,
        Math.max(0, (recent?.getBoundingClientRect().top ?? 0) + globalThis.scrollY - 74),
      );
    });
    const recentPopupPath = path.join(temporaryDir, 'popup-recent.png');
    await popup.screenshot({ path: recentPopupPath, type: 'png' });

    await popup.evaluate(() =>
      globalThis.scrollTo(0, globalThis.document.documentElement.scrollHeight),
    );
    const linkedPopupPath = path.join(temporaryDir, 'popup-linked.png');
    await popup.screenshot({ path: linkedPopupPath, type: 'png' });

    // The website walkthrough uses the real, uncropped product screens. Keep
    // these separate from the composed Chrome Web Store marketing images so
    // installation guidance never relies on a simulated browser interface.
    await Promise.all([
      copyFile(backgroundPath, path.join(howItWorksOutputDir, 'zetamac-game.jpg')),
      copyFile(topPopupPath, path.join(howItWorksOutputDir, 'extension-overview.png')),
      copyFile(recentPopupPath, path.join(howItWorksOutputDir, 'extension-history.png')),
      copyFile(linkedPopupPath, path.join(howItWorksOutputDir, 'extension-sync.png')),
      copyFile(leaderboardPath, path.join(howItWorksOutputDir, 'leaderboard.jpg')),
    ]);

    await renderComposition({
      browser: context,
      backgroundPath,
      popupPath: topPopupPath,
      outputPath: path.join(outputDir, '01-automatic-score-tracking.jpg'),
      title: 'Scores saved automatically',
      detail: 'Play on Zetamac as normal. ZetaLog records each completed score in the extension.',
    });
    await renderComposition({
      browser: context,
      backgroundPath,
      popupPath: recentPopupPath,
      outputPath: path.join(outputDir, '02-recent-score-history.jpg'),
      title: 'Review recent games',
      detail: 'See your score history. Restore or remove local games when needed.',
    });
    await renderComposition({
      browser: context,
      backgroundPath: leaderboardPath,
      popupPath: linkedPopupPath,
      outputPath: path.join(outputDir, '03-leaderboard-sync.jpg'),
      title: 'Sync to the leaderboard',
      detail: 'Link once to upload eligible scores and see their sync status.',
      address: 'www.zetalog.co.uk',
      backgroundPosition: 'center top',
    });
    await renderPromoTile(context, path.join(outputDir, 'small-promo-tile-440x280.jpg'));
  } finally {
    await context?.close();
    await new Promise((resolve) => api.server.close(resolve));
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

await main();
