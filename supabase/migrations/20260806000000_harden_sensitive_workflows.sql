-- Sensitive workflow hardening.
--
-- The application used to compose OTP, alias, profile, and review changes from
-- independent PostgREST requests.  These functions make their state
-- transitions atomic, keep client roles out of privileged data, and leave an
-- auditable review trail.

create extension if not exists pgcrypto with schema extensions;

-- Authentication throttles are operational security records keyed only by
-- SHA-256 digests. Defining the table before account deletion lets erasure also
-- remove the otherwise linkable recipient-email digests immediately.
create table public.auth_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  hits integer not null check (hits >= 0),
  last_seen_at timestamptz not null,
  primary key (bucket, key_hash)
);

create index auth_rate_limits_last_seen_idx on public.auth_rate_limits (last_seen_at);
alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from public, anon, authenticated;

-- A durable record is created before a verification email is dispatched.  It
-- intentionally contains no OTP plaintext: the request process has the code
-- only long enough to hand it to the mail provider.
create table public.verification_email_outbox (
  verification_id uuid primary key references public.uni_verifications (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

create index verification_email_outbox_created_idx
  on public.verification_email_outbox (created_at desc);

alter table public.verification_email_outbox enable row level security;
revoke all on public.verification_email_outbox from anon, authenticated;

-- Atomically reserve both the address and global sending budgets and create a
-- pending verification/outbox record.  The global advisory lock is deliberate:
-- the cap is small and correctness is more valuable than a racy counter.
create function public.reserve_uni_verification(
  p_user_id uuid,
  p_email extensions.citext,
  p_code_hash text,
  p_expires_at timestamptz,
  p_per_email_limit integer,
  p_global_limit integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verification_id uuid;
begin
  if p_per_email_limit < 1 or p_global_limit < 1 then
    raise exception 'invalid verification quota';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zetalog:verification-email-global', 0)
  );

  if (select count(*) from public.uni_verifications v
      where v.email operator(extensions.=) p_email
        and v.created_at >= pg_catalog.now() - interval '1 hour') >= p_per_email_limit then
    return 'rate-limited';
  end if;

  if (select count(*) from public.verification_email_outbox o
      where o.created_at >= pg_catalog.now() - interval '1 day') >= p_global_limit then
    return 'capacity';
  end if;

  insert into public.uni_verifications (user_id, email, code_hash, expires_at, attempts)
  values (p_user_id, p_email, p_code_hash, p_expires_at, 0)
  returning id into v_verification_id;

  insert into public.verification_email_outbox (verification_id)
  values (v_verification_id);

  return v_verification_id::text;
end;
$$;

-- Mark the delivery attempt without ever making a successfully delivered OTP
-- appear failed merely because the audit write is unavailable.
create function public.record_verification_email_delivery(
  p_verification_id uuid,
  p_sent boolean,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.verification_email_outbox
     set status = case when p_sent then 'sent' else 'failed' end,
         sent_at = case when p_sent then pg_catalog.now() else null end,
         last_error = case when p_sent then null else left(coalesce(p_error, 'send failed'), 500) end
   where verification_id = p_verification_id
$$;

-- Consume exactly one verification attempt, or atomically apply the verified
-- alias and badge.  The row lock prevents a concurrent confirmation from
-- multiplying guesses or partially applying the two related records.
create function public.confirm_uni_verification(
  p_user_id uuid,
  p_code_hash text,
  p_now timestamptz default now()
)
returns table (
  status text,
  university_name text,
  university_slug text,
  attempts_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verification public.uni_verifications%rowtype;
  v_university public.universities%rowtype;
begin
  select * into v_verification
    from public.uni_verifications
   where user_id = p_user_id and verified_at is null
   order by created_at desc
   limit 1
   for update;

  if not found then
    return query select 'no-pending'::text, null::text, null::text, null::integer;
    return;
  end if;
  if p_now > v_verification.expires_at then
    return query select 'expired'::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_verification.attempts >= 5 then
    return query select 'locked'::text, null::text, null::text, 0;
    return;
  end if;
  if v_verification.code_hash <> p_code_hash then
    update public.uni_verifications
       set attempts = attempts + 1
     where id = v_verification.id;
    return query select
      'incorrect'::text,
      null::text,
      null::text,
      greatest(0, 5 - (v_verification.attempts + 1));
    return;
  end if;

  select u.* into v_university
    from public.universities u
   where exists (
     select 1
       from pg_catalog.unnest(u.domains) as d(domain)
      where pg_catalog.lower(d.domain) = pg_catalog.lower(pg_catalog.split_part(v_verification.email::text, '@', 2))
   )
   limit 1;
  if not found then
    return query select 'unknown-university'::text, null::text, null::text, null::integer;
    return;
  end if;

  begin
    update public.uni_verifications
       set verified_at = p_now
     where id = v_verification.id and verified_at is null;
    if not found then
      return query select 'no-pending'::text, null::text, null::text, null::integer;
      return;
    end if;

    update public.profiles
       set university_id = v_university.id,
           uni_verified_at = p_now
     where id = p_user_id;
    if not found then
      raise exception 'profile missing for verification user %', p_user_id;
    end if;
  exception when unique_violation then
    return query select 'alias-conflict'::text, null::text, null::text, null::integer;
    return;
  end;

  return query select 'ok'::text, v_university.name, v_university.slug, null::integer;
end;
$$;

create function public.remove_verified_alias(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set university_id = null, uni_verified_at = null
   where id = p_user_id;
  if not found then
    raise exception 'profile missing for alias user %', p_user_id;
  end if;

  delete from public.uni_verifications
   where user_id = p_user_id and verified_at is not null;
end;
$$;

-- Optional fields are accompanied by explicit set flags, so null can remain a
-- legitimate future value without losing atomicity.
create function public.update_profile_settings(
  p_user_id uuid,
  p_set_display_name boolean,
  p_display_name text,
  p_set_independent boolean,
  p_independent boolean,
  p_set_leaderboard_opt_out boolean,
  p_leaderboard_opt_out boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = case when p_set_display_name then p_display_name::extensions.citext else display_name end,
         independent = case when p_set_independent then p_independent else independent end,
         leaderboard_opt_out = case when p_set_leaderboard_opt_out then p_leaderboard_opt_out else leaderboard_opt_out end
   where id = p_user_id;
  if not found then
    raise exception 'profile missing for update user %', p_user_id;
  end if;
end;
$$;

-- Every review transition is recorded in the same transaction as the status
-- update.  The function repeats the admin check so this remains safe if a
-- future route accidentally omits its application-level gate.
create table public.admin_game_reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  admin_id uuid references auth.users (id) on delete set null,
  previous_status public.game_status not null,
  new_status public.game_status not null check (new_status in ('accepted', 'rejected')),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create index admin_game_reviews_game_created_idx
  on public.admin_game_reviews (game_id, created_at desc);

alter table public.admin_game_reviews enable row level security;
revoke all on public.admin_game_reviews from anon, authenticated;

create function public.resolve_quarantined_game(
  p_game_id uuid,
  p_admin_id uuid,
  p_status public.game_status,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.game_status;
begin
  if p_status not in ('accepted', 'rejected')
     or char_length(trim(p_reason)) not between 3 and 500
     or not exists (
    select 1 from public.profiles where id = p_admin_id and is_admin
  ) then
    return false;
  end if;

  select status into v_previous from public.games where id = p_game_id for update;
  if not found or v_previous <> 'quarantined' then
    return false;
  end if;

  update public.games set status = p_status where id = p_game_id;
  insert into public.admin_game_reviews (game_id, admin_id, previous_status, new_status, reason)
  values (p_game_id, p_admin_id, v_previous, p_status, trim(p_reason));
  return true;
end;
$$;

-- Account deletion immediately removes web auth sessions, profiles, games,
-- aliases, and verification records. Independent extension credentials and
-- authorization codes cascade from the profile in the extension migration.
-- The retained event deliberately contains no user identifier and is purged
-- after 30 days by the maintenance function below.
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint security_events_anonymous_details check (details = '{}'::jsonb)
);

create index security_events_occurred_idx on public.security_events (occurred_at);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;

create function public.delete_account_and_data(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_hashes text[];
begin
  -- Keep the table bounded even where a scheduled maintenance invocation is
  -- temporarily unavailable.
  delete from public.security_events where occurred_at < pg_catalog.now() - interval '30 days';

  -- Email delivery logs use stable recipient hashes. Remove hashes for both the
  -- primary and verification addresses before deleting their source rows, so
  -- the supposedly anonymous log cannot remain linkable after erasure.
  select pg_catalog.array_agg(
    pg_catalog.encode(extensions.digest(address, 'sha256'), 'hex')
  )
  into v_recipient_hashes
  from (
    select pg_catalog.lower(u.email::text) as address
      from auth.users u where u.id = p_user_id
    union
    select pg_catalog.lower(v.email::text) as address
      from public.uni_verifications v where v.user_id = p_user_id
  ) as account_addresses;

  delete from public.email_events
   where recipient_hash = any(
     coalesce(v_recipient_hashes, array[]::text[])
   );

  delete from public.auth_rate_limits
   where bucket in (
     'auth-recovery-request-recipient',
     'auth-recovery-verify-recipient'
   )
     and key_hash = any(
     coalesce(v_recipient_hashes, array[]::text[])
   );

  -- Extension-link and legacy-migration limits use the account UUID as their
  -- raw limiter key. Their stored digests are still linkable to a deleted
  -- account unless removed in the same transaction.
  delete from public.auth_rate_limits
   where bucket in (
     'extension-link-authorize-user',
     'extension-migrate-user',
     'game-challenge'
   )
     and key_hash = pg_catalog.encode(
       extensions.digest(p_user_id::text, 'sha256'),
       'hex'
     );

  -- auth.users deletion revokes credentials/sessions and cascades through
  -- profiles to games and uni_verifications. Extension authorization-code and
  -- opaque-credential tables are required to reference profiles with ON DELETE
  -- CASCADE, so later extension-session migrations join this same erasure
  -- boundary without this migration naming their tables. Do not retain an
  -- identifier in the security record.
  delete from auth.users where id = p_user_id;
  if not found then
    return false;
  end if;
  insert into public.security_events (kind, details)
  values ('account-deleted', '{}'::jsonb);
  return true;
end;
$$;

create function public.purge_expired_security_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.security_events where occurred_at < pg_catalog.now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.reserve_uni_verification(uuid, extensions.citext, text, timestamptz, integer, integer) from public, anon, authenticated;
revoke execute on function public.record_verification_email_delivery(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.confirm_uni_verification(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.remove_verified_alias(uuid) from public, anon, authenticated;
revoke execute on function public.update_profile_settings(uuid, boolean, text, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.resolve_quarantined_game(uuid, uuid, public.game_status, text) from public, anon, authenticated;
revoke execute on function public.delete_account_and_data(uuid) from public, anon, authenticated;
revoke execute on function public.purge_expired_security_events() from public, anon, authenticated;

grant execute on function public.reserve_uni_verification(uuid, extensions.citext, text, timestamptz, integer, integer) to service_role;
grant execute on function public.record_verification_email_delivery(uuid, boolean, text) to service_role;
grant execute on function public.confirm_uni_verification(uuid, text, timestamptz) to service_role;
grant execute on function public.remove_verified_alias(uuid) to service_role;
grant execute on function public.update_profile_settings(uuid, boolean, text, boolean, boolean, boolean, boolean) to service_role;
grant execute on function public.resolve_quarantined_game(uuid, uuid, public.game_status, text) to service_role;
grant execute on function public.delete_account_and_data(uuid) to service_role;
grant execute on function public.purge_expired_security_events() to service_role;
