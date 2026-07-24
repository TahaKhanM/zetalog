-- ZetaLog leaderboard view and new-user badge trigger.

-- handle_new_user ----------------------------------------------------------
-- SECURITY DEFINER trigger on auth.users: creates the profiles row for every
-- new account and awards the "instant badge" when the sign-up email
-- domain matches a seeded university.
--
-- SECURITY DEFINER is required: the insert into auth.users happens under the
-- GoTrue/service context, and the function must write public.profiles (which is
-- RLS-protected and has no client INSERT path). search_path is pinned to '' so
-- the body cannot be hijacked by a caller-controlled search_path; every object
-- is schema-qualified. Built-ins (lower, split_part, unnest, now) resolve via
-- the always-present pg_catalog.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_university_id uuid;
begin
  -- Domain of the sign-up address, lowercased for case-insensitive matching.
  v_domain := lower(split_part(new.email, '@', 2));

  -- Match against seeded university domains (also lowercased in the seed;
  -- lower() here keeps the check robust to any manually inserted rows).
  if v_domain <> '' then
    select u.id
      into v_university_id
      from public.universities u
     where exists (
       select 1 from unnest(u.domains) as d(domain)
        where lower(d.domain) = v_domain
     )
     limit 1;
  end if;

  insert into public.profiles (id, university_id, uni_verified_at)
  values (
    new.id,
    v_university_id,
    -- Instant badge only when a domain matched; otherwise verify later.
    case when v_university_id is not null then now() end
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profiles row on signup and awards the instant university badge when the email domain matches a seeded university.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- leaderboard_entries ------------------------------------------------------
-- Public leaderboard projection: personal best (max accepted server_score) per
-- (user, rankable duration), with the university badge shown only for verified
-- profiles. One row per (user, duration).
--
-- SECURITY NOTE — this is intentionally a plain (SECURITY DEFINER) view, NOT a
-- security_invoker view. It runs with the owner's (postgres) privileges and so
-- bypasses RLS on games/profiles. That is deliberate and required: the public
-- leaderboard must expose every ranked user's row to anon, but RLS on the base
-- tables restricts each caller to their own rows. The view is the controlled
-- gateway: it exposes ONLY this minimal, non-sensitive projection (display
-- name, duration, best score, counts, public university name/slug) and never
-- telemetry, scores of non-accepted games, emails, or admin flags.
--
-- Consequently the Supabase advisor "security_definer_view" (0010) warning is
-- EXPECTED and ACCEPTED for this object. Switching it to security_invoker would
-- break the public leaderboard (anon would see nothing). The safety of this
-- decision rests on the projection below staying minimal — do not add columns
-- that leak per-user private data.
create view public.leaderboard_entries as
select
  p.id                                    as user_id,
  p.display_name                          as display_name,
  g.rankable_duration                     as duration,
  max(g.server_score)                     as best_score,
  count(*)                                as games_counted,
  -- University columns are visible only once the badge is verified.
  case when p.uni_verified_at is not null then u.name end as university_name,
  case when p.uni_verified_at is not null then u.slug end as university_slug
from public.games g
join public.profiles p on p.id = g.user_id
left join public.universities u on u.id = p.university_id
where g.status = 'accepted'
  and g.rankable_duration is not null
  and p.display_name is not null
group by
  p.id,
  p.display_name,
  g.rankable_duration,
  p.uni_verified_at,
  u.name,
  u.slug;

comment on view public.leaderboard_entries is
  'Public leaderboard: PB per (user, duration) over accepted rankable games. Definer-semantics view (bypasses RLS by design) exposing only a minimal public projection; security_definer_view advisor warning is accepted (see migration comment).';

-- Public read access, SELECT only. Supabase's default privileges grant ALL on
-- new public objects to anon/authenticated, so revoke first (defense in depth:
-- the view is not updatable, but the grants should still say exactly SELECT),
-- then grant back the single privilege these roles need. The view owner
-- (postgres) supplies the underlying table access.
revoke all on public.leaderboard_entries from anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;
