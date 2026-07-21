# W4 — Linking, sync, backfill, e2e, packaging (report)

**Branch:** `worktree-agent-af8615c617f2fce37` (off `feat/v1-build`)
**Status:** DONE
**`pnpm verify`:** exit 0 on every commit. Unit tests: shared 89, web 140,
extension 205 (all green). E2e: required replica suite passing; optional
full-stack smoke verified passing against a local Supabase.

> Written to the worktree root (`<REPO>/w4-report.md`) per the controller's
> exception — this agent's isolation blocks writing to `<SDD>`. Not committed.

## Commits (oldest → newest)

| Hash      | Subject                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `a1f6d22` | feat(extension): account session persistence and raw-fetch token refresh    |
| `f608150` | feat(extension): typed game API client with one-shot 401 refresh            |
| `5c510ed` | feat(extension): leaderboard sync queue with backfill and backoff           |
| `0448fa8` | feat(extension): link handoff, background sync worker, and message protocol |
| `d750de6` | feat(web): real extension link handoff on the /link page                    |
| `653aaf7` | feat(extension): popup signed-in footer, Unlink, and per-game sync chips    |
| `a055c5c` | test(extension): required extension-vs-replica e2e (Playwright)             |
| `1c58fdb` | chore(extension): CI e2e job and Chrome Web Store packaging docs            |
| `a47f4a2` | test(extension): optional full-stack leaderboard smoke e2e                  |

## Test summary

- **Unit (vitest):** extension 205 tests / 20 files. New pure cores at **100%
  branch** (enforced per-file in `vitest.config.ts`): `lib/auth.ts`, `lib/api.ts`,
  `lib/sync.ts`, `lib/link.ts`, `lib/messages.ts`, plus the updated `lib/store.ts`
  kept at 100%. Web +3 (`lib/link.ts` pure message helpers). Shared unchanged (89).
- **E2e (Playwright, @playwright/test 1.61.1, chromium):**
  - **Required — `e2e/extension.spec.ts` (extension vs offline replica):**
    `1 passed` in **~13.8s** (15.6s wall incl. extension build). Loads the built
    MV3 extension, plays scripted games on an offline Zetamac replica, asserts the
    recorded score, restart-quarantine of an aborted game, and sparkline graph mode
    through the real popup.
  - **Optional — `e2e/fullstack.spec.ts` (extension API client vs live stack):**
    `1 passed` in **~244ms** test time under `ZL_FULLSTACK=1` with `supabase start`
    - `next dev`; **skipped by default** (so the default run / CI stay replica-only,
      no Docker). Submits an `accepted` rankable game via the extension's own
      `createApiClient` to the live `POST /api/games` and asserts it ranks on the
      `leaderboard_entries` view.
  - Default `pnpm --filter @zetalog/extension test:e2e`: `1 passed, 1 skipped`.

## What shipped

### Extension session + API client

- `lib/auth.ts` — session persisted under `zl:v1:session` (zod); `requestRefresh`
  via a single raw `fetch` to the GoTrue token endpoint (`apikey` = anon key),
  supabase-js kept out of the bundle. `decodeUserId` reads the JWT `sub` so
  `Session.userId` comes from the token itself (keeps the handoff message exactly
  `{access_token, refresh_token}`). Tokens are sent only to `SUPABASE_URL` and
  never appear in an error detail or log.
- `lib/api.ts` — `submitGame`/`revokeGame` over the W3 endpoints; bearer auth;
  one token refresh + retry on 401; zod-parsed 201 `{id, outcome, serverScore}`;
  every status/fault mapped to a typed `ApiError`; `Result` returns.
- `lib/config.ts` — public `SUPABASE_URL` / `SUPABASE_ANON_KEY` placeholders
  (runbook-filled) + `LINK_ORIGINS` allowlist; `WEB_APP_URL` retained.

### Sync queue + backfill

- `lib/sync.ts` — the queue is _derived_ state: a pure `reconcileJobs` rebuilds it
  from local history each drain (kept-rankable → submit; uploaded-then-removed →
  revoke; first link backfills every kept rankable game). `drainSync` processes due
  entries, writes each server verdict back onto the game (`sync: {state, outcome,
serverScore}`), marks permanent failures, reschedules transient ones with
  exponential backoff (1m/5m/25m, cap 2h), and halts (preserving the queue) on an
  auth failure. `lib/store.ts` gained the `sync` field, `markSync`, `clearAllSync`.
- `entrypoints/background.ts` — MV3 service worker; the sole drain owner.
  Message-triggered (link/drain/unlink) + `alarms` retry. No in-memory state;
  everything re-read from `browser.storage.local` each event.

### Session handoff (content-script postMessage — the brief's fixed decision)

- `entrypoints/link.content.ts` — runs only on the two `/link` origins; validates
  `event.origin ∈ LINK_ORIGINS` **and** `event.source === window` before reading
  anything, forwards the tokens to the background, and posts `zl-link-ack` back
  only to the validated origin. `lib/link.ts` is the pure, 100%-covered validator.
- `apps/web/app/_components/LinkHandoff.tsx` — a "Link the ZetaLog extension"
  button posts the current session to this exact origin **only on explicit click**,
  waits for the ack to show "Linked", and shows a not-detected fallback otherwise.
  Message shape + ack detection in a tested `apps/web/lib/link.ts`.

### Popup

- Footer: signed-out keeps "Sync to leaderboard"; signed-in shows "Syncing to
  leaderboard" + Unlink (messages the background to clear session/queue/sync;
  local games untouched). Per-game sync chips in Recent (Syncing… / Synced /
  Under review / Rejected / Sync failed), steel/maroon tints per CO-2. Popup kicks
  a drain on open and refreshes live on storage changes.

### e2e + packaging

- Offline replica (`test/replica/`): faithful `#game` DOM + a deterministic,
  seeded, jQuery-free `app.js` with a short-duration override. Content script fires
  against it via `--host-resolver-rules="MAP arithmetic.zetamac.com 127.0.0.1:<port>"`.
- CI: a dedicated `e2e` job in `.github/workflows/ci.yml` (Playwright browser
  cache; `test:e2e` builds the extension then runs the replica suite; never live,
  never Docker).
- Store docs: `docs/store/listing.md` (benefit-oriented copy, category,
  screenshot brief, per-permission justifications, single-purpose statement) and
  `docs/store/privacy-policy.md` (local-first telemetry, opt-in upload, deletion
  story). `wxt zip` → `.output/zetalogextension-0.0.0-chrome.zip` (693 kB).

## Contract conformance (vs w1-report / w3-report)

- **`startedAtMs` (epoch-ms):** the recorder already stored `Date.now()` at game
  start (W1), which matches W3's corrected `played_at` contract. No conflict; the
  api client submits the record verbatim.
- **`POST /api/games` / `DELETE /api/games/[clientGameId]`:** api client matches
  the W3 shapes (bearer, `gameRecordSchema` body, 201 `{id, outcome, serverScore}`
  with `outcome ∈ accepted|quarantined|rejected|user_removed`, `{error:{code,message}}`
  bodies, open CORS). Confirmed live in the full-stack e2e.
- **LinkHandoff seam:** replaced the W3 placeholder in place; `/link` still renders
  it unchanged.

## Deviations & flags (none are contract conflicts)

1. **`externally_connectable` vs content-script postMessage.** W3's LinkHandoff
   TSDoc mentioned an `externally_connectable` handoff, but the W4 brief's _fixed
   decision_ is the content-script postMessage pattern (browser-guaranteed origin,
   no extension IDs in URLs). I implemented the brief's approach on both sides.
2. **One permission added: `alarms`.** Required by the brief's own "browser.alarms
   retry" for the backoff drain. No host permissions added; the two `/link`
   origins are content-script `matches` only. Manifest permissions are now
   `["storage", "alarms"]`.
3. **`userId` from JWT `sub`.** To keep the handoff message exactly
   `{access_token, refresh_token}` (per the brief) while persisting the
   `{accessToken, refreshToken, userId}` session (per the brief), the extension
   decodes the token's `sub` locally (`decodeUserId`) — no JWT dependency, and it
   is display-only (the server re-verifies every request).
4. **e2e launch flags (documented in the spec):** MV3 service workers only
   register under Chrome's new headless, so the context launches with
   `--headless=new`. The http replica is not a secure context (the real site is
   HTTPS), so `crypto.randomUUID` is unavailable there; the launch adds
   `--unsafely-treat-insecure-origin-as-secure=http://arithmetic.zetamac.com` to
   match production. Both are test-harness-only.

## Runbook / follow-ups

- **Fill `SUPABASE_URL` and `SUPABASE_ANON_KEY`** in `apps/extension/lib/config.ts`
  before publishing (marked with RUNBOOK comments). They are public, client-safe
  placeholders today; the extension is fully functional signed out regardless.
- **Publish the privacy policy** at a stable URL and enter it in the CWS dashboard
  (required — telemetry is uploaded on opt-in sync).
- Consider dropping the `localhost:3000/link` content-script match from the
  published build (kept for local dev; noted in the listing).

## Concerns

1. **Mid-game-exit save race (pre-existing, W1).** A game aborted by navigation
   saves via `pagehide`, whose async storage write can lose to unload. If in a rare
   window a submit _succeeded_ server-side but the client didn't record `uploaded`
   AND the user then removes the game, the server keeps an orphan (no revoke is
   queued because local `sync.state !== 'uploaded'`). Rare; acceptable for v1. The
   e2e sidesteps the race by dispatching `pagehide` on a live page.
2. **Auth-failure policy.** On an auth failure the drain halts and _leaves_ the
   session (chips stay "Syncing…"); re-linking resumes uploads. I deliberately did
   not auto-clear the session (avoids surprising the user); a future refinement
   could surface a "re-link" prompt.
3. **Full-stack e2e teardown.** `next dev` is stopped via a process-group SIGTERM;
   a leftover dev server on port 3100 can occasionally persist (observed a warm
   reuse). Harmless to correctness, but worth hardening if this test is promoted
   into regular CI. It stays skipped by default, so CI is unaffected.
4. **CI headless.** The replica e2e runs `--headless=new` (validated locally,
   headless). If a CI runner's chromium struggles with extensions in new headless,
   wrap the job in `xvfb-run` as a fallback.
