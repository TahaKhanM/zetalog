# ZetaLog

Frictionless Zetamac score tracker (browser extension) + UK-university leaderboard (website).

**Sources of truth — read before non-trivial work:**

- Design spec: `docs/superpowers/specs/2026-07-20-zetalog-design.md`
- Implementation plan: `docs/superpowers/plans/` (execute in order; keep checkboxes current)

## Copy rules (HARD RULES for every word a user sees)

Applies to all UI strings, page copy, empty states, hints, errors, and store listings.
Violating any of these is a bug:

1. No em dashes. Use a period or a comma, or restructure the sentence.
2. No Oxford commas.
3. Plain, direct language. Short sentences. No marketing fluff, no "seamlessly",
   "effortlessly", "supercharge", "unlock" or similar.
4. Say what the thing does, not how impressive it is. "Scores sync after each game"
   beats "your scores are recomputed and validated server-side".
5. No exclamation marks. No rhetorical questions.

## Quality bar

Flagship CV project: assume every line will be read by senior engineers at quantitative
trading firms. Quality outranks scope — cut features before cutting rigor.

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No `any`,
  no non-null assertions, no `@ts-expect-error` without an explanatory comment.
- `pnpm verify` (format, lint zero-warnings, typecheck, test, build) must pass before every
  commit. TDD for all behaviour-bearing code (superpowers:test-driven-development).
- All scoring/validation/fingerprint/quarantine logic = pure functions in `packages/shared`.
  No I/O, clocks, or randomness inside — inject them. 100% branch coverage enforced there.
- Errors are values (typed results). No silent `catch`. Validate every external boundary
  (DOM, network, storage) with zod schemas.
- Conventional Commits, small and single-purpose. Every dependency must justify itself.

## Repository map

| Path              | Contents                                                                    |
| ----------------- | --------------------------------------------------------------------------- |
| `packages/shared` | Types, design tokens, fingerprint/quarantine/validation rules (pure)        |
| `apps/extension`  | WXT extension (Chrome-family MV3) — recorder, popup, sync                   |
| `apps/web`        | Next.js site on Vercel — leaderboards, dashboard, API routes, admin         |
| `supabase/`       | Migrations, seed data (UK universities), config                             |
| `Assets/icons/`   | Generated icon set + favicon (from `Assets/high-resolution-color-logo.png`) |

## Commands

- `pnpm install` — bootstrap workspace
- `pnpm verify` — full local CI (run before every commit)
- `pnpm --filter @zetalog/shared test` — one package's tests

## Product invariants (violating any of these is a bug)

1. **Never trust a claimed score.** The server recomputes every score from the submitted
   event stream; only `server_score` ranks — and the problem stream must be statistically
   consistent with Zetamac's generator for the claimed settings.
2. All game writes go through the API with the service role. No client inserts. RLS is
   default-deny; the service-role key never reaches a client bundle.
3. **Quarantine, never silently delete.** Auto-flagged scores stay visible and restorable.
4. Local-first: the extension is fully functional signed out; telemetry is recorded for
   every game so history can backfill through validation later.
5. Rankable game = Zetamac default ranges/operations AND duration ∈ {30, 60, 120}s.
   Leaderboards: personal best per duration, global + per-university.
6. Email only via the Resend SMTP module (`apps/web/lib/email`) — never Supabase's built-in
   sender. Max 3 verification emails per address per hour.
7. Design tokens live in `packages/shared/src/tokens.ts` — never hard-code palette hexes or
   font families elsewhere. Red `#c1121f` only for new PBs and destructive actions. All
   numerals in Spline Sans Mono `tabular-nums`. Fonts self-hosted WOFF2; zero external font
   requests. No Inter/system-ui as primary; no serif display faces; no crests.
8. Content scripts run only on `arithmetic.zetamac.com` (recorder) and the ZetaLog `/link` pages (session handoff) — never anywhere else.
   All Zetamac selectors live in the versioned selectors module; capture failure surfaces a
   popup banner, never silent data loss.

## Skills to use

- `superpowers:test-driven-development` — before any behaviour-bearing code
- `supabase-postgres-best-practices` + `supabase` — anything under `supabase/` or RLS/auth
- `chrome-extensions` — anything under `apps/extension`
- `frontend-design:frontend-design` + `dataviz` — UI and charts (within §8 design language)
- `vercel:nextjs` — anything under `apps/web`
