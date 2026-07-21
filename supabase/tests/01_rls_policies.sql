-- RLS policy behaviour: default-deny across the five tables.
--
-- Strategy: every pgTAP bookkeeping call (plan/is/throws_ok/finish) runs as the
-- session superuser. Role-scoped queries switch role with `set local role`
-- inside the tested statement and reset immediately after. Denials are asserted
-- purely by SQLSTATE (42501 = insufficient_privilege) via the four-argument
-- throws_ok(sql, errcode, errmsg => NULL, description) form, so they never
-- depend on the exact error-message wording.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions, pg_catalog;

select plan(15);

-- Fixtures -----------------------------------------------------------------
-- Two users (profiles are created by the on_auth_user_created trigger).
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'alice@nomatch.example'),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'bob@nomatch.example');

update public.profiles set display_name = 'alice' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.profiles set display_name = 'bob'   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Games: 2 for Alice, 1 for Bob.
insert into public.games
  (user_id, client_game_id, played_at, settings_fingerprint, rankable_duration,
   claimed_score, server_score, status, telemetry, validation)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), now(), 'fp', 60,  90,  90, 'accepted',    '{}', '{}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), now(), 'fp', 30,  50,  50, 'quarantined', '{}', '{}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(), now(), 'fp', 60, 120, 120, 'accepted',    '{}', '{}');

-- A reference university so anon can observe non-empty public reference data.
insert into public.universities (name, slug, domains)
values ('Test University', 'test-university-rls', array['rls.test.example']);

-- anon: protected tables are entirely unreadable ---------------------------
select throws_ok(
  $$ set local role anon; select 1 from public.games $$,
  '42501', null, 'anon cannot select games');
select throws_ok(
  $$ set local role anon; select 1 from public.profiles $$,
  '42501', null, 'anon cannot select profiles');
select throws_ok(
  $$ set local role anon; select 1 from public.uni_verifications $$,
  '42501', null, 'anon cannot select uni_verifications');
select throws_ok(
  $$ set local role anon; select 1 from public.email_events $$,
  '42501', null, 'anon cannot select email_events');

-- anon: cannot write games or profiles -------------------------------------
select throws_ok(
  $$ set local role anon;
     insert into public.games
       (user_id, client_game_id, played_at, settings_fingerprint,
        claimed_score, server_score, status, telemetry, validation)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), now(),
             'fp', 1, 1, 'accepted', '{}', '{}') $$,
  '42501', null, 'anon cannot insert games');
select throws_ok(
  $$ set local role anon;
     insert into public.profiles (id) values (gen_random_uuid()) $$,
  '42501', null, 'anon cannot insert profiles');

-- anon: public reference data IS readable ----------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(
  (select count(*)::int from public.universities where slug = 'test-university-rls'),
  1, 'anon can read universities');
reset role;
reset request.jwt.claims;

-- authenticated: a user sees only their own games --------------------------
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is(
  (select count(*)::int from public.games),
  2, 'Alice sees exactly her own 2 games');
select is(
  (select count(*)::int from public.games
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0, 'Alice cannot see Bob''s games');
reset role;
reset request.jwt.claims;

-- authenticated: cannot insert a game (writes are service-role only) --------
select throws_ok(
  $$ set local role authenticated;
     set local request.jwt.claims to
       '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
     insert into public.games
       (user_id, client_game_id, played_at, settings_fingerprint,
        claimed_score, server_score, status, telemetry, validation)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), now(),
             'fp', 1, 1, 'accepted', '{}', '{}') $$,
  '42501', null, 'authenticated user cannot insert games');

-- authenticated: display_name update allowed on own row --------------------
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
update public.profiles set display_name = 'alice_2' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
reset role;
reset request.jwt.claims;
select is(
  (select display_name::text from public.profiles
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'alice_2', 'user can update their own display_name');

-- authenticated: privileged columns are not client-writable ----------------
select throws_ok(
  $$ set local role authenticated;
     set local request.jwt.claims to
       '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
     update public.profiles set is_admin = true
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null, 'user cannot update is_admin');
select throws_ok(
  $$ set local role authenticated;
     set local request.jwt.claims to
       '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
     update public.profiles
        set university_id = (select id from public.universities limit 1)
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null, 'user cannot update university_id');

-- authenticated: cannot update another user's row (RLS filters it out) ------
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
with updated as (
  update public.profiles set display_name = 'hacked'
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  returning 1
)
select is((select count(*)::int from updated), 0,
  'user cannot update another user''s row (0 rows affected)');
reset role;
reset request.jwt.claims;
select is(
  (select display_name::text from public.profiles
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'bob', 'Bob''s display_name is unchanged');

select * from finish();
rollback;
