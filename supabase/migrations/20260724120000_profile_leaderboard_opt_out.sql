-- Leaderboard privacy. A user can hide their scores from every public
-- board without unlinking or losing their history. The flag is opt-in
-- (default false = visible, so a new account is public), written only by the
-- service role through POST /api/profile, and enforced in the
-- leaderboard_entries view so one filter covers the global board, the
-- per-university boards, and the masthead counts.

alter table public.profiles
  add column if not exists leaderboard_opt_out boolean not null default false;

-- Recreate the public leaderboard view with opted-out players excluded. The
-- view must be dropped and recreated (create or replace cannot keep the exact
-- grant/comment posture); the original SELECT-only, definer-semantics posture
-- is restored below (see the 20260720235630 migration for the advisor rationale).
drop view public.leaderboard_entries;

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
  and p.leaderboard_opt_out is not true
group by
  p.id,
  p.display_name,
  g.rankable_duration,
  p.uni_verified_at,
  u.name,
  u.slug;

comment on view public.leaderboard_entries is
  'Public leaderboard: PB per (user, duration) over accepted rankable games, excluding players who opted out of the boards. Definer-semantics view (bypasses RLS by design) exposing only a minimal public projection; security_definer_view advisor warning is accepted (see 20260720235630 migration comment).';

revoke all on public.leaderboard_entries from anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;
