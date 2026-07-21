import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import { createServerClient } from '@supabase/ssr';
import { expect, test, type Cookie } from '@playwright/test';

/**
 * W7 bug 3 regression: a signed-in browser session must render `/me` with the
 * user's personal bests and history — it must NOT bounce to `/signin`.
 *
 * The reported failure implicated "browser-set cookies vs @supabase/ssr server
 * expectations" after the OTP flow. This drives the real cookie-read path: it
 * mints the session cookies with @supabase/ssr's OWN `setSession` (byte-for-byte
 * what the browser client writes after `verifyOtp`), plants them in the browser,
 * and loads `/me` — asserting the server reads them and renders the private
 * dashboard. Games are seeded through the real `POST /api/games` pipeline, so the
 * stored rows are exactly production-shaped.
 *
 * OPT-IN (skipped unless ZL_FULLSTACK=1 with a local `supabase start` running),
 * like the extension's full-stack smoke — the default run and CI stay
 * Docker-free.
 */

const FULLSTACK = process.env.ZL_FULLSTACK === '1';
const WEB_PORT = 3200;
const WEB_URL = `http://localhost:${String(WEB_PORT)}`;

// Playwright runs with cwd = apps/web (the config's directory); the repo root is
// two levels up. (Avoids `import.meta`, since apps/web is not an ESM package.)
const repoRoot = path.resolve(process.cwd(), '..', '..');

interface SupabaseEnv {
  readonly API_URL: string;
  readonly ANON_KEY: string;
  readonly SERVICE_ROLE_KEY: string;
}

function readSupabaseEnv(): SupabaseEnv {
  const raw = execSync('supabase status -o env', { cwd: repoRoot, encoding: 'utf8' });
  const env = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) env.set(match[1], match[2]);
  }
  const API_URL = env.get('API_URL');
  const ANON_KEY = env.get('ANON_KEY');
  const SERVICE_ROLE_KEY = env.get('SERVICE_ROLE_KEY');
  if (API_URL === undefined || ANON_KEY === undefined || SERVICE_ROLE_KEY === undefined) {
    throw new Error('supabase status is missing keys — is `supabase start` running?');
  }
  return { API_URL, ANON_KEY, SERVICE_ROLE_KEY };
}

async function poll(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** A clean, human-paced accepted game at `duration`s with `problems` verified answers. */
function acceptedGame(problems: number, duration: 30 | 60 | 120): unknown {
  const events: unknown[] = [];
  let at = 0;
  for (let i = 0; i < problems; i += 1) {
    const left = 10 + i;
    const answer = String(left + 5);
    events.push({ kind: 'problem', at, text: `${String(left)} + 5` });
    at += 700;
    let acc = '';
    for (const ch of answer) {
      acc += ch;
      events.push({ kind: 'input', at, value: acc });
      at += 450;
    }
    events.push({ kind: 'accepted', at, answer: left + 5 });
    at += 1100;
  }
  return {
    id: crypto.randomUUID(),
    startedAtMs: Date.now() - 120_000,
    playedMs: duration * 1000,
    settings: {
      addEnabled: true,
      addLeft: { min: 2, max: 100 },
      addRight: { min: 2, max: 100 },
      subEnabled: true,
      mulEnabled: true,
      mulLeft: { min: 2, max: 12 },
      mulRight: { min: 2, max: 100 },
      divEnabled: true,
      durationSeconds: duration,
    },
    claimedScore: problems,
    events,
  };
}

/** Mint the session cookies exactly as the browser @supabase/ssr client writes them. */
async function mintSessionCookies(
  sb: SupabaseEnv,
  accessToken: string,
  refreshToken: string,
): Promise<Cookie[]> {
  const jar = new Map<string, string>();
  const client = createServerClient(sb.API_URL, sb.ANON_KEY, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (toSet) => {
        for (const { name, value } of toSet) jar.set(name, value);
      },
    },
  });
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error !== null) throw new Error(`setSession failed: ${error.message}`);
  return [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }));
}

test.describe('signed-in /me', () => {
  test.skip(!FULLSTACK, 'set ZL_FULLSTACK=1 with a local `supabase start` running');
  test.describe.configure({ timeout: 180_000 });

  let sb: SupabaseEnv;
  let web: ChildProcess;

  test.beforeAll(async () => {
    sb = readSupabaseEnv();
    web = spawn(
      'pnpm',
      ['--filter', '@zetalog/web', 'exec', 'next', 'dev', '--port', String(WEB_PORT)],
      {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: sb.API_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY,
          RESEND_API_KEY: 'dummy-key',
          EMAIL_FROM: 'ZetaLog <test@example.com>',
        },
      },
    );
    await poll(`${WEB_URL}/signin`, 120_000);
  });

  test.afterAll(() => {
    if (web.pid !== undefined) {
      try {
        process.kill(-web.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  });

  test('renders personal bests and history for an OTP-style cookie session', async ({
    browser,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `me_e2e_${suffix}@example.com`;
    const password = 'test-password-123';
    const displayName = `Me ${suffix}`;

    // Confirmed user (handle_new_user creates the profile) + a display name.
    const created = await fetch(`${sb.API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: sb.SERVICE_ROLE_KEY,
        authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    expect(created.status).toBe(200);
    const user = (await created.json()) as { id: string };

    const named = await fetch(`${sb.API_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: sb.SERVICE_ROLE_KEY,
        authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ display_name: displayName }),
    });
    expect(named.status).toBe(204);

    // Token, then submit two accepted rankable games through the real pipeline.
    const tokenRes = await fetch(`${sb.API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: sb.ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const token = (await tokenRes.json()) as { access_token: string; refresh_token: string };
    expect(token.access_token).toBeTruthy();

    for (const problems of [3, 5]) {
      const res = await fetch(`${WEB_URL}/api/games`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(acceptedGame(problems, 60)),
      });
      const body = (await res.json()) as { outcome?: string };
      expect(res.status).toBe(201);
      expect(body.outcome).toBe('accepted');
    }

    // Plant the browser-faithful session cookies, then load /me.
    const cookies = await mintSessionCookies(sb, token.access_token, token.refresh_token);
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();

    const response = await page.goto(`${WEB_URL}/me`, { waitUntil: 'domcontentloaded' });

    // It must NOT bounce to /signin.
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(`${WEB_URL}/me`);

    // Personal bests: best of the two accepted 60s games is 5.
    await expect(page.getByRole('heading', { name: 'My progress' })).toBeVisible();
    const pbSection = page.locator('.pb-grid');
    await expect(pbSection).toContainText('60s');
    await expect(pbSection.locator('.pb-card__score')).toHaveText('5');

    // History: both accepted games are listed.
    const history = page.locator('.me__section', { hasText: 'History' });
    await expect(history.getByText('Accepted').first()).toBeVisible();
    await expect(history.getByText('5')).toBeVisible();
    await expect(history.getByText('3')).toBeVisible();

    await context.close();
  });
});
