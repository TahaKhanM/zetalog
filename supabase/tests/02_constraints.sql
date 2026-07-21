-- Schema constraint behaviour: display_name format, idempotent-upload
-- uniqueness, and the game value checks. All run as the session superuser, so
-- these assert the constraints themselves (independent of RLS).
--
-- SQLSTATEs: 23514 = check_violation, 23505 = unique_violation.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions, pg_catalog;

select plan(12);

-- Fixtures: two users (profiles via trigger).
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'a@nomatch.example'),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'b@nomatch.example');

-- display_name CHECK (CO-5 handle rule): valid names accepted ---------------
select lives_ok(
  $$ update public.profiles set display_name = 'abc'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'accepts a minimal 3-char name');
select lives_ok(
  $$ update public.profiles set display_name = 'alice_99'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'accepts digits and underscores');
select lives_ok(
  $$ update public.profiles set display_name = 'abcdefghijklmno'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'accepts a maximal 15-char name');
select lives_ok(
  $$ update public.profiles set display_name = null
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'accepts null (name not yet chosen)');

-- display_name CHECK: bad names rejected -----------------------------------
-- Four-arg throws_ok(sql, errcode, errmsg => NULL, description) checks only the
-- SQLSTATE (23514 = check_violation), independent of message wording.
select throws_ok(
  $$ update public.profiles set display_name = 'ab'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514', null, 'rejects names shorter than 3 chars');
select throws_ok(
  $$ update public.profiles set display_name = 'al ice'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514', null, 'rejects spaces anywhere in the name');
select throws_ok(
  $$ update public.profiles set display_name = 'bad!name'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514', null, 'rejects disallowed characters');
select throws_ok(
  $$ update public.profiles set display_name = 'abcdefghijklmnop'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514', null, 'rejects names longer than 15 chars');

-- Idempotent uploads: (user_id, client_game_id) is unique per user ---------
insert into public.games
  (user_id, client_game_id, played_at, settings_fingerprint, rankable_duration,
   claimed_score, server_score, status, telemetry, validation)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', now(), 'fp', 60, 10, 10,
   'accepted', '{}', '{}');

select throws_ok(
  $$ insert into public.games
       (user_id, client_game_id, played_at, settings_fingerprint,
        claimed_score, server_score, status, telemetry, validation)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             '11111111-1111-1111-1111-111111111111', now(), 'fp', 10, 10,
             'accepted', '{}', '{}') $$,
  '23505', null, 'duplicate (user_id, client_game_id) is rejected');

select lives_ok(
  $$ insert into public.games
       (user_id, client_game_id, played_at, settings_fingerprint,
        claimed_score, server_score, status, telemetry, validation)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
             '11111111-1111-1111-1111-111111111111', now(), 'fp', 10, 10,
             'accepted', '{}', '{}') $$,
  'same client_game_id is allowed for a different user');

-- Game value checks --------------------------------------------------------
select throws_ok(
  $$ insert into public.games
       (user_id, client_game_id, played_at, settings_fingerprint,
        rankable_duration, claimed_score, server_score, status, telemetry, validation)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), now(),
             'fp', 45, 10, 10, 'accepted', '{}', '{}') $$,
  '23514', null, 'rejects a rankable_duration outside {30,60,120}');
select throws_ok(
  $$ insert into public.games
       (user_id, client_game_id, played_at, settings_fingerprint,
        claimed_score, server_score, status, telemetry, validation)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), now(),
             'fp', 10, -1, 'accepted', '{}', '{}') $$,
  '23514', null, 'rejects a negative server_score');

select * from finish();
rollback;
