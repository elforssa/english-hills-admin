-- 047 — Remove three legacy authorization exceptions without changing workflows.
begin;

drop policy if exists "receipts student read" on public.receipts;
drop policy if exists "messages self update" on public.messages;
drop policy if exists "pending_roles self read" on public.pending_roles;

create or replace function public.messages_preserve_read_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.read is distinct from old.read
     and (to_jsonb(new) - 'read' - 'updated_at')
         = (to_jsonb(old) - 'read' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_messages_preserve_read_timestamp on public.messages;
create trigger zz_messages_preserve_read_timestamp
before update of read on public.messages
for each row execute function public.messages_preserve_read_timestamp();

create or replace function public.mark_message_read(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.email into caller_email
  from public.profiles p
  where p.id = auth.uid();

  if caller_email is null or not exists (
    select 1 from public.messages m
    where m.id = p_message_id and m.to_user_email = caller_email
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.messages
  set read = true
  where id = p_message_id and read is distinct from true;
  return true;
end;
$$;

revoke all on function public.mark_message_read(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_message_read(uuid) to authenticated;
revoke all on function public.messages_preserve_read_timestamp() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
