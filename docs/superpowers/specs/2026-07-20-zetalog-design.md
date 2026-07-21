# ZetaLog — Design Spec

**Date:** 2026-07-20
**Status:** Approved 2026-07-20
**One-liner:** A frictionless score tracker (browser extension) and leaderboard (website) for Zetamac (https://arithmetic.zetamac.com/), with UK-university badges.

---

## 1. Product summary

ZetaLog has two halves:

- **Extension (local-first tracker).** Installs once, then sits in the background. Every Zetamac game is recorded automatically — no buttons, no setup. The popup shows scores, trends, and history management. Fully functional with zero account.
- **Website (opt-in leaderboard).** One button in the popup links the extension to an account. Verified, server-validated personal bests rank on global and per-university leaderboards. UK university badges come from verifying a university email address.

### Core product decisions (locked)

| Decision       | Choice                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Score scope    | Track **all** games locally (tagged with settings); only **default-ranges** games at **30s / 60s / 120s** durations rank on leaderboards                             |
| Ranking metric | **Personal best per duration** (all-time highest accepted score)                                                                                                     |
| Board views    | Global board + per-university boards, each with 30s / 60s / 120s tabs. No time-windowed boards in v1                                                                 |
| Auto-removal   | **Quarantine, restorable** — never silently deleted                                                                                                                  |
| Identity       | Sign in with any email (magic link) or Google. A UK uni email at sign-up ⇒ instant badge. Otherwise: empty badge with "+" on your own leaderboard row ⇒ verify later |
| Anti-cheat     | **Aggressive**: full per-problem event streams, server-side score recomputation, statistical validation, admin review queue                                          |
| Stack          | Supabase (Postgres + Auth + RLS) · Next.js on Vercel · WXT extension · pnpm monorepo                                                                                 |
| Browsers       | Chrome-family (Chrome/Edge/Brave/Arc) via WXT for v1; Firefox later (WXT makes it cheap)                                                                             |
| Email          | **Resend** as custom SMTP for Supabase Auth — never Supabase's built-in sender                                                                                       |
| Quality bar    | **Quant-firm recruiting grade** — flagship CV project; see §11                                                                                                       |

---

## 2. Repository layout

```
zetalog/
├── apps/
│   ├── extension/        # WXT extension (Chrome-family MV3)
│   └── web/              # Next.js site + API routes (Vercel)
├── packages/
│   └── shared/           # Types, validation rules, quarantine rules, settings fingerprinting
├── supabase/             # Migrations, seed data (UK universities), config
├── Assets/               # Logo sources (existing)
├── docs/superpowers/specs/
└── CLAUDE.md
```

pnpm workspaces. `packages/shared` is the single source of truth for: `GameRecord` types, the settings fingerprint algorithm, quarantine rules, and validation rules — so the extension can pre-flag locally exactly the way the server judges authoritatively.

---

## 3. Extension

### 3.1 Capture (content script on `arithmetic.zetamac.com`)

- **Game start:** detected from the DOM transition into play mode. At start, the settings fingerprint is captured from the pre-game form (operations enabled, operand ranges, duration) plus the URL `?key=` parameter. A game is **rankable** iff ranges/operations equal Zetamac defaults and duration ∈ {30, 60, 120}. ("Defaults" = the exact values Zetamac's settings form ships with, all four operations enabled; the canonical constants are captured verbatim from the live page during implementation and frozen in `packages/shared`.)
- **During play:** records a per-problem event stream — problem text shown, each answer-box input as a full value snapshot (what the DOM exposes; see CO-1 in `docs/superpowers/plans/`), answer-accepted timestamp, running score. Timestamps come from `performance.now()` (monotonic, immune to clock changes).
- **Game end:** on the game-over state (or page exit mid-game), a complete `GameRecord` is persisted to extension storage: `{ id, startedAt, settingsFingerprint, rankableDuration | null, events[], finalScore, playedMs, status }`.
- Telemetry is captured for **every** game, signed-in or not, so pre-account history can later backfill through server validation.

**DOM resilience:** every Zetamac selector lives in one versioned module (`selectors.ts`). If a game is detected but events fail to capture, the record is marked `capture_failed` and the popup shows a "recorder needs an update" banner — data is never silently lost. No scraping outside the Zetamac origin; the content script never touches other tabs.

### 3.2 Quarantine rules (local; mirrored server-side from `packages/shared`)

Auto-quarantine a game when either:

1. **Restart detection:** actual played time < 80% of the configured duration (user restarted or navigated away), or
2. **Outlier detection:** the user has ≥ 5 kept games on that settings fingerprint AND the score < 40% of the median of the last 10 kept games on that fingerprint.

Quarantined games are greyed out in history, excluded from graphs/stats/leaderboard, and restorable with one click. Manual **Remove** works on any game; removing or quarantining a synced game also revokes it server-side (PB recalculates). Restore of a rankable game re-submits it through server validation.

### 3.3 Popup UI

Typography and colour per the fixed design language (§8). Contents:

- Latest score + **PB callout** (Archivo display; red `#c1121f` only when the PB is _new_)
- **Adaptive trend graph:** < 5 games on the selected config → recent-scores list only; 5–19 → sparkline; ≥ 20 → full line chart with range selector. The user can override which settings config the graph shows (default: most-played config) and the time range; choices persist.
- Recent games list with per-game Restore / Remove
- Quarantine indicator on auto-flagged games
- Footer: **"Sync to leaderboard"** button (signed out) or sync status + display name (signed in). This is the only leaderboard surface in the popup — frictionless stays frictionless.

### 3.4 Account linking & sync

- The popup button opens `zetalog` website `/link`. After Supabase sign-in there, the page hands the session (access + refresh token) to the extension via `window.postMessage` to a content script that runs only on the ZetaLog `/link` origin, on an explicit user click (safer than `externally_connectable`: the browser guarantees which extension receives it, and no extension IDs travel in URLs — see W4 brief). The extension stores the session and refreshes tokens itself.
- On first link, the extension **backfills** all local rankable history (full event streams) through the validation API. Afterwards, each new rankable game uploads on completion.
- Uploads are queued in extension storage and retried with exponential backoff — offline play loses nothing.

---

## 4. Data model (Supabase Postgres)

```
profiles           id (= auth.users.id), display_name (unique, citext),
                   university_id → universities NULLABLE, uni_verified_at, is_admin
universities       id, name, slug, domains text[]     -- seeded from open UK uni/domains dataset
games              id, user_id, client_game_id (uuid, unique per user — idempotent upload),
                   played_at, received_at, settings_fingerprint text  -- canonical string from shared fingerprint(),
                   rankable_duration int NULL,        -- 30 | 60 | 120 | NULL
                   claimed_score int, server_score int,
                   status enum: accepted | quarantined | rejected | user_removed,
                   telemetry jsonb (event stream), validation jsonb (rule results, anomaly score)
uni_verifications  id, user_id, email, code_hash, attempts, expires_at, verified_at
email_events       id, kind, recipient_hash, status, error, created_at   -- send-failure logging (§7)
```

- **Leaderboards** are SQL views: max accepted `server_score` per user per `rankable_duration`, joined to profile + university. Global and per-university variants.
- **RLS:** users read their own `games` rows (sans other users' telemetry); anonymous/public can read only the leaderboard views and `universities`; **all game writes go through the API service role** — no direct client inserts, ever.

---

## 5. Validation pipeline (API route `POST /api/games`)

The extension submits the full event stream; the claimed score is never trusted.

1. **Recompute** the score from the event stream. `server_score` is what ranks.
2. **Physiology rules:** sustained answer times below the human floor (~250 ms per problem), inter-keystroke intervals too uniform (scripted cadence), problem rate impossible for the duration.
3. **Consistency rules:** monotonic timestamps, event count consistent with score, total time consistent with configured duration, fingerprint actually matches default ranges for the claimed `rankable_duration`.
4. **History rules:** a new PB far above the user's score distribution ⇒ `quarantined` for human review, not auto-accepted. Per-user rate limit on submissions (more games/hour than a human can physically play ⇒ reject).
5. **Problem-stream conformity (W6 — problem-tampering defence):** a cheater who rewrites the _displayed_ problems (e.g. every problem becomes "2 + 2") yields an internally consistent stream that no other check catches; these rules reconstruct what Zetamac's generator can emit for the claimed settings.
   - **Range conformity:** each solved problem's operands must be producible by the generator — add within its ranges; subtraction is the reverse of add (shown subtrahend ∈ add_left, answer ∈ add_right); multiplication within its ranges (left factor ≤ its cap); division the reverse of mul (divisor ∈ mul_left, exact quotient ∈ mul_right). An impossible problem ⇒ `rejected` (same class as non-monotonic timestamps).
   - **Operation mix:** with ≥ 2 ops enabled each is drawn uniformly, so over n ≥ 30 problems an enabled op's share deviating past a Hoeffding two-sided union bound (`t = √(ln(2k/α)/2n)`, family-wise false-positive α = 1e-4) ⇒ `quarantined`. Abstains when a zero divisor could force a re-roll.
   - **Repetition/entropy:** independent draws mean a single problem recurring beyond the birthday bound for the _claimed_ operand space (Poisson-tail union bound, α = 1e-4) ⇒ `quarantined`; narrow-range games are judged against their own small space and so are not flagged.
   - **Problem-switch:** consecutive `problem` events with no `accepted` between them (Zetamac never re-renders an unsolved problem) are counted; any occurrence ⇒ `quarantined` with the count recorded.

   All bounds are property-tested (fast-check, 10k seeded runs) against a faithful port of the real generator so legitimate play — across durations and non-default configs — never trips them.

Outcomes: `accepted` (ranks) · `quarantined` (appears in `/admin` review queue with telemetry visualisation; approve ⇒ accepted, reject ⇒ rejected) · `rejected` (kept for audit; never ranks). All rules are pure functions in `packages/shared`, unit-tested against synthetic human-like and bot-like event-stream fixtures.

---

## 6. Website (Next.js on Vercel)

| Route         | Purpose                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | Landing + **global leaderboard** with 120s / 60s / 30s tabs (120s default). Rank, display name, uni badge (or "+" placeholder on your own row), PB — numerals in Azeret Mono (CO-2) `tabular-nums`, the visual hero |
| `/uni/[slug]` | Per-university board, same duration tabs                                                                                                                                                                            |
| `/me`         | Private dashboard: score-over-time graph (steel-blue strokes, adaptive like the popup, config filter + custom range), full history with quarantine management, account settings, display-name change                |
| `/link`       | Extension linking page (sign-in + token handoff)                                                                                                                                                                    |
| `/verify`     | Uni email verification (OTP entry)                                                                                                                                                                                  |
| `/admin`      | Review queue for quarantined submissions — `is_admin` gated                                                                                                                                                         |

Public profiles expose **only** display name, badge, and PBs. Full history and graphs are private. Account deletion purges all rows.

---

## 7. Auth, badges, and email

- **Auth:** Supabase Auth — email magic link + Google OAuth. Display name chosen on first sign-in (unique).
- **Instant badge:** sign-up email domain ∈ `universities.domains` ⇒ university set + verified immediately.
- **Badge later:** empty "+" badge on your own row (and in `/me`) → `/verify`: enter uni email → 6-digit OTP sent → code entered → badge granted. One university per profile; re-verify to change. Uni emails are used solely for verification — never displayed.
- **Email delivery (hard requirements):**
  - **Never** Supabase's built-in sender (rate-limited to a handful/hour; will fail under real signups).
  - **Resend** (free tier: 3,000/month, 100/day) configured as custom SMTP in Supabase dashboard (Auth → SMTP settings); OTP emails sent via Supabase Auth through Resend, templated server-side.
  - All keys via env vars only (`RESEND_API_KEY`, etc.) — never committed; documented in `.env.example`.
  - **Per-address rate limit:** max 3 verification emails per address per hour, enforced server-side, so one abuser can't burn the 100/day cap.
  - Send failures logged (`email_events`); if the daily cap is hit the UI shows a clear "try again later" state.
  - Email sending isolated behind one module (`apps/web/lib/email/`) so the provider can swap to Brevo/SES without touching auth logic.

---

## 8. Design language (fixed — do not substitute)

Palette: `#780000` maroon · `#c1121f` red · `#fdf0d5` cream · `#003049` navy · `#669bbc` steel blue.

**CO-2 (2026-07-21) — desaturated application:** the hexes are brand anchors, not surface paint. Neutrals carry layouts; brand color is confined to identity and state accents; no solid brand-color region larger than a badge chip except the wordmark and chart strokes. Full rules: `docs/superpowers/plans/2026-07-21-co2-design-desaturation.md`.

- **Display:** Archivo variable, width 125%, weight 800–900, all-caps, tracking +2%. Used **only** for wordmark, page titles, PB callouts. Maroon on cream.
- **UI/body:** Spline Sans. Navy on cream (light mode); cream on navy (dark mode).
- **All numerals** (scores, timers, leaderboard, chart axes): Azeret Mono with `font-variant-numeric: tabular-nums` (CO-2: replaced Spline Sans Mono, whose slashed zero was rejected; plain-zero verified by specimen). Numerals are the visual hero of every screen.
- **Red `#c1121f`** only for new personal bests and destructive actions. **Steel blue `#669bbc`** for chart strokes and secondary data.
- Fonts **self-hosted as WOFF2** in the extension bundle and site (no external font requests).
- No crests, no serif display faces, no Inter/system-ui fallback as primary.
- Favicon + extension icons generated from `Assets/high-resolution-color-logo.png` (the icon mark, not the full wordmark).

---

## 9. Error handling

- **Upload failures:** queued + exponential backoff; idempotent via `client_game_id`.
- **Zetamac DOM drift:** versioned selector module; `capture_failed` records + popup banner rather than silent loss.
- **Clock skew:** client uses monotonic timestamps; server records `received_at`; ordering/rate rules use server time.
- **Email cap exhaustion:** logged, surfaced as "try again later" (§7).
- **Storage pressure:** event streams are compact JSON; oldest _non-rankable_ telemetry is pruned first if extension storage nears quota (scores themselves are never pruned).

## 10. Testing

- **Recorder:** unit tests against saved Zetamac DOM fixtures (start, during-play mutations, game-over, mid-game exit).
- **Rules:** quarantine + validation rules are pure functions — fixture battery of human-like vs scripted event streams, restarts, outliers, boundary durations.
- **API:** route tests for submission, idempotency, rate limits, PB revocation on remove.
- **RLS:** policy tests (user cannot read others' telemetry; anon reads views only).
- **E2E:** Playwright drives the extension against a **local static replica** of the Zetamac game page (never live Zetamac in CI).

## 11. Engineering quality bar

This is a flagship portfolio project: assume every line will be read by senior engineers at quantitative trading firms during recruiting. Quality outranks scope — cut v1 features before cutting rigor. These standards are enforced by CI, not convention:

- **Types:** TypeScript strict everywhere plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`, no non-null assertions, no `@ts-expect-error` without an explanatory comment. Lint is typescript-eslint strict-type-checked with zero warnings — warnings fail CI.
- **Determinism and purity:** all scoring, validation, fingerprinting, and quarantine logic lives in `packages/shared` as pure functions — no I/O, no clocks, no randomness; time and effects are injected. Property-based tests (fast-check) run alongside example-based fixtures.
- **Test discipline:** TDD for all behaviour-bearing code. `packages/shared` enforces 100% branch coverage in CI; apps track coverage and cover critical flows end-to-end (Playwright). No skipped tests on `main`.
- **Errors are values:** fallible operations return typed results; no silent `catch`; failures are logged with context. Every external boundary — DOM scraping, network, storage — validates inputs with zod schemas. No unchecked casts at boundaries.
- **Small, documented units:** each module has one purpose; exported symbols carry TSDoc; invariants are stated where they are enforced.
- **Reviewable history:** Conventional Commits, small single-purpose commits, CI (format, lint, typecheck, unit, e2e, build) green on every commit to `main`.
- **Security hygiene:** secrets only via env vars documented in `.env.example`; RLS is default-deny; the service-role key never reaches a client bundle; every dependency must justify its existence — prefer the standard library.

## 12. Out of scope for v1

Firefox/Safari store releases · time-windowed (weekly) boards · friends/follows · shareable score images · custom-config leaderboards · mobile.
