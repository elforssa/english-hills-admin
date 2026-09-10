-- Batch 1 only: contain profile escalation and anonymous privileged RPCs.
-- Backend role changes still use service_role; pending-role activation runs
-- inside the existing postgres-owned apply_pending_role(). Neither is an
-- end-user table-write permission. Role-workflow redesign belongs to Batch 2.
begin;

create or replace function public.profiles_prevent_self_elevation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Explicit trusted execution identities, not a catch-all non-client bypass.
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.email is distinct from old.email
     or new.linked_student_id is distinct from old.linked_student_id
     or new.linked_teacher_id is distinct from old.linked_teacher_id then
    raise exception 'Protected profile fields require an authorized backend operation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A column REVOKE alone cannot override a table-level grant. Remove both
-- table grants and any existing per-column grants before allowing self edits.
revoke insert, update, delete, truncate on public.profiles, public.pending_roles
  from public, anon, authenticated;
do $$
declare
  c record;
begin
  for c in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('profiles', 'pending_roles')
  loop
    execute format('revoke insert (%I), update (%I) on public.%I from public, anon, authenticated',
      c.column_name, c.column_name, c.table_name);
  end loop;
end;
$$;
grant update (full_name, phone) on public.profiles to authenticated;

drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles delete" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "pending_roles admin all" on public.pending_roles;
create policy "pending_roles admin select" on public.pending_roles
  for select to authenticated
  using (public.get_my_role() in ('admin', 'director'));

-- Preserve signup (auth trigger), backend invitations/role changes and the
-- self-scoped activation RPC. Never grant client writes to pending_roles.
grant select, insert, update, delete on public.profiles, public.pending_roles to service_role;
revoke execute on function public.apply_pending_role() from public, anon;
grant execute on function public.apply_pending_role() to authenticated;

create or replace function public.soft_delete_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or (public.get_my_role() in ('admin', 'director')) is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.students set deleted_at = now()
    where id = p_student_id and deleted_at is null;
end;
$$;

create or replace function public.soft_delete_teacher(p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or (public.get_my_role() in ('admin', 'director')) is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.teachers set deleted_at = now()
    where id = p_teacher_id and deleted_at is null;
end;
$$;

create or replace function public.soft_delete_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.receipts set deleted_at = now()
    where id = p_receipt_id and deleted_at is null;
end;
$$;

-- Soft-delete RPCs require an actual user session, including for backend
-- callers. service_role retains explicit table access, not an RPC bypass.
revoke execute on function public.soft_delete_student(uuid),
  public.soft_delete_teacher(uuid), public.soft_delete_receipt(uuid)
  from public, anon, service_role;
grant execute on function public.soft_delete_student(uuid),
  public.soft_delete_teacher(uuid), public.soft_delete_receipt(uuid)
  to authenticated;

-- Revoking named roles alone leaves inherited PUBLIC execution intact.
revoke execute on function public.claim_director_if_none()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
