-- Role decisions use the authenticated JWT, never a caller-supplied actor ID.
-- Deploy this migration before the new API handlers; old role writes fail closed.
begin;
lock table public.profiles in share row exclusive mode;

create schema if not exists role_security;
revoke all on schema role_security from public, anon, authenticated, service_role;

-- A real row update serializes writers even at REPEATABLE READ (where a
-- concurrent change raises serialization_failure). A count-after-advisory-lock
-- alone would not protect against an old transaction snapshot.
create table role_security.director_guard (
  singleton boolean primary key default true check (singleton),
  director_count bigint not null check (director_count >= 0)
);
insert into role_security.director_guard select true, count(*) from public.profiles where role = 'director';
revoke all on role_security.director_guard from public, anon, authenticated, service_role;

create function role_security.guard_directors()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare delta integer := 0;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Profiles cannot be truncated' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and new.role = 'director' then delta := delta + 1; end if;
  if tg_op <> 'INSERT' and old.role = 'director' then delta := delta - 1; end if;
  update role_security.director_guard set director_count = director_count + delta
    where singleton and (delta >= 0 or director_count > 1);
  if not found then
    raise exception 'Cannot remove the last director' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function role_security.guard_directors() from public, anon, authenticated, service_role;
-- AFTER counts only rows actually written, including INSERT ... ON CONFLICT.
-- An exception still rolls back the entire statement/transaction and cascade.
create trigger role_security_guard after insert or update of role or delete on public.profiles
  for each row execute function role_security.guard_directors();
create trigger role_security_no_truncate before truncate on public.profiles
  for each statement execute function role_security.guard_directors();

-- Service-key-only writes are no longer a role-management interface.
revoke insert, update, delete, truncate on public.profiles from service_role;
revoke insert, update, delete, truncate on public.pending_roles from service_role;
do $$ declare c record; begin
  for c in select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('profiles', 'pending_roles') loop
    execute format('revoke insert (%I), update (%I) on public.%I from service_role', c.column_name, c.column_name, c.table_name);
  end loop;
end $$;
grant update (full_name, phone, email, linked_student_id, linked_teacher_id) on public.profiles to service_role;

create or replace function public.profiles_prevent_self_elevation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$ begin
  -- postgres is the trusted migration/RPC owner, not an application login.
  if current_user = 'postgres' then return new; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role
    or (current_user <> 'service_role' and (
      new.email is distinct from old.email
      or new.linked_student_id is distinct from old.linked_student_id
      or new.linked_teacher_id is distinct from old.linked_teacher_id)) then
    raise exception 'Protected profile fields require an authorized operation' using errcode = '42501';
  end if;
  return new;
end $$;

-- Old queues lack authority provenance and will not activate. Keep them for
-- operator review, rather than assigning an invented inviter or deleting them.
alter table public.pending_roles
  add column invited_by uuid references public.profiles(id) on delete set null,
  add column target_user_id uuid references public.profiles(id) on delete cascade,
  add column expires_at timestamptz;
-- Abort safely if legacy case-folded duplicates require operator resolution.
create unique index pending_roles_normalized_email on public.pending_roles (lower(btrim(email)));

create function role_security.assert_transition(caller_role text, target_role text, requested_role text)
returns void language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$ begin
  if requested_role is null or requested_role not in ('student','parent','teacher','admin','director')
    or target_role is null or target_role not in ('pending','student','parent','teacher','admin','director')
    or (caller_role = 'director' or (caller_role = 'admin'
      and target_role in ('pending','student','parent','teacher')
      and requested_role in ('student','parent','teacher'))) is not true then
    raise exception 'Forbidden role transition' using errcode = '42501';
  end if;
end $$;
revoke all on function role_security.assert_transition(text,text,text) from public, anon, authenticated, service_role;

create function public.change_user_role(p_user_id uuid, p_role text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$ declare actor_role text; target public.profiles%rowtype; begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update role_security.director_guard set director_count = director_count where singleton;
  select role into actor_role from public.profiles where id = auth.uid();
  select * into target from public.profiles where id = p_user_id for update;
  perform role_security.assert_transition(actor_role, target.role, p_role);
  update public.profiles set role = p_role where id = target.id;
  -- Explicit changes supersede any outstanding invitation, including a no-op.
  delete from public.pending_roles where target_user_id = target.id or lower(btrim(email)) = lower(btrim(target.email));
  -- The existing profile audit trigger retains auth.uid() through this RPC.
  return jsonb_build_object('success', true, 'userId', target.id, 'email', target.email,
    'previousRole', target.role, 'role', p_role);
end $$;

create or replace function public.prepare_role_invitation(p_email text, p_role text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$ declare
  actor_role text; target public.profiles%rowtype;
  normalized_email text := lower(btrim(p_email)); queue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if normalized_email is null or length(normalized_email) > 254 or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  update role_security.director_guard set director_count = director_count where singleton;
  select role into actor_role from public.profiles where id = auth.uid();
  -- Auth email is authoritative. Refuse profile/Auth disagreement, not a
  -- second invitation that could later attach to the wrong identity.
  if exists (select 1 from public.profiles p join auth.users u on u.id=p.id
    where (lower(btrim(p.email))=normalized_email or lower(btrim(u.email))=normalized_email)
    and lower(btrim(p.email)) is distinct from lower(btrim(u.email))) then
    raise exception 'Account email requires reconciliation' using errcode = '23514';
  end if;
  select p.* into target from public.profiles p join auth.users u on u.id=p.id
    where lower(btrim(u.email)) = normalized_email for update of p;
  perform role_security.assert_transition(actor_role, coalesce(target.role, 'pending'), p_role);
  if target.id is not null and target.role <> 'pending' then
    if target.role <> p_role then
      raise exception 'Use explicit role management for an existing account' using errcode = '23514';
    end if;
    delete from public.pending_roles where lower(btrim(email)) = normalized_email;
    return jsonb_build_object('success', true, 'alreadyRegistered', true, 'needsDelivery', false,
      'userId', target.id, 'role', target.role, 'email', normalized_email);
  end if;
  insert into public.pending_roles(email,role,invited_by,target_user_id,expires_at)
    values(normalized_email,p_role,auth.uid(),target.id,now()+interval '7 days')
    on conflict (lower(btrim(email))) do update set role=excluded.role,
      invited_by=excluded.invited_by, target_user_id=excluded.target_user_id,
      expires_at=excluded.expires_at
    returning id into queue_id;
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'INSERT','pending_roles',queue_id,array['role','invited_by','target_user_id','expires_at'],
      jsonb_build_object('role',p_role,'invited_by',auth.uid(),'target_user_id',target.id));
  return jsonb_build_object('success',true,'alreadyRegistered',target.id is not null,
    'needsDelivery',not exists(select 1 from auth.users where id=target.id and email_confirmed_at is not null),
    'userId',target.id,'role',p_role,'email',normalized_email);
end $$;

create or replace function public.apply_pending_role()
returns text language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$ declare target public.profiles%rowtype; queued public.pending_roles%rowtype;
  issuer_role text; verified_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update role_security.director_guard set director_count = director_count where singleton;
  select * into target from public.profiles where id=auth.uid() for update;
  select email into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if target.id is null or verified_email is null
    or lower(btrim(target.email)) is distinct from lower(btrim(verified_email)) then return null; end if;
  select * into queued from public.pending_roles where lower(btrim(email))=lower(btrim(verified_email)) for update;
  if queued.id is null then return null; end if;
  select role into issuer_role from public.profiles where id=queued.invited_by;
  -- One-shot, pending-only, identity-bound and reauthorized at consumption.
  if target.role <> 'pending' or queued.invited_by is null or queued.expires_at is null
    or queued.expires_at <= now() or (queued.target_user_id is not null and queued.target_user_id <> target.id)
    or (issuer_role='director' or (issuer_role='admin' and queued.role in ('student','parent','teacher'))) is not true then
    delete from public.pending_roles where id=queued.id;
    return null;
  end if;
  perform role_security.assert_transition(issuer_role,target.role,queued.role);
  update public.profiles set role=queued.role where id=target.id;
  delete from public.pending_roles where id=queued.id;
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'DELETE','pending_roles',queued.id,array['role'],
      jsonb_build_object('activated_role',queued.role,'authorized_by',queued.invited_by));
  return queued.role;
end $$;

revoke all on function public.change_user_role(uuid,text), public.prepare_role_invitation(text,text), public.apply_pending_role()
  from public, anon, authenticated, service_role;
grant execute on function public.change_user_role(uuid,text), public.prepare_role_invitation(text,text), public.apply_pending_role()
  to authenticated;
notify pgrst, 'reload schema';
commit;
