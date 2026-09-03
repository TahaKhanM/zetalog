-- Add an ISO country to the university affiliation registry.
--
-- Existing rows are UK institutions; the default backfills them as GB. The
-- original table comment ("UK universities") lives in an applied migration
-- and is replaced here rather than edited.

alter table public.universities
  add column country text not null default 'GB'
  check (country in ('GB', 'US'));

comment on table public.universities is
  'Public reference data: UK and US universities + verification email domains. Seeded from an open dataset.';
