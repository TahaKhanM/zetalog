-- A small, service-managed badge slot for exceptional leaderboard identities.
-- It is deliberately separate from university verification so special accounts
-- do not affect university filters, boards, or statistics. Authenticated users
-- have no UPDATE grant on this column.

alter table public.profiles
  add column leaderboard_badge text;

alter table public.profiles
  add constraint profiles_leaderboard_badge_allowed
  check (leaderboard_badge is null or leaderboard_badge = 'chrome-reviewer');

comment on column public.profiles.leaderboard_badge is
  'Service-managed public leaderboard badge. NULL for ordinary accounts.';

-- Append the badge to the existing public projection. The view remains a
-- minimal, read-only projection and retains its grants and definer semantics.
create or replace view public.leaderboard_entries as
select
  p.id                                    as user_id,
  p.display_name                          as display_name,
  g.rankable_duration                     as duration,
  max(g.server_score)                     as best_score,
  count(*)                                as games_counted,
  case when p.uni_verified_at is not null then u.name end as university_name,
  case when p.uni_verified_at is not null then u.slug end as university_slug,
  p.leaderboard_badge                     as leaderboard_badge
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
  u.slug,
  p.leaderboard_badge;

comment on view public.leaderboard_entries is
  'Public leaderboard: PB per (user, duration) over accepted rankable games, excluding opted-out players. Exposes only the display name, aggregate score, verified university badge, and service-managed leaderboard badge.';

comment on column public.leaderboard_entries.leaderboard_badge is
  'A service-managed public badge identifier, or NULL for ordinary accounts.';
