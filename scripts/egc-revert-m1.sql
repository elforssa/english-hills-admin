-- Prepared forward revert of migration M1 (120_enrollment_group_consistency.sql),
-- plan EGC-r2 "Rollback". Not a migration: applied only with the owner's
-- approval, under a new migration number, before the enforcement migration (M2)
-- and after every clean-up stage has been reverted
-- (academic_security.egc_revert_cleanup, reverse order). Restores the bodies
-- M1 replaced, as they stood at migration 119, and the 074 student-form trigger;
-- drops M1's guards, commands, helpers and checks. Keeps the Ended status value
-- and the ended_* columns (harmless when unused); enrollments ended by the
-- commands stay Ended, which the restored readers treat as not active.
-- Rehearsed in CI by scripts/test-egc-upgrade.mjs.
begin;

do $$ begin
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.enrollments'::regclass and c.convalidated
      and c.conname in ('enrollments_active_requires_group','enrollments_ended_shape','enrollments_confirmed_has_programme')) then
    raise exception 'EGC M1 revert refused: the enforcement migration is applied' using errcode = 'P0001';
  end if;
  if exists (select 1 from maintenance.egc_cleanup_log) then
    raise exception 'EGC M1 revert refused: revert the clean-up stages first' using errcode = 'P0001';
  end if;
end $$;

drop trigger students_membership_guard on public.students;
drop trigger groups_membership_level_guard on public.groups;
drop trigger enrollment_group_capacity on public.enrollments;
drop trigger enrollments_history_guard on public.enrollments;

drop function public.place_learner_in_group(uuid, uuid, timestamptz, uuid, text, timestamptz, text);
drop function public.remove_learner_from_group(uuid, uuid, timestamptz, uuid, timestamptz);
drop function public.end_learner(uuid, timestamptz, text, text, uuid[]);
drop function public.close_school_year(text, integer, text);
drop function public.reopen_enrollment(uuid, timestamptz);
drop function public.restore_student(uuid);
drop function public.list_archived_students(integer, integer);
drop function public.create_enrollment(uuid, jsonb);
drop function public.save_enrollment_changes(uuid, timestamptz, jsonb);
drop function public.my_member_group_ids();

-- Bodies at migration 119 (074, 072, 119, 117, 041, 084 and 118 definitions).
CREATE OR REPLACE FUNCTION public.sync_student_from_enrollments(p_student uuid, p_force_downgrade boolean, p_previous_group uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_current public.students%rowtype;
  v_status text;
  v_group uuid;
  v_student_status text;
  v_session text;
  v_level text;
begin
  if p_student is null or pg_trigger_depth() > 1 then return; end if;
  select * into v_current from public.students where id = p_student for update;
  if not found then return; end if;

  select e.status, e.group_id, e.session_type, e.level into v_status, v_group, v_session, v_level
  from public.enrollments e where e.student_id = p_student
  order by case e.status
    when 'Validated' then 0 when 'Trial' then 1 when 'Confirmed' then 2
    when 'Under Review' then 3 when 'Submitted' then 4 else 5 end,
    e.updated_at desc, e.created_at desc, e.id desc
  limit 1;

  v_student_status := case v_status
    when 'Validated' then 'Enrolled'
    when 'Confirmed' then 'Enrolled'
    when 'Trial' then 'Trial'
    when 'Rejected' then 'Inactive'
    else 'Prospect' end;
  if not p_force_downgrade and v_status not in ('Validated','Confirmed','Trial')
    and v_current.status in ('Enrolled','Trial','Alumni') then
    v_student_status := v_current.status;
  end if;

  update public.students s set
    status = v_student_status,
    session_type = case when v_group is not null and v_status in ('Validated','Trial') then coalesce(v_session, s.session_type) else s.session_type end,
    niveau_cefr = case when v_group is not null and v_status in ('Validated','Trial') then coalesce(v_level, s.niveau_cefr) else s.niveau_cefr end,
    groupe_id = case
      when v_status in ('Validated','Trial') then v_group
      when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
      else s.groupe_id end
  where s.id = p_student
    and (s.status is distinct from v_student_status
      or (v_group is not null and v_status in ('Validated','Trial') and (s.session_type is distinct from coalesce(v_session,s.session_type)
        or s.niveau_cefr is distinct from coalesce(v_level,s.niveau_cefr)))
      or s.groupe_id is distinct from case
        when v_status in ('Validated','Trial') then v_group
        when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
        else s.groupe_id end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_student_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.student_id is null then
      raise exception 'Enrollment requires a student' using errcode = '23514';
    end if;
    if new.status in ('Validated','Trial') and new.group_id is null then
      raise exception 'Active enrollment requires a group' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
      raise exception 'Enrollment student is immutable' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.sync_student_from_enrollments(old.student_id,
      old.status in ('Validated','Trial','Confirmed'), old.group_id);
    return old;
  end if;
  perform public.sync_student_from_enrollments(new.student_id,
    tg_op = 'UPDATE' and (
      (old.status in ('Validated','Trial','Confirmed')
        and new.status not in ('Validated','Trial','Confirmed'))
      or (old.status in ('Validated','Trial') and new.status = 'Confirmed')),
    case when tg_op = 'UPDATE' then old.group_id else null end);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_enrollment_student_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_group_session text;
  v_group_level text;
begin
  if new.student_id is null then
    raise exception 'Enrollment requires a student' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    raise exception 'Enrollment student is immutable' using errcode = '23514';
  end if;
  if new.status = 'Confirmed' and new.group_id is not null then
    new.status := 'Validated';
  end if;
  if new.status in ('Validated','Trial') and new.group_id is null then
    raise exception 'Active enrollment requires a group' using errcode = '23514';
  end if;
  if new.group_id is not null and new.session_type is not null then
    select g.session_type, g.niveau into v_group_session, v_group_level
    from public.groups g where g.id = new.group_id;
    if found and (v_group_session is distinct from new.session_type
      or (new.level is not null and v_group_level is distinct from new.level)) then
      raise exception 'Enrollment group must match its session and level' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

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
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
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

CREATE OR REPLACE FUNCTION public.assign_receptionist_student_group(p_student uuid, p_enrollment uuid, p_group uuid, p_student_updated_at timestamp with time zone, p_enrollment_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; v_count integer;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found or p_student_updated_at is null or s.updated_at is distinct from p_student_updated_at then
    raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
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
    raise exception 'Enrollment unavailable or stale' using errcode='PT409'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
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
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_enrollment(p_student uuid, p_enrollment uuid DEFAULT NULL::uuid, p_group uuid DEFAULT NULL::uuid, p_status text DEFAULT 'Submitted'::text, p_level text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_session text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  effective_level:=coalesce(p_level,e.level,case
    when operational_security.valid_session_level(effective_session,s.niveau_cefr)
    then s.niveau_cefr end);
  if effective_session not in ('Yearly','Adults','Summer Camp','Communication Junior',
      'Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One') or
    (effective_year is not null and effective_year !~ '^[0-9]{4}/[0-9]{4}$') then
    raise exception 'Invalid enrollment session/year' using errcode='22023'; end if;
  if operational_security.valid_session_level(effective_session,effective_level) is not true then
    raise exception 'Invalid enrollment session/level' using errcode='23514'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.soft_delete_student(p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null
     or (public.get_my_role() in ('admin', 'director')) is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.students set deleted_at = now()
    where id = p_student_id and deleted_at is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_student_group(p_student uuid, p_group uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
  perform 1 from public.students where id=p_student for update;
  update public.enrollments set group_id=null,
    status=case when status='Trial' then 'Under Review' else 'Confirmed' end
  where student_id=p_student and group_id=p_group and status in ('Validated','Trial');
  update public.students set groupe_id=null where id=p_student and groupe_id=p_group;
end;
$function$;

CREATE OR REPLACE FUNCTION crm_security.evaluate_conversion(lead uuid, happened timestamp with time zone, previous_status text DEFAULT NULL::text, evidence text DEFAULT 'linked_confirmed_enrollment'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare l public.crm_leads%rowtype; e public.enrollments%rowtype; a uuid; t public.crm_tasks%rowtype; begin
 select * into l from public.crm_leads where id=lead for update;
 if not found or l.enrollment_id is null then return; end if;
 select * into strict e from public.enrollments where id=l.enrollment_id for update;
 if e.student_id is distinct from l.student_id then raise exception 'CRM enrollment/student mismatch' using errcode='23514'; end if;
 if l.status='CONVERTED' then
  if (e.status is null or e.status not in ('Confirmed','Validated')) and (not l.conversion_review_required or previous_status is distinct from e.status and previous_status is not null) then
   insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,details)
   values(l.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'conversion_review_required',
    'conversion-review:'||e.id||':'||gen_random_uuid(),'Inscription modifiée après confirmation : vérification par la direction.',
    jsonb_build_object('previous_enrollment_status',previous_status,'enrollment_status',e.status));
   update public.crm_leads set conversion_review_required=true,version=version+1,updated_at=now() where id=l.id;
  end if;
  return;
 end if;
 if e.status is null or e.status not in ('Confirmed','Validated') then return; end if;
 insert into public.crm_activities(lead_id,enrollment_id,attribution_submission_id,occurred_at,actor_id,actor_kind,event_type,source_key,from_status,to_status,body,details)
 values(l.id,e.id,l.first_submission_id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'lead_converted',
  'conversion:'||l.id||':'||e.id,l.status,'CONVERTED','Inscription confirmée.',jsonb_build_object('enrollment_status',e.status,'evidence',evidence))
 on conflict(source_key) do nothing returning id into a;
 if a is null then select id into strict a from public.crm_activities where source_key='conversion:'||l.id||':'||e.id; end if;
 update public.crm_leads set status='CONVERTED',converted_at=happened,conversion_activity_id=a,
 conversion_review_required=conversion_review_required or l.status in ('LOST','NOT_QUALIFIED'),
 closure_reason=null,closure_note=null,closed_at=null,version=version+1,updated_at=now() where id=l.id;
 -- System confirmations must work without a browser auth identity as well.
 for t in select * from public.crm_tasks where lead_id=l.id and status='open' order by id for update loop
  insert into public.crm_activities(lead_id,task_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
  values(l.id,t.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'task_cancelled',
   'conversion-task:'||l.id||':'||t.id,'Inscription confirmée : suivi commercial terminé.');
  update public.crm_tasks set status='cancelled',cancelled_at=happened,cancelled_by=auth.uid(),
   cancellation_reason='Inscription confirmée',version=version+1,updated_at=now() where id=t.id;
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_start_enrollment(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; c public.crm_contacts%rowtype;
 s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; a uuid; t public.crm_tasks%rowtype; keep_task uuid;
 learner text; birth date; session text; year text; level text; initial_status text; due timestamptz; result jsonb;
 followup_at timestamptz; followup_task uuid; followup jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
 or p_data-array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date','candidate_review','confirm_new','enrollment_id','expected_enrollment_updated_at','session_type','school_year','level','group_id','initial_status','followup_at','notes']<>'{}'::jsonb then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- E9: hint only the helper's own lock collision, at its original position.
 -- Every other error, including a malformed student_id cast, propagates as before.
 begin
  perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
 exception when sqlstate 'PT409' then
  if sqlerrm='Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' then
   raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409',hint='crm_enrollment.enrollment_in_progress'; end if;
  raise;
 end;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':start_enrollment:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='start_enrollment' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023',hint='crm_enrollment.request_conflict'; end if;return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 -- E1: one reason per condition of the former combined lead check.
 if not found or l.merged_into_lead_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_unavailable'; end if;
 if l.enrollment_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_already_enrolled'; end if;
 if l.status<>'QUALIFIED' then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_not_qualified'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409',hint='crm_enrollment.lead_changed'; end if;
 select * into strict c from public.crm_contacts where id=l.contact_id;
 learner:=btrim(p_data->>'learner_name');
 -- E3: same cast at the same position; only its cast errors gain a reason.
 begin
  birth:=nullif(p_data->>'birth_date','')::date;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.birth_date_invalid';
 end;
 session:=p_data->>'session_type';year:=p_data->>'school_year';level:=nullif(p_data->>'level','');initial_status:=coalesce(p_data->>'initial_status','Submitted');
 -- E2: the former combined program/year/notes check, split in its original order.
 if session is null or session<>all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One']) then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.program_invalid'; end if;
 if year is null or year!~'^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer<>left(year,4)::integer+1 then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.school_year_invalid'; end if;
 if length(p_data->>'notes')>2000 then raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.notes_too_long'; end if;
 if initial_status not in ('Submitted','Trial') then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501',hint='crm_enrollment.initial_status_not_permitted'; end if;
 if p_data->>'student_choice'='new' then
  -- E3: the same rejected set as 084, one reason per condition. A birth date is
  -- bounded by the Casablanca civil date (enrollment initiation only).
  if l.student_id is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_already_linked'; end if;
  if p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
  if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_name_invalid'; end if;
  if not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_invalid'; end if;
  if birth>(now() at time zone 'Africa/Casablanca')::date then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_future'; end if;
  -- Serializes new-student decisions for equal names, including separate leads.
  perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner),0));
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='PT409',hint='crm_enrollment.candidates_changed'; end if;
  if exists(select 1 from crm_security.student_candidates(l.id,learner,birth)) and coalesce((p_data->>'confirm_new')::boolean,false) is not true then raise exception 'Explicit new learner decision required' using errcode='22023',hint='crm_enrollment.new_learner_confirmation_required'; end if;
  insert into public.students(full_name,date_naissance,telephone,email,parent_email,status,session_type,niveau_cefr,notes)
  values(learner,birth,coalesce(c.phone_e164,c.phone_raw),case when c.contact_kind='adult_learner' then c.email_normalized end,
   case when c.contact_kind<>'adult_learner' then c.email_normalized end,'Prospect',session,level,
   case when c.contact_kind<>'adult_learner' then 'Contact : '||coalesce(c.display_name,'Non renseigné') end) returning * into s;
 elsif p_data->>'student_choice'='existing' then
  select * into s from public.students where id=(p_data->>'student_id')::uuid and deleted_at is null for update;
  -- E4: the former combined check, split by linkage.
  if not found then
   if l.student_id is not null and l.student_id=(p_data->>'student_id')::uuid then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.linked_learner_unavailable'; end if;
   if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
   raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_unavailable';
  end if;
  if l.student_id is not null and l.student_id<>s.id then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
 else raise exception 'Explicit student choice required' using errcode='22023',hint='crm_enrollment.learner_choice_required'; end if;
 if p_data->>'enrollment_id' is not null then
  select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
  -- E5: the former combined check, split into incompatibility and linkage.
  if not found or e.student_id is distinct from s.id or e.status is null or e.status='Rejected'
  or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year then
   raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_incompatible'; end if;
  if exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_already_linked'; end if;
  if e.group_id is not null then
   select * into g from public.groups where id=e.group_id for share;
   if not found or g.session_type is distinct from session or (e.level is not null and g.niveau is distinct from e.level) then
    raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.enrollment_group_incompatible'; end if;
  end if;
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='PT409',hint='crm_enrollment.enrollment_changed'; end if;
 else
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment status requires review' using errcode='22023',hint='crm_enrollment.existing_enrollment_needs_review'; end if;
  -- E6: same condition and message; the hint says whether any match is still selectable.
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected' and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected'
    and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
    then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.group_incompatible'; end if;
   level:=g.niveau;
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023',hint='crm_enrollment.level_invalid'; end if;
  -- E6: the 072 trigger's only remaining outcome for this row (23514), raised
  -- with the handler's mapped message after every earlier check has run.
  if initial_status='Trial' and g.id is null then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.trial_requires_group'; end if;
  insert into public.enrollments(student_id,session_type,school_year,level,group_id,status,date_inscription,notes)
  values(s.id,session,year,level,g.id,initial_status,current_date,p_data->>'notes') returning * into e;
 end if;
 update public.crm_leads set student_id=s.id,enrollment_id=e.id,version=version+1,updated_at=now() where id=l.id;
 insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
 values(l.id,e.id,now(),actor,'user','enrollment_started','enrollment-started:'||l.id||':'||e.id,'Inscription rattachée à l’apprenant.') returning id into a;
 perform crm_security.evaluate_conversion(l.id,statement_timestamp());
 if (select status from public.crm_leads where id=l.id)<>'CONVERTED' then
  -- Keep the earliest appropriate follow-up, cancel only redundant enrollment tasks.
  select * into t from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' order by due_at,id limit 1 for update;
  if t.id is null then
   -- E7: pre-checks logically identical to next_window and new_task, in their
   -- order; new_task still validates. An empty string stays a parse error.
   begin
    followup_at:=(p_data->>'followup_at')::timestamptz;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.followup_invalid';
   end;
   if not isfinite(followup_at) then raise exception 'Finite due time required' using errcode='22023',hint='crm_enrollment.followup_invalid'; end if;
   begin
    due:=crm_security.next_window(l.followup_policy_id,coalesce(followup_at,now()+interval '1 day'));
   exception when invalid_parameter_value then
    if sqlerrm='Policy has no available calling window' then
     raise exception 'Policy has no available calling window' using errcode='22023',hint='crm_enrollment.followup_policy_unavailable'; end if;
    raise;
   end;
   if due<now() then raise exception 'Valid future task required' using errcode='22023',hint='crm_enrollment.followup_in_past'; end if;
   if l.owner_id is not null and not exists(select 1 from public.profiles where id=l.owner_id and role in ('director','admin','receptionist')) then
    raise exception 'Assignee must be operational staff' using errcode='22023',hint='crm_enrollment.owner_not_operational'; end if;
   followup_task:=crm_security.new_task(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le parent.'),'enrollment-followup:'||l.id||':'||e.id,'enrollment');
   followup:=jsonb_build_object('id',followup_task,'created',true);
  else
   keep_task:=t.id;
   for t in select * from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' and id<>keep_task order by id for update loop
    perform crm_security.finish_task(t,true,'Suivi de cette inscription déjà prévu','enrollment-duplicate:'||e.id||':'||t.id);
   end loop;
   followup_task:=keep_task;followup:=jsonb_build_object('id',keep_task,'created',false);
  end if;
  -- E8: the created or retained task, read by id; never the loop variable.
  followup:=followup||crm_security.scheduled_civil((select due_at from public.crm_tasks where id=followup_task));
 end if;
 result:=crm_security.result(l.id,'enrollment-started:'||l.id||':'||e.id)||jsonb_build_object('enrollment',crm_security.enrollment_summary(e),'enrollment_followup',followup);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'start_enrollment',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='PT409',hint='crm_enrollment.concurrent_change';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.record_rejected';
end $function$;

CREATE OR REPLACE FUNCTION public.online_close_course(p_group uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.online_courses%rowtype; v_revoked integer;
begin
  perform online_security.require_role(array['director', 'admin']);
  c := online_security.course_for_update(p_group, p_expected_version);
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est déjà clôturé.'); end if;
  update public.online_courses set status = 'closed', version = version + 1, updated_at = now(), updated_by = auth.uid()
  where group_id = p_group returning * into c;
  update public.online_join_tokens t set revoked_at = now(), revoke_reason = 'course_closed'
  from public.online_lessons l
  where t.lesson_id = l.id and l.group_id = p_group and t.revoked_at is null and t.expires_at > now();
  get diagnostics v_revoked = row_count;
  -- The opaque room reference stays on the server: the close route resolves it as the
  -- service role through online_resolve_room (migration 118, review fix N1).
  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status, 'revoked', v_revoked);
end $function$;

CREATE FUNCTION public.sync_enrollments_from_student()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_ids uuid[];
  v_session text;
  v_level text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.groupe_id is not distinct from old.groupe_id
    and new.session_type is not distinct from old.session_type
    and new.niveau_cefr is not distinct from old.niveau_cefr then return new; end if;

  select array_agg(e.id) into v_ids from public.enrollments e
  where e.student_id = new.id and e.status in ('Confirmed','Validated','Trial')
    and old.groupe_id is not null and e.group_id = old.groupe_id;
  if v_ids is null and new.groupe_id is not null then
    select array_agg(e.id) into v_ids from public.enrollments e
    where e.student_id=new.id and e.status='Confirmed' and e.group_id is null
      and coalesce(e.session_type,old.session_type)=new.session_type;
  end if;
  if coalesce(array_length(v_ids,1),0) > 1 then
    raise exception 'Plusieurs inscriptions sont concernées. Modifiez chaque inscription depuis la fiche apprenant.' using errcode='23514';
  end if;
  if new.groupe_id is not null then
    select session_type,niveau into v_session,v_level from public.groups where id=new.groupe_id;
    if v_session is distinct from new.session_type or v_level is distinct from new.niveau_cefr then
      raise exception 'Le groupe doit correspondre à la session et au niveau.' using errcode='23514';
    end if;
  end if;
  if v_ids is not null then
    if exists(select 1 from public.enrollments where id=any(v_ids)
      and coalesce(session_type,old.session_type) is distinct from new.session_type) then
      raise exception 'Modifiez la session depuis son inscription dans la fiche apprenant.' using errcode='23514';
    end if;
    update public.enrollments set group_id=new.groupe_id,
      level=new.niveau_cefr,
      status=case when new.groupe_id is null then
        case when status='Trial' then 'Under Review' else 'Confirmed' end
        when status='Confirmed' then 'Validated' else status end
    where id=any(v_ids);
    if exists(select 1 from public.enrollments where id=any(v_ids) and status in ('Confirmed','Validated')) then
      new.status := 'Enrolled';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_enrollments_from_student() from public, anon, authenticated;
create trigger student_enrollment_assignment_sync before update of groupe_id, session_type, niveau_cefr on public.students
  for each row execute function public.sync_enrollments_from_student();
revoke all on function public.remove_student_group(uuid, uuid) from public, anon;
grant execute on function public.remove_student_group(uuid, uuid) to authenticated;

drop schema academic_security cascade;
drop table maintenance.egc_cleanup_log;
drop schema maintenance;

drop index public.enrollments_one_active_programme_year;
alter table public.enrollments drop constraint enrollments_active_requires_group,
  drop constraint enrollments_ended_shape,
  drop constraint enrollments_confirmed_has_programme;

notify pgrst, 'reload schema';
commit;
