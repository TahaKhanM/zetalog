-- Alias-login integrity: the verified-alias uniqueness index and the
-- service-role identifier lookup function.
--
-- Same conventions as 01–03: pgTAP bookkeeping runs as the session superuser;
-- role-scoped behaviour switches role inside the tested statement; denials are
-- asserted by SQLSTATE only (42501 insufficient_privilege, 23505
-- unique_violation).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions, pg_catalog;

select plan(17);

-- Fixtures -----------------------------------------------------------------
-- Alice: password + google identities. Bob: passwordless (OTP-era) email
-- identity only. Profiles arrive via the on_auth_user_created trigger.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'alice@nomatch.example', '$2a$10$abcdefghijklmnopqrstuv'),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'bob@nomatch.example', null);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at)
values
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', 'email',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now()),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '{"sub":"google-alice"}', 'google', 'google-alice', now()),
  (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}', 'email',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());

-- Alice holds a verified alias and one pending (unverified) code row.
insert into public.uni_verifications (user_id, email, code_hash, expires_at, verified_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@uni.example', 'h',
   now() + interval '15 minutes', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pending@uni.example', 'h',
   now() + interval '15 minutes', null);

-- 1) Verified-alias uniqueness ----------------------------------------------
select throws_ok(
  $$insert into public.uni_verifications (user_id, email, code_hash, expires_at, verified_at)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'alice@uni.example', 'h',
            now() + interval '15 minutes', now())$$,
  '23505', null,
  'a second VERIFIED claim on the same alias address is rejected');

select lives_ok(
  $$insert into public.uni_verifications (user_id, email, code_hash, expires_at)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'alice@uni.example', 'h',
            now() + interval '15 minutes')$$,
  'pending (unverified) rows for the same address stay allowed — rate-limit history');

select lives_ok(
  $$insert into public.uni_verifications (user_id, email, code_hash, expires_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pending@uni.example', 'h',
            now() + interval '15 minutes')$$,
  'multiple pending rows for one address stay allowed');

select throws_ok(
  $$insert into public.uni_verifications (user_id, email, code_hash, expires_at, verified_at)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ALICE@UNI.EXAMPLE', 'h',
            now() + interval '15 minutes', now())$$,
  '23505', null,
  'the uniqueness is case-insensitive (citext)');

-- 2) auth_identifier_lookup ---------------------------------------------------
select results_eq(
  $$select user_id, primary_email::text, has_password, providers, matched_by
    from public.auth_identifier_lookup('alice@nomatch.example')$$,
  $$values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'alice@nomatch.example',
            true, array['email','google'], 'primary')$$,
  'primary email resolves with password flag and sorted providers');

select results_eq(
  $$select user_id, primary_email::text, has_password, matched_by
    from public.auth_identifier_lookup('bob@nomatch.example')$$,
  $$values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'bob@nomatch.example',
            false, 'primary')$$,
  'a passwordless OTP-era account reports has_password = false');

select results_eq(
  $$select user_id, primary_email::text, matched_by
    from public.auth_identifier_lookup('alice@uni.example')$$,
  $$values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'alice@nomatch.example', 'alias')$$,
  'a verified alias resolves to its owner primary email');

select results_eq(
  $$select matched_by from public.auth_identifier_lookup('ALICE@UNI.EXAMPLE')$$,
  $$values ('alias')$$,
  'alias resolution is case-insensitive');

select is_empty(
  $$select * from public.auth_identifier_lookup('pending@uni.example')$$,
  'a pending (unverified) code row never resolves');

select is_empty(
  $$select * from public.auth_identifier_lookup('nobody@nomatch.example')$$,
  'an unknown address resolves to nothing');

select results_eq(
  $$select count(*)::int from public.auth_identifier_lookup('alice@nomatch.example')$$,
  $$values (1)$$,
  'exactly one row comes back for a primary match');

-- Primary beats alias when one address is both (bob primary + verified alias
-- of alice is impossible for the same address, so simulate: give bob's primary
-- address a verified alias row owned by alice — resolution must prefer primary).
insert into public.uni_verifications (user_id, email, code_hash, expires_at, verified_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bob@nomatch.example', 'h',
        now() + interval '15 minutes', now());

select results_eq(
  $$select user_id, matched_by from public.auth_identifier_lookup('bob@nomatch.example')$$,
  $$values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'primary')$$,
  'when an address is both a primary and an alias, the primary account wins');

-- A soft-deleted account must not resolve.
update auth.users set deleted_at = now()
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select results_eq(
  $$select matched_by from public.auth_identifier_lookup('bob@nomatch.example')$$,
  $$values ('alias')$$,
  'a soft-deleted primary account is skipped (the alias claim then surfaces)');

-- 3) Grants -------------------------------------------------------------------
-- Asserted via the privilege catalog rather than behaviourally: in the local
-- stack image (PG 17.6 aarch64 + preload hooks) the function-EXECUTE *denial*
-- path segfaults the backend for ANY revoked function — reproducible with a
-- trivial `language sql` probe, so it is unrelated to this function. EXECUTE
-- consults exactly these catalog privileges, so the assertions are equivalent.
select ok(
  not has_function_privilege('anon',
    'public.auth_identifier_lookup(extensions.citext)', 'execute'),
  'anon cannot execute the lookup');

select ok(
  not has_function_privilege('authenticated',
    'public.auth_identifier_lookup(extensions.citext)', 'execute'),
  'authenticated cannot execute the lookup');

select ok(
  has_function_privilege('service_role',
    'public.auth_identifier_lookup(extensions.citext)', 'execute'),
  'service_role can execute the lookup');

-- The allowed path, behaviourally (this is the exact PostgREST rpc shape).
select lives_ok(
  $$set local role service_role;
    select * from public.auth_identifier_lookup('alice@nomatch.example')$$,
  'service_role executes the lookup cleanly');
reset role;

select finish();
rollback;
