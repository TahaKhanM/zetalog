import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * W8 full-stack auth proof (OPT-IN like me.spec.ts: skipped unless
 * ZL_FULLSTACK=1 with a local `supabase start` running). Drives the REAL
 * browser → form → API route → GoTrue → @supabase/ssr cookie chain:
 *
 * 1. sign-up → emailed code (read from Mailpit — the local stack renders the
 *    byte-synced production templates) → session; then a fresh visit signs in
 *    with EMAIL + PASSWORD only (no code) through /api/auth/login, and /me
 *    renders — proving the server-set cookies are exactly what the browser
 *    client and proxy expect (the silent-session-churn class);
 * 2. a VERIFIED uni alias signs in with the account's password, and the
 *    verify-request route refuses an address already owned by another
 *    account (409 email-taken);
 * 3. wrong-password and unknown-identifier answer byte-identically.
 */

const FULLSTACK = process.env.ZL_FULLSTACK === '1';
const WEB_PORT = 3300;
const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
const MAILPIT_URL = 'http://127.0.0.1:54324';

// Playwright runs with cwd = apps/web; the repo root is two levels up.
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

/**
 * The most recent auth code emailed to `to`, read from Mailpit. The branded
 * templates carry the token in the subject ("Your ZetaLog … code: 123456"),
 * so the subject line is all we need.
 */
async function emailedCode(to: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (res.ok) {
      const body = (await res.json()) as { messages?: { Subject?: string }[] };
      const subject = body.messages?.[0]?.Subject ?? '';
      const match = /code: (\d{6,10})/.exec(subject);
      if (match?.[1] !== undefined) return match[1];
    }
    if (Date.now() > deadline) throw new Error(`no code email for ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Create a confirmed user with a password via the admin API; returns its id. */
async function createConfirmedUser(sb: SupabaseEnv, email: string, password: string) {
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
  return (await created.json()) as { id: string };
}

/** Walk the email-first form: enter the address and press Continue. */
async function continueWithEmail(page: Page, email: string): Promise<void> {
  await page.goto(`${WEB_URL}/signin`, { waitUntil: 'networkidle' });
  const field = page.getByLabel('Email');
  await field.fill(email);
  await expect(field).toHaveValue(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test.describe('W8 auth flows', () => {
  test.skip(!FULLSTACK, 'set ZL_FULLSTACK=1 with a local `supabase start` running');
  test.describe.configure({ timeout: 240_000 });

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

  test('sign-up asks for a code once; sign-in is email + password only', async ({ browser }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `w8_signup_${suffix}@example.com`;
    const password = `Marble9 kettle ${suffix}`;

    // Sign-up through the real form: email → password + confirm → code.
    const context = await browser.newContext();
    const page = await context.newPage();
    await continueWithEmail(page, email);
    await expect(page.getByText('New account for')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // The confirmation email is the branded, code-only template.
    await expect(page.getByLabel('Sign-up code')).toBeVisible();
    const code = await emailedCode(email);
    await page.getByLabel('Sign-up code').fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Session established → display-name onboarding on /me (no bounce).
    await page.waitForURL(`${WEB_URL}/me`);
    await expect(page.getByLabel('Display name')).toBeVisible();
    await context.close();

    // A FRESH browser signs in with email + password — no code anywhere.
    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await continueWithEmail(freshPage, email);
    await freshPage.getByLabel('Password', { exact: true }).fill(password);
    await freshPage.getByRole('button', { name: 'Sign in' }).click();

    // /api/auth/login set the @supabase/ssr cookies server-side; the proxy
    // and Server Components must accept them on the very next navigation.
    await freshPage.waitForURL(`${WEB_URL}/me`);
    const response = await freshPage.goto(`${WEB_URL}/me`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(freshPage).toHaveURL(`${WEB_URL}/me`);
    await expect(freshPage.getByLabel('Display name')).toBeVisible();
    await fresh.close();
  });

  test('a verified uni alias signs the account in; foreign addresses cannot be claimed', async ({
    browser,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `w8_alias_${suffix}@example.com`;
    const alias = `w8_alias_${suffix}@dur.ac.uk`;
    // The bystander's PRIMARY email is on a uni domain — the address user A
    // must not be able to claim as a badge/alias.
    const foreignPrimary = `w8_other_${suffix}@dur.ac.uk`;
    const password = `Kettle drums ${suffix}`;
    const user = await createConfirmedUser(sb, email, password);
    await createConfirmedUser(sb, foreignPrimary, password);

    // Verified alias row (the uni-verification flow's end state).
    const inserted = await fetch(`${sb.API_URL}/rest/v1/uni_verifications`, {
      method: 'POST',
      headers: {
        apikey: sb.SERVICE_ROLE_KEY,
        authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: user.id,
        email: alias,
        code_hash: 'e2e',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        verified_at: new Date().toISOString(),
      }),
    });
    expect(inserted.status).toBe(201);

    // Wrong password at the alias fails safely…
    const context = await browser.newContext();
    const page = await context.newPage();
    await continueWithEmail(page, alias);
    await page.getByLabel('Password', { exact: true }).fill('not the password 1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // (Next.js adds its own empty [role=alert] route announcer — target ours.)
    await expect(page.locator('p[role="alert"]')).toContainText('Wrong email or password');

    // …the account password at the alias signs in.
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${WEB_URL}/me`);
    const response = await page.goto(`${WEB_URL}/me`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // Signed in, trying to verify an address that is ANOTHER account's
    // primary email: refused 409 before any code is sent (alias integrity).
    const conflict = await page.evaluate(async (foreign) => {
      const res = await fetch('/api/verify/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: foreign }),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    }, foreignPrimary);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: { code: 'email-taken' } });
    await context.close();
  });

  test('wrong-password and unknown-identifier are byte-identical', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `w8_parity_${suffix}@example.com`;
    await createConfirmedUser(sb, email, `Parity pass ${suffix}`);

    const attempt = async (identifier: string): Promise<{ status: number; body: string }> => {
      const res = await fetch(`${WEB_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password: 'definitely wrong 99' }),
      });
      return { status: res.status, body: await res.text() };
    };

    const wrongPassword = await attempt(email);
    const unknownIdentifier = await attempt(`w8_ghost_${suffix}@example.com`);
    expect(wrongPassword.status).toBe(401);
    expect(unknownIdentifier.status).toBe(401);
    expect(wrongPassword.body).toBe(unknownIdentifier.body);
  });
});
