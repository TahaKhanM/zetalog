import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type GameRecord } from '@zetalog/shared';
import { expect, test } from '@playwright/test';

import { createApiClient } from '../lib/api.js';

/**
 * OPTIONAL full-stack smoke (brief "e2e — OPTIONAL"). Proves the extension's real
 * API client submits a recorded game through the live `POST /api/games` route to
 * a local Supabase, is judged `accepted`, and surfaces on the leaderboard.
 *
 * Skipped unless `ZL_FULLSTACK=1` AND a local Supabase stack is running
 * (`supabase start`), so the default e2e run — and CI — stays replica-only, with
 * no Docker dependency. When enabled it reads the local Supabase keys, boots
 * `next dev`, and drives the whole chain.
 */

const FULLSTACK = process.env.ZL_FULLSTACK === '1';
const WEB_PORT = 3100;
const WEB_URL = `http://localhost:${String(WEB_PORT)}`;

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

  test('submits a recorded game through the API, ranks it, then revokes it', async () => {
    const api = sb.API_URL;
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `e2e_${suffix}@example.com`;
    const password = 'test-password-123';
    // display_name is unique + constrained to ^[A-Za-z0-9_][A-Za-z0-9_ ]{1,18}[A-Za-z0-9_]$.
    const displayName = `E2E ${suffix}`;

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

    // Sign in the way the extension's session was minted.
    const tokenRes = await fetch(`${api}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: sb.ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const token = (await tokenRes.json()) as { access_token: string };
    expect(token.access_token).toBeTruthy();

    // Submit through the extension's OWN API client against the live route.
    const client = createApiClient({
      fetch: (url, init) => fetch(url, init),
      auth: {
        accessToken: () => Promise.resolve(token.access_token),
        refresh: () => Promise.resolve(null),
      },
      baseUrl: WEB_URL,
    });
    const game = acceptedGame();
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

    // Revoking through the extension's OWN API client (a background DELETE that,
    // in a real browser, is CORS-preflighted) soft-deletes the game, so it drops
    // off the accepted-only leaderboard view.
    const revoked = await client.revokeGame(game.id);
    expect(revoked.ok).toBe(true);
    expect(await readLeaderboard()).toEqual([]);
  });
});

/** A human-paced, three-problem 60s game that judges to `accepted` (score 3). */
function acceptedGame(): GameRecord {
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
  };
}
