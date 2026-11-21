-- Receptionist permissions, stage 3 (plan RPW-r2, table A items 1-6, 14, 16, 17, 17c, 18, 18p, 19, L).
-- The dossier: programme, level and source while the learner is in no group (the admin rule),
-- the two e-mails while no active or pending family link uses the old address (every change
-- logged for every role), pick-up adults, « Sortie des jeunes », « Ancien apprenant », reopening an
-- ended enrollment. Teaching: grades (no delete), portfolios and learning profiles (create, no
-- delete), certificates and leave requests (view only). Teachers: a record without login, e-mail
-- (only while no login is linked and no invitation is pending) and notes, photo; never pay fields.
-- Director and admin answers are unchanged except the e-mail change log. Function bodies are the
-- live definitions with only the named lines changed. No online or teacher-portal object changes.
begin;

create or replace function operational_security.capability_roles()
returns table(capability text, roles text[])
language sql immutable security invoker set search_path=pg_catalog,pg_temp as $$
  select c.capability, c.roles from (values
    ('manage_crm', array['director','admin','receptionist']),
    ('manage_placement', array['director','admin','receptionist']),
    ('manage_students', array['director','admin','receptionist']),
    ('manage_groups', array['director','admin','receptionist']),
    ('manage_academics', array['director','admin','receptionist']),
    ('manage_finance_operations', array['director','admin','receptionist']),
    ('manage_teacher_operations', array['director','admin','receptionist']),
    ('assign_group', array['director','admin','receptionist']),
    ('record_attendance', array['director','admin','receptionist']),
    ('edit_teacher_operations', array['director','admin','receptionist']),
    ('manage_student_documents', array['director','admin','receptionist']),
    ('edit_enrollment', array['director','admin','receptionist']),
    ('override_capacity', array['director','admin','receptionist']),
    ('place_without_paid_enrollment', array['director','admin','receptionist']),
    ('edit_student_email', array['director','admin','receptionist']),
    ('manage_authorized_adults', array['director','admin','receptionist']),
    ('record_dismissal', array['director','admin','receptionist']),
    ('end_learner', array['director','admin','receptionist']),
    ('reopen_enrollment', array['director','admin','receptionist']),
    ('manage_grades', array['director','admin','receptionist']),
    ('manage_learning_records', array['director','admin','receptionist']),
    ('view_certificates', array['director','admin','receptionist']),
    ('add_teacher', array['director','admin','receptionist']),
    ('view_leave_requests', array['director','admin','receptionist']),
    ('issue_certificates', array['director','admin']),
    ('decide_leave_requests', array['director','admin']),
    ('write_student_records', array['director','admin']),
    ('view_help', array['director','admin','receptionist']),
    ('manage_online_lessons', array['director','admin','receptionist']),
    ('manage_online_courses', array['director','admin']),
    ('view_finance_analytics', array['director','admin']),
    ('manage_users', array['director','admin']),
    ('manage_system_settings', array['director','admin']),
    ('view_teacher_compensation', array['director','admin']),
    ('manage_payroll', array['director','admin']),
    ('manage_integrations', array['director']),
    ('view_marketing_analytics', array['director']),
    ('correct_finance', array['director']),
    ('archive_students', array['director','admin']),
    ('import_students', array['director','admin']),
    ('export_students', array['director','admin']),
    ('edit_student_programme', array['director','admin','receptionist']),
    ('manage_teacher_hr', array['director','admin']),
    ('delete_academic_records', array['director','admin']),
    ('manage_own_account', array['director','admin','receptionist','teacher','parent','student'])
  ) as c(capability, roles)
$$;

-- Item 3: does an active or pending family link of this learner and relation use this address?
create function operational_security.family_link_holds(p_student uuid, p_relation text, p_address text)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select nullif(btrim(p_address), '') is not null and exists (
    select 1 from public.family_links fl left join public.profiles p on p.id = fl.profile_id
    where fl.student_id = p_student and fl.relation = p_relation and fl.status in ('active', 'pending')
      and (fl.invite_email = lower(btrim(p_address)) or lower(btrim(p.email)) = lower(btrim(p_address))))
$$;
revoke all on function operational_security.family_link_holds(uuid, text, text) from public, anon, authenticated, service_role;

-- Items 2 and 3.
create or replace function public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.students%rowtype; begin
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
      p_changes->>'photo_url','Prospect','Standard') on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
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
    -- RPW-r2 items 2 and 3: programme, level and source (the admin rule: guard_student_membership
    -- refuses a programme or level change while the learner is in a group) and the two e-mails
    -- (refused while an active or pending family link uses the old address; every change logged).
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url','session_type','niveau_cefr','referral_source','email','parent_email']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
    if (p_changes ? 'session_type' or p_changes ? 'niveau_cefr') and operational_security.valid_session_level(
        case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
        case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end) is not true then
      raise exception 'Programme ou niveau invalide.' using errcode='22023', hint='rpw.level_invalid'; end if;
    if p_changes ? 'email' and nullif(btrim(p_changes->>'email'),'') is distinct from s.email
       and operational_security.family_link_holds(s.id, 'self', s.email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'parent_email' and nullif(btrim(p_changes->>'parent_email'),'') is distinct from s.parent_email
       and operational_security.family_link_holds(s.id, 'parent', s.parent_email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end,
      session_type=case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
      niveau_cefr=case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end,
      referral_source=case when p_changes ? 'referral_source' then nullif(p_changes->>'referral_source','') else s.referral_source end,
      email=case when p_changes ? 'email' then nullif(btrim(p_changes->>'email'),'') else s.email end,
      parent_email=case when p_changes ? 'parent_email' then nullif(btrim(p_changes->>'parent_email'),'') else s.parent_email end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $function$;

-- Item 3: every e-mail change of a learner file, every role and path: who, when, column, old -> new.
create function academic_security.log_student_email_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text; v_column text;
begin
  select p.email into v_email from public.profiles p where p.id = auth.uid();
  foreach v_column in array array['email', 'parent_email'] loop
    if (to_jsonb(new) ->> v_column) is distinct from (to_jsonb(old) ->> v_column) then
      insert into public.activity_log(actor_id, actor_email, action, target_table, target_id, changed_columns, before, after)
      values (auth.uid(), v_email, 'UPDATE', 'students', new.id, array[v_column],
        jsonb_build_object(v_column, to_jsonb(old) -> v_column),
        jsonb_build_object(v_column, to_jsonb(new) -> v_column, 'kind', 'student_email_change', 'author_role', public.get_my_role()));
    end if;
  end loop;
  return null;
end $$;
revoke all on function academic_security.log_student_email_change() from public, anon, authenticated, service_role;
create trigger students_email_change_log after update of email, parent_email on public.students
  for each row execute function academic_security.log_student_email_change();

-- Item 4: pick-up adults, editable by every staff role (she may delete here only).
drop policy receptionist_insert_deny on public.authorized_adults;
drop policy receptionist_update_deny on public.authorized_adults;
drop policy receptionist_delete_deny on public.authorized_adults;
create policy receptionist_authorized_adult_write on public.authorized_adults for all to authenticated
  using ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null))
  with check ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));

-- Item 5: « Sortie des jeunes »: she records and reads; nobody edits or deletes (trigger).
create or replace function public.enforce_dismissal_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_role text;
  v_staff text;
  v_student text;
  v_adult text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Dismissal history is immutable; contact the director for a documented correction.'
      using errcode = '42501';
  end if;
  select p.role, p.full_name into v_role, v_staff
  from public.profiles p where p.id = auth.uid();
  -- RPW-r2 item 5: the record_dismissal capability (director, admin, receptionist).
  if not operational_security.role_has_capability(coalesce(v_role, ''), 'record_dismissal') or v_staff is null or pg_catalog.btrim(v_staff) = '' then
    raise exception 'Authorized staff profile required' using errcode = '42501';
  end if;
  select s.full_name into v_student from public.students s where s.id = new.student_id;
  select a.full_name into v_adult from public.authorized_adults a
  where a.id = new.adult_id and a.student_id = new.student_id;
  if v_student is null or v_adult is null then
    raise exception 'Adult is not authorized for this student' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dismissal:' || new.student_id::text, 0)
  );
  if exists (
    select 1 from public.dismissal_logs d
    where d.student_id = new.student_id and d.confirmed is true
      and (d.timestamp at time zone public.centre_utc_offset())::date
        = (pg_catalog.clock_timestamp() at time zone public.centre_utc_offset())::date
  ) then
    raise exception 'Student already dismissed today' using errcode = '23505';
  end if;
  new.student_name := v_student;
  new.adult_name := v_adult;
  new.staff_name := v_staff;
  new.timestamp := pg_catalog.clock_timestamp();
  new.confirmed := true;
  return new;
end;
$function$;

drop policy receptionist_deny on public.dismissal_logs;
create policy receptionist_dismissal_read on public.dismissal_logs for select to authenticated
  using ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_dismissal_insert on public.dismissal_logs for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_update_deny on public.dismissal_logs as restrictive for update to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.dismissal_logs as restrictive for delete to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') ;

-- Items 6 and 14.
create or replace function public.end_learner(p_student uuid, p_student_updated_at timestamp with time zone, p_final_status text, p_reason text, p_enrollments uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students; v_count integer;
begin
  -- RPW-r2 item 6.
  perform operational_security.require_capability('end_learner');
  s := academic_security.lock_learner(p_student, p_student_updated_at, true);
  v_count := academic_security.leave(p_student, p_final_status, p_reason, p_enrollments);
  perform academic_security.log('leaver', null, p_student, null,
    jsonb_build_object('reason', btrim(p_reason), 'final_status', p_final_status, 'ended', v_count));
  select * into s from public.students where id = p_student;
  return jsonb_build_object('ended', v_count, 'status', s.status, 'updated_at', s.updated_at,
    'open_balance', (select coalesce(sum(c.balance), 0) from public.charge_balances c
      where c.student_id = p_student and c.voided_at is null and c.balance > 0));
end $function$;

create or replace function public.reopen_enrollment(p_enrollment uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare e public.enrollments; v_student uuid; v_flag text; v_constraint text;
begin
  -- RPW-r2 item 14.
  perform operational_security.require_capability('reopen_enrollment');
  select x.student_id into v_student from public.enrollments x where x.id = p_enrollment;
  if not found then perform academic_security.stale(); end if;
  perform academic_security.lock_learner(v_student, null, false);
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    perform academic_security.stale();
  end if;
  if e.status is distinct from 'Ended' then
    raise exception 'Seule une inscription terminée peut être rouverte.' using errcode = '23514', hint = 'egc.not_ended';
  end if;
  -- EAP (Q11): a row the archive step ended (journal membership, never the text of
  -- end_reason) does not reopen unless the archive revert restored it.
  if exists (select 1 from maintenance.eap_archive_journal j where j.entity = 'enrollments' and j.row_id = e.id
      and j.action = 'ended' and not exists (select 1 from maintenance.eap_archive_journal r
        where r.action = 'reverted' and r.reverts_id = j.id)) then
    raise exception 'Une pré-inscription archivée ne se rouvre pas : inscrivez et encaissez.'
      using errcode = '23514', hint = 'eap.archived_not_reopenable';
  end if;
  if e.session_type is null or e.school_year is null then
    raise exception 'Programme et année scolaire requis pour rouvrir cette inscription.'
      using errcode = '22023', hint = 'egc.programme_required';
  end if;
  if exists (select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
      and x.session_type = e.session_type and x.school_year = e.school_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  v_flag := academic_security.set_flag('eh.enrollment_command', 'on');
  begin
    update public.enrollments set status = 'Confirmed', group_id = null, ended_at = null, ended_by = null,
      end_reason = null, ended_group_id = null
    where id = e.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  perform academic_security.set_flag('eh.enrollment_command', v_flag);
  perform academic_security.log('reopen', e.id, e.student_id, null, null);
  return e.id;
end $function$;

-- Item 16: grades, add and edit; delete stays denied.
drop policy receptionist_insert_deny on public.assessments;
drop policy receptionist_update_deny on public.assessments;
create policy receptionist_assessment_insert on public.assessments for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_assessment_update on public.assessments for update to authenticated
  using ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null)) with check ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));

-- Item 17: portfolios and learning profiles, read and create; no edit, no delete.
drop policy receptionist_deny on public.portfolios;
create policy receptionist_portfolio_read on public.portfolios for select to authenticated
  using ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_portfolio_insert on public.portfolios for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_update_deny on public.portfolios as restrictive for update to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.portfolios as restrictive for delete to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') ;
drop policy receptionist_deny on public.learning_assessments;
create policy receptionist_learning_assessment_read on public.learning_assessments for select to authenticated
  using ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_learning_assessment_insert on public.learning_assessments for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_update_deny on public.learning_assessments as restrictive for update to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.learning_assessments as restrictive for delete to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') ;
-- Items 17 and 18p: storage purposes portfolio and teacher photo.
create or replace function storage_security.can_write(actor uuid, purpose text, sid uuid, tid uuid, eid uuid)
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
     -- RPW-r2 items 17 and 18p: a portfolio file of a learner, a teacher photo (never pay).
     or (operational_security.role_has_capability(p.role, 'manage_learning_records') and purpose='portfolio'
       and sid is not null and eid is null and tid is null)
     or (operational_security.role_has_capability(p.role, 'add_teacher') and purpose='teacher_photo'
       and sid is null and eid is null)
     or (purpose='portfolio' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null and (
       (p.role='student' and portal_security.family_linked(p.id, s.id)) or
       (p.role='teacher' and portal_security.teacher_member(p.linked_teacher_id, s.id)))))
     or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
       and s.plan_type='Premium' and p.role in ('student','parent') and portal_security.family_linked(p.id, s.id)))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$function$;

create or replace function public.resolve_storage_asset(p_asset_id uuid)
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
       -- RPW-r2 item 17: a portfolio file she may read (her portfolio rows are readable).
       (caller_role='receptionist' and a.purpose='portfolio' and s.deleted_at is null and pf.id is not null) or
       (caller_role='receptionist' and a.purpose in ('student_photo','enrollment_document','teacher_photo')
         and (a.purpose='teacher_photo' and exists(select 1 from public.teachers t
           where t.id=a.teacher_id and t.deleted_at is null) or
           a.purpose in ('student_photo','enrollment_document') and s.deleted_at is null
             and (a.purpose='student_photo' and b.student_photo_id=s.id or
               a.purpose='enrollment_document' and b.enrollment_id=a.enrollment_id
                 and exists(select 1 from public.enrollments e where e.id=a.enrollment_id and e.student_id=s.id)))) or
       (a.purpose in ('student_photo','portfolio') and s.deleted_at is null and (
         (caller_role='parent' and portal_security.family_linked(auth.uid(), s.id) and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
         (caller_role='student' and portal_security.family_linked(auth.uid(), s.id) and (a.purpose='student_photo' or pf.visible_to_student is true)) or
         (caller_role='teacher' and portal_security.teacher_sees(s.id, null))
       )) or
       (a.purpose='premium_homework' and ph.id is not null and (
         (caller_role in ('parent','student') and portal_security.family_linked(auth.uid(), s.id)) or
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

-- Item 17c: certificates, view only.
drop policy receptionist_deny on public.certificates;
create policy receptionist_certificate_read on public.certificates for select to authenticated
  using ((select public.get_my_role()) = 'receptionist' and student_id in (select s.id from public.students s where s.deleted_at is null));
create policy receptionist_insert_deny on public.certificates as restrictive for insert to authenticated with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_update_deny on public.certificates as restrictive for update to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.certificates as restrictive for delete to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') ;

-- L: leave requests, view only.
drop policy receptionist_deny on public.leave_requests;
create policy receptionist_leave_request_read on public.leave_requests for select to authenticated
  using ((select public.get_my_role()) = 'receptionist');
create policy receptionist_insert_deny on public.leave_requests as restrictive for insert to authenticated with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_update_deny on public.leave_requests as restrictive for update to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.leave_requests as restrictive for delete to authenticated using ((select public.get_my_role()) is distinct from 'receptionist') ;

-- Items 18 and 19: a teacher record without login; e-mail (N2 = A), notes and photo; never pay.
create or replace function public.save_receptionist_teacher_operations(p_teacher uuid, p_expected_updated_at timestamptz, p_changes jsonb)
returns table(id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare t public.teachers%rowtype; v_email text; begin
  perform operational_security.require_receptionist();
  if p_teacher is null then raise exception 'Identifiant enseignant requis.' using errcode = '22023'; end if;
  if p_changes ? 'photo_url' and nullif(btrim(p_changes->>'photo_url'), '') is not null
     and storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
    raise exception 'Registry photo required' using errcode = '42501'; end if;
  if p_expected_updated_at is null then
    perform operational_security.require_capability('add_teacher');
    perform operational_security.assert_keys(p_changes, array['full_name','telephone','email','certifications',
      'niveaux_autorises','notes','photo_url']);
    v_email := lower(btrim(coalesce(p_changes->>'email', '')));
    if nullif(btrim(p_changes->>'full_name'), '') is null or v_email = '' then
      raise exception 'Nom et e-mail de l’enseignant requis.' using errcode = '22023', hint = 'rpw.teacher_identity_required'; end if;
    insert into public.teachers(id, full_name, telephone, email, certifications, niveaux_autorises, notes, photo_url)
    values (p_teacher, btrim(p_changes->>'full_name'), nullif(p_changes->>'telephone', ''), v_email,
      case when p_changes ? 'certifications' then array(select jsonb_array_elements_text(p_changes->'certifications')) end,
      case when p_changes ? 'niveaux_autorises' then array(select jsonb_array_elements_text(p_changes->'niveaux_autorises')) end,
      nullif(p_changes->>'notes', ''), nullif(p_changes->>'photo_url', ''))
    on conflict on constraint teachers_pkey do nothing
    returning teachers.id, teachers.updated_at into id, updated_at;
    if id is null then
      -- A resend of the same create (REL-4) answers with the record; anything else conflicts.
      select * into t from public.teachers where teachers.id = p_teacher;
      if t.deleted_at is not null or t.full_name is distinct from btrim(p_changes->>'full_name') or t.email is distinct from v_email then
        raise exception 'Teacher create identity conflict' using errcode = '23505'; end if;
      id := t.id; updated_at := t.updated_at;
    end if;
    return next; return;
  end if;
  perform operational_security.assert_keys(p_changes, array['full_name','telephone','certifications','niveaux_autorises',
    'email','notes','photo_url']);
  if p_changes = '{}'::jsonb then raise exception 'Missing changes/version' using errcode = '22023'; end if;
  select * into t from public.teachers where teachers.id = p_teacher and deleted_at is null for update;
  if not found or t.updated_at is distinct from p_expected_updated_at then
    raise exception 'Teacher unavailable or stale' using errcode = 'PT409';
  end if;
  v_email := case when p_changes ? 'email' then lower(btrim(coalesce(p_changes->>'email', ''))) else t.email end;
  if v_email is distinct from t.email then
    if v_email = '' then raise exception 'E-mail de l’enseignant requis.' using errcode = '22023', hint = 'rpw.teacher_identity_required'; end if;
    if exists (select 1 from public.profiles p where p.linked_teacher_id = t.id)
       or exists (select 1 from public.pending_roles r where r.teacher_id = t.id and (r.expires_at is null or r.expires_at > now())) then
      raise exception 'Un compte ou une invitation utilise cet e-mail : la direction le modifie.'
        using errcode = '42501', hint = 'rpw.teacher_email_locked';
    end if;
  end if;
  update public.teachers set
    full_name = case when p_changes ? 'full_name' then p_changes->>'full_name' else t.full_name end,
    telephone = case when p_changes ? 'telephone' then p_changes->>'telephone' else t.telephone end,
    certifications = case when p_changes ? 'certifications' then
      array(select jsonb_array_elements_text(p_changes->'certifications')) else t.certifications end,
    niveaux_autorises = case when p_changes ? 'niveaux_autorises' then
      array(select jsonb_array_elements_text(p_changes->'niveaux_autorises')) else t.niveaux_autorises end,
    email = v_email,
    notes = case when p_changes ? 'notes' then nullif(p_changes->>'notes', '') else t.notes end,
    photo_url = case when p_changes ? 'photo_url' then nullif(p_changes->>'photo_url', '') else t.photo_url end
  where teachers.id = p_teacher returning teachers.id, teachers.updated_at into id, updated_at;
  return next;
end $$;

-- Item 19: the teacher operations read returns the notes (pay fields never).
drop function public.get_teacher_operations(uuid, integer, integer);
create function public.get_teacher_operations(p_teacher_id uuid default null, p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, full_name text, email text, telephone text, certifications text[], niveaux_autorises text[],
  photo_url text, notes text, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$ begin
  perform operational_security.require_capability('manage_teacher_operations');
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then
    raise exception 'Invalid teacher page' using errcode = '22023';
  end if;
  return query select t.id, t.full_name, t.email, t.telephone, t.certifications,
    t.niveaux_autorises, t.photo_url, t.notes, t.updated_at
  from public.teachers t where t.deleted_at is null and (p_teacher_id is null or t.id = p_teacher_id)
  order by t.full_name, t.id limit p_limit offset p_offset;
end $$;
revoke all on function public.get_teacher_operations(uuid, integer, integer) from public, anon, service_role;
grant execute on function public.get_teacher_operations(uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
