-- ZetaLog schema: core tables, types, and indexes.
--
-- Design invariants enforced here:
--   * Never trust a claimed score -> claimed_score and server_score are stored
--     separately; only server_score ranks (see leaderboard_entries view).
--   * All game writes go through the API service role -> no client-writable
--     columns; RLS (next migration) is default-deny.
--   * Idempotent uploads -> unique (user_id, client_game_id).
--
-- RLS is enabled in a dedicated follow-up migration (20260720235629_enable_rls).

-- Extensions ---------------------------------------------------------------

-- citext: case-insensitive display names and email addresses. Installed into
-- the dedicated `extensions` schema per Supabase convention (keeps `public`
-- clean and out of the Data API surface).
create extension if not exists citext with schema extensions;

-- Types --------------------------------------------------------------------

-- Lifecycle of a submitted game. `quarantined` and `user_removed` are both
-- non-ranking but recoverable; `rejected` is terminal but retained for audit.
create type public.game_status as enum (
  'accepted',
  'quarantined',
  'rejected',
  'user_removed'
);

-- Tables -------------------------------------------------------------------

-- Public reference data: UK universities and their email domains. Seeded from
-- an open dataset (see supabase/scripts/generate-seed.mjs). Readable by all.
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  domains text[] not null
);

comment on table public.universities is
  'Public reference data: UK universities + verification email domains. Seeded from an open dataset.';

-- One row per authenticated user, keyed to auth.users. Created automatically by
-- the handle_new_user trigger (see views+triggers migration); never inserted by
-- clients. display_name is the only client-updatable column (column-level grant
-- + RLS in the next migration).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- citext is schema-qualified so the migration does not depend on `extensions`
  -- being present in the current search_path.
  display_name extensions.citext unique,
  university_id uuid references public.universities (id),
  uni_verified_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  -- 3-20 chars from [A-Za-z0-9_ ], first/last char non-space (no leading or
  -- trailing spaces). The bounded regex encodes the length limits directly.
  constraint profiles_display_name_format check (
    display_name is null
    or display_name::text ~ '^[A-Za-z0-9_][A-Za-z0-9_ ]{1,18}[A-Za-z0-9_]$'
  )
);

comment on constraint profiles_display_name_format on public.profiles is
  '3-20 chars of [A-Za-z0-9_ ]; no leading/trailing space.';

-- One row per submitted game. Written exclusively by the validation API using
-- the service role; clients only ever SELECT their own rows.
create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Client-generated id, stable across retries -> idempotent uploads.
  client_game_id uuid not null,
  played_at timestamptz not null,
  received_at timestamptz not null default now(),
  settings_fingerprint text not null,
  -- 30 | 60 | 120 for rankable games; NULL for non-default configs.
  rankable_duration int check (rankable_duration in (30, 60, 120)),
  claimed_score int not null check (claimed_score >= 0),
  server_score int not null check (server_score >= 0),
  status public.game_status not null,
  telemetry jsonb not null,
  validation jsonb not null,
  constraint games_user_client_game_unique unique (user_id, client_game_id)
);

comment on column public.games.claimed_score is
  'Score claimed by the client. Never trusted for ranking; see server_score.';
comment on column public.games.server_score is
  'Score recomputed server-side from the event stream. The only score that ranks.';

-- History listing per user (dashboard), newest first.
create index games_user_played_idx on public.games (user_id, played_at desc);

-- Leaderboards: best accepted server_score per duration. Partial index keeps it
-- small and lets the leaderboard_entries view scan only ranking rows.
create index games_leaderboard_idx
  on public.games (rankable_duration, server_score desc)
  where status = 'accepted' and rankable_duration is not null;

-- Admin review queue: quarantined submissions, oldest surfaced first.
create index games_quarantine_queue_idx
  on public.games (received_at)
  where status = 'quarantined';

-- Per-user submission rate limiting, newest first.
create index games_user_received_idx on public.games (user_id, received_at desc);

-- OTP verification attempts. Service-role only (no client access). Retained for
-- rate limiting (3 per address per hour) and audit.
create table public.uni_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email extensions.citext not null,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);

-- Per-user verification history / rate limiting.
create index uni_verifications_user_idx
  on public.uni_verifications (user_id, created_at desc);

-- Per-address rate limiting: max 3 verification emails per address per hour.
create index uni_verifications_email_idx
  on public.uni_verifications (email, created_at desc);

-- Email send-failure log. Recipient addresses are hashed, never
-- stored in the clear. Service-role only.
create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient_hash text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

-- Recent-activity scan (e.g. daily cap monitoring).
create index email_events_created_idx on public.email_events (created_at desc);

-- Per-recipient send history.
create index email_events_recipient_idx
  on public.email_events (recipient_hash, created_at desc);

-- Foreign-key index for profiles.university_id: speeds per-university
-- leaderboards and the profile -> university join in leaderboard_entries.
create index profiles_university_idx on public.profiles (university_id);
