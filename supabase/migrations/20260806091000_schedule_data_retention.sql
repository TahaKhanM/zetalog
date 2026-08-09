-- Scheduled retention is deliberately isolated from the schema migration. The
-- hosted Supabase project must have its Cron integration available; failing this
-- migration cannot roll back the independent-session and account-erasure schema.

create extension if not exists pg_cron;

select cron.schedule(
  'zetalog-operational-data-retention',
  '17 * * * *',
  'select public.purge_expired_operational_data()'
)
where not exists (
  select 1
    from cron.job
   where jobname = 'zetalog-operational-data-retention'
);
