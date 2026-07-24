-- Remove profile pictures entirely (product decision: user-uploaded
-- images are a moderation liability, and stored images cost real space on the
-- free tier). The display-name handle rules are untouched;
-- monogram initials replace photos in the UI.
--
-- The view must be dropped and recreated (create or replace cannot remove a
-- column). Recreating loses grants, so the exact original posture is restored below:
-- intentionally SECURITY DEFINER, SELECT-only for anon/authenticated (see the
-- 20260720235630 migration for the accepted advisor-warning rationale).

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
group by
  p.id,
  p.display_name,
  g.rankable_duration,
  p.uni_verified_at,
  u.name,
  u.slug;

comment on view public.leaderboard_entries is
  'Public leaderboard: PB per (user, duration) over accepted rankable games. Definer-semantics view (bypasses RLS by design) exposing only a minimal public projection; security_definer_view advisor warning is accepted (see 20260720235630 migration comment).';

revoke all on public.leaderboard_entries from anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;

alter table public.profiles drop column if exists avatar_url;

-- NOTE: the `avatars` bucket and its objects cannot be dropped here — hosted
-- Supabase forbids direct DML on storage tables in migrations ("Use the
-- Storage API instead"). The bucket is emptied and deleted via the Storage
-- API at rollout (service role); nothing in the schema references it anymore.
