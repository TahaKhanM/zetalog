-- ZetaLog Row-Level Security: default-deny across all five tables.
--
-- Model (spec §4): the anon/authenticated roles reach these tables only through
-- the Data API, so RLS is the boundary between the public internet and users'
-- telemetry. Every table has RLS enabled; only the minimal read/update surface
-- is opened. All game writes and every OTP/email row are service-role only, and
-- the service role bypasses RLS entirely (it never appears in a client bundle).
--
-- Defense in depth: Supabase grants broad table privileges to anon/authenticated
-- by default. We REVOKE ALL first, then grant back only what each role needs, so
-- a future RLS misconfiguration cannot silently widen access beyond these grants.

-- universities -------------------------------------------------------------
-- Public reference data: readable by everyone, writable by no client role.
alter table public.universities enable row level security;

revoke all on public.universities from anon, authenticated;
grant select on public.universities to anon, authenticated;

create policy universities_select_all
  on public.universities
  for select
  to anon, authenticated
  using (true);

-- profiles -----------------------------------------------------------------
-- A user may read only their own profile and update only their own
-- display_name. is_admin / university_id / uni_verified_at are set by the
-- trigger or the service role and are never client-writable.
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
-- Row read + column-scoped update. The column list on GRANT UPDATE is what
-- prevents a user from touching is_admin or university_id: any UPDATE naming a
-- column outside this grant is rejected by column privileges, before RLS.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- USING gates which rows are updatable; WITH CHECK prevents re-homing a row to
-- another user id. Column scope is enforced by the GRANT above.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- games --------------------------------------------------------------------
-- A user may read only their own games. There is intentionally NO client
-- INSERT/UPDATE/DELETE policy: all writes go through the validation API using
-- the service role (spec §4, product invariant 2).
alter table public.games enable row level security;

revoke all on public.games from anon, authenticated;
grant select on public.games to authenticated;

create policy games_select_own
  on public.games
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- uni_verifications --------------------------------------------------------
-- Service-role only: OTP hashes and verification attempts must never be
-- reachable by a client. RLS enabled with zero policies => default-deny for
-- anon/authenticated; the service role bypasses RLS.
alter table public.uni_verifications enable row level security;

revoke all on public.uni_verifications from anon, authenticated;

-- email_events -------------------------------------------------------------
-- Service-role only send-failure log. Same default-deny posture.
alter table public.email_events enable row level security;

revoke all on public.email_events from anon, authenticated;
