# ZetaLog Implementation Roadmap

The design spec (`docs/superpowers/specs/2026-07-20-zetalog-design.md`) spans four
subsystems. Each gets its own implementation plan producing working, testable software on
its own. Execute strictly in order — later plans consume interfaces from earlier ones.

Plans 2–4 are **deliberately not written yet**: each begins with reconnaissance whose
outputs (live Zetamac DOM fixtures, a provisioned Supabase project) the task detail depends
on. Each plan is written with superpowers:writing-plans at phase start and saved here.

## Plan 1 — Domain core (`2026-07-20-domain-core.md`) — WRITTEN

All pure domain logic in `packages/shared`: event/record schemas (zod), Zetamac default
settings + fingerprinting, problem parsing, score recomputation, quarantine rules, and the
full validation pipeline (physiology / consistency / history → verdict).

**Working software:** a fully tested library — 100% branch coverage, property-based tests —
that both apps consume. Everything downstream (extension pre-flagging, server judging) is a
thin shell around this core.

## Plan 2 — Extension local tracker (`apps/extension`)

Recon first: play real games, save DOM fixtures (pre-game form, play mode, game-over) into
`apps/extension/test/fixtures/`, verify problem-text glyphs against the Plan 1 parser.
Then: WXT scaffold, versioned `selectors.ts`, content-script recorder emitting
`GameRecord`s, extension-storage repository with quarantine via `evaluateQuarantine`,
popup UI (design tokens, adaptive graph: <5 list / 5–19 sparkline / ≥20 chart with
persisted config+range override), restore/remove, capture-failure banner, self-hosted
WOFF2 fonts, icons from `Assets/icons/`.

**Working software:** an installable extension that records, quarantines, and graphs games
locally with zero account. Playwright e2e against a local static Zetamac replica built from
the fixtures.

## Plan 3 — Backend + leaderboard site (`supabase/` + `apps/web`)

Recon first: provision Supabase project, configure Resend as custom SMTP (Auth → SMTP
settings). Then: migrations for `profiles`/`universities`/`games`/`uni_verifications`/
`email_events` with default-deny RLS, UK university seed data, Supabase Auth (magic link +
Google), `POST /api/games` calling `judge()` from `@zetalog/shared` (service-role writes,
idempotent on `client_game_id`, per-user rate limits), leaderboard views + pages
(global `/` and `/uni/[slug]`, 120s/60s/30s tabs), `/me` dashboard, uni-email OTP
verification (Resend module in `apps/web/lib/email`, 3 emails/address/hour), instant badge
on uni-domain sign-up, `/admin` review queue, RLS policy tests.

**Working software:** a deployed site where a seeded user can rank, verify a badge, and an
admin can review quarantined submissions — before the extension ever connects.

## Plan 4 — Linking, sync, and release

`/link` page with `externally_connectable` session handoff, extension session refresh,
upload queue with exponential backoff, first-link history backfill through validation,
server-side PB revocation on remove/quarantine, restore re-submission, full-stack
Playwright e2e (record → sync → appears on board), Chrome Web Store packaging (listing,
permission justifications, privacy policy per the chrome-extensions skill).

**Working software:** the complete shipped product.

## Standing gates (every plan, every task)

- TDD; `pnpm verify` green before every commit (spec §11).
- 100% branch coverage holds in `packages/shared`; apps cover critical flows e2e.
- Skills: `superpowers:test-driven-development` per task; `chrome-extensions` (Plan 2/4),
  `supabase` + `supabase-postgres-best-practices` (Plan 3), `frontend-design` + `dataviz`
  (UI), `vercel:nextjs` (Plan 3).
