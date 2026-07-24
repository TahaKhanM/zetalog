# Contributing

## The bar

Assume every line will be read closely. Quality outranks scope; cut features before
cutting rigor.

- **TypeScript strict**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  No `any`, no non-null assertions, no `@ts-expect-error` without an explanatory comment.
- **`pnpm verify` green before every commit.** It runs format, lint (zero warnings),
  typecheck, test and build, which is the same gate CI runs.
- **Test-driven.** Write the failing test first for any behaviour-bearing code.
- **Pure domain core.** All scoring, validation, fingerprint and quarantine logic lives
  as pure functions in `packages/shared` with no I/O, clocks or randomness inside; inject
  them. 100% branch coverage is enforced there.
- **Errors are values.** Return typed results; no silent `catch`. Validate every external
  boundary (DOM, network, storage) with zod.
- **Small, single-purpose commits** using [Conventional Commits](https://www.conventionalcommits.org).
  Every dependency must justify itself.

## Product invariants

Violating any of these is a bug.

1. **Never trust a claimed score.** The server recomputes every score from the submitted
   event stream, and only `server_score` ranks. The problem stream must be statistically
   consistent with Zetamac's generator for the claimed settings.
2. All game writes go through the API with the service role. No client inserts. Row-level
   security is default-deny; the service-role key never reaches a client bundle.
3. **Quarantine, never silently delete.** Auto-flagged scores stay visible and restorable.
4. **Local-first.** The extension is fully functional signed out; telemetry is recorded for
   every game so history can backfill through validation later.
5. A rankable game uses the default Zetamac ranges and operations at a duration in
   {30, 60, 120}s. Leaderboards show a personal best per duration, global and per-university.
6. Email is sent only through the Resend module (`apps/web/lib/email`), never Supabase's
   built-in sender. At most three verification emails per address per hour.
7. Design tokens live in `packages/shared/src/tokens.ts`. Never hard-code palette hexes or
   font families elsewhere. All numerals use a tabular mono face. Fonts are self-hosted; no
   external font requests.
8. Content scripts run only on `arithmetic.zetamac.com` (recorder) and the ZetaLog `/link`
   pages (session handoff), never anywhere else. Selectors live in a versioned module; a
   capture failure surfaces a banner rather than losing data.

## Copy rules

Every word a user sees follows these:

1. No em dashes. Use a period or comma, or restructure.
2. No Oxford commas.
3. Plain, direct language. No marketing fluff.
4. Say what the thing does, not how impressive it is.
5. No exclamation marks and no rhetorical questions.

## Commands

- `pnpm install` — bootstrap the workspace.
- `pnpm verify` — full local CI. Run before every commit.
- `pnpm --filter @zetalog/shared test` — one package's tests.
