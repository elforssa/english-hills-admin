begin;

create or replace function public.count_today_dismissals()
returns bigint language sql stable security invoker
set search_path = pg_catalog, pg_temp
as $$
  select count(*) from public.dismissal_logs
  where confirmed is true
    and ("timestamp" at time zone 'Africa/Casablanca')::date
      = (pg_catalog.now() at time zone 'Africa/Casablanca')::date;
$$;

revoke all on function public.count_today_dismissals() from public, anon, authenticated;
grant execute on function public.count_today_dismissals() to authenticated;

commit;
