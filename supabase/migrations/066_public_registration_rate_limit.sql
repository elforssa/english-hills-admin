begin;

-- Retain the existing signature for the server route, but never trust the
-- caller-supplied thresholds. This endpoint is service-role only.
create or replace function public.check_anon_rate_limit(
  p_ip_key text, p_scope text, p_max_requests int, p_window_seconds int
) returns boolean language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hits integer;
begin
  if p_scope <> 'inscription:hour' or p_ip_key is null or pg_catalog.length(p_ip_key) > 256 then
    raise exception 'Invalid public rate limit' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('anon:' || p_ip_key || ':' || p_scope, 0));
  delete from public.anon_rate_limits
  where ip_key = p_ip_key and scope = p_scope
    and created_at < pg_catalog.clock_timestamp() - interval '1 hour';
  select count(*) into v_hits from public.anon_rate_limits
  where ip_key = p_ip_key and scope = p_scope;
  if v_hits >= 5 then return false; end if;
  insert into public.anon_rate_limits(ip_key,scope) values(p_ip_key,p_scope);
  return true;
end;
$$;

revoke all on function public.check_anon_rate_limit(text,text,int,int) from public, anon, authenticated;
grant execute on function public.check_anon_rate_limit(text,text,int,int) to service_role;

commit;
