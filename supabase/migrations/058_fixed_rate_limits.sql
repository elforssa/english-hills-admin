-- Only named, server-owned limits are callable. Serialize requests for each
-- actor/scope so concurrent HTTP workers cannot all observe the same count.
begin;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

create or replace function public.consume_rate_limit(p_scope text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_max integer;
  v_window integer;
  v_hits integer;
begin
  if v_user is null then return false; end if;
  case p_scope
    when 'email_send:minute' then v_max := 10; v_window := 60;
    when 'email_send:hour' then v_max := 100; v_window := 3600;
    when 'invite:minute' then v_max := 5; v_window := 60;
    when 'invite:hour' then v_max := 20; v_window := 3600;
    when 'role_update:minute' then v_max := 10; v_window := 60;
    when 'role_update:hour' then v_max := 50; v_window := 3600;
    else raise exception 'Unknown rate limit scope' using errcode = '22023';
  end case;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_scope, 0)
  );
  select count(*) into v_hits from public.rate_limits
  where user_id = v_user and scope = p_scope
    and created_at >= pg_catalog.clock_timestamp() - pg_catalog.make_interval(secs => v_window);
  if v_hits >= v_max then return false; end if;
  insert into public.rate_limits(user_id, scope) values (v_user, p_scope);
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text) to authenticated;
commit;
