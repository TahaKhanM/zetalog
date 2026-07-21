# CO-4: Progress/account split, per-problem analysis, quieter paper

**Source:** product-owner feedback after W8: the site still reads overly saturated; the
header's profile chip and "My progress" both landed on the same page; the progress page
should analyse WHERE the player is weak (operations, times tables, specific problems);
the leaderboard/progress score display showed the depressed pre-W7 server score.

Supersedes CO-3 §1 surface mixes where they conflict; palette hexes, font roles, and all
other CO-3 rules stand.

## 1. Quieter paper (surface mix change only)

- Light: page `cream 38% → white` (was 78%), cards `cream 14%`, raised `26%`; maroon
  hairlines dialled to 10–13%; strong rules 36%. Metadata text `steel 44%` into body ink
  (was 70%) — steel stays for charts, stops tinting whole paragraphs.
- Dark blackboard: page `navy 58% → black`, cards `74%`; cream ruling 10–14%/30%.
- Theme-aware ink: top-3 rank numerals and selected tabs use `--ink-index`
  (maroon on paper, cream on the blackboard) — raw maroon on navy failed contrast.
- Stat rail and PB tiles drop their card boxes: ruled broadsheet figures (2px maroon
  top-rule, numeral, small-caps label). The board table is the page's only card.

## 2. Progress vs account (information architecture)

- `/me` = progress only: masthead + identity chip (→ `/account`), PB tiles, trend,
  analysis (§3), history ledger. Sign-out and settings leave the page.
- `/account` (new, proxy-gated like `/me`): display name, university badge, sign out.
  Header auth chip links here; "My progress" links to `/me`. The duplicate-destination
  nav is gone.

## 3. Per-problem analysis (shared core + both surfaces)

- `packages/shared/src/analysis.ts` (pure, 100% branch): `solvedProblems` (verified
  solves with solve time + backspace corrections), `operationStats`, `factStats`
  (×N by small factor, ÷N by divisor), `skillBuckets` (carry / borrow / small vs large
  tables), `weakestBuckets`, `slowestSolves`.
- `/me` sections (server-rendered, no client JS): "Where your time goes" op bars
  (steel; slowest inked maroon), "Weak spots" callouts (median, ratio vs fastest area,
  sample size — minimum 8 solves), "Times tables" heat ledger (steel tints, slowest
  cell maroon), "Toughest problems" ledger (problem, time, corrections).
- Popup "Focus" line: slowest well-sampled skill area over the last 20 kept games via
  the same shared functions; needs ≥ 2 sampled areas to render a verdict.
- Popup adopts the CO-3 paper language (was still CO-2): ruled masthead, broadsheet PB
  tiles, maroon ruling throughout.

## 4. Score display + dev data

- Leaderboard gains a quiet games-counted column; the score column was already
  `server_score` — the "wrong score" was the pre-W7 corrupt stream (claimed 40 /
  recomputed 0) plus an empty board. The corrupt game is user-removed (soft, restorable).
- `supabase/scripts/seed-dev-games.mjs`: seeds statistically-conforming, human-paced
  fake games for a test account through the real `POST /api/games` pipeline (generator
  replica + op-dependent pacing; division and 11/12× deliberately slow so the analysis
  page has signal). Dev-only; requires the dev server and service-role env.
- `lib/own-row.ts` badge detection extended to CO-3 `.uni-badge` marks (verified users
  no longer see "＋ add badge").
