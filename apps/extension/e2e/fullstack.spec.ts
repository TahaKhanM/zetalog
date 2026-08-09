import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type GameRecord } from '@zetalog/shared';
import { expect, test } from '@playwright/test';

import { createApiClient } from '../lib/api.js';

/**
 * Full-stack smoke. Proves the extension's real
 * API client submits a recorded game through the live `POST /api/games` route to
 * a local Supabase, is judged `accepted`, and surfaces on the leaderboard.
 *
 * Skipped locally unless `ZL_FULLSTACK=1` and a local Supabase stack is running.
 * The full-stack CI job sets the flag after starting a fresh database. When
 * enabled it reads the local keys, boots Next.js, and drives the whole chain.
 */

const FULLSTACK = process.env.ZL_FULLSTACK === '1';
const WEB_PORT = 3100;
const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..', '..');

interface SupabaseEnv {
  readonly API_URL: string;
  readonly ANON_KEY: string;
  readonly SERVICE_ROLE_KEY: string;
}

/** Parse the local Supabase keys from `supabase status -o env` (`KEY="value"`). */
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

test.describe('full-stack leaderboard smoke', () => {
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
          EXTENSION_OAUTH_REDIRECT_URIS: REDIRECT_URI,
          RESEND_API_KEY: 'dummy-key',
          EMAIL_FROM: 'ZetaLog <test@example.com>',
        },
      },
    );
    await poll(`${WEB_URL}/`, 120_000);
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

  test('links an independent session and exercises its complete game lifecycle', async ({
    browser,
  }) => {
    const api = sb.API_URL;
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `e2e_${suffix}@example.com`;
    const password = 'test-password-123';
    // display_name is a unique 3–15 character handle: letters, digits or underscore.
    const displayName = `E2E_${suffix}`;

    // Create an email-confirmed user (the handle_new_user trigger makes a profile).
    const created = await fetch(`${api}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: sb.SERVICE_ROLE_KEY,
        authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const user = (await created.json()) as { id: string };
    expect(created.status).toBe(200);

    // The leaderboard view requires a display name.
    const named = await fetch(`${api}/rest/v1/profiles?id=eq.${user.id}`, {
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

    // Two simultaneous verification-email reservations for one address cannot
    // both spend the same quota. This exercises the database advisory-lock
    // boundary, not a JavaScript mock.
    const reserveAlias = (codeHash: string) =>
      fetch(`${api}/rest/v1/rpc/reserve_uni_verification`, {
        method: 'POST',
        headers: {
          apikey: sb.SERVICE_ROLE_KEY,
          authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: user.id,
          p_email: `parallel_${suffix}@dur.ac.uk`,
          p_code_hash: codeHash,
          p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          p_per_email_limit: 1,
          p_global_limit: 100,
        }),
      });
    const reservations = await Promise.all([
      reserveAlias('parallel-code-one'),
      reserveAlias('parallel-code-two'),
    ]);
    expect(reservations.map((response) => response.status)).toEqual([200, 200]);
    const reservationResults = await Promise.all(
      reservations.map(async (response) => (await response.json()) as string),
    );
    expect(reservationResults.filter((value) => value === 'rate-limited')).toHaveLength(1);
    expect(
      reservationResults.filter((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value),
      ),
    ).toHaveLength(1);

    // Sign the website in normally, then run the exact browser-owned PKCE link
    // protocol. The credential returned below is independent: neither the
    // website access token nor its rotating refresh token crosses the page.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/signin`);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${WEB_URL}/me`);

    const verifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');
    const authorizeUrl = new URL('/api/extension/link/authorize', WEB_URL);
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', state);
    const authorized = await context.request.get(authorizeUrl.toString(), { maxRedirects: 0 });
    expect(authorized.status()).toBe(303);
    const callback = new URL(authorized.headers().location ?? '');
    expect(`${callback.origin}${callback.pathname}`).toBe(REDIRECT_URI);
    expect(callback.searchParams.get('state')).toBe(state);
    const code = callback.searchParams.get('code');
    expect(code).toBeTruthy();

    const exchange = async () =>
      fetch(`${WEB_URL}/api/extension/link/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: REDIRECT_URI }),
      });
    const exchanged = await exchange();
    expect(exchanged.status).toBe(200);
    const linked = (await exchanged.json()) as { credential: string; userId: string };
    expect(linked.credential).toMatch(/^zlx_[A-Za-z0-9_-]{43}$/);
    expect(linked.userId).toBe(user.id);
    expect((await exchange()).status).toBe(401); // authorization codes are single-use

    // Submit through the extension's OWN API client against the live route.
    const client = createApiClient({
      fetch: (url, init) => fetch(url, init),
      auth: {
        accessToken: () => Promise.resolve(linked.credential),
        refresh: () => Promise.resolve(null),
      },
      baseUrl: WEB_URL,
    });
    const evidence = await client.startChallenge();
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) return;
    const game = acceptedGame({ evidence: evidence.value });
    const result = await client.submitGame(game);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toBe('accepted');
    expect(result.value.serverScore).toBe(3);

    // The accepted rankable game surfaces on the public leaderboard view.
    const readLeaderboard = async (): Promise<{ duration: number; best_score: number }[]> => {
      const res = await fetch(
        `${api}/rest/v1/leaderboard_entries?user_id=eq.${user.id}&select=duration,best_score`,
        { headers: { apikey: sb.ANON_KEY, authorization: `Bearer ${sb.ANON_KEY}` } },
      );
      return (await res.json()) as { duration: number; best_score: number }[];
    };
    expect(await readLeaderboard()).toEqual([{ duration: 60, best_score: 3 }]);

    // The exact same ID submitted concurrently is admitted once and both
    // callers resolve to the same durable row (atomic idempotency).
    const concurrent = acceptedGame();
    const [left, right] = await Promise.all([
      client.submitGame(concurrent),
      client.submitGame(concurrent),
    ]);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.id).toBe(right.value.id);

    // Replaying consumed evidence cannot attach it to another game. The game
    // itself still receives today's normal plausibility verdict, which is the
    // deliberate friction-free offline fallback.
    const replay = acceptedGame({ evidence: evidence.value });
    const replayed = await client.submitGame(replay);
    expect(replayed.ok).toBe(true);
    const replayRow = await fetch(
      `${api}/rest/v1/games?user_id=eq.${user.id}&client_game_id=eq.${replay.id}&select=challenge_id`,
      {
        headers: {
          apikey: sb.SERVICE_ROLE_KEY,
          authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
        },
      },
    );
    expect(await replayRow.json()).toEqual([{ challenge_id: null }]);

    // The byte limit is enforced by the real route even when a client lies by
    // omitting Content-Length; no unbounded JSON parse reaches the validator.
    const oversized = await fetch(`${WEB_URL}/api/games`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${linked.credential}`,
        'content-type': 'application/json',
      },
      body: `{"padding":"${'x'.repeat(2_000_000)}"}`,
    });
    expect(oversized.status).toBe(413);

    // Revoking through the extension's OWN API client (a background DELETE that,
    // in a real browser, is CORS-preflighted) soft-deletes the game, so it drops
    // off the accepted-only leaderboard view.
    const revoked = await client.revokeGame(game.id);
    expect(revoked.ok).toBe(true);
    const restored = await client.restoreGame(game.id);
    expect(restored.ok).toBe(true);

    // Unlink revokes only this installation credential. The website session
    // remains signed in so the user can relink once without account damage.
    expect((await client.revokeSession()).ok).toBe(true);
    expect(await client.listGames()).toEqual({ ok: false, error: { kind: 'auth' } });
    await expect(page).toHaveURL(`${WEB_URL}/me`);

    // Account erasure is also driven through the real authenticated API. The
    // pgTAP suite separately proves every profile/game/alias/credential row is
    // removed atomically and only an anonymous 30-day event remains.
    const deleted = await context.request.delete(`${WEB_URL}/api/account`, {
      data: { confirmation: 'DELETE' },
    });
    expect(deleted.status()).toBe(200);
    const deletedUser = await fetch(`${api}/auth/v1/admin/users/${user.id}`, {
      headers: {
        apikey: sb.SERVICE_ROLE_KEY,
        authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`,
      },
    });
    expect(deletedUser.status).toBe(404);
    await context.close();
  });
});

/** A human-paced, three-problem 60s game that judges to `accepted` (score 3). */
function acceptedGame(over: Partial<GameRecord> = {}): GameRecord {
  return {
    id: crypto.randomUUID(),
    startedAtMs: Date.now() - 60_000,
    playedMs: 6000,
    settings: {
      addEnabled: true,
      addLeft: { min: 2, max: 100 },
      addRight: { min: 2, max: 100 },
      subEnabled: true,
      mulEnabled: true,
      mulLeft: { min: 2, max: 12 },
      mulRight: { min: 2, max: 100 },
      divEnabled: true,
      durationSeconds: 60,
    },
    claimedScore: 3,
    events: [
      { kind: 'problem', at: 0, text: '10 + 5' },
      { kind: 'input', at: 800, value: '1' },
      { kind: 'input', at: 1600, value: '15' },
      { kind: 'accepted', at: 2000, answer: 15 },
      { kind: 'problem', at: 2000, text: '20 + 4' },
      { kind: 'input', at: 2800, value: '2' },
      { kind: 'input', at: 3600, value: '24' },
      { kind: 'accepted', at: 4000, answer: 24 },
      { kind: 'problem', at: 4000, text: '30 + 3' },
      { kind: 'input', at: 4800, value: '3' },
      { kind: 'input', at: 5600, value: '33' },
      { kind: 'accepted', at: 6000, answer: 33 },
    ],
    ...over,
  };
}
