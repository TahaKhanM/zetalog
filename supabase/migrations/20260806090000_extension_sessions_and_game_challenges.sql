-- Independent extension sessions and transparent game-session binding.
--
-- The website and extension must never rotate the same Supabase refresh token.
-- A signed-in website authorization creates a short-lived code that is bound
-- to an S256 PKCE challenge and an exact Chrome Identity redirect URL. Only
-- the originating extension can redeem it for an opaque credential.
-- Challenges are optional evidence: online games bind to one automatically,
-- while offline games continue through the existing plausibility checks.

create table public.extension_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_challenge text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint extension_authorization_codes_expiry check (expires_at > created_at),
  constraint extension_authorization_codes_challenge check (
    code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'
  ),
  constraint extension_authorization_codes_redirect check (
    redirect_uri ~ '^https://[a-p]{32}\.chromiumapp\.org/zetalog-link$'
  )
);

create index extension_authorization_codes_expiry_idx
  on public.extension_authorization_codes (expires_at)
  where consumed_at is null;

create table public.extension_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index extension_credentials_user_idx
  on public.extension_credentials (user_id, created_at desc);

create table public.game_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  nonce_hash text not null,
  issued_at timestamptz not null default now(),
  start_expires_at timestamptz not null,
  consumed_at timestamptz,
  game_id uuid references public.games (id) on delete set null,
  constraint game_challenges_start_expiry check (start_expires_at > issued_at)
);

create index game_challenges_user_idx
  on public.game_challenges (user_id, issued_at desc);

-- A removed row remembers its prior moderation outcome so Restore is a real
-- server operation rather than an idempotent re-POST that remains removed.
alter table public.games
  add column status_before_removal public.game_status;

-- Evidence is nullable for legacy and offline submissions. It is deliberately
-- not used as a claim of cheat-proof play; it prevents replay/backdating and
-- gives moderation a stronger signal without rejecting legitimate offline play.
alter table public.games
  add column challenge_id uuid references public.game_challenges (id) on delete set null;

create unique index games_challenge_unique_idx
  on public.games (challenge_id)
  where challenge_id is not null;

alter table public.extension_authorization_codes enable row level security;
alter table public.extension_credentials enable row level security;
alter table public.game_challenges enable row level security;

revoke all on public.extension_authorization_codes from public, anon, authenticated;
revoke all on public.extension_credentials from public, anon, authenticated;
revoke all on public.game_challenges from public, anon, authenticated;

-- Code consumption, S256 verifier validation, redirect binding, and credential
-- creation occur in one transaction. No public role can call this function.
create or replace function public.redeem_extension_authorization_code(
  p_code_hash text,
  p_code_verifier text,
  p_redirect_uri text,
  p_token_hash text,
  p_now timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code_challenge text;
begin
  if p_code_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then
    return null;
  end if;

  v_code_challenge := pg_catalog.translate(
    pg_catalog.rtrim(
      pg_catalog.encode(extensions.digest(p_code_verifier, 'sha256'), 'base64'),
      '='
    ),
    '+/',
    '-_'
  );

  update public.extension_authorization_codes
  set consumed_at = p_now
  where code_hash = p_code_hash
    and code_challenge = v_code_challenge
    and redirect_uri = p_redirect_uri
    and consumed_at is null
    and expires_at > p_now
  returning user_id into v_user_id;

  if v_user_id is null then
    return null;
  end if;

  insert into public.extension_credentials (user_id, token_hash, created_at, last_used_at)
  values (v_user_id, p_token_hash, p_now, p_now);

  return v_user_id;
end;
$$;

revoke execute on function public.redeem_extension_authorization_code(
  text, text, text, text, timestamptz
)
  from public, anon, authenticated;
grant execute on function public.redeem_extension_authorization_code(
  text, text, text, text, timestamptz
)
  to service_role;

create or replace function public.consume_auth_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_now timestamptz,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.auth_rate_limits%rowtype;
begin
  if p_window_seconds < 1 or p_limit < 1 then
    raise exception 'invalid rate limit configuration';
  end if;
  -- This indexed opportunistic cleanup keeps attacker-created keys bounded even
  -- if scheduled maintenance is temporarily unavailable.
  delete from public.auth_rate_limits
   where last_seen_at < p_now - interval '2 days';
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_bucket || ':' || p_key_hash, 0)
  );
  select * into v_row from public.auth_rate_limits
   where bucket = p_bucket and key_hash = p_key_hash
   for update;

  if not found or v_row.window_started_at <= p_now - pg_catalog.make_interval(secs => p_window_seconds) then
    insert into public.auth_rate_limits (bucket, key_hash, window_started_at, hits, last_seen_at)
    values (p_bucket, p_key_hash, p_now, 1, p_now)
    on conflict (bucket, key_hash) do update
      set window_started_at = excluded.window_started_at,
          hits = 1,
          last_seen_at = excluded.last_seen_at;
    return true;
  end if;

  update public.auth_rate_limits set last_seen_at = p_now
   where bucket = p_bucket and key_hash = p_key_hash;
  if v_row.hits >= p_limit then return false; end if;
  update public.auth_rate_limits set hits = hits + 1
   where bucket = p_bucket and key_hash = p_key_hash;
  return true;
end;
$$;

revoke execute on function public.consume_auth_rate_limit(text, text, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, timestamptz, integer, integer)
  to service_role;

create or replace function public.remove_owned_game(p_user_id uuid, p_client_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games
  set status_before_removal = status,
      status = 'user_removed'
  where user_id = p_user_id
    and client_game_id = p_client_game_id
    and status in ('accepted', 'quarantined');
  return found;
end;
$$;

create or replace function public.restore_owned_game(p_user_id uuid, p_client_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games
  set status = coalesce(status_before_removal, 'quarantined'::public.game_status),
      status_before_removal = null
  where user_id = p_user_id
    and client_game_id = p_client_game_id
    and status = 'user_removed';
  return found;
end;
$$;

revoke execute on function public.remove_owned_game(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.restore_owned_game(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_owned_game(uuid, uuid) to service_role;
grant execute on function public.restore_owned_game(uuid, uuid) to service_role;

-- Serialize one user's admission decision so retries, hourly limits, PB-jump
-- history and challenge consumption all observe one coherent state.
create or replace function public.submit_game_atomic(
  p_user_id uuid,
  p_client_game_id uuid,
  p_played_at timestamptz,
  p_settings_fingerprint text,
  p_rankable_duration integer,
  p_claimed_score integer,
  p_server_score integer,
  p_status public.game_status,
  p_telemetry jsonb,
  p_validation jsonb,
  p_challenge_id uuid,
  p_rate_since timestamptz,
  p_rate_limit integer
)
returns table (
  result text,
  id uuid,
  outcome public.game_status,
  server_score integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.games%rowtype;
  v_status public.game_status := p_status;
  v_validation jsonb := p_validation;
  v_history_count integer;
  v_history_best integer;
  v_challenge_id uuid;
  v_inserted public.games%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zetalog:game:' || p_user_id::text, 0)
  );

  select * into v_existing
    from public.games
   where user_id = p_user_id and client_game_id = p_client_game_id;
  if found then
    return query select 'existing'::text, v_existing.id, v_existing.status, v_existing.server_score;
    return;
  end if;

  if (select count(*) from public.games
       where user_id = p_user_id and received_at >= p_rate_since) >= p_rate_limit then
    return query select 'rate-limited'::text, null::uuid, null::public.game_status, null::integer;
    return;
  end if;

  -- Re-run the history-dependent decision inside the lock. Two concurrent PBs
  -- can no longer both compare against the same stale history snapshot.
  if v_status = 'accepted' then
    select count(*), max(g.server_score)
      into v_history_count, v_history_best
      from public.games g
     where g.user_id = p_user_id
       and g.rankable_duration = p_rankable_duration
       and g.status = 'accepted';
    if v_history_count >= 10
       and p_server_score > v_history_best + greatest(15, v_history_best * 0.25) then
      v_status := 'quarantined';
      v_validation := pg_catalog.jsonb_set(v_validation, '{historyFlag}', '"pb-jump"'::jsonb, true);
    end if;
  end if;

  select c.id into v_challenge_id
    from public.game_challenges c
   where c.id = p_challenge_id
     and c.user_id = p_user_id
     and c.consumed_at is null
     and c.start_expires_at > pg_catalog.now()
   for update;

  insert into public.games (
    user_id, client_game_id, played_at, settings_fingerprint,
    rankable_duration, claimed_score, server_score, status,
    telemetry, validation, challenge_id
  ) values (
    p_user_id, p_client_game_id, p_played_at, p_settings_fingerprint,
    p_rankable_duration, p_claimed_score, p_server_score, v_status,
    p_telemetry, v_validation, v_challenge_id
  ) returning * into v_inserted;

  if v_challenge_id is not null then
    update public.game_challenges as challenge
       set consumed_at = pg_catalog.now(), game_id = v_inserted.id
     where challenge.id = v_challenge_id;
  end if;

  return query select 'inserted'::text, v_inserted.id, v_inserted.status, v_inserted.server_score;
end;
$$;

revoke execute on function public.submit_game_atomic(
  uuid, uuid, timestamptz, text, integer, integer, integer,
  public.game_status, jsonb, jsonb, uuid, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.submit_game_atomic(
  uuid, uuid, timestamptz, text, integer, integer, integer,
  public.game_status, jsonb, jsonb, uuid, timestamptz, integer
) to service_role;

-- One maintenance boundary for every short-lived security artifact. Games and
-- active credentials remain until unlink/account deletion; old challenge hashes,
-- used/expired authorization codes, revoked credentials, rate keys and anonymous deletion
-- events do not accumulate indefinitely.
create or replace function public.purge_expired_operational_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.purge_expired_security_events();
  delete from public.email_events
   where created_at < pg_catalog.now() - interval '30 days';
  delete from public.auth_rate_limits
   where last_seen_at < pg_catalog.now() - interval '2 days';
  delete from public.extension_authorization_codes
   where expires_at < pg_catalog.now()
      or consumed_at < pg_catalog.now() - interval '1 day';
  -- A challenge can only be attached to a game that starts within ten minutes.
  -- Keep a one-day diagnostic cushion, not a month of attacker-growable rows.
  delete from public.game_challenges
   where start_expires_at < pg_catalog.now() - interval '1 day';
  delete from public.extension_credentials
   where revoked_at < pg_catalog.now() - interval '30 days';
end;
$$;

revoke execute on function public.purge_expired_operational_data()
  from public, anon, authenticated;
grant execute on function public.purge_expired_operational_data()
  to service_role;
