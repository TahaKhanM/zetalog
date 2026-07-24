-- CO-11: "not at a university". The flag records an explicit choice so the UI
-- stops offering the badge flow. Independent players appear on the global
-- board only, which is already the default for unverified profiles; verifying
-- a university email later simply outranks the flag in the UI. Written only by
-- the service role through POST /api/profile (client column grants unchanged).

alter table public.profiles
  add column if not exists independent boolean not null default false;
