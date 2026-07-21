/**
 * Seed realistic fake Zetamac games for the owner's Warwick test account.
 *
 * - Problems come from a faithful replica of Zetamac's generator (uniform
 *   draws, sub = reverse add, div = reverse mul with zero-divisor re-roll), so
 *   the W6 statistical conformity rules pass by construction.
 * - Pacing is human: op-dependent solve times (division slowest, 11/12 times
 *   tables painful), jittered keystrokes, occasional typo + backspace
 *   corrections, think-time before the first key.
 * - Every game is submitted through the real POST /api/games pipeline with a
 *   session minted via the admin magic-link API, so rows are judged and stored
 *   exactly as production writes them (claimed == recomputed, status accepted).
 *
 * Usage (repo root, dev server running): node supabase/scripts/seed-dev-games.mjs [email] [--dry-run]
 */

/* global fetch, process, console */

import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const WEB_URL = 'http://localhost:3000';
const TARGET_EMAIL = process.argv.find((a) => a.includes('@')) ?? 'u5740627@live.warwick.ac.uk';
const DRY_RUN = process.argv.includes('--dry-run');

// ── env ──────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// ── deterministic PRNG (mulberry32, mirrors the shared testkit) ─────────────
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (rng, n) => Math.floor(rng() * n);
const randInt = (rng, r) => r.min + rand(rng, r.max - r.min + 1);
const uuid = (rng) =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const v = rand(rng, 16);
    return (c === 'x' ? v : (v & 0x3) | 0x8).toString(16);
  });

// ── Zetamac default settings (must match ZETAMAC_DEFAULT_SETTINGS) ──────────
const settingsFor = (durationSeconds) => ({
  addEnabled: true,
  addLeft: { min: 2, max: 100 },
  addRight: { min: 2, max: 100 },
  subEnabled: true,
  mulEnabled: true,
  mulLeft: { min: 2, max: 12 },
  mulRight: { min: 2, max: 100 },
  divEnabled: true,
  durationSeconds,
});

// ── faithful generator replica (testkit semantics) ──────────────────────────
function nextProblem(settings, rng) {
  const gens = [
    () => {
      const left = randInt(rng, settings.addLeft);
      const right = randInt(rng, settings.addRight);
      return { pretty: `${left} + ${right}`, answer: left + right, op: '+', left, right };
    },
    () => {
      const first = randInt(rng, settings.addLeft);
      const second = randInt(rng, settings.addRight);
      return {
        pretty: `${first + second} – ${first}`,
        answer: second,
        op: '-',
        left: first + second,
        right: first,
      };
    },
    () => {
      const left = randInt(rng, settings.mulLeft);
      const right = randInt(rng, settings.mulRight);
      return { pretty: `${left} × ${right}`, answer: left * right, op: '*', left, right };
    },
    () => {
      const first = randInt(rng, settings.mulLeft);
      const second = randInt(rng, settings.mulRight);
      if (first === 0) return null;
      return {
        pretty: `${first * second} ÷ ${first}`,
        answer: second,
        op: '/',
        left: first * second,
        right: first,
      };
    },
  ];
  for (;;) {
    const p = gens[rand(rng, gens.length)]();
    if (p !== null) return p;
  }
}

// ── human pacing model ───────────────────────────────────────────────────────
// Base think-time medians per op (ms) at skill = 1.0. The trend seeds improve
// by shrinking `skill` over the weeks. Division is the deliberate weak area,
// with big times-tables (11/12 × large) the standout struggle problems.
function thinkTimeMs(p, rng, skill) {
  let base;
  if (p.op === '+') {
    base = 1050 + (p.left > 50 && p.right > 50 ? 320 : 0);
    if ((p.left % 10) + (p.right % 10) >= 10) base += 260; // carry
  } else if (p.op === '-') {
    base = 1300;
    if (p.left % 10 < p.right % 10) base += 420; // borrow
  } else if (p.op === '*') {
    base = 1150 + (p.left >= 7 ? 300 : 0) + (p.right > 50 ? 350 : 0);
    if (p.left >= 11) base += 900 + (p.right > 50 ? 700 : 0); // 11/12 tables hurt
  } else {
    base = 1750 + (p.right >= 7 ? 450 : 0) + (p.answer > 50 ? 300 : 0); // division: the weak area
  }
  // Log-normal-ish jitter: multiply by e^{N(0, 0.35)} approximated via CLT.
  const gauss = (rng() + rng() + rng() + rng() - 2) / 1.157; // ~N(0,1)
  const jitter = Math.exp(0.32 * gauss);
  return Math.max(420, Math.round(base * skill * jitter));
}

/** Build one game's event stream; returns { events, score, problems }. */
function buildGame(settings, rng, skill) {
  const windowMs = settings.durationSeconds * 1000;
  const events = [];
  let at = 0;
  let score = 0;
  for (;;) {
    const p = nextProblem(settings, rng);
    const think = thinkTimeMs(p, rng, skill);
    const digits = String(p.answer);
    // keystroke plan: occasionally fat-finger a digit and correct it.
    const fumble = rng() < 0.055 && digits.length >= 2;
    const keys = [];
    let typed = '';
    for (let i = 0; i < digits.length; i += 1) {
      if (fumble && i === 1) {
        const wrong = String((Number(digits[1]) + 1 + rand(rng, 8)) % 10);
        keys.push(typed + wrong); // wrong digit
        keys.push(typed); // backspace
      }
      typed += digits[i];
      keys.push(typed);
    }
    const keyGaps = keys.map(() => 120 + rand(rng, 240) + (fumble ? 60 : 0));
    const typingMs = keyGaps.reduce((a, b) => a + b, 0);
    const gapAfter = 130 + rand(rng, 280);
    const total = think + typingMs + gapAfter;
    if (at + think + typingMs > windowMs - 150) break; // timer expires mid-problem
    events.push({ kind: 'problem', at, text: p.pretty });
    let t = at + think;
    for (let i = 0; i < keys.length; i += 1) {
      events.push({ kind: 'input', at: t, value: keys[i] });
      t += keyGaps[i];
    }
    events.push({ kind: 'accepted', at: t, answer: p.answer });
    score += 1;
    at = t + gapAfter;
    void total;
  }
  return { events, score };
}

// ── session plan: ~7 weeks of practice, improving ───────────────────────────
const NOW = Date.now();
const DAY = 86_400_000;
const sessions = [];
{
  const rng = mulberry32(20260721);
  const sessionCount = 18;
  for (let s = 0; s < sessionCount; s += 1) {
    const progress = s / (sessionCount - 1); // 0 → 1 over the weeks
    const daysAgo = 44 - Math.round(progress * 44) + rand(rng, 2);
    // Evening practice, 18:00–22:30 local.
    const start = NOW - daysAgo * DAY;
    const dayStart = start - (start % DAY) + 18 * 3_600_000 + rand(rng, 4.5 * 3_600_000);
    const gamesInSession = 2 + rand(rng, 3); // 2–4
    const skill = 1.42 - progress * 0.5 + (rng() - 0.5) * 0.12;
    sessions.push({ at: Math.min(dayStart, NOW - 3_600_000), gamesInSession, skill, seed: s });
  }
  sessions.sort((a, b) => a.at - b.at);
}

const DURATION_PICKS = [120, 120, 120, 120, 120, 120, 60, 60, 60, 30, 30];

async function main() {
  console.log(`Seeding fake games for ${TARGET_EMAIL} (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);

  // 1. Find the user.
  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
  });
  const { users } = await usersRes.json();
  const user = (users ?? []).find((u) => u.email === TARGET_EMAIL);
  if (!user) throw new Error(`user ${TARGET_EMAIL} not found`);
  console.log(`user: ${user.id}`);

  // 2. Mint a session via admin magic link (no password involved).
  let token = null;
  if (!DRY_RUN) {
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email: TARGET_EMAIL }),
    });
    const link = await linkRes.json();
    if (!link.hashed_token) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    });
    token = await verifyRes.json();
    if (!token.access_token) throw new Error(`verify failed: ${JSON.stringify(token)}`);
    fs.writeFileSync(
      path.join(REPO, '.seed-session.json'),
      JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token }),
    );
    console.log('session minted (saved to warwick-session.json)');
  }

  // 3. Build and submit games chronologically.
  const rng = mulberry32(777_001);
  let submitted = 0;
  const summary = { 120: [], 60: [], 30: [] };
  for (const session of sessions) {
    let clock = session.at;
    for (let g = 0; g < session.gamesInSession; g += 1) {
      const duration = DURATION_PICKS[rand(rng, DURATION_PICKS.length)];
      const settings = settingsFor(duration);
      // Per-game skill wobble: tired at session end, warm after game 1.
      const wobble = 1 + (g === 0 ? 0.05 : 0) + (rng() - 0.5) * 0.08;
      const { events, score } = buildGame(settings, rng, session.skill * wobble);
      const record = {
        id: uuid(rng),
        startedAtMs: Math.round(clock),
        playedMs: duration * 1000,
        settings,
        events,
        claimedScore: score,
      };
      summary[duration].push(score);
      if (!DRY_RUN) {
        const res = await fetch(`${WEB_URL}/api/games`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(record),
        });
        const body = await res.json();
        if (res.status !== 201 || body.outcome !== 'accepted') {
          console.error(
            `  !! ${duration}s score=${score} -> HTTP ${res.status} ${JSON.stringify(body)}`,
          );
        } else {
          submitted += 1;
        }
      }
      clock += duration * 1000 + 45_000 + rand(rng, 240_000); // breather between games
    }
  }

  for (const d of [120, 60, 30]) {
    const scores = summary[d];
    console.log(
      `${d}s: ${scores.length} games, scores ${scores.join(', ')} (best ${Math.max(...scores, 0)})`,
    );
  }
  console.log(
    DRY_RUN ? 'dry run complete (nothing submitted)' : `submitted ${submitted} accepted games`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
