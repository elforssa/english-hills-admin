-- Upgrade lanes: after `supabase migration up`, the ledger must end at the newest file in
-- supabase/migrations and hold every file from :ceiling_from on. The ceiling is read from
-- the repository (psql runs from its root, as in CI), so a new or renumbered migration
-- needs no edit here. Set ceiling_from before including this file.
\set migrations `ls supabase/migrations 2>/dev/null | sed -n 's/^\([0-9][0-9][0-9]\)_.*\.sql$/\1/p' | paste -sd, -`
select set_config('eh.migration_files', :'migrations', false) as ceiling_files, set_config('eh.ceiling_from', :'ceiling_from', false) as ceiling_low \gset
do $ceiling$
declare files text[] := string_to_array(nullif(current_setting('eh.migration_files'), ''), ',');
  low integer := current_setting('eh.ceiling_from')::integer; newest integer; missing text;
begin
  if files is null then raise exception 'Run from the repository root: supabase/migrations not found'; end if;
  newest := (select max(f::integer) from unnest(files) f);
  if (select max(version::integer) from supabase_migrations.schema_migrations) is distinct from newest then
    raise exception 'Expected the ledger at the current migration % after the upgrade', newest; end if;
  select string_agg(f, ',' order by f) into missing from unnest(files) f
  where f::integer >= low and f not in (select version from supabase_migrations.schema_migrations);
  if missing is not null then raise exception 'Migrations % through current not all recorded (missing %)', low, missing; end if;
  raise notice 'Upgraded to current (%), every migration from % recorded', newest, low;
end $ceiling$;
