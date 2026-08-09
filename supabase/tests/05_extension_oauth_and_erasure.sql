-- Extension OAuth/PKCE security properties and account-erasure boundaries.
--
-- This covers the privileged redemption function directly because it is the
-- atomic boundary between a browser authorization code and an installation
-- credential. Account deletion is exercised with all extension and limiter
-- records present, ensuring no user-linked digest survives the transaction.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions, pg_catalog;

select plan(27);

-- Fixtures -----------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'link@example.test'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'deletion@example.test');

insert into public.extension_authorization_codes
  (code_hash, user_id, code_challenge, redirect_uri, expires_at)
values (
  pg_catalog.encode(extensions.digest('zla_link_code', 'sha256'), 'hex'),
  '11111111-1111-4111-8111-111111111111',
  pg_catalog.translate(
    pg_catalog.rtrim(
      pg_catalog.encode(extensions.digest(repeat('a', 43), 'sha256'), 'base64'),
      '='
    ),
    '+/', '-_'
  ),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
  now() + interval '5 minutes'
);

-- PKCE and one-time redemption ------------------------------------------------
select is(
  public.redeem_extension_authorization_code(
    pg_catalog.encode(extensions.digest('zla_link_code', 'sha256'), 'hex'),
    repeat('b', 43),
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
    pg_catalog.encode(extensions.digest('zlx_wrong_verifier', 'sha256'), 'hex'),
    now()
  ),
  null::uuid,
  'a wrong PKCE verifier cannot redeem an authorization code'
);

select is(
  public.redeem_extension_authorization_code(
    pg_catalog.encode(extensions.digest('zla_link_code', 'sha256'), 'hex'),
    repeat('a', 43),
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/other',
    pg_catalog.encode(extensions.digest('zlx_wrong_redirect', 'sha256'), 'hex'),
    now()
  ),
  null::uuid,
  'a different callback URL cannot redeem an authorization code'
);

select is(
  public.redeem_extension_authorization_code(
    pg_catalog.encode(extensions.digest('zla_link_code', 'sha256'), 'hex'),
    repeat('a', 43),
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
    pg_catalog.encode(extensions.digest('zlx_redeemed', 'sha256'), 'hex'),
    now()
  ),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'a matching verifier and exact callback redeem the code for its user'
);

select ok(
  exists(
    select 1 from public.extension_credentials
     where user_id = '11111111-1111-4111-8111-111111111111'
       and token_hash = pg_catalog.encode(extensions.digest('zlx_redeemed', 'sha256'), 'hex')
  ),
  'redemption atomically creates the independent credential'
);

select is(
  public.redeem_extension_authorization_code(
    pg_catalog.encode(extensions.digest('zla_link_code', 'sha256'), 'hex'),
    repeat('a', 43),
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
    pg_catalog.encode(extensions.digest('zlx_replay', 'sha256'), 'hex'),
    now()
  ),
  null::uuid,
  'a consumed authorization code cannot be replayed'
);

-- Privileged function grants --------------------------------------------------
select ok(
  not has_function_privilege('anon',
    'public.redeem_extension_authorization_code(text,text,text,text,timestamptz)', 'execute'),
  'anon cannot execute authorization-code redemption'
);

select ok(
  not has_function_privilege('authenticated',
    'public.redeem_extension_authorization_code(text,text,text,text,timestamptz)', 'execute'),
  'authenticated cannot execute authorization-code redemption'
);

select ok(
  has_function_privilege('service_role',
    'public.redeem_extension_authorization_code(text,text,text,text,timestamptz)', 'execute'),
  'service_role can execute authorization-code redemption'
);

-- Expired game-start evidence -------------------------------------------------
insert into public.game_challenges
  (id, user_id, nonce_hash, issued_at, start_expires_at)
values (
  '55555555-5555-4555-8555-555555555551',
  '11111111-1111-4111-8111-111111111111',
  repeat('c', 64),
  now() - interval '11 minutes',
  now() - interval '1 minute'
);

select lives_ok(
  $$select * from public.submit_game_atomic(
    '11111111-1111-4111-8111-111111111111'::uuid,
    '55555555-5555-4555-8555-555555555552'::uuid,
    now(), 'expired-challenge-test', 60, 1, 1,
    'accepted'::public.game_status, '[]'::jsonb, '{}'::jsonb,
    '55555555-5555-4555-8555-555555555551'::uuid,
    now() - interval '1 hour', 60
  )$$,
  'an expired optional challenge does not block a legitimate game submission'
);

select is(
  (select challenge_id from public.games
    where client_game_id = '55555555-5555-4555-8555-555555555552'),
  null::uuid,
  'an expired challenge is never attached to the submitted game'
);

select is(
  (select consumed_at from public.game_challenges
    where id = '55555555-5555-4555-8555-555555555551'),
  null::timestamptz,
  'an expired challenge remains unconsumed'
);

-- Deletion fixtures -----------------------------------------------------------
insert into public.extension_authorization_codes
  (code_hash, user_id, code_challenge, redirect_uri, expires_at)
values (
  pg_catalog.encode(extensions.digest('zla_delete_code', 'sha256'), 'hex'),
  '22222222-2222-4222-8222-222222222222',
  repeat('a', 43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
  now() + interval '5 minutes'
);

insert into public.extension_credentials (user_id, token_hash)
values (
  '22222222-2222-4222-8222-222222222222',
  pg_catalog.encode(extensions.digest('zlx_delete', 'sha256'), 'hex')
);

insert into public.games
  (user_id, client_game_id, played_at, settings_fingerprint, rankable_duration,
   claimed_score, server_score, status, telemetry, validation)
values (
  '22222222-2222-4222-8222-222222222222', gen_random_uuid(), now(), 'fp', 60,
  10, 10, 'accepted', '{}'::jsonb, '{}'::jsonb
);

insert into public.uni_verifications (id, user_id, email, code_hash, expires_at)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222', 'alias@university.test', 'hash',
  now() + interval '15 minutes'
);

insert into public.verification_email_outbox (verification_id)
values ('33333333-3333-4333-8333-333333333333');

insert into public.email_events (kind, recipient_hash, status)
values
  ('verification', pg_catalog.encode(extensions.digest('deletion@example.test', 'sha256'), 'hex'), 'sent'),
  ('verification', pg_catalog.encode(extensions.digest('alias@university.test', 'sha256'), 'hex'), 'sent');

insert into public.auth_rate_limits (bucket, key_hash, window_started_at, hits, last_seen_at)
values
  ('extension-link-authorize-user',
   pg_catalog.encode(extensions.digest('22222222-2222-4222-8222-222222222222', 'sha256'), 'hex'),
   now(), 1, now()),
  ('extension-migrate-user',
   pg_catalog.encode(extensions.digest('22222222-2222-4222-8222-222222222222', 'sha256'), 'hex'),
   now(), 1, now()),
  ('game-challenge',
   pg_catalog.encode(extensions.digest('22222222-2222-4222-8222-222222222222', 'sha256'), 'hex'),
   now(), 1, now());

create temporary table prior_security_events on commit drop as
select id from public.security_events;

select ok(
  public.delete_account_and_data('22222222-2222-4222-8222-222222222222'),
  'account deletion succeeds'
);

select is_empty(
  $$select 1 from auth.users where id = '22222222-2222-4222-8222-222222222222'$$,
  'account deletion removes the auth user'
);

select is_empty(
  $$select 1 from public.profiles where id = '22222222-2222-4222-8222-222222222222'$$,
  'account deletion cascades the profile'
);

select is_empty(
  $$select 1 from public.extension_authorization_codes
     where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'account deletion cascades extension authorization codes'
);

select is_empty(
  $$select 1 from public.extension_credentials
     where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'account deletion cascades extension credentials'
);

select is_empty(
  $$select 1 from public.games
     where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'account deletion cascades games'
);

select is_empty(
  $$select 1 from public.uni_verifications
     where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'account deletion cascades university verifications'
);

select is_empty(
  $$select 1 from public.verification_email_outbox
     where verification_id = '33333333-3333-4333-8333-333333333333'$$,
  'account deletion cascades verification-email outbox rows'
);

select is_empty(
  $$select 1 from public.email_events
     where recipient_hash in (
       pg_catalog.encode(extensions.digest('deletion@example.test', 'sha256'), 'hex'),
       pg_catalog.encode(extensions.digest('alias@university.test', 'sha256'), 'hex')
     )$$,
  'account deletion removes primary and verification email hashes'
);

select is_empty(
  $$select 1 from public.auth_rate_limits
   where bucket in ('extension-link-authorize-user', 'extension-migrate-user', 'game-challenge')
       and key_hash = pg_catalog.encode(
         extensions.digest('22222222-2222-4222-8222-222222222222', 'sha256'), 'hex'
       )$$,
  'account deletion removes user-keyed extension limiter hashes'
);

select is(
  (select count(*)::integer
     from public.security_events event
    where not exists (select 1 from prior_security_events prior where prior.id = event.id)),
  1,
  'account deletion adds only its anonymous security event'
);

select is(
  (select details
     from public.security_events event
    where not exists (select 1 from prior_security_events prior where prior.id = event.id)),
  '{}'::jsonb,
  'the retained account-deletion event has no identifier'
);

insert into public.security_events (kind, occurred_at, details)
values ('old-test-event', now() - interval '31 days', '{}'::jsonb);

select is(
  public.purge_expired_security_events(),
  1,
  'security-event maintenance purges events older than 30 days'
);

insert into public.game_challenges
  (id, user_id, nonce_hash, issued_at, start_expires_at)
values
  ('44444444-4444-4444-8444-444444444441',
   '11111111-1111-4111-8111-111111111111', repeat('a', 64),
   now() - interval '2 days', now() - interval '2 days' + interval '10 minutes'),
  ('44444444-4444-4444-8444-444444444442',
   '11111111-1111-4111-8111-111111111111', repeat('b', 64),
   now() - interval '1 hour', now() - interval '50 minutes');

select lives_ok(
  $$select public.purge_expired_operational_data()$$,
  'operational-data retention runs as one maintenance boundary'
);

select is_empty(
  $$select 1 from public.game_challenges
     where id = '44444444-4444-4444-8444-444444444441'$$,
  'an unusable challenge older than the one-day cushion is purged'
);

select results_eq(
  $$select id from public.game_challenges
     where id = '44444444-4444-4444-8444-444444444442'$$,
  $$values ('44444444-4444-4444-8444-444444444442'::uuid)$$,
  'a recently expired challenge remains inside the diagnostic cushion'
);

select * from finish();
rollback;
