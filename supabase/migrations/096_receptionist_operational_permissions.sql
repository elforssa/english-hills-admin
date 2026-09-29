-- Receptionist Batch 1: bounded operational access. No production activation.
begin;

create schema if not exists operational_security;
revoke all on schema operational_security from public, anon, authenticated, service_role;

create function operational_security.has_capability(p_capability text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p where p.id=auth.uid() and (
      (p_capability in ('manage_crm','manage_admissions','manage_placement','manage_students',
        'manage_groups','manage_academics','manage_finance_operations','manage_teacher_operations',
        'assign_group','record_attendance','edit_teacher_operations','manage_student_documents')
        and p.role in ('director','admin','receptionist'))
      or (p_capability in ('view_finance_analytics','manage_users','manage_system_settings',
        'view_teacher_compensation','manage_payroll','archive_students','manage_teacher_hr',
        'delete_academic_records') and p.role in ('director','admin'))
      or (p_capability in ('manage_integrations','view_marketing_analytics','correct_finance')
        and p.role='director')
    )
  )
$$;
create function operational_security.require_capability(p_capability text) returns void
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ begin
  if operational_security.has_capability(p_capability) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
end $$;
create function operational_security.require_receptionist() returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
  -- Share the role-transition serialization lock used by 077 before a write.
  update role_security.director_guard set director_count=director_count where singleton;
  if auth.uid() is null or not exists(select 1 from public.profiles p
      where p.id=auth.uid() and p.role='receptionist') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
end $$;
create function operational_security.assert_keys(p_payload jsonb,p_allowed text[]) returns void
language plpgsql immutable security invoker set search_path=pg_catalog,pg_temp as $$ begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or
    exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(p_allowed)) then
    raise exception 'Unsupported operational field' using errcode='22023';
  end if;
end $$;
create function operational_security.valid_session_level(p_session text,p_level text) returns boolean
language sql immutable security invoker set search_path=pg_catalog,pg_temp as $$
  select p_session in ('Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
    'One-to-One','Mise à niveau','Other') and (p_level is null or case
    when p_session='Yearly' then p_level='Pre-Child' or p_level ~ '^(Child|Junior) [1-6]$'
    when p_session='Adults' then p_level ~ '^(Beginning|Intermediate) [1-6]$' or p_level ~ '^Advanced [1-5]$'
    else p_level in ('A1','A2','B1','B2','C1','C2') end)
$$;
revoke all on all functions in schema operational_security from public,anon,authenticated,service_role;

-- Selected 077 restrictive policies become command-specific denials. Existing
-- permissive family/teacher policies are preserved and cannot grant writes to
-- receptionist through the restrictive non-SELECT policies below.
do $$ declare t text; begin
  foreach t in array array['receipts','charges','assessments','authorized_adults',
    'premium_groups','premium_group_memberships','premium_sessions','premium_attendance'] loop
    execute format('drop policy if exists receptionist_deny on public.%I',t);
    execute format('create policy receptionist_insert_deny on public.%I as restrictive for insert to authenticated with check (public.get_my_role() is distinct from ''receptionist'')',t);
    execute format('create policy receptionist_update_deny on public.%I as restrictive for update to authenticated using (public.get_my_role() is distinct from ''receptionist'') with check (public.get_my_role() is distinct from ''receptionist'')',t);
    execute format('create policy receptionist_delete_deny on public.%I as restrictive for delete to authenticated using (public.get_my_role() is distinct from ''receptionist'')',t);
  end loop;
end $$;
create policy receptionist_receipt_read on public.receipts for select to authenticated
  using (public.get_my_role()='receptionist' and student_id in
    (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_charge_read on public.charges for select to authenticated
  using (public.get_my_role()='receptionist' and student_id in
    (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_assessment_read on public.assessments for select to authenticated
  using (public.get_my_role()='receptionist' and student_id in
    (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_authorized_adult_read on public.authorized_adults for select to authenticated
  using (public.get_my_role()='receptionist' and student_id in
    (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_premium_group_read on public.premium_groups for select to authenticated
  using (public.get_my_role()='receptionist');
create policy receptionist_premium_membership_read on public.premium_group_memberships for select to authenticated
  using (public.get_my_role()='receptionist');
create policy receptionist_premium_session_read on public.premium_sessions for select to authenticated
  using (public.get_my_role()='receptionist');
create policy receptionist_premium_attendance_read on public.premium_attendance for select to authenticated
  using (public.get_my_role()='receptionist');

drop policy if exists receptionist_deny on public.attendance;
create policy receptionist_attendance_read on public.attendance for select to authenticated
  using (public.get_my_role()='receptionist' and exists(select 1 from public.students s
    where s.id=student_id and s.deleted_at is null));
create policy receptionist_attendance_insert on public.attendance for insert to authenticated
  with check (public.get_my_role()='receptionist' and exists(select 1 from public.students s
    where s.id=student_id and s.deleted_at is null));
create policy receptionist_attendance_update on public.attendance for update to authenticated
  using (public.get_my_role()='receptionist' and exists(select 1 from public.students s
    where s.id=student_id and s.deleted_at is null))
  with check (public.get_my_role()='receptionist' and exists(select 1 from public.students s
    where s.id=student_id and s.deleted_at is null));
create policy receptionist_attendance_delete_deny on public.attendance as restrictive for delete to authenticated
  using (public.get_my_role() is distinct from 'receptionist');

-- No teacher base-table grant: fixed typed operational projection only.
create or replace function public.get_teacher_directory(p_teacher_id uuid default null)
returns table(id uuid,full_name text,email text) language plpgsql stable security definer
set search_path=pg_catalog,pg_temp as $$ begin
  if auth.uid() is null or (public.get_my_role() in
    ('parent','student','teacher','admin','director','receptionist')) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  return query select t.id,t.full_name,t.email from public.teachers t
    where t.deleted_at is null and (p_teacher_id is null or t.id=p_teacher_id);
end $$;
create function public.get_teacher_operations(p_teacher_id uuid default null,
  p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,full_name text,email text,telephone text,certifications text[],
  niveaux_autorises text[],photo_url text,updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ begin
  perform operational_security.require_capability('manage_teacher_operations');
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then
    raise exception 'Invalid teacher page' using errcode='22023';
  end if;
  return query select t.id,t.full_name,t.email,t.telephone,t.certifications,
    t.niveaux_autorises,t.photo_url,t.updated_at
  from public.teachers t where t.deleted_at is null and (p_teacher_id is null or t.id=p_teacher_id)
  order by t.full_name,t.id limit p_limit offset p_offset;
end $$;
create function public.save_receptionist_teacher_operations(p_teacher uuid,p_expected_updated_at timestamptz,p_changes jsonb)
returns table(id uuid,updated_at timestamptz) language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$ declare t public.teachers%rowtype; begin
  perform operational_security.require_receptionist();
  perform operational_security.assert_keys(p_changes,array['full_name','telephone','certifications','niveaux_autorises']);
  if p_changes='{}'::jsonb or p_expected_updated_at is null then raise exception 'Missing changes/version' using errcode='22023'; end if;
  select * into t from public.teachers where teachers.id=p_teacher and deleted_at is null for update;
  if not found or t.updated_at is distinct from p_expected_updated_at then
    raise exception 'Teacher unavailable or stale' using errcode='40001';
  end if;
  update public.teachers set
    full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else t.full_name end,
    telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else t.telephone end,
    certifications=case when p_changes ? 'certifications' then
      array(select jsonb_array_elements_text(p_changes->'certifications')) else t.certifications end,
    niveaux_autorises=case when p_changes ? 'niveaux_autorises' then
      array(select jsonb_array_elements_text(p_changes->'niveaux_autorises')) else t.niveaux_autorises end
  where teachers.id=p_teacher returning teachers.id,teachers.updated_at into id,updated_at;
  return next;
end $$;

-- Dossier create and bounded edit. Portal identity and enrollment fields are absent
-- from the update allowlist, even when a caller sends an entire Student object.
create function public.save_receptionist_student(p_student uuid,p_expected_updated_at timestamptz,p_changes jsonb)
returns table(id uuid,updated_at timestamptz) language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$ declare s public.students%rowtype; begin
  perform operational_security.require_receptionist();
  if p_student is null then raise exception 'Stable student id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone','email',
      'parent_email','age_category','notes','session_type','niveau_cefr','referral_source','photo_url']);
    if nullif(btrim(p_changes->>'full_name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau_cefr') is not true then
      raise exception 'Invalid session/level' using errcode='22023'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    insert into public.students(id,full_name,date_naissance,telephone,email,parent_email,age_category,
      notes,session_type,niveau_cefr,referral_source,photo_url,status,plan_type)
    values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
      p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
      p_changes->>'photo_url','Enrolled','Standard') on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Enrolled' or s.plan_type is distinct from 'Standard' or
        s.full_name is distinct from p_changes->>'full_name' or
        s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
        s.telephone is distinct from p_changes->>'telephone' or
        s.email is distinct from p_changes->>'email' or s.parent_email is distinct from p_changes->>'parent_email' or
        s.age_category is distinct from p_changes->>'age_category' or s.notes is distinct from p_changes->>'notes' or
        s.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        s.niveau_cefr is distinct from p_changes->>'niveau_cefr' or
        s.referral_source is distinct from p_changes->>'referral_source' or
        s.photo_url is distinct from p_changes->>'photo_url' then
        raise exception 'Student create identity conflict' using errcode='23505'; end if;
      id:=s.id; updated_at:=s.updated_at;
    end if;
  else
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='40001'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $$;

create function public.save_receptionist_group(p_group uuid,p_expected_updated_at timestamptz,p_changes jsonb)
returns table(id uuid,updated_at timestamptz) language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$ declare g public.groups%rowtype;
  v_teacher uuid; v_session text; v_level text; begin
  perform operational_security.require_receptionist();
  if p_group is null then raise exception 'Stable group id required' using errcode='22023'; end if;
  perform operational_security.assert_keys(p_changes,array['name','langue','session_type','niveau','teacher_id',
    'salle','jours','horaire','capacite_max','terme','annee','categorie']);
  v_teacher:=nullif(p_changes->>'teacher_id','')::uuid;
  if p_changes ? 'teacher_id' and v_teacher is not null and not exists(
    select 1 from public.teachers t where t.id=v_teacher and t.deleted_at is null) then
    raise exception 'Teacher unavailable' using errcode='23514'; end if;
  if p_expected_updated_at is null then
    if nullif(btrim(p_changes->>'name'),'') is null or p_changes->>'niveau' is null then
      raise exception 'Group name and level required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau') is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    insert into public.groups(id,name,langue,session_type,niveau,teacher_id,salle,jours,horaire,
      capacite_max,terme,annee,categorie)
    values(p_group,p_changes->>'name',coalesce(p_changes->>'langue','Anglais'),
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau',v_teacher,
      p_changes->>'salle',p_changes->>'jours',p_changes->>'horaire',
      coalesce((p_changes->>'capacite_max')::integer,12),p_changes->>'terme',
      p_changes->>'annee',p_changes->>'categorie') on conflict on constraint groups_pkey do nothing
    returning groups.id,groups.updated_at into id,updated_at;
    if id is null then
      select * into g from public.groups where groups.id=p_group for update;
      if g.name is distinct from p_changes->>'name' or
        g.langue is distinct from coalesce(p_changes->>'langue','Anglais') or
        g.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        g.niveau is distinct from p_changes->>'niveau' or g.teacher_id is distinct from v_teacher or
        g.salle is distinct from p_changes->>'salle' or g.jours is distinct from p_changes->>'jours' or
        g.horaire is distinct from p_changes->>'horaire' or
        g.capacite_max is distinct from coalesce((p_changes->>'capacite_max')::integer,12) or
        g.terme is distinct from p_changes->>'terme' or g.annee is distinct from p_changes->>'annee' or
        g.categorie is distinct from p_changes->>'categorie' then
        raise exception 'Group create identity conflict' using errcode='23505'; end if;
      id:=g.id; updated_at:=g.updated_at;
    end if;
  else
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into g from public.groups where groups.id=p_group for update;
    if not found or g.updated_at is distinct from p_expected_updated_at then
      raise exception 'Group unavailable or stale' using errcode='40001'; end if;
    v_session:=case when p_changes ? 'session_type' then p_changes->>'session_type' else g.session_type end;
    v_level:=case when p_changes ? 'niveau' then p_changes->>'niveau' else g.niveau end;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and
      operational_security.valid_session_level(v_session,v_level) is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and (
      exists(select 1 from public.enrollments e where e.group_id=p_group and e.status in ('Trial','Confirmed','Validated'))
      or exists(select 1 from public.students s where s.groupe_id=p_group and s.deleted_at is null)) then
      raise exception 'Reassign learners before changing group session or level' using errcode='23514'; end if;
    update public.groups set
      name=case when p_changes ? 'name' then p_changes->>'name' else g.name end,
      langue=case when p_changes ? 'langue' then p_changes->>'langue' else g.langue end,
      session_type=v_session,niveau=v_level,
      teacher_id=case when p_changes ? 'teacher_id' then v_teacher else g.teacher_id end,
      salle=case when p_changes ? 'salle' then p_changes->>'salle' else g.salle end,
      jours=case when p_changes ? 'jours' then p_changes->>'jours' else g.jours end,
      horaire=case when p_changes ? 'horaire' then p_changes->>'horaire' else g.horaire end,
      capacite_max=case when p_changes ? 'capacite_max' then (p_changes->>'capacite_max')::integer else g.capacite_max end,
      terme=case when p_changes ? 'terme' then p_changes->>'terme' else g.terme end,
      annee=case when p_changes ? 'annee' then p_changes->>'annee' else g.annee end,
      categorie=case when p_changes ? 'categorie' then p_changes->>'categorie' else g.categorie end
    where groups.id=p_group returning groups.id,groups.updated_at into id,updated_at;
  end if;
  return next;
end $$;

-- Replace the old public overload in the same transaction so PostgREST cannot
-- resolve an ambiguous seven-argument call. Existing named calls use defaults.
drop function public.save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text);
create function public.save_receptionist_enrollment(
  p_student uuid,p_enrollment uuid default null,p_group uuid default null,
  p_status text default 'Submitted',p_level text default null,p_date date default current_date,
  p_notes text default null,p_session text default null,p_school_year text default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype;
  result uuid; effective_session text; effective_level text; effective_year text;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found then raise exception 'Student unavailable' using errcode='23514'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id=p_enrollment for update;
    if not found or e.student_id is distinct from p_student then
      raise exception 'Enrollment unavailable' using errcode='23514'; end if;
  end if;
  if e.id is not null and (
    (e.session_type is not null and p_session is not null and p_session<>e.session_type) or
    (e.school_year is not null and p_school_year is not null and p_school_year<>e.school_year)) then
    raise exception 'Existing enrollment session/year is immutable' using errcode='42501'; end if;
  effective_session:=coalesce(e.session_type,p_session,s.session_type);
  effective_year:=coalesce(e.school_year,p_school_year);
  effective_level:=coalesce(p_level,e.level,s.niveau_cefr);
  if effective_session not in ('Yearly','Adults','Summer Camp','Communication Junior',
      'Communication Adult','One-to-One','Mise à niveau','Other') or
    (effective_year is not null and effective_year !~ '^[0-9]{4}/[0-9]{4}$') then
    raise exception 'Invalid enrollment session/year' using errcode='22023'; end if;
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found or g.session_type is distinct from effective_session then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
    effective_level:=coalesce(effective_level,g.niveau);
    if g.niveau is distinct from effective_level then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
  end if;
  if e.status in ('Confirmed','Validated') then
    if p_group is null or p_status not in ('Confirmed','Validated') then
      raise exception 'Only group assignment is permitted' using errcode='42501'; end if;
    update public.enrollments set group_id=p_group,level=effective_level,
      session_type=effective_session,status='Validated'
    where id=e.id returning id into result;
  else
    if p_status is null or p_status not in ('Submitted','Under Review','Trial') or
      (p_enrollment is not null and e.status not in ('Submitted','Under Review','Trial')) then
      raise exception 'Only operational pre-enrollment is permitted' using errcode='42501'; end if;
    if p_enrollment is null then
      insert into public.enrollments(student_id,group_id,status,level,date_inscription,notes,session_type,school_year)
      values(p_student,p_group,p_status,effective_level,p_date,p_notes,effective_session,effective_year)
      returning id into result;
    else
      update public.enrollments set group_id=p_group,status=p_status,level=effective_level,
        session_type=effective_session,school_year=effective_year,date_inscription=p_date,notes=p_notes
      where id=e.id returning id into result;
    end if;
  end if;
  return result;
end $$;

create function public.assign_receptionist_student_group(p_student uuid,p_enrollment uuid,p_group uuid,
  p_student_updated_at timestamptz,p_enrollment_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; v_count integer;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found or p_student_updated_at is null or s.updated_at is distinct from p_student_updated_at then
    raise exception 'Student unavailable or stale' using errcode='40001'; end if;
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found then raise exception 'Group unavailable' using errcode='23514'; end if;
  end if;
  if p_enrollment is null then
    if exists(select 1 from public.enrollments where student_id=p_student and status<>'Rejected'
      and (group_id=s.groupe_id or (group_id is null and p_group is not null))) then
      raise exception 'Select an enrollment explicitly' using errcode='23514'; end if;
    if p_group is not null and (g.session_type is distinct from s.session_type or
      g.niveau is distinct from s.niveau_cefr) then
      raise exception 'Group must match dossier session/level' using errcode='23514'; end if;
    update public.students set groupe_id=p_group where id=p_student;
    return null;
  end if;
  select * into e from public.enrollments where id=p_enrollment and student_id=p_student for update;
  if not found or p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at then
    raise exception 'Enrollment unavailable or stale' using errcode='40001'; end if;
  if p_group is null then
    if e.group_id is null then return e.id; end if;
    select count(*) into v_count from public.enrollments
      where student_id=p_student and group_id=e.group_id and status in ('Validated','Trial');
    if v_count>1 then raise exception 'Multiple memberships require separate selection' using errcode='23514'; end if;
    if e.status in ('Validated','Trial') then
      perform public.remove_student_group(p_student,e.group_id);
    elsif e.status in ('Submitted','Under Review') then
      perform public.save_receptionist_enrollment(p_student,e.id,null,e.status,e.level,
        e.date_inscription,e.notes,e.session_type,e.school_year);
    else raise exception 'Removal unavailable' using errcode='42501'; end if;
    return e.id;
  end if;
  if g.session_type is distinct from coalesce(e.session_type,s.session_type) or
    g.niveau is distinct from coalesce(e.level,s.niveau_cefr) then
    raise exception 'Enrollment group must match session/level' using errcode='23514'; end if;
  perform public.save_receptionist_enrollment(p_student,e.id,p_group,e.status,e.level,
    e.date_inscription,e.notes,e.session_type,e.school_year);
  return e.id;
end $$;
-- Existing 084 wrapper; only authorization gate changes.
CREATE OR REPLACE FUNCTION public.create_charge_payment(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_charge public.charges%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_requested_id uuid := nullif(p_payload->>'enrollment_id','')::uuid;
  v_enrollment_id uuid;
  v_prior_request public.financial_requests%rowtype;
  v_crm_matches integer;
begin
  -- Same staff boundary as the inner financial command; never trust caller roles.
  perform operational_security.require_capability('manage_finance_operations');
  -- Payments share this lock with other payments, preserving the existing
  -- financial idempotency/charge serialization. CRM linkage takes it exclusively.
  if nullif(p_payload->>'student_id','') is not null and not pg_try_advisory_xact_lock_shared(
    hashtextextended('crm:enrollment-intent:'||(p_payload->>'student_id')::uuid,0)) then
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='40001';
  end if;
  -- Lock before inner charge/receipt foreign-key reads to avoid lock upgrades
  -- between simultaneous payments for the same student. Existing locks remain.
  perform 1 from public.students where id=nullif(p_payload->>'student_id','')::uuid for update;
  -- The inner function enforces staff authorization, payment validation and
  -- idempotency before the wrapper makes any academic changes.
  v_result := public.create_charge_payment_financial(p_payload);
  if coalesce((v_result->>'replayed')::boolean, false) then
    select * into v_prior_request from public.financial_requests
    where idempotency_key = (p_payload->>'idempotency_key')::uuid;
    if v_prior_request.requested_enrollment_id is distinct from v_requested_id then
      raise exception 'Idempotency key conflict: selected enrollment changed.';
    end if;
    return v_result;
  end if;
  update public.financial_requests set requested_enrollment_id = v_requested_id
  where idempotency_key = (p_payload->>'idempotency_key')::uuid;
  if (v_result->>'receipt_id') is null then
    return v_result;
  end if;

  select * into v_charge from public.charges
  where id = (v_result->>'charge_id')::uuid for update;
  if nullif(p_payload->>'student_id','') is null then
    update public.students set session_type = v_charge.session_type,
      niveau_cefr = coalesce(v_charge.level, niveau_cefr)
    where id = v_charge.student_id;
  end if;
  -- Every newly issued receipt enrolls its student. Historical receipts and
  -- idempotent retries are not rewritten or used to reactivate archived records.
  update public.students set status = 'Enrolled' where id = v_charge.student_id;
  v_result := v_result || jsonb_build_object('student_enrolled', true);
  if v_charge.session_type = 'Other' or v_charge.legacy then
    if v_requested_id is not null then
      raise exception 'This service cannot be linked to a tuition enrollment.';
    end if;
    return v_result;
  end if;

  -- Lock the student across different charges in the same request period.
  perform 1 from public.students where id = v_charge.student_id for update;
  if v_charge.enrollment_id is not null and v_requested_id is not null
    and v_charge.enrollment_id <> v_requested_id then
    raise exception 'Charge is already linked to another enrollment.';
  end if;
  v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

  if v_enrollment_id is not null then
    select * into v_enrollment from public.enrollments
    where id = v_enrollment_id for update;
    if not found or v_enrollment.student_id is distinct from v_charge.student_id
      or v_enrollment.status = 'Rejected'
      or (v_enrollment.session_type is not null
          and v_enrollment.session_type <> v_charge.session_type)
      or (v_enrollment.school_year is not null and v_charge.school_year is not null
          and v_enrollment.school_year <> v_charge.school_year) then
      raise exception 'Selected enrollment does not match this student, session and school year.';
    end if;
    update public.enrollments set
      session_type = v_charge.session_type,
      school_year = coalesce(v_charge.school_year, v_enrollment.school_year),
      level = coalesce(v_enrollment.level, v_charge.level),
      status = case
        when status in ('Submitted','Under Review') then
          case when group_id is null then 'Confirmed' else 'Validated' end
        when status = 'Trial' then 'Validated'
        else status end
    where id = v_enrollment_id;
  else
    -- Guard only the implicit tuition-enrollment creation branch. Explicit charge
    -- or request links retain 074 validation. Exceptions roll back the entire
    -- inner financial transaction, including receipt/event/student side effects.
    select count(*) into v_crm_matches
    from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id
    join public.students s on s.id=e.student_id
    where e.student_id=v_charge.student_id and s.deleted_at is null
      and e.status is distinct from 'Rejected' and l.merged_into_lead_id is null
      and coalesce(e.session_type,s.session_type)=v_charge.session_type
      -- Unknown year on an old charge cannot establish a distinct intent.
      and (v_charge.school_year is null or crm_security.enrollment_year(e)=v_charge.school_year);
    if v_crm_matches>0 then
      raise exception '%',case when v_crm_matches=1
        then 'Une inscription CRM existe pour ce programme et cette année. Sélectionnez-la avant d’enregistrer le paiement.'
        else 'Plusieurs inscriptions CRM correspondent. Sélectionnez explicitement l’inscription à payer.' end
        using errcode='22023';
    end if;
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, 'Confirmed', current_date,
            v_charge.session_type, v_charge.school_year, v_charge.level)
    returning id into v_enrollment_id;
  end if;

  update public.charges set enrollment_id = v_enrollment_id
  where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
  update public.receipts set enrollment_id = v_enrollment_id
  where id = (v_result->>'receipt_id')::uuid;
  select * into v_enrollment from public.enrollments where id = v_enrollment_id;
  return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
                                       'enrollment_confirmed', true,
                                       'group_pending', v_enrollment.group_id is null);
end;
$function$;

-- Renamed 057 inner transaction; receptionist may update phone, never existing portal email.
CREATE OR REPLACE FUNCTION public.create_charge_payment_financial(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_student public.students%rowtype;
  v_charge public.charges%rowtype;
  v_receipt public.receipts%rowtype;
  v_existing public.financial_requests%rowtype;
  v_student_id uuid := nullif(p_payload->>'student_id','')::uuid;
  v_charge_id uuid := nullif(p_payload->>'charge_id','')::uuid;
  v_key uuid := (p_payload->>'idempotency_key')::uuid;
  v_session text := nullif(btrim(p_payload->>'session_type'),'');
  v_school_year text := nullif(btrim(p_payload->>'school_year'),'');
  v_service_detail text := nullif(btrim(p_payload->>'service_detail'),'');
  v_service text;
  v_plan text := nullif(btrim(p_payload->>'plan_type'),'');
  v_level text := nullif(btrim(p_payload->>'level'),'');
  v_student_name text := nullif(btrim(p_payload->>'student_name'),'');
  v_phone text := nullif(btrim(p_payload->>'phone'),'');
  v_student_email text := nullif(lower(btrim(p_payload->>'student_email')),'');
  v_parent_email text := nullif(lower(btrim(p_payload->>'parent_email')),'');
  v_update_contacts boolean := coalesce((p_payload->>'update_contacts')::boolean, false);
  v_request_email boolean := coalesce((p_payload->>'request_email')::boolean, false);
  v_email_recipient text := nullif(lower(btrim(p_payload->>'email_recipient')),'');
  v_gross numeric(12,2) := round(coalesce(nullif(p_payload->>'gross_amount','')::numeric, 0), 2);
  v_discount numeric(12,2) := round(coalesce(nullif(p_payload->>'discount_amount','')::numeric, 0), 2);
  v_payment numeric(12,2) := round(coalesce(nullif(p_payload->>'payment_amount','')::numeric, 0), 2);
  v_due_date date := nullif(p_payload->>'due_date','')::date;
  v_payment_date date := coalesce(nullif(p_payload->>'payment_date','')::date,current_date);
  v_payment_method text := nullif(btrim(p_payload->>'payment_method'),'');
  v_transaction_reference text := nullif(btrim(p_payload->>'transaction_reference'),'');
  v_note text := nullif(btrim(p_payload->>'note'),'');
  v_normalized_request jsonb;
  v_request_fingerprint text;
  v_paid numeric(12,2);
  v_net numeric(12,2);
  v_balance numeric(12,2);
  v_status text;
  v_actor_name text;
  v_new_charge boolean := false;
begin
  perform operational_security.require_capability('manage_finance_operations');
  if v_key is null then raise exception 'An idempotency key is required.'; end if;
  if v_payment < 0 then raise exception 'Payment amount cannot be negative.'; end if;
  if v_payment = 0 then
    v_request_email := false;
    v_email_recipient := null;
  end if;
  if not v_request_email then v_email_recipient := null; end if;
  if v_request_email and (
    v_email_recipient is null
    or v_email_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'A valid email recipient is required when email delivery is requested.';
  end if;
  if v_charge_id is null and v_session <> 'Yearly' and v_plan <> 'Premium' then
    v_plan := null;
  end if;

  v_normalized_request := jsonb_strip_nulls(jsonb_build_object(
    'student_id',v_student_id,
    'student_name',case when v_student_id is null then v_student_name end,
    'phone',case when v_student_id is null or v_update_contacts then v_phone end,
    'student_email',case when v_student_id is null or v_update_contacts then v_student_email end,
    'parent_email',case when v_student_id is null or v_update_contacts then v_parent_email end,
    'update_contacts',case when v_student_id is not null then v_update_contacts else false end,
    'charge_id',v_charge_id,
    'session_type',case when v_charge_id is null then v_session end,
    'school_year',case when v_charge_id is null then v_school_year end,
    'service_detail',case when v_charge_id is null and v_session = 'Other' then v_service_detail end,
    'plan_type',case when v_charge_id is null then v_plan end,
    'level',case when v_charge_id is null then v_level end,
    'gross_amount',case when v_charge_id is null then v_gross end,
    'discount_amount',case when v_charge_id is null then v_discount end,
    'due_date',case when v_charge_id is null then v_due_date end,
    'payment_amount',v_payment,
    'payment_date',v_payment_date,
    'payment_method',v_payment_method,
    'transaction_reference',v_transaction_reference,
    'note',v_note,
    'request_email',v_request_email,
    'email_recipient',case when v_request_email then v_email_recipient end
  ));
  v_request_fingerprint := encode(extensions.digest(v_normalized_request::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtext(v_key::text));
  select * into v_existing from public.financial_requests where idempotency_key = v_key;
  if found then
    if v_existing.actor_id is distinct from v_actor then
      raise exception 'Idempotency key conflict: this key belongs to another actor.';
    end if;
    if v_existing.request_fingerprint is distinct from v_request_fingerprint then
      raise exception 'Idempotency key conflict: request contents changed.';
    end if;
    return jsonb_build_object('charge_id',v_existing.charge_id,'receipt_id',v_existing.receipt_id,'replayed',true);
  end if;

  if v_student_id is null then
    if char_length(coalesce(v_student_name,'')) < 2 then raise exception 'Student name is required.'; end if;
    insert into public.students(full_name, telephone, email, parent_email, status)
    values (v_student_name, v_phone, v_student_email, v_parent_email, 'Prospect')
    returning * into v_student;
    v_student_id := v_student.id;
  else
    select * into v_student from public.students where id = v_student_id and deleted_at is null;
    if not found then raise exception 'Student not found.'; end if;
    if v_update_contacts then
      if public.get_my_role()='receptionist' and
        (v_student_email is distinct from v_student.email or v_parent_email is distinct from v_student.parent_email) then
        raise exception 'Contact identity cannot be changed' using errcode='42501';
      end if;
      update public.students set telephone=v_phone,email=v_student_email,parent_email=v_parent_email
      where id=v_student_id returning * into v_student;
    end if;
  end if;

  if v_charge_id is null then
    if v_session is null or v_school_year is null then
      raise exception 'Session and school year are required for a new charge.';
    end if;
    if v_school_year !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Invalid school year.'; end if;
    if v_session = 'Yearly' and (v_plan in ('Standard','Premium')) is not true then
      raise exception 'A Yearly charge requires Standard or Premium.';
    elsif v_session <> 'Yearly' and v_plan = 'Premium' then
      raise exception 'Premium is available only for Yearly charges.';
    elsif v_session <> 'Yearly' then
      v_plan := null;
    end if;
    if v_session = 'Other' and char_length(coalesce(v_service_detail,'')) < 3 then
      raise exception 'A service description is required for Other.';
    end if;
    if char_length(coalesce(v_service_detail,'')) > 120 then raise exception 'Service description is too long.'; end if;
    if v_gross < 0 or v_discount < 0 or v_discount > v_gross then raise exception 'Invalid price or discount.'; end if;

    v_service := case
      when v_session = 'Other' then concat_ws(' · ', 'Autre', v_service_detail, v_school_year)
      when v_session = 'Yearly' then concat_ws(' · ', v_session, v_plan, v_school_year)
      else concat_ws(' · ', v_session, v_school_year)
    end;
    insert into public.charges(student_id,session_type,school_year,service_description,plan_type,
      level,gross_amount,discount_amount,due_date,created_by)
    values (v_student_id,v_session,v_school_year,v_service,v_plan,v_level,v_gross,v_discount,v_due_date,v_actor)
    returning * into v_charge;
    v_new_charge := true;
  else
    select * into v_charge from public.charges
    where id=v_charge_id and student_id=v_student_id and voided_at is null for update;
    if not found then raise exception 'Open charge not found for this student.'; end if;
  end if;

  v_net := v_charge.gross_amount - v_charge.discount_amount;
  select coalesce(sum(montant_paye),0) into v_paid from public.receipts
  where charge_id=v_charge.id and voided_at is null and deleted_at is null;
  v_balance := round(v_net-v_paid,2);
  if v_payment > v_balance then raise exception 'Payment exceeds the remaining balance of % MAD.', v_balance; end if;

  insert into public.financial_requests(idempotency_key,actor_id,request_fingerprint,charge_id)
  values (v_key,v_actor,v_request_fingerprint,v_charge.id);
  if v_new_charge then
    insert into public.financial_events(event_type,charge_id,actor_id,metadata)
    values ('charge_created',v_charge.id,v_actor,jsonb_build_object('gross_amount',v_charge.gross_amount,'discount_amount',v_charge.discount_amount,'school_year',v_charge.school_year));
  end if;
  if v_payment = 0 then
    return jsonb_build_object('charge_id',v_charge.id,'receipt_id',null,'balance',v_balance,'replayed',false);
  end if;

  v_balance := round(v_balance-v_payment,2);
  v_status := case when v_balance=0 then 'Soldé' when v_charge.due_date<current_date then 'En retard' else 'Acompte versé' end;
  select coalesce(full_name,email) into v_actor_name from public.profiles where id=v_actor;
  insert into public.receipts(
    student_id,charge_id,date,nom_prenom,telephone,email,date_naissance,
    session_type,plan_type,niveau,school_year_snapshot,service_description,montant_total,remise,
    montant_paye,mode_paiement,statut_paiement,transaction_reference,payment_note,observation,
    actor_id,actor_name,gross_amount_snapshot,discount_amount_snapshot,net_amount_snapshot,
    paid_before_snapshot,balance_after_snapshot,idempotency_key,email_delivery_status
  ) values (
    v_student.id,v_charge.id,v_payment_date,v_student.full_name,v_student.telephone,
    coalesce(v_email_recipient,v_student.parent_email,v_student.email),v_student.date_naissance,
    v_charge.session_type,v_charge.plan_type,v_charge.level,v_charge.school_year,v_charge.service_description,
    v_charge.gross_amount,case when v_charge.gross_amount=0 then 0 else round(v_charge.discount_amount*100/v_charge.gross_amount,2) end,
    v_payment,v_payment_method,v_status,v_transaction_reference,v_note,v_note,v_actor,v_actor_name,
    v_charge.gross_amount,v_charge.discount_amount,v_net,v_paid,v_balance,v_key,
    case when v_request_email then 'pending' else 'skipped' end
  ) returning * into v_receipt;
  update public.financial_requests set receipt_id=v_receipt.id where idempotency_key=v_key;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_recorded',v_charge.id,v_receipt.id,v_actor,jsonb_build_object('amount',v_payment,'balance_after',v_balance,'email_requested',v_request_email));
  return jsonb_build_object('charge_id',v_charge.id,'receipt_id',v_receipt.id,'balance',v_balance,'replayed',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.receipt_enrollment_candidates(p_student uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare result jsonb; begin
 perform operational_security.require_capability('manage_finance_operations');
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,
  'session_type',case when linked.yes then coalesce(e.session_type,s.session_type) else e.session_type end,
  'school_year',case when linked.yes then crm_security.enrollment_year(e) else e.school_year end,
  'group_id',e.group_id,'date_inscription',e.date_inscription,'crm_linked',linked.yes)
  order by e.created_at desc,e.id),'[]'::jsonb) into result
 from public.enrollments e join public.students s on s.id=e.student_id
 cross join lateral(select exists(select 1 from public.crm_leads l where l.enrollment_id=e.id and l.merged_into_lead_id is null
  and e.status is distinct from 'Rejected') yes) linked
 where e.student_id=p_student and s.deleted_at is null;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.retry_receipt_email(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_receipt public.receipts%rowtype;
  edge_url text;
  auth_token text;
  request_id bigint;
begin
  perform operational_security.require_capability('manage_finance_operations');
  select * into v_receipt from public.receipts where id=p_receipt_id for update;
  if not found then raise exception 'Receipt not found.'; end if;
  if v_receipt.email_delivery_status = 'unknown' then
    raise exception 'Historical delivery is unknown and cannot be replayed automatically.';
  end if;
  if v_receipt.email_delivery_status = 'sent' then
    raise exception 'Receipt email is already marked sent.';
  end if;
  if v_receipt.voided_at is not null or v_receipt.deleted_at is not null then
    update public.receipts set email_delivery_status='skipped',
      email_last_error='Receipt was voided before delivery.' where id=p_receipt_id;
    return jsonb_build_object('receipt_id',p_receipt_id,'queued',false,'skipped',true);
  end if;
  if v_receipt.email is null then
    update public.receipts set email_delivery_status='skipped',
      email_last_error='No email address on receipt.' where id=p_receipt_id;
    return jsonb_build_object('receipt_id',p_receipt_id,'queued',false,'skipped',true);
  end if;
  if v_receipt.email_delivery_status = 'queued'
     and v_receipt.email_last_attempted_at > now() - interval '15 minutes' then
    raise exception 'Receipt email is already queued.';
  end if;

  select decrypted_secret into auth_token from vault.decrypted_secrets where name='receipt_webhook_token';
  select decrypted_secret into edge_url from vault.decrypted_secrets where name='receipt_webhook_url';
  if nullif(auth_token,'') is null or nullif(edge_url,'') is null then
    update public.receipts set email_delivery_status='failed',
      email_attempt_count=email_attempt_count+1, email_last_attempted_at=now(),
      email_last_error='Receipt email webhook is not configured.' where id=p_receipt_id;
    return jsonb_build_object('receipt_id',p_receipt_id,'queued',false,'configuration_error',true);
  end if;

  begin
    select net.http_post(url=>edge_url,
      headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||auth_token),
      body=>jsonb_build_object('type','RETRY','table','receipts','schema','public','record',row_to_json(v_receipt)))
      into request_id;
  exception when others then
    update public.receipts set email_delivery_status='failed',
      email_attempt_count=email_attempt_count+1, email_last_attempted_at=now(),
      email_last_error=left(sqlerrm,500)
    where id=p_receipt_id;
    return jsonb_build_object('receipt_id',p_receipt_id,'queued',false,'queue_error',true);
  end;
  update public.receipts
  set email_delivery_status='queued', email_request_id=request_id,
      email_attempt_count=email_attempt_count+1, email_last_attempted_at=now(),
      email_last_error=null
  where id=p_receipt_id;
  if v_receipt.charge_id is not null then
    insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
    values ('email_retry_queued',v_receipt.charge_id,p_receipt_id,auth.uid(),
      jsonb_build_object('request_id',request_id));
  end if;
  return jsonb_build_object('receipt_id',p_receipt_id,'queued',true,'request_id',request_id);
end $function$;

CREATE OR REPLACE FUNCTION public.search_students_page(p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_age_category text DEFAULT ''::text, p_session text DEFAULT ''::text, p_level text DEFAULT ''::text, p_incomplete boolean DEFAULT false, p_source text DEFAULT ''::text, p_plan text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_group text DEFAULT ''::text, p_payment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120
    or coalesce(p_payment, '') not in ('', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none') then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and public.get_my_role()='receptionist' then
    raise exception 'Student export forbidden' using errcode='42501';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;

  with finance as materialized (
    select c.student_id,
      count(*) as charge_count,
      sum(c.balance)::numeric(12,2) as payment_balance,
      bool_or(c.balance > 0 and c.settlement_status = 'En retard') as has_overdue,
      bool_or(c.balance > 0 and c.paid_amount > 0) as has_partial
    from public.charge_balances c
    where c.voided_at is null
    group by c.student_id
  ), candidates as materialized (
    select s.*,
      (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments,
      coalesce(f.payment_balance, 0)::numeric(12,2) as payment_balance,
      case
        when f.charge_count is null then 'Aucun engagement'
        when f.payment_balance <= 0 then 'Soldé'
        when f.has_overdue then 'En retard'
        when f.has_partial then 'Acompte versé'
        else 'En attente'
      end as payment_status
    from public.students s
    left join finance f on f.student_id = s.id
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial','Alumni'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (s.groupe_id is null or exists (
        select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null))))
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    and (coalesce(p_source,'') = '' or s.referral_source = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0)
  ), filtered as materialized (
    select * from candidates
    where coalesce(p_payment, '') = ''
      or (p_payment = 'due' and payment_balance > 0)
      or (p_payment = 'unpaid' and payment_status = 'En attente')
      or (p_payment = 'partial' and payment_status = 'Acompte versé')
      or (p_payment = 'overdue' and payment_status = 'En retard')
      or (p_payment = 'paid' and payment_status = 'Soldé')
      or (p_payment = 'none' and payment_status = 'Aucun engagement')
  ), rows as (
    select * from filtered order by created_at desc, id asc
    limit nullif(p_page_size,0)
    offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end
  )
  select pg_catalog.jsonb_build_object(
    'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
    'count',(select count(*) from filtered),
    'total',(select count(*) from public.students),
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial','Alumni'))
  ) into v_result;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_attendance_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_role text;
  v_teacher uuid;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role not in ('director','admin','teacher','receptionist') then
    raise exception 'Attendance actor unauthorized' using errcode = '42501';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.get_my_teacher_id();
    if v_teacher is null or not exists (
      select 1 from public.groups g where g.id = new.group_id and g.teacher_id = v_teacher
    ) then raise exception 'Teacher not assigned to group' using errcode = '42501'; end if;
  end if;
  if v_role = 'receptionist' and (
    (tg_op = 'UPDATE' and (new.id,new.created_at,new.notes) is distinct from
      (old.id,old.created_at,old.notes)) or
    (tg_op = 'INSERT' and (new.notes is not null or new.created_at is distinct from now()))
  ) then
    raise exception 'Receptionist may record attendance status only' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and
    (new.student_id, new.group_id, new.session_date)
      is distinct from (old.student_id, old.group_id, old.session_date) then
    raise exception 'Attendance identity is immutable' using errcode = '23514';
  end if;
  if not public.attendance_student_in_group(new.student_id, new.group_id) then
    raise exception 'Student is not enrolled in group' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'attendance:' || new.student_id::text || ':' || new.group_id::text || ':' || new.session_date::text, 0));
    if exists (select 1 from public.attendance a
      where a.student_id = new.student_id and a.group_id = new.group_id
        and a.session_date = new.session_date) then
      raise exception 'Attendance already exists' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION storage_security.can_write(actor uuid, purpose text, sid uuid, tid uuid, eid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select actor is not null and exists (
   select 1 from public.profiles p where p.id=actor and (
     (p.role in ('admin','director') and purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','premium_homework'))
     or (p.role='receptionist' and purpose in ('student_photo','enrollment_document')
       and sid is not null and (purpose='student_photo' and eid is null or
         purpose='enrollment_document' and eid is not null))
     or (purpose='portfolio' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null and (
       (p.role='student' and s.email=p.email) or
       (p.role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
         where g.id=s.groupe_id and t.email=p.email and t.deleted_at is null)))))
     or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
       and s.plan_type='Premium' and (
         (p.role='student' and s.email=p.email) or (p.role='parent' and s.parent_email=p.email))))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$function$;

CREATE OR REPLACE FUNCTION storage_security.can_insert_reserved_object(p_bucket_id text, p_object_path text, p_owner_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select auth.uid() is not null
    and p_owner_id is not distinct from auth.uid()::text
    and p_object_path ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.storage_assets a
      join public.profiles p on p.id=auth.uid()
      where a.bucket_id=p_bucket_id and a.object_path=p_object_path and a.uploader_id=auth.uid()
        and a.state='reserved' and a.expires_at>now()
        and p.role in ('admin','director','teacher','student','parent','receptionist')
        and storage_security.can_write(auth.uid(),a.purpose,a.student_id,a.teacher_id,a.enrollment_id) is true
    )
$function$;

CREATE OR REPLACE FUNCTION public.resolve_storage_asset(p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare a public.storage_assets; allowed boolean; caller_role text; begin
 select p.role into caller_role from public.profiles p where p.id=auth.uid();
 select * into a from public.storage_assets where id=p_asset_id;
 if auth.uid() is null or a.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.state='staff_only' then
   allowed:=a.purpose='legacy_unclassified' and caller_role in ('admin','director')
     and not exists(select 1 from public.storage_asset_bindings b where b.asset_id=a.id);
 elsif a.state='active' and a.purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','premium_homework') then
   select exists(select 1 from public.storage_asset_bindings b
     left join public.students s on s.id=a.student_id
     left join public.portfolios pf on pf.id=b.portfolio_id
     left join public.premium_homework_submissions ph on ph.id=b.premium_submission_id
     left join public.premium_sessions ps on ps.id=ph.premium_session_id
     where b.asset_id=a.id and (
       caller_role in ('admin','director') or
       (caller_role='receptionist' and a.purpose in ('student_photo','enrollment_document','teacher_photo')
         and (a.purpose='teacher_photo' and exists(select 1 from public.teachers t
           where t.id=a.teacher_id and t.deleted_at is null) or
           a.purpose in ('student_photo','enrollment_document') and s.deleted_at is null
             and (a.purpose='student_photo' and b.student_photo_id=s.id or
               a.purpose='enrollment_document' and b.enrollment_id=a.enrollment_id
                 and exists(select 1 from public.enrollments e where e.id=a.enrollment_id and e.student_id=s.id)))) or
       (a.purpose in ('student_photo','portfolio') and s.deleted_at is null and (
         (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
         (caller_role='student' and s.email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_student is true)) or
         (caller_role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
           where g.id=s.groupe_id and t.email=(select email from public.profiles where id=auth.uid()) and t.deleted_at is null))
       )) or
       (a.purpose='premium_homework' and ph.id is not null and (
         (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid())) or
         (caller_role='student' and s.email=(select email from public.profiles where id=auth.uid())) or
         (caller_role='teacher' and ps.teacher_id=public.get_my_teacher_id())
       ))
     )) into allowed;
 else allowed:=false;
 end if;
 if allowed is not true or not exists(
   select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path and o.version=a.object_version
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('bucket',a.bucket_id,'path',a.object_path);
end $function$;


-- Legacy INVOKER aggregates now fail explicitly for receptionist even though
-- operational receipt/student SELECT is enabled. Other-role RLS semantics stay.
create or replace function public.get_finance_summary() returns json
language plpgsql stable security invoker set search_path=pg_catalog,pg_temp as $$
declare result json; begin
  if public.get_my_role()='receptionist' then raise exception 'Forbidden' using errcode='42501'; end if;
  select json_build_object(
    'total_encaisse',coalesce(sum(montant_paye),0),
    'total_du',coalesce(sum(montant_total*(1-coalesce(remise,0)/100)),0),
    'total_restant',coalesce(sum(greatest(0,montant_total*(1-coalesce(remise,0)/100)-montant_paye)),0),
    'count_total',count(*),'count_en_retard',count(*) filter(where statut_paiement='En retard'),
    'count_solde',count(*) filter(where statut_paiement='Soldé' or
      montant_total*(1-coalesce(remise,0)/100)-montant_paye<=0),
    'by_program',(select coalesce(json_agg(json_build_object('program',prog,'encaisse',enc,'restant',rest)
      order by enc desc),'[]'::json) from (
      select coalesce(session_type,'(non défini)') prog,sum(montant_paye) enc,
        sum(greatest(0,montant_total*(1-coalesce(remise,0)/100)-montant_paye)) rest
      from public.receipts group by 1) g)) into result from public.receipts;
  return result;
end $$;
create or replace function public.get_unpaid_receipts(lim integer default 50) returns setof public.receipts
language plpgsql stable security invoker set search_path=pg_catalog,pg_temp as $$ begin
  if public.get_my_role()='receptionist' then raise exception 'Forbidden' using errcode='42501'; end if;
  return query select * from public.receipts
    where montant_total*(1-coalesce(remise,0)/100)-montant_paye>0.5
    order by (statut_paiement='En retard') desc,
      (montant_total*(1-coalesce(remise,0)/100)-montant_paye) desc limit lim;
end $$;
create or replace function public.get_referral_breakdown() returns json
language plpgsql stable security invoker set search_path=pg_catalog,pg_temp as $$
declare result json; begin
  if public.get_my_role()='receptionist' then raise exception 'Forbidden' using errcode='42501'; end if;
  select coalesce(json_agg(json_build_object('source',src,'count',c) order by c desc),'[]'::json)
    into result from (select coalesce(referral_source,'Non renseigné') src,count(*) c
      from public.students where status='Enrolled' group by 1) t;
  return result;
end $$;

create function public.append_receptionist_enrollment_document(p_enrollment uuid,
  p_expected_updated_at timestamptz,p_asset text) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare e public.enrollments%rowtype; begin
  perform operational_security.require_receptionist();
  select * into e from public.enrollments where id=p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at or
    not exists(select 1 from public.students s where s.id=e.student_id and s.deleted_at is null) then
    raise exception 'Enrollment unavailable or stale' using errcode='40001'; end if;
  if storage_security.is_asset_reference(p_asset) is not true or
    p_asset=any(coalesce(e.documents_urls,array[]::text[])) then
    raise exception 'Invalid document asset' using errcode='42501'; end if;
  if not exists(select 1 from public.storage_assets a where a.id=substring(p_asset from 7)::uuid
    and a.purpose='enrollment_document' and a.student_id=e.student_id and a.enrollment_id=e.id
    and a.uploader_id=auth.uid() and a.state='uploaded' and a.expires_at>now()) then
    raise exception 'Invalid document asset' using errcode='42501'; end if;
  update public.enrollments set documents_urls=array_append(coalesce(e.documents_urls,array[]::text[]),p_asset)
    where id=e.id;
  return e.id;
end $$;

create function public.create_receptionist_premium_group(p_group uuid,p_name text,p_teacher uuid,
  p_weekday smallint,p_start_time time,p_academic_year text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare existing public.premium_groups%rowtype; begin
  perform operational_security.require_receptionist();
  if p_group is null or nullif(btrim(p_name),'') is null or not exists(
    select 1 from public.teachers where id=p_teacher and deleted_at is null) then
    raise exception 'Invalid Premium group/teacher' using errcode='23514'; end if;
  insert into public.premium_groups(id,name,teacher_id,weekday,start_time,academic_year,notes,
    duration_minutes,target_size,active)
  values(p_group,p_name,p_teacher,p_weekday,p_start_time,p_academic_year,p_notes,60,5,true)
  on conflict(id) do nothing;
  select * into existing from public.premium_groups where id=p_group for update;
  if existing.name is distinct from p_name or existing.teacher_id is distinct from p_teacher or
    existing.weekday is distinct from p_weekday or existing.start_time is distinct from p_start_time or
    existing.academic_year is distinct from p_academic_year or existing.notes is distinct from p_notes or
    not existing.active then raise exception 'Premium group identity conflict' using errcode='23505'; end if;
  return p_group;
end $$;
create function public.save_receptionist_premium_membership(p_membership uuid,
  p_expected_updated_at timestamptz,p_group uuid default null,p_student uuid default null,
  p_start_date date default current_date)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare m public.premium_group_memberships%rowtype; begin
  perform operational_security.require_receptionist();
  if p_membership is null then raise exception 'Stable membership id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    if p_group is null or p_student is null or p_start_date is null or p_start_date<current_date or
      not exists(select 1 from public.premium_groups
      where id=p_group and active) then raise exception 'Invalid Premium membership' using errcode='23514'; end if;
    insert into public.premium_group_memberships(id,premium_group_id,student_id,start_date,end_date,active)
      values(p_membership,p_group,p_student,p_start_date,
        (select premium_end_date from public.students where id=p_student),true)
      on conflict(id) do nothing;
    select * into m from public.premium_group_memberships where id=p_membership for update;
    if m.premium_group_id is distinct from p_group or m.student_id is distinct from p_student or
      m.start_date is distinct from p_start_date or not m.active then
      raise exception 'Premium membership identity conflict' using errcode='23505'; end if;
  else
    if p_group is not null or p_student is not null then
      raise exception 'Membership identity is immutable' using errcode='42501'; end if;
    select * into m from public.premium_group_memberships where id=p_membership for update;
    if not found or m.updated_at is distinct from p_expected_updated_at or not m.active or
      m.start_date>current_date then raise exception 'Membership unavailable or stale' using errcode='40001'; end if;
    update public.premium_group_memberships set active=false,end_date=current_date where id=p_membership;
  end if;
  return p_membership;
end $$;
create function public.save_receptionist_premium_session(p_session uuid,
  p_expected_updated_at timestamptz,p_changes jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare ps public.premium_sessions%rowtype; pg public.premium_groups%rowtype; begin
  perform operational_security.require_receptionist();
  if p_session is null then raise exception 'Stable Premium session id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['premium_group_id','scheduled_date']);
    select * into pg from public.premium_groups
      where id=(p_changes->>'premium_group_id')::uuid and active for share;
    if not found then raise exception 'Premium group unavailable' using errcode='23514'; end if;
    insert into public.premium_sessions(id,premium_group_id,student_id,teacher_id,scheduled_date,
      start_time,duration_minutes,status)
    values(p_session,pg.id,null,pg.teacher_id,(p_changes->>'scheduled_date')::date,
      pg.start_time,60,'Scheduled') on conflict(id) do nothing;
    select * into ps from public.premium_sessions where id=p_session for update;
    if ps.premium_group_id is distinct from pg.id or ps.scheduled_date is distinct from
      (p_changes->>'scheduled_date')::date or ps.teacher_id is distinct from pg.teacher_id or
      ps.status is distinct from 'Scheduled' then
      raise exception 'Premium session identity conflict' using errcode='23505'; end if;
  else
    perform operational_security.assert_keys(p_changes,array['scheduled_date','start_time','status']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into ps from public.premium_sessions where id=p_session for update;
    if not found or ps.updated_at is distinct from p_expected_updated_at then
      raise exception 'Premium session unavailable or stale' using errcode='40001'; end if;
    if ps.premium_group_id is null or ps.status in ('Completed','Cancelled') or
      (p_changes ? 'status' and (p_changes ? 'scheduled_date' or p_changes ? 'start_time')) or
      (p_changes ? 'status' and p_changes->>'status' not in ('Confirmed','Completed','Cancelled')) then
      raise exception 'Unsupported Premium session action' using errcode='42501'; end if;
    update public.premium_sessions set
      scheduled_date=case when p_changes ? 'scheduled_date' then (p_changes->>'scheduled_date')::date else ps.scheduled_date end,
      start_time=case when p_changes ? 'start_time' then (p_changes->>'start_time')::time else ps.start_time end,
      status=case when p_changes ? 'status' then p_changes->>'status' else ps.status end,
      completed_at=case when p_changes ? 'status' then
        case when p_changes->>'status'='Completed' then coalesce(ps.completed_at,now()) else null end
        else ps.completed_at end
    where id=p_session;
  end if;
  return p_session;
end $$;
create function public.save_receptionist_premium_attendance(p_session uuid,p_student uuid,
  p_status text,p_expected_updated_at timestamptz default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a public.premium_attendance%rowtype; begin
  perform operational_security.require_receptionist();
  perform pg_advisory_xact_lock(hashtextextended('premium-attendance:'||p_session::text||':'||p_student::text,0));
  select * into a from public.premium_attendance where premium_session_id=p_session and student_id=p_student for update;
  if found then
    if p_expected_updated_at is null or a.updated_at is distinct from p_expected_updated_at then
      raise exception 'Premium attendance stale' using errcode='40001'; end if;
    update public.premium_attendance set status=p_status,recorded_by=auth.uid() where id=a.id;
    return a.id;
  end if;
  if p_expected_updated_at is not null then raise exception 'Premium attendance unavailable' using errcode='40001'; end if;
  insert into public.premium_attendance(premium_session_id,student_id,status,recorded_by)
    values(p_session,p_student,p_status,auth.uid()) returning id into a.id;
  return a.id;
end $$;

-- Exact public entrypoint ACLs. Private helpers and the inner financial command
-- remain inaccessible to every browser role, including authenticated.
revoke all on function public.create_charge_payment_financial(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_teacher_operations(uuid,integer,integer),
  public.save_receptionist_teacher_operations(uuid,timestamptz,jsonb),
  public.save_receptionist_student(uuid,timestamptz,jsonb),
  public.save_receptionist_group(uuid,timestamptz,jsonb),
  public.save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text,text,text),
  public.assign_receptionist_student_group(uuid,uuid,uuid,timestamptz,timestamptz),
  public.append_receptionist_enrollment_document(uuid,timestamptz,text),
  public.create_receptionist_premium_group(uuid,text,uuid,smallint,time,text,text),
  public.save_receptionist_premium_membership(uuid,timestamptz,uuid,uuid,date),
  public.save_receptionist_premium_session(uuid,timestamptz,jsonb),
  public.save_receptionist_premium_attendance(uuid,uuid,text,timestamptz)
from public,anon,authenticated,service_role;
grant execute on function public.get_teacher_operations(uuid,integer,integer),
  public.save_receptionist_teacher_operations(uuid,timestamptz,jsonb),
  public.save_receptionist_student(uuid,timestamptz,jsonb),
  public.save_receptionist_group(uuid,timestamptz,jsonb),
  public.save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text,text,text),
  public.assign_receptionist_student_group(uuid,uuid,uuid,timestamptz,timestamptz),
  public.append_receptionist_enrollment_document(uuid,timestamptz,text),
  public.create_receptionist_premium_group(uuid,text,uuid,smallint,time,text,text),
  public.save_receptionist_premium_membership(uuid,timestamptz,uuid,uuid,date),
  public.save_receptionist_premium_session(uuid,timestamptz,jsonb),
  public.save_receptionist_premium_attendance(uuid,uuid,text,timestamptz)
to authenticated;
notify pgrst,'reload schema';
commit;
