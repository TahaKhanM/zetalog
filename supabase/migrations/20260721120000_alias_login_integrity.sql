-- Alias login: a university email verified for the badge becomes a LOGIN
-- alias for the account. Two pieces make that safe:
--
--   1. an address can only ever be a verified alias of ONE account (partial
--      unique index — the app checks first, this closes the race), and
--   2. a service-role-only lookup that resolves an identifier (primary email
--      or verified alias) to the owning account, with enough shape to
--      classify the sign-in flow (password? which providers?).

-- 1) Verified-alias uniqueness ----------------------------------------------

-- Retire duplicate verified claims before the index lands (keep the newest
-- claim per address; superseded rows keep their history but stop being
-- aliases). profiles.uni_verified_at — the badge — is untouched.
update public.uni_verifications v
set verified_at = null
where v.verified_at is not null
  and exists (
    select 1
    from public.uni_verifications newer
    where newer.email = v.email
      and newer.verified_at is not null
      and (newer.verified_at > v.verified_at
           or (newer.verified_at = v.verified_at and newer.id > v.id))
  );

-- Pending rows (verified_at is null) stay unconstrained: they are the
-- per-address rate-limit history and may repeat freely.
create unique index uni_verifications_verified_email_key
  on public.uni_verifications (email)
  where verified_at is not null;

-- 2) Identifier lookup --------------------------------------------------------

-- Resolve a login identifier to its account. SECURITY DEFINER because it must
-- read auth.users / auth.identities; search_path is pinned so the body cannot
-- be hijacked. Matching order: a primary (GoTrue) email always beats an alias
-- claim on the same address; soft-deleted accounts never resolve. Returns one
-- row or none.
create function public.auth_identifier_lookup(p_identifier extensions.citext)
returns table (
  user_id uuid,
  primary_email extensions.citext,
  has_password boolean,
  providers text[],
  matched_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  with primary_match as (
    -- operator(extensions.=) pins citext's case-insensitive equality: with
    -- search_path = '' a bare `=` would silently fall back to case-SENSITIVE
    -- text comparison.
    select u.id
    from auth.users u
    where u.email::extensions.citext operator(extensions.=) p_identifier
      and u.deleted_at is null
    order by u.created_at
    limit 1
  ),
  alias_match as (
    select v.user_id as id
    from public.uni_verifications v
    join auth.users u on u.id = v.user_id
    where v.email operator(extensions.=) p_identifier
      and v.verified_at is not null
      and u.deleted_at is null
    limit 1
  ),
  chosen as (
    select id, 'primary' as matched_by from primary_match
    union all
    select id, 'alias' from alias_match
    where not exists (select 1 from primary_match)
  )
  select
    u.id,
    u.email::extensions.citext,
    coalesce(u.encrypted_password, '') <> '',
    coalesce(
      (select array_agg(i.provider order by i.provider)
       from auth.identities i
       where i.user_id = u.id),
      '{}'::text[]
    ),
    c.matched_by
  from chosen c
  join auth.users u on u.id = c.id
$$;

comment on function public.auth_identifier_lookup(extensions.citext) is
  'Resolve a sign-in identifier (primary email or verified uni alias) to its '
  'account: id, primary email, password flag, identity providers, match kind. '
  'Service-role only; feeds /api/auth/lookup, /api/auth/login and the '
  'verify-request alias-integrity check.';

-- Service-role only: this function reads auth.* and reveals account
-- existence, so client roles must never call it directly.
revoke execute on function public.auth_identifier_lookup(extensions.citext)
  from public, anon, authenticated;
grant execute on function public.auth_identifier_lookup(extensions.citext)
  to service_role;
