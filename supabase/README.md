# ZetaLog database (Supabase)

The complete database layer: schema, default-deny RLS, the leaderboard view, the
new-user badge trigger, UK-university seed data, and pgTAP policy tests. This is
the security boundary between the public internet and users' telemetry — treat
every change here as security-critical.

## Layout

| Path                        | Contents                                                      |
| --------------------------- | ------------------------------------------------------------- |
| `migrations/`               | Ordered SQL migrations (schema → RLS → views+trigger)         |
| `seed.sql`                  | Generated UK-university reference data (committed artifact)   |
| `scripts/generate-seed.mjs` | Dependency-free generator that (re)produces `seed.sql`        |
| `tests/`                    | pgTAP policy/constraint/view tests, run by `supabase test db` |
| `config.toml`               | Local stack configuration                                     |

Migrations, in order:

1. `…_create_schema.sql` — `citext`, the `game_status` enum, the five tables
   (`universities`, `profiles`, `games`, `uni_verifications`, `email_events`),
   their constraints and indexes.
2. `…_enable_rls.sql` — RLS enabled on every table; broad default grants revoked
   from `anon`/`authenticated`, then minimal grants + policies restored.
3. `…_create_views_and_triggers.sql` — the `handle_new_user` badge trigger and
   the public `leaderboard_entries` view.

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

`seed.sql` is a committed, deterministic artifact. Refresh it against upstream
only intentionally:

```bash
node supabase/scripts/generate-seed.mjs   # rewrites supabase/seed.sql
```

Re-running with unchanged upstream data reproduces the file byte-for-byte, so a
noisy diff means the source dataset changed. Review the diff before committing.

## Provisioning a hosted project

1. **Create** a project in the Supabase dashboard; note its project ref.
2. **Link** the local repo: `supabase link --project-ref <ref>`.
3. **Push** the schema: `supabase db push` (applies `migrations/` to the remote
   database).
4. **Seed** the reference data — run `seed.sql` once against the remote database
   (Dashboard → SQL Editor, or `psql "$SUPABASE_DB_URL" -f supabase/seed.sql`).
   It is idempotent (`on conflict (slug) do nothing`), so re-running is safe.
5. **Auth providers** (Dashboard → Authentication → Providers): enable **Email**
   (passwords, confirm-email ON, minimum length 10), **Google**, and **GitHub**
   OAuth — the full W8 checklist, including the GitHub OAuth app and the email
   template pastes, is `docs/ops/github-oauth-setup.md`. Set the
   display-name-on-first-sign-in flow in the app, not here.
6. **Custom SMTP — required** (Dashboard → Authentication → SMTP settings):
   configure **Resend** as the custom SMTP sender. **Never** use Supabase's
   built-in email sender: it is rate-limited to a handful of messages per hour
   and will silently fail under real sign-up load (spec §7, product invariant 6).
   Use the Resend SMTP host/credentials and set the From address to `EMAIL_FROM`.
7. **URLs** (Dashboard → Authentication → URL Configuration): set the **Site URL**
   to the deployed web origin and add the extension linking page plus preview
   deployments to **Redirect URLs**.

## Environment variables

Names are documented in the repo-root `.env.example`; never commit real values.

| Variable                        | Used by                      | Notes                                              |
| ------------------------------- | ---------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | web + extension (client)     | Client-safe; RLS enforces access.                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web + extension (client)     | Client-safe; RLS enforces access.                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | web API routes (server only) | Bypasses RLS. Never ship to any client bundle.     |
| `SUPABASE_DB_URL`               | migrations / seeding         | Postgres connection string (Dashboard → Database). |
| `RESEND_API_KEY`                | Supabase Auth SMTP / email   | Resend API key for the custom SMTP sender.         |
| `EMAIL_FROM`                    | auth + verification emails   | From address, e.g. `ZetaLog <verify@example.com>`. |

## Security model (why it is shaped this way)

- **Default-deny.** Every table has RLS enabled. `anon`/`authenticated` are
  granted only what they need; all game writes and every OTP/email row are
  service-role only. The service-role key never reaches a client.
- **`profiles` updates are column-scoped.** A user may update only their own
  `display_name` (column-level `GRANT UPDATE (display_name)` + own-row policy);
  `is_admin`, `university_id`, and `uni_verified_at` are set by the trigger or
  the service role.
- **`leaderboard_entries` is a definer-semantics view by design.** It bypasses
  RLS so `anon` can read the public board, while exposing only a minimal, public
  projection (display name, duration, best score, counts, verified badge). The
  Supabase advisor `security_definer_view` (0010) warning is therefore expected
  and accepted — see the comment in the view migration. Do not convert it to
  `security_invoker` (that would empty the public board) and do not add columns
  that leak per-user private data.
