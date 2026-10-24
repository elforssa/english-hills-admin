-- ADR-009 zero rule on the cumulative catalog (plan NRC-r2, CI guard point 3).
-- No application function may raise the retryable serialization code or catch
-- serialization_failure to re-raise it; deliberate conflicts use PT409. This
-- overrides the per-file migration baselines, which only describe history.
-- Platform schemas and extension members are not application code.
do $$
declare offenders text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into offenders
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'realtime', '_realtime',
      'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'vault', 'cron', 'net', 'supabase_functions',
      'supabase_migrations', 'pgsodium', 'pgsodium_masks', '_analytics')
    and n.nspname !~ '^pg_temp_|^pg_toast_temp_'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and (p.prosrc ~ '''40001''' or p.prosrc ~* '\mserialization_failure\M');
  if offenders is not null then
    raise exception 'ADR-009: application functions raise or catch the retryable serialization code: %', offenders;
  end if;
end $$;
