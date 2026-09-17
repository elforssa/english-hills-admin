begin;
create or replace function public.recover_missing_profile()
returns boolean language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profiles (id, email, full_name, role)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', ''), 'pending'
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
  return exists(select 1 from public.profiles p where p.id = auth.uid());
end;
$$;
revoke all on function public.recover_missing_profile() from public, anon, authenticated;
grant execute on function public.recover_missing_profile() to authenticated;
commit;
