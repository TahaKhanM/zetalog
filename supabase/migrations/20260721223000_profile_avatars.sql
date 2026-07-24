-- Profile pictures.
--
-- 1. `profiles.avatar_url` — the public URL of the user's avatar (with a
--    cache-busting version query), written ONLY by the avatar API route via
--    the service role. The column grant story is unchanged: clients may still
--    update display_name only.
-- 2. `leaderboard_entries` gains the avatar column. Avatars are public by
--    definition (they render on the public boards), so this stays within the
--    view's minimal-public-projection rule; the SECURITY DEFINER posture and
--    grants are unchanged (create or replace preserves owner and privileges).
-- 3. An `avatars` storage bucket: public read, service-role writes only (no
--    storage.objects policies are added, so client roles cannot write; the
--    API route uploads with the service key). Small caps as defense in depth.

alter table public.profiles
  add column if not exists avatar_url text
  check (avatar_url is null or length(avatar_url) <= 500);

create or replace view public.leaderboard_entries as
select
  p.id                                    as user_id,
  p.display_name                          as display_name,
  g.rankable_duration                     as duration,
  max(g.server_score)                     as best_score,
  count(*)                                as games_counted,
  -- University columns are visible only once the badge is verified.
  case when p.uni_verified_at is not null then u.name end as university_name,
  case when p.uni_verified_at is not null then u.slug end as university_slug,
  p.avatar_url                            as avatar_url
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
  u.slug,
  p.avatar_url;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 307200, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
