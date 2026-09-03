# ZetaLog database (Supabase)

The complete database layer: schema, default-deny RLS, the leaderboard view, the
new-user badge trigger, UK and US university seed data, and pgTAP policy tests. This is
the security boundary between the public internet and users' telemetry — treat
every change here as security-critical.

## Layout

| Path                        | Contents                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `migrations/`               | Ordered SQL migrations (schema → RLS → views+trigger)              |
| `seed.sql`                  | Generated UK and US university reference data (committed artifact) |
| `scripts/generate-seed.mjs` | Dependency-free generator that (re)produces `seed.sql`             |
| `tests/`                    | pgTAP policy/constraint/view tests, run by `supabase test db`      |
| `config.toml`               | Local stack configuration                                          |

Migrations, in order:

1. `20260720235624_create_schema.sql` — base tables, constraints, indexes, the
   `game_status` enum, and `citext`.
2. `20260720235629_enable_rls.sql` — default-deny RLS and minimal grants.
3. `20260720235630_create_views_and_triggers.sql` — the new-user badge trigger
   and public `leaderboard_entries` view.
4. `20260721000000_harden_function_grants.sql` — locks down existing function
   execution grants.
5. `20260721120000_alias_login_integrity.sql` — verified-alias uniqueness and
   identifier lookup.
6. `20260721210000_display_name_handle_rule.sql`,
   `20260721223000_profile_avatars.sql`,
   `20260721231500_display_name_handle_backfill.sql`, and
   `20260722001000_remove_profile_avatars.sql` — profile constraints and their
   deterministic backfill/removal sequence.
7. `20260724100000_profile_independent.sql` and
   `20260724120000_profile_leaderboard_opt_out.sql` — leaderboard preferences.
8. `20260806000000_harden_sensitive_workflows.sql` — atomic sensitive workflows,
   deletion erasure, anonymous 30-day security events, and rate limits.
9. `20260806090000_extension_sessions_and_game_challenges.sql` — independent
   extension credentials, PKCE-bound authorization codes, optional game-start
   evidence, and operational-data retention.
10. `20260806091000_schedule_data_retention.sql` — hourly scheduled retention;
    requires `pg_cron` to be available in the hosted project before it runs.
11. `20260809164010_add_profile_leaderboard_badges.sql` — a constrained,
    service-managed badge slot for exceptional leaderboard identities.
12. `20260903000000_universities_country.sql` — ISO country (GB/US) on the
    university affiliation registry.

## Local development

Requires Docker (Desktop or Engine) and the Supabase CLI (2.98.2 pinned).

```bash
supabase start          # boots the local stack (first run downloads images)
supabase db reset       # applies all migrations, then loads seed.sql
supabase test db        # runs the pgTAP suite under supabase/tests/
supabase stop           # tears the stack down
```

`supabase db reset` is the fastest way to confirm a migration applies cleanly
from scratch and that the seed loads. `supabase test db` re-applies migrations
to a fresh test database and runs every `tests/*.sql` file with `pg_prove`.

### Regenerating the seed

`seed.sql` is a committed, deterministic artifact built from two upstreams: the
Hipo world-universities dataset (GB + US institutions) and JetBrains swot (the
academic-domain registry education-discount programmes verify student emails
against), whose `.edu` tree fills Hipo's gaps — system-wide mail domains like
`umsystem.edu` and institutions Hipo omits. Refresh only intentionally:

```bash
node supabase/scripts/generate-seed.mjs   # rewrites supabase/seed.sql
```

Re-running with unchanged upstream data reproduces the file byte-for-byte, so a
noisy diff means a source dataset changed. Review the diff before committing.
Rows upsert on slug, so re-applying the seed to a database refreshes existing
universities' domains in place; the generator refuses to remap a committed slug
to a different institution.

## Provisioning a hosted project

1. **Create** a project in the Supabase dashboard; note its project ref.
2. **Link** the local repo: `supabase link --project-ref <ref>`.
3. **Enable Cron first**: in the Supabase dashboard, enable the production
   project's Cron integration so `pg_cron` is available. The final August
   migration schedules `zetalog-operational-data-retention`; do not apply it
   until this prerequisite is met.
4. **Push** the schema: `supabase db push` (applies `migrations/` to the remote
   database). Confirm the `zetalog-operational-data-retention` job exists and
   can run `public.purge_expired_operational_data()`.
5. **Seed** the reference data — run `seed.sql` against the remote database
   (`supabase db push --include-seed`, the Dashboard SQL Editor, or
   `psql "$SUPABASE_DB_URL" -f supabase/seed.sql`). It is idempotent (upsert on
   slug), so re-running is safe and refreshes domain data in place.
6. **Auth providers** (Dashboard → Authentication → Providers): enable **Email**
   (passwords, confirm-email ON, minimum length 10), **Google**, and **GitHub**
   OAuth. The full setup checklist, including the GitHub OAuth app and the email
   template pastes, is `docs/ops/github-oauth-setup.md`. Set the
   display-name-on-first-sign-in flow in the app, not here.
7. **Custom SMTP — required** (Dashboard → Authentication → SMTP settings):
   configure **Resend** as the custom SMTP sender. **Never** use Supabase's
   built-in email sender: it is rate-limited to a handful of messages per hour
   and will silently fail under real sign-up load (spec §7, product invariant 6).
   Use the Resend SMTP host/credentials and set the From address to `EMAIL_FROM`.
8. **URLs** (Dashboard → Authentication → URL Configuration): set the **Site URL**
   to the deployed web origin and add the website `/auth/callback` plus preview
   deployments to **Redirect URLs**. Do not add the Chrome Identity callback here.
9. **Chrome Identity callback**: set the web deployment's
   `EXTENSION_OAUTH_REDIRECT_URIS` to the exact production value,
   `https://bjleafpcpockiiblhkoddgomhkloaiab.chromiumapp.org/zetalog-link`. This is
   a server-side allowlist, not a Supabase Auth Redirect URL. Deploy the database
   migrations and web/API with that value before publishing an extension update.

## Environment variables

Names are documented in the repo-root `.env.example`; never commit real values.

| Variable                        | Used by                      | Notes                                                                             |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | web + extension (client)     | Client-safe; RLS enforces access.                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web + extension (client)     | Client-safe; RLS enforces access.                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | web API routes (server only) | Bypasses RLS. Never ship to any client bundle.                                    |
| `EXTENSION_OAUTH_REDIRECT_URIS` | web API routes (server only) | Exact Chrome Identity callbacks after CWS assigns the extension ID; no wildcards. |
| `SUPABASE_DB_URL`               | migrations / seeding         | Postgres connection string (Dashboard → Database).                                |
| `RESEND_API_KEY`                | Supabase Auth SMTP / email   | Resend API key for the custom SMTP sender.                                        |
| `EMAIL_FROM`                    | auth + verification emails   | From address, e.g. `ZetaLog <verify@example.com>`.                                |

## Security model (why it is shaped this way)

- **Default-deny.** Every table has RLS enabled. `anon`/`authenticated` are
  granted only what they need; all game writes and every OTP/email row are
  service-role only. The service-role key never reaches a client.
- **`profiles` updates are column-scoped.** A user may update only their own
  `display_name` (column-level `GRANT UPDATE (display_name)` + own-row policy);
  `is_admin`, `university_id`, `uni_verified_at`, and `leaderboard_badge` are set
  by the trigger or the service role.
- **`leaderboard_entries` is a definer-semantics view by design.** It bypasses
  RLS so `anon` can read the public board, while exposing only a minimal, public
  projection (display name, duration, best score, counts, verified university,
  and service-managed badge). The Supabase advisor `security_definer_view`
  (0010) warning is therefore expected and accepted — see the comment in the
  view migration. Do not convert it to `security_invoker` (that would empty the
  public board) and do not add columns that leak per-user private data.
