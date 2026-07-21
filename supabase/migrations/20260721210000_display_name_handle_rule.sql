-- CO-5: display names become handles — 3–15 chars of letters, digits, and
-- underscore, no spaces. Mirrors apps/web/lib/profile.ts (the app-side gate).
--
-- NOT VALID: legacy spaced names written under the W2 rule stay readable and
-- rankable; they simply cannot be saved again without conforming. Every new
-- write goes through the CHECK.

alter table public.profiles
  drop constraint if exists profiles_display_name_format;

alter table public.profiles
  add constraint profiles_display_name_format
  check (display_name is null or display_name::text ~ '^[A-Za-z0-9_]{3,15}$')
  not valid;
