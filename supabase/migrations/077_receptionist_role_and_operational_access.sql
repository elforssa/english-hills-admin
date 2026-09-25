begin;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('director','admin','receptionist','teacher','parent','student','pending'));
alter table public.pending_roles drop constraint pending_roles_role_check;
alter table public.pending_roles add constraint pending_roles_role_check
  check (role in ('director','admin','receptionist','teacher','parent','student'));

-- All three role RPCs from 042 delegate to this private function. Their JWT
-- identity, serialization, provenance, expiry and last-director logic stay intact.
create or replace function role_security.assert_transition(caller_role text, target_role text, requested_role text)
returns void language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$ begin
  if requested_role is null or requested_role not in ('student','parent','teacher','admin','director','receptionist')
    or target_role is null or target_role not in ('pending','student','parent','teacher','admin','director','receptionist')
    or (caller_role = 'director' or (caller_role = 'admin'
      and target_role in ('pending','student','parent','teacher')
      and requested_role in ('student','parent','teacher'))) is not true then
    raise exception 'Forbidden role transition' using errcode = '42501';
  end if;
end $$;
revoke all on function role_security.assert_transition(text,text,text) from public,anon,authenticated,service_role;

create or replace function public.change_user_role(p_user_id uuid, p_role text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$ declare actor_role text; target public.profiles%rowtype; begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update role_security.director_guard set director_count = director_count where singleton;
  select role into actor_role from public.profiles where id = auth.uid();
  select * into target from public.profiles where id = p_user_id for update;
  if actor_role is distinct from 'director' and exists (
    select 1 from public.pending_roles where lower(btrim(email))=lower(btrim(target.email)) and role='receptionist'
  ) then raise exception 'Director required for receptionist invitation' using errcode='42501'; end if;
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
  if actor_role is distinct from 'director' and exists (
    select 1 from public.pending_roles where lower(btrim(email))=normalized_email and role='receptionist'
  ) then raise exception 'Director required for receptionist invitation' using errcode='42501'; end if;
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

-- Existing permissive policies (including linked-family/self access) must not
-- accidentally grant the new role access outside the explicit operational set.
-- No table grants are added. Owner-run audited RPCs/triggers continue to work.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public'
    and tablename not in ('profiles','students','groups','enrollments','placement_tests')
  loop
    execute format('create policy receptionist_deny on public.%I as restrictive for all to authenticated
      using (public.get_my_role() is distinct from ''receptionist'')
      with check (public.get_my_role() is distinct from ''receptionist'')', t.tablename);
  end loop;
end $$;

create policy receptionist_student_read on public.students for select to authenticated
  using (public.get_my_role()='receptionist' and deleted_at is null);
create policy receptionist_enrollment_read on public.enrollments for select to authenticated
  using (public.get_my_role()='receptionist' and exists (
    select 1 from public.students s where s.id=student_id and s.deleted_at is null));
-- groups already has an authenticated SELECT policy. No group writes are added.
create policy receptionist_placement_read on public.placement_tests for select to authenticated
  using (public.get_my_role()='receptionist');
create policy receptionist_placement_insert on public.placement_tests for insert to authenticated
  with check (public.get_my_role()='receptionist' and (student_id is null or exists (
    select 1 from public.students s where s.id=student_id and s.deleted_at is null)));
create policy receptionist_placement_update on public.placement_tests for update to authenticated
  using (public.get_my_role()='receptionist')
  with check (public.get_my_role()='receptionist' and (student_id is null or exists (
    select 1 from public.students s where s.id=student_id and s.deleted_at is null)));
-- No deletion or student-dossier mutation permissions are required by Phase 1.

-- Narrow enrollment write interface: no arbitrary columns, document/consent
-- mutations, deletion, financial writes, or creation of a confirmed enrollment.
-- Existing 070–074 triggers remain authoritative for academic consistency.
create function public.save_receptionist_enrollment(
  p_student uuid, p_enrollment uuid default null, p_group uuid default null,
  p_status text default 'Submitted', p_level text default null,
  p_date date default current_date, p_notes text default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$ declare
  s public.students%rowtype; e public.enrollments%rowtype; result uuid;
  g public.groups%rowtype; effective_session text; effective_level text;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
  -- Serialize against role changes using the same lock as role management.
  update role_security.director_guard set director_count=director_count where singleton;
  if public.get_my_role() is distinct from 'receptionist' then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found then raise exception 'Student unavailable' using errcode='23514'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id=p_enrollment for update;
    if not found or e.student_id is distinct from p_student then
      raise exception 'Enrollment unavailable' using errcode='23514';
    end if;
  end if;
  -- Resolve legacy NULLs from authoritative records, never as permission to
  -- skip compatibility checks. An explicit level can still select a new level,
  -- as in the existing assignment workflow; NULL cannot erase a known level.
  effective_session := coalesce(e.session_type, s.session_type);
  effective_level := coalesce(p_level, e.level, s.niveau_cefr);
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found or effective_session is null
      or g.session_type is distinct from effective_session then
      raise exception 'Enrollment group must match its session and level' using errcode='23514';
    end if;
    -- A group defines the level only when neither the enrollment nor student
    -- nor caller provides one. Persist it so 070–074 see complete assignment data.
    effective_level := coalesce(effective_level, g.niveau);
    if effective_level is null or g.niveau is distinct from effective_level then
      raise exception 'Enrollment group must match its session and level' using errcode='23514';
    end if;
  end if;
  if e.status in ('Confirmed','Validated') then
    -- Assignment of an already confirmed enrollment preserves its conversion
    -- boundary; receptionist cannot downgrade or independently confirm it.
    if p_group is null or p_status not in ('Confirmed','Validated') or p_status is null then
      raise exception 'Only group assignment is permitted' using errcode='42501';
    end if;
    update public.enrollments set group_id=p_group, level=effective_level,
      session_type=effective_session, status='Validated'
      where id=e.id returning id into result;
  else
    if p_status is null or p_status not in ('Submitted','Under Review','Trial')
      or (p_enrollment is not null and e.status not in ('Submitted','Under Review','Trial')) then
      raise exception 'Only operational pre-enrollment is permitted' using errcode='42501';
    end if;
    if p_enrollment is null then
      insert into public.enrollments(student_id,group_id,status,level,date_inscription,notes,session_type)
        values(p_student,p_group,p_status,effective_level,p_date,p_notes,effective_session) returning id into result;
    else
      update public.enrollments set group_id=p_group,status=p_status,level=effective_level,
        session_type=effective_session,date_inscription=p_date,notes=p_notes
        where id=e.id returning id into result;
    end if;
  end if;
  return result;
end $$;
revoke all on function public.save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text) to authenticated;

-- RLS cannot protect TRUNCATE. Preserve historical privileges for existing
-- roles, but prevent the new role inheriting this destructive SQL capability.
create function role_security.block_receptionist_truncate()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $$ begin
  if public.get_my_role()='receptionist' then
    raise exception 'Receptionist cannot truncate tables' using errcode='42501';
  end if;
  return null;
end $$;
revoke all on function role_security.block_receptionist_truncate() from public,anon,authenticated,service_role;
do $$ declare t record; begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage') and c.relkind='r'
      and has_table_privilege('authenticated',c.oid,'TRUNCATE')
  loop
    execute format('create trigger receptionist_no_truncate before truncate on %I.%I
      for each statement execute function role_security.block_receptionist_truncate()',t.nspname,t.relname);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
