-- The handle CHECK was added as NOT VALID, assuming legacy
-- spaced names could persist untouched. But NOT VALID only skips validation of
-- existing rows AT REST — every UPDATE re-checks the whole row, so a profile
-- keeping a legacy name could no longer change anything (avatar sync included).
-- Fix: conform legacy names deterministically (strip disallowed characters,
-- cap at 15, numeric suffix on collision), then validate the constraint.

do $$
declare
  rec record;
  base text;
  candidate text;
  n int;
begin
  for rec in
    select id, display_name::text as name
    from public.profiles
    where display_name is not null
      and display_name::text !~ '^[A-Za-z0-9_]{3,15}$'
  loop
    base := left(regexp_replace(rec.name, '[^A-Za-z0-9_]', '', 'g'), 15);
    if length(base) < 3 then
      base := rpad(base, 3, '0');
    end if;
    candidate := base;
    n := 1;
    while exists (
      select 1 from public.profiles
      where display_name = candidate::extensions.citext and id <> rec.id
    ) loop
      candidate := left(base, 15 - length(n::text)) || n::text;
      n := n + 1;
    end loop;
    update public.profiles set display_name = candidate where id = rec.id;
  end loop;
end $$;

alter table public.profiles validate constraint profiles_display_name_format;
