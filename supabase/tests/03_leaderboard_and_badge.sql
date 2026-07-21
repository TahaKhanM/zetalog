-- leaderboard_entries view semantics + handle_new_user badge trigger.
--
-- The view is a definer-semantics view: its projection and filtering are
-- identical for every caller (it does not depend on RLS), so content is
-- asserted as the session user. anon's read access is asserted separately via
-- table privileges.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions, pg_catalog;

select plan(16);

-- Fixtures -----------------------------------------------------------------
insert into public.universities (name, slug, domains)
values ('LB Test Uni A', 'lb-test-uni-a', array['lbmatch.example']);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'v@nomatch.example'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'u@nomatch.example'),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'n@nomatch.example');

-- Verified user: badge visible.
update public.profiles
   set display_name = 'verivera',
       university_id = (select id from public.universities where slug = 'lb-test-uni-a'),
       uni_verified_at = now()
 where id = '11111111-1111-1111-1111-111111111111';

-- Unverified user: has a university set but no verification timestamp.
update public.profiles
   set display_name = 'unveruna',
       university_id = (select id from public.universities where slug = 'lb-test-uni-a'),
       uni_verified_at = null
 where id = '22222222-2222-2222-2222-222222222222';

-- Null-display_name user: must never appear on the board.
-- (display_name defaults to null; left as-is.)

insert into public.games
  (user_id, client_game_id, played_at, settings_fingerprint, rankable_duration,
   claimed_score, server_score, status, telemetry, validation)
values
  -- Verified user's 60s games: two accepted (best 150, count 2)...
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), now(), 'fp', 60, 100, 100, 'accepted',    '{}', '{}'),
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), now(), 'fp', 60, 150, 150, 'accepted',    '{}', '{}'),
  -- ...a quarantined higher score that must NOT rank...
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), now(), 'fp', 60, 999, 999, 'quarantined', '{}', '{}'),
  -- ...a rejected score that must NOT rank...
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), now(), 'fp', 60, 777, 777, 'rejected',    '{}', '{}'),
  -- ...an accepted non-rankable game (duration null) that must NOT appear...
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), now(), 'fp', null, 500, 500, 'accepted',  '{}', '{}'),
  -- ...and a separate 30s row (best 40).
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), now(), 'fp', 30, 40, 40, 'accepted',      '{}', '{}'),
  -- Unverified user: one accepted 60s game.
  ('22222222-2222-2222-2222-222222222222', gen_random_uuid(), now(), 'fp', 60, 80, 80, 'accepted',      '{}', '{}'),
  -- Null-name user: an accepted 60s game that must be excluded.
  ('33333333-3333-3333-3333-333333333333', gen_random_uuid(), now(), 'fp', 60, 200, 200, 'accepted',    '{}', '{}');

-- best_score is the max over ACCEPTED games only (quarantined 999 excluded) ---
select is(
  (select best_score from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111' and duration = 60),
  150, 'best_score is the max accepted score (quarantined/rejected excluded)');
select is(
  (select games_counted from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111' and duration = 60),
  2::bigint, 'games_counted counts only accepted rankable games');

-- Badge columns populated for a verified profile ---------------------------
select is(
  (select university_name from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111' and duration = 60),
  'LB Test Uni A', 'verified profile shows university_name');
select is(
  (select university_slug from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111' and duration = 60),
  'lb-test-uni-a', 'verified profile shows university_slug');

-- Distinct duration rows -----------------------------------------------------
select is(
  (select best_score from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111' and duration = 30),
  40, 'a separate row exists per rankable duration');
select is(
  (select count(*)::int from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111'),
  2, 'verified user has exactly two rows (60s and 30s; non-rankable excluded)');
select is(
  (select count(*)::int from public.leaderboard_entries
    where user_id = '11111111-1111-1111-1111-111111111111' and duration is null),
  0, 'non-rankable (null duration) games never appear');

-- Unverified profile: appears, but badge columns are hidden ----------------
select is(
  (select best_score from public.leaderboard_entries
    where user_id = '22222222-2222-2222-2222-222222222222' and duration = 60),
  80, 'unverified user still appears on the board');
select is(
  (select university_name from public.leaderboard_entries
    where user_id = '22222222-2222-2222-2222-222222222222' and duration = 60),
  null::text, 'unverified profile hides university_name');
select is(
  (select university_slug from public.leaderboard_entries
    where user_id = '22222222-2222-2222-2222-222222222222' and duration = 60),
  null::text, 'unverified profile hides university_slug');

-- Null display_name excluded entirely --------------------------------------
select is(
  (select count(*)::int from public.leaderboard_entries
    where user_id = '33333333-3333-3333-3333-333333333333'),
  0, 'profiles without a display_name are excluded');

-- anon may read the leaderboard --------------------------------------------
select ok(
  has_table_privilege('anon', 'public.leaderboard_entries', 'SELECT'),
  'anon has SELECT on leaderboard_entries');

-- handle_new_user: instant badge for a matching email domain ---------------
insert into public.universities (name, slug, domains)
values ('Badge Uni', 'lb-badge-uni', array['badgematch.example']);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'x@badgematch.example'),
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'y@nomatch.example'),
  ('00000000-0000-0000-0000-000000000000',
   '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'z@BadgeMatch.Example');

select is(
  (select university_id from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'),
  (select id from public.universities where slug = 'lb-badge-uni'),
  'matching email domain sets university_id');
select isnt(
  (select uni_verified_at from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'),
  null::timestamptz, 'matching email domain sets uni_verified_at (instant badge)');
select is(
  (select university_id from public.profiles
    where id = '55555555-5555-5555-5555-555555555555'),
  null::uuid, 'non-matching email domain leaves university_id null');
select is(
  (select university_id from public.profiles
    where id = '66666666-6666-6666-6666-666666666666'),
  (select id from public.universities where slug = 'lb-badge-uni'),
  'domain matching is case-insensitive');

select * from finish();
rollback;
