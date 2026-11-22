-- Restore script for migrations 131-135 (receptionist permissions, plan RPW-r2). Generated from
-- two full catalogue dumps of the local stack (clean 130 and 135) and rehearsed locally:
-- 135 → this script → the function, policy and trigger catalogue equals clean 130.
--
-- What it does, in one transaction:
--   1. drops the policies and triggers 131-135 added or changed;
--   2. re-creates every function 131-135 changed or removed with its 130 body and grants;
--   3. drops the functions 131-135 added;
--   4. re-creates the policies and triggers as they were at 130;
--   5. drops messages.channel and its check (134); re-applying 134 recomputes it from the profiles.
-- What it keeps: the activity_log rows written by the new log triggers (inert history).
-- Apart from the dropped column it changes no row. It refuses (changing nothing) unless 134 and
-- 135 are applied, and does not touch supabase_migrations.schema_migrations: the ledger rows are removed by the operator.
--
-- Run only with the owner's approval, as part of an approved rollback, and with the app
-- rolled back to a commit that does not call the 131-135 functions (stages 1-5 of PR RPW).
\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('portal_security.require_family_inviter()') is null
    or to_regprocedure('public.list_staff_recipients()') is null then
    raise exception 'Restore 131-135: migrations 134 and 135 are not applied' using errcode = '55000';
  end if;
end $$;

-- 1. Drop the policies and triggers 131-135 added or changed.
drop policy "receptionist_announcement_insert" on public.announcements;
drop policy "receptionist_announcement_read" on public.announcements;
drop policy "receptionist_delete_deny" on public.announcements;
drop policy "receptionist_update_deny" on public.announcements;
drop policy "receptionist_assessment_insert" on public.assessments;
drop policy "receptionist_assessment_update" on public.assessments;
drop policy "receptionist_authorized_adult_write" on public.authorized_adults;
drop policy "receptionist_certificate_read" on public.certificates;
drop policy "receptionist_delete_deny" on public.certificates;
drop policy "receptionist_insert_deny" on public.certificates;
drop policy "receptionist_update_deny" on public.certificates;
drop policy "receptionist_delete_deny" on public.dismissal_logs;
drop policy "receptionist_dismissal_insert" on public.dismissal_logs;
drop policy "receptionist_dismissal_read" on public.dismissal_logs;
drop policy "receptionist_update_deny" on public.dismissal_logs;
drop policy "receptionist_delete_deny" on public.learning_assessments;
drop policy "receptionist_learning_assessment_insert" on public.learning_assessments;
drop policy "receptionist_learning_assessment_read" on public.learning_assessments;
drop policy "receptionist_update_deny" on public.learning_assessments;
drop policy "receptionist_delete_deny" on public.leave_requests;
drop policy "receptionist_insert_deny" on public.leave_requests;
drop policy "receptionist_leave_request_read" on public.leave_requests;
drop policy "receptionist_update_deny" on public.leave_requests;
drop policy "receptionist_delete_deny" on public.messages;
drop policy "receptionist_office_message_insert" on public.messages;
drop policy "receptionist_office_message_read" on public.messages;
drop policy "receptionist_office_message_update" on public.messages;
drop policy "receptionist_delete_deny" on public.notifications;
drop policy "receptionist_notification_insert" on public.notifications;
drop policy "receptionist_notification_read" on public.notifications;
drop policy "receptionist_update_deny" on public.notifications;
drop policy "receptionist_delete_deny" on public.portfolios;
drop policy "receptionist_portfolio_insert" on public.portfolios;
drop policy "receptionist_portfolio_read" on public.portfolios;
drop policy "receptionist_update_deny" on public.portfolios;
drop trigger groups_capacity_log on public.groups;
drop trigger a_receptionist_message_read_only on public.messages;
drop trigger portal_recipient_zchannel on public.messages;
drop trigger students_email_change_log on public.students;

-- 2. Re-create every function 131-135 replaced, with its 130 body and grants.
CREATE OR REPLACE FUNCTION academic_security.place(p_student uuid, p_group uuid, p_enrollment uuid, p_school_year text, p_student_updated_at timestamp with time zone, p_enrollment_updated_at timestamp with time zone, p_override_reason text, p_require_fresh boolean, p_without_enrollment_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students; e public.enrollments; g public.groups; v_locked public.groups;
  v_ids uuid[]; v_year text; v_id uuid; v_full boolean := false; v_flag text; v_constraint text;
  v_reason text := nullif(btrim(p_override_reason), '');
  v_role text := public.get_my_role();
begin
  s := academic_security.lock_learner(p_student, p_student_updated_at, p_require_fresh);
  select * into g from public.groups where id = p_group;
  if not found then raise exception 'Groupe introuvable.' using errcode = '23514', hint = 'egc.group_unavailable'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id = p_enrollment for update;
    if not found or e.student_id is distinct from p_student or (p_require_fresh
        and (p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at)) then
      perform academic_security.stale();
    end if;
  else
    -- DAT-1: only the enrollment of this group's programme; others stay untouched.
    v_year := coalesce(nullif(btrim(p_school_year), ''), academic_security.school_year_of(g.annee));
    if not academic_security.valid_school_year(v_year) then
      raise exception 'Année scolaire requise pour cette affectation.' using errcode = '22023', hint = 'egc.school_year_required';
    end if;
    select array_agg(x.id order by x.id) into v_ids from public.enrollments x
    where x.student_id = p_student and x.session_type = g.session_type and x.school_year = v_year
      and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
    if cardinality(v_ids) > 1 or (v_ids is null and exists (select 1 from public.enrollments x
        where x.student_id = p_student and coalesce(x.session_type, g.session_type) = g.session_type
          and x.school_year is distinct from v_year and x.group_id is null
          and x.status in ('Submitted','Under Review','Confirmed'))) then
      raise exception 'Sélectionnez l’inscription à affecter.' using errcode = '23514', hint = 'egc.select_enrollment';
    end if;
    if v_ids is not null then
      select * into e from public.enrollments where id = v_ids[1] for update;
      -- D1: one group per programme and year; moving needs the enrollment named.
      if e.group_id is not null and e.group_id <> p_group then
        raise exception 'Cet apprenant est déjà dans un autre groupe de ce programme pour cette année.'
          using errcode = '23514', hint = 'egc.already_placed';
      end if;
    end if;
  end if;
  -- The group last: the share lock holds its programme and level (I5) for the write.
  select * into v_locked from public.groups where id = p_group for share;
  if not found or v_locked.session_type is distinct from g.session_type or v_locked.niveau is distinct from g.niveau
     or v_locked.annee is distinct from g.annee then
    perform academic_security.stale();
  end if;
  if e.id is not null then
    if e.status not in ('Submitted','Under Review','Confirmed','Validated','Trial') then
      raise exception 'Cette inscription ne peut pas être affectée.' using errcode = '23514', hint = 'egc.enrollment_not_placeable';
    end if;
    -- While placed, an enrollment's level is its group's (I4): a move takes the
    -- new group's level; an unplaced enrollment with a level must match.
    if coalesce(e.session_type, g.session_type) is distinct from g.session_type
       or (e.group_id is null and e.level is not null and e.level is distinct from g.niveau) then
      raise exception 'Le groupe doit correspondre au programme et au niveau de l’inscription.'
        using errcode = '23514', hint = 'egc.group_mismatch';
    end if;
    if e.group_id is not distinct from p_group then return e.id; end if;
    v_year := coalesce(e.school_year, nullif(btrim(p_school_year), ''), academic_security.school_year_of(g.annee));
    if e.status in ('Confirmed','Validated','Trial') and not academic_security.valid_school_year(v_year) then
      raise exception 'Année scolaire requise pour cette affectation.' using errcode = '22023', hint = 'egc.school_year_required';
    end if;
  end if;
  -- EAP (Q3 = B): a placement follows a paid enrollment. Reception places only a
  -- Confirmed or Validated enrollment of the group's programme and year; director
  -- and admin may place a learner without one (creating the enrollment, or placing
  -- a legacy unpaid row) with a dedicated reason, distinct from the capacity
  -- override, logged and listed in Contrôles.
  if e.id is null or e.status not in ('Confirmed','Validated') then
    if coalesce(v_role, '') = 'receptionist' then
      raise exception 'Inscrivez et encaissez d’abord : l’affectation suit une inscription payée.'
        using errcode = '23514', hint = 'eap.paid_enrollment_required';
    end if;
    if not academic_security.valid_reason(p_without_enrollment_reason) then
      raise exception 'Motif requis pour affecter sans inscription payée (200 caractères au plus).'
        using errcode = '23514', hint = 'eap.placement_reason_required';
    end if;
  end if;
  -- I6: capacity, overridable by director/admin with a reason (D4-A).
  if not online_security.is_online_type(g.session_type) and g.capacite_max is not null then
    perform pg_advisory_xact_lock(hashtextextended('group:seats:' || p_group::text, 0));
    v_full := academic_security.seats_taken(p_group, p_student) >= g.capacite_max;
    if v_full and v_reason is null then
      raise exception 'Ce groupe est complet.' using errcode = '23514', hint = 'egc.capacity';
    end if;
    if v_full and (coalesce(public.get_my_role(), '') not in ('director','admin') or char_length(v_reason) > 200) then
      raise exception 'Seule la direction peut dépasser la capacité, avec un motif de 200 caractères au plus.'
        using errcode = '42501', hint = 'egc.capacity_override_forbidden';
    end if;
  end if;
  v_flag := academic_security.set_flag('eh.capacity_override', case when v_full then 'on' else '' end);
  begin
    if e.id is not null then
      update public.enrollments set group_id = p_group, session_type = g.session_type,
        level = case when e.group_id is null then coalesce(e.level, g.niveau) else g.niveau end, school_year = v_year
      where id = e.id returning id into v_id;
    else
      insert into public.enrollments(student_id, group_id, status, level, session_type, school_year, date_inscription)
      values (p_student, p_group, 'Validated', g.niveau, g.session_type, v_year, academic_security.today())
      returning id into v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  perform academic_security.set_flag('eh.capacity_override', v_flag);
  if v_full then
    perform academic_security.log('capacity_override', v_id, p_student, p_group, jsonb_build_object('reason', btrim(v_reason)));
  end if;
  if e.id is null or e.status not in ('Confirmed','Validated') then
    perform academic_security.log('placement_without_enrollment', v_id, p_student, p_group,
      jsonb_build_object('reason', btrim(p_without_enrollment_reason), 'author_role', v_role));
  end if;
  return v_id;
end $function$;
revoke all on function academic_security.place(p_student uuid, p_group uuid, p_enrollment uuid, p_school_year text, p_student_updated_at timestamp with time zone, p_enrollment_updated_at timestamp with time zone, p_override_reason text, p_require_fresh boolean, p_without_enrollment_reason text) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION operational_security.has_capability(p_capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;
revoke all on function operational_security.has_capability(p_capability text) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION portal_security.account_sees(p_profile uuid, p_student uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select exists (select 1 from public.profiles p where p.id = p_profile and (
    p.role in ('director', 'admin')
    or (p.role in ('parent', 'student') and exists (select 1 from public.family_links fl
      join public.students s on s.id = fl.student_id
      where fl.profile_id = p.id and fl.student_id = p_student and fl.status = 'active' and s.deleted_at is null
        and fl.relation = case p.role when 'parent' then 'parent' else 'self' end))
    or (p.role = 'teacher' and portal_security.teacher_member(p.linked_teacher_id, p_student))))
$function$;
revoke all on function portal_security.account_sees(p_profile uuid, p_student uuid) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION portal_security.queue_role_invitation(p_email text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare
  actor_role text; target public.profiles%rowtype;
  normalized_email text := lower(btrim(p_email)); queue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if normalized_email is null or length(normalized_email) > 254 or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('portal.invite:' || normalized_email, 0));
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
      expires_at=excluded.expires_at, teacher_id=null
    returning id into queue_id;
  delete from public.family_links where pending_role_id = queue_id and status = 'pending';
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'INSERT','pending_roles',queue_id,array['role','invited_by','target_user_id','expires_at'],
      jsonb_build_object('role',p_role,'invited_by',auth.uid(),'target_user_id',target.id));
  return jsonb_build_object('success',true,'alreadyRegistered',target.id is not null,
    'needsDelivery',not exists(select 1 from auth.users where id=target.id and email_confirmed_at is not null),
    'userId',target.id,'role',p_role,'email',normalized_email,'queueId',queue_id);
end $function$;
revoke all on function portal_security.queue_role_invitation(p_email text, p_role text) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION portal_security.recipient_for(p_email text, p_student uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select p.id from public.profiles p
  where portal_security.norm_email(p_email) is not null
    and portal_security.norm_email(p.email) = portal_security.norm_email(p_email)
    and case when p_student is null then p.role in ('director', 'admin', 'teacher')
      else portal_security.account_sees(p.id, p_student) end
  order by p.created_at, p.id limit 1
$function$;
revoke all on function portal_security.recipient_for(p_email text, p_student uuid) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.apply_pending_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare target public.profiles%rowtype; queued public.pending_roles%rowtype;
  issuer_role text; verified_email text; pending public.family_links%rowtype;
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
  -- Portal links: activate this queue row's pending links of the matching
  -- relation, detached from the queue row before it is deleted. A link that no
  -- longer passes its checks stays pending and goes with the queue row.
  if queued.role in ('parent','student') then
    for pending in select * from public.family_links where pending_role_id = queued.id and status = 'pending'
        and relation = case queued.role when 'parent' then 'parent' else 'self' end order by created_at, id loop
      begin
        perform portal_security.activate_link(target.id, pending.student_id, pending.relation, pending.invite_email, pending.id);
      exception when sqlstate 'PT409' or sqlstate '42501' or sqlstate '22023' then null;
      end;
    end loop;
  elsif queued.role = 'teacher' and queued.teacher_id is not null
    and exists (select 1 from public.teachers t where t.id = queued.teacher_id and t.deleted_at is null)
    and not exists (select 1 from public.profiles p where p.linked_teacher_id = queued.teacher_id and p.id <> target.id) then
    update public.profiles set linked_teacher_id = queued.teacher_id where id = target.id;
  end if;
  delete from public.pending_roles where id=queued.id;
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'DELETE','pending_roles',queued.id,array['role'],
      jsonb_build_object('activated_role',queued.role,'authorized_by',queued.invited_by));
  return queued.role;
end $function$;
revoke all on function public.apply_pending_role() from public, anon, authenticated, service_role;
grant execute on function public.apply_pending_role() to authenticated;
CREATE OR REPLACE FUNCTION public.can_message_recipient(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_role text; v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is null or v_role not in ('director', 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email <> '' and v_email is not null and (
    exists(select 1 from public.profiles p where p.role <> 'pending' and pg_catalog.lower(p.email) = v_email)
    or exists(select 1 from public.students s where pg_catalog.lower(s.email) = v_email or pg_catalog.lower(s.parent_email) = v_email)
    or exists(select 1 from public.teachers x where pg_catalog.lower(x.email) = v_email));
end;
$function$;
revoke all on function public.can_message_recipient(p_email text) from public, anon, authenticated, service_role;
grant execute on function public.can_message_recipient(p_email text) to service_role;
grant execute on function public.can_message_recipient(p_email text) to authenticated;
CREATE OR REPLACE FUNCTION public.end_learner(p_student uuid, p_student_updated_at timestamp with time zone, p_final_status text, p_reason text, p_enrollments uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students; v_count integer;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  s := academic_security.lock_learner(p_student, p_student_updated_at, true);
  v_count := academic_security.leave(p_student, p_final_status, p_reason, p_enrollments);
  perform academic_security.log('leaver', null, p_student, null,
    jsonb_build_object('reason', btrim(p_reason), 'final_status', p_final_status, 'ended', v_count));
  select * into s from public.students where id = p_student;
  return jsonb_build_object('ended', v_count, 'status', s.status, 'updated_at', s.updated_at,
    'open_balance', (select coalesce(sum(c.balance), 0) from public.charge_balances c
      where c.student_id = p_student and c.voided_at is null and c.balance > 0));
end $function$;
revoke all on function public.end_learner(p_student uuid, p_student_updated_at timestamp with time zone, p_final_status text, p_reason text, p_enrollments uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.end_learner(p_student uuid, p_student_updated_at timestamp with time zone, p_final_status text, p_reason text, p_enrollments uuid[]) to authenticated;
CREATE OR REPLACE FUNCTION public.enforce_dismissal_integrity()
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
  if v_role not in ('admin','director') or v_staff is null or pg_catalog.btrim(v_staff) = '' then
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
revoke all on function public.enforce_dismissal_integrity() from public, anon, authenticated, service_role;
grant execute on function public.enforce_dismissal_integrity() to service_role;
drop function public.get_teacher_operations(p_teacher_id uuid, p_limit integer, p_offset integer);  -- its result type changed after 130
CREATE OR REPLACE FUNCTION public.get_teacher_operations(p_teacher_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, email text, telephone text, certifications text[], niveaux_autorises text[], photo_url text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
  perform operational_security.require_capability('manage_teacher_operations');
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then
    raise exception 'Invalid teacher page' using errcode='22023';
  end if;
  return query select t.id,t.full_name,t.email,t.telephone,t.certifications,
    t.niveaux_autorises,t.photo_url,t.updated_at
  from public.teachers t where t.deleted_at is null and (p_teacher_id is null or t.id=p_teacher_id)
  order by t.full_name,t.id limit p_limit offset p_offset;
end $function$;
revoke all on function public.get_teacher_operations(p_teacher_id uuid, p_limit integer, p_offset integer) from public, anon, authenticated, service_role;
grant execute on function public.get_teacher_operations(p_teacher_id uuid, p_limit integer, p_offset integer) to authenticated;
CREATE OR REPLACE FUNCTION public.prepare_family_invitation(p_email text, p_role text, p_student_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_email text := portal_security.norm_email(p_email); v_selected uuid[]; v_result jsonb; v_queue uuid;
  v_relation text := case p_role when 'parent' then 'parent' else 'self' end; v_links jsonb := '[]'::jsonb; v_id uuid; sid uuid;
begin
  perform portal_security.require_manager();
  if v_email is null or not pg_try_advisory_xact_lock(hashtextextended('portal.invite:' || v_email, 0)) then
    if v_email is null then perform portal_security.fail('invalid_email', '22023', 'Adresse e-mail invalide.'); end if;
    perform portal_security.fail('stale', 'PT409', 'Une autre invitation de cette adresse est en cours. Rechargez.');
  end if;
  v_selected := portal_security.check_family_selection(v_email, p_role, p_student_ids);
  v_result := portal_security.queue_role_invitation(v_email, p_role);
  v_queue := (v_result->>'queueId')::uuid;
  foreach sid in array v_selected loop
    if v_queue is not null then
      insert into public.family_links(student_id, relation, invite_email, pending_role_id, status, created_by)
      values (sid, v_relation, v_email, v_queue, 'pending', auth.uid()) returning id into v_id;
      perform portal_security.log('INSERT', 'family_links', v_id,
        jsonb_build_object('student_id', sid, 'relation', v_relation, 'status', 'pending'));
      v_links := v_links || jsonb_build_object('id', v_id, 'student_id', sid, 'status', 'pending');
    else
      -- The account already holds this role: the links are active at once.
      v_id := portal_security.activate_link((v_result->>'userId')::uuid, sid, v_relation, v_email);
      v_links := v_links || jsonb_build_object('id', v_id, 'student_id', sid, 'status', 'active');
    end if;
  end loop;
  return (v_result - 'queueId') || jsonb_build_object('links', v_links);
end $function$;
revoke all on function public.prepare_family_invitation(p_email text, p_role text, p_student_ids uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.prepare_family_invitation(p_email text, p_role text, p_student_ids uuid[]) to authenticated;
CREATE OR REPLACE FUNCTION public.preview_family_invitation(p_email text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_email text := portal_security.norm_email(p_email); v_matches uuid[]; v_hint text; v_message text; v_refusal jsonb;
begin
  perform portal_security.require_manager();
  v_matches := portal_security.family_matches(v_email, p_role);
  begin
    perform portal_security.check_family_address(v_email, p_role);
    if p_role = 'student' and cardinality(v_matches) > 0 then
      perform portal_security.check_family_selection(v_email, p_role, v_matches);
    end if;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_message = message_text;
    if coalesce(v_hint, '') not like 'portal.%' then raise; end if;
    v_refusal := jsonb_build_object('reason', v_hint, 'message', v_message);
  end;
  return jsonb_build_object(
    'refusal', v_refusal,
    'matches', coalesce((select jsonb_agg(jsonb_build_object('student_id', s.id, 'full_name', s.full_name,
        'age_category', s.age_category, 'status', s.status,
        'groups', coalesce((select jsonb_agg(g.name order by g.name) from public.groups g
          where academic_security.is_group_member(s.id, g.id)), '[]'::jsonb),
        'linked', exists (select 1 from public.family_links fl where fl.student_id = s.id and fl.status = 'active'
          and fl.relation = case p_role when 'parent' then 'parent' else 'self' end))
      order by s.full_name, s.id) from public.students s where s.id = any(v_matches)), '[]'::jsonb),
    'mixed_surnames', (select count(distinct lower(regexp_replace(btrim(s.full_name), '^.*\s', ''))) > 1
      from public.students s where s.id = any(v_matches)),
    'mixed_phones', (select count(distinct regexp_replace(s.telephone, '\D', '', 'g')) > 1
      from public.students s where s.id = any(v_matches) and nullif(regexp_replace(s.telephone, '\D', '', 'g'), '') is not null));
end $function$;
revoke all on function public.preview_family_invitation(p_email text, p_role text) from public, anon, authenticated, service_role;
grant execute on function public.preview_family_invitation(p_email text, p_role text) to authenticated;
CREATE OR REPLACE FUNCTION public.reopen_enrollment(p_enrollment uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare e public.enrollments; v_student uuid; v_flag text; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
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
revoke all on function public.reopen_enrollment(p_enrollment uuid, p_expected_updated_at timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.reopen_enrollment(p_enrollment uuid, p_expected_updated_at timestamp with time zone) to authenticated;
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
revoke all on function public.resolve_storage_asset(p_asset_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.resolve_storage_asset(p_asset_id uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.revoke_family_link(p_link_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_link public.family_links%rowtype;
begin
  perform portal_security.require_manager();
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 200 then
    perform portal_security.fail('invalid_reason', '22023', 'Indiquez un motif (200 caractères au plus).');
  end if;
  select * into v_link from public.family_links where id = p_link_id for update;
  if v_link.id is null or v_link.status <> 'active' then
    perform portal_security.fail('link_not_active', 'PT409', 'Cet accès n’est plus actif. Rechargez.');
  end if;
  update public.family_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(),
    revoke_reason = btrim(p_reason) where id = p_link_id;
  perform portal_security.log('UPDATE', 'family_links', p_link_id,
    jsonb_build_object('student_id', v_link.student_id, 'relation', v_link.relation, 'status', 'revoked'));
  return jsonb_build_object('id', p_link_id, 'status', 'revoked');
end $function$;
revoke all on function public.revoke_family_link(p_link_id uuid, p_reason text) from public, anon, authenticated, service_role;
grant execute on function public.revoke_family_link(p_link_id uuid, p_reason text) to authenticated;
CREATE OR REPLACE FUNCTION public.save_enrollment_changes(p_enrollment uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare e public.enrollments; g public.groups; v_student uuid; v_status text; v_session text; v_year text;
  v_level text; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform operational_security.assert_keys(p_changes, array['status','level','date_inscription','notes','session_type','school_year']);
  if p_changes = '{}'::jsonb then raise exception 'Aucune modification.' using errcode = '22023'; end if;
  select x.student_id into v_student from public.enrollments x where x.id = p_enrollment;
  if not found then perform academic_security.stale(); end if;
  perform academic_security.lock_learner(v_student, null, false);
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    perform academic_security.stale();
  end if;
  if e.status = 'Ended' and exists (select 1 from jsonb_object_keys(p_changes) k where k <> 'notes') then
    raise exception 'Une inscription terminée ne se modifie que par ses notes.' using errcode = '23514', hint = 'egc.ended_read_only';
  end if;
  v_status := case when p_changes ? 'status' then p_changes->>'status' else e.status end;
  v_session := case when p_changes ? 'session_type' then nullif(p_changes->>'session_type', '') else e.session_type end;
  v_year := case when p_changes ? 'school_year' then nullif(p_changes->>'school_year', '') else e.school_year end;
  v_level := case when p_changes ? 'level' then nullif(p_changes->>'level', '') else e.level end;
  -- EAP (D4, Q5): no status change here any more; an unchanged status key passes.
  if v_status is distinct from e.status then
    raise exception 'Ce changement de statut passe par le paiement, l’affectation ou « Ancien apprenant ».'
      using errcode = '23514', hint = 'egc.status_not_permitted';
  end if;
  if (e.session_type is not null and v_session is distinct from e.session_type)
     or (e.school_year is not null and v_year is distinct from e.school_year) then
    raise exception 'Le programme et l’année scolaire ne changent plus une fois fixés.' using errcode = '23514', hint = 'egc.programme_fixed';
  end if;
  if (v_session is not null and operational_security.valid_session_level(v_session, v_level) is not true)
     or (v_year is not null and not academic_security.valid_school_year(v_year)) then
    raise exception 'Programme, niveau ou année scolaire invalide.' using errcode = '22023', hint = 'egc.level_invalid';
  end if;
  if e.group_id is not null then
    select * into g from public.groups where id = e.group_id for share;
    if (v_session is not null and v_session is distinct from g.session_type)
       or (v_level is not null and v_level is distinct from g.niveau) then
      raise exception 'Le groupe doit correspondre au programme et au niveau de l’inscription.'
        using errcode = '23514', hint = 'egc.group_mismatch';
    end if;
  end if;
  if v_status not in ('Rejected','Ended') and v_session is not null and v_year is not null and exists (
      select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
        and x.session_type = v_session and x.school_year = v_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  begin
    update public.enrollments set status = v_status, session_type = v_session, school_year = v_year, level = v_level,
      date_inscription = case when p_changes ? 'date_inscription' then nullif(p_changes->>'date_inscription', '')::date else date_inscription end,
      notes = case when p_changes ? 'notes' then nullif(p_changes->>'notes', '') else notes end
    where id = e.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return e.id;
end $function$;
revoke all on function public.save_enrollment_changes(p_enrollment uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_enrollment_changes(p_enrollment uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) to authenticated;
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
revoke all on function public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.save_receptionist_teacher_operations(p_teacher uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare t public.teachers%rowtype; begin
  perform operational_security.require_receptionist();
  perform operational_security.assert_keys(p_changes,array['full_name','telephone','certifications','niveaux_autorises']);
  if p_changes='{}'::jsonb or p_expected_updated_at is null then raise exception 'Missing changes/version' using errcode='22023'; end if;
  select * into t from public.teachers where teachers.id=p_teacher and deleted_at is null for update;
  if not found or t.updated_at is distinct from p_expected_updated_at then
    raise exception 'Teacher unavailable or stale' using errcode='PT409';
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
end $function$;
revoke all on function public.save_receptionist_teacher_operations(p_teacher uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_receptionist_teacher_operations(p_teacher uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) to authenticated;
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
       (p.role='student' and portal_security.family_linked(p.id, s.id)) or
       (p.role='teacher' and portal_security.teacher_member(p.linked_teacher_id, s.id)))))
     or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
       and s.plan_type='Premium' and p.role in ('student','parent') and portal_security.family_linked(p.id, s.id)))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$function$;
revoke all on function storage_security.can_write(actor uuid, purpose text, sid uuid, tid uuid, eid uuid) from public, anon, authenticated, service_role;

-- 3. Drop the functions 131-135 added.
drop function academic_security.log_group_capacity();
drop function academic_security.log_student_email_change();
drop function operational_security.capability_roles();
drop function operational_security.family_link_holds(p_student uuid, p_relation text, p_address text);
drop function operational_security.receptionist_message_read_only();
drop function operational_security.role_has_capability(p_role text, p_capability text);
drop function portal_security.message_channel(p_sender uuid, p_recipient uuid, p_from text, p_to text);
drop function portal_security.message_party(p_profile uuid, p_email text);
drop function portal_security.require_family_inviter();
drop function portal_security.set_message_channel();
drop function public.list_staff_recipients();

-- 4. Re-create the policies and triggers as they were at 130.
create policy "receptionist_deny" on public.announcements as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_insert_deny" on public.assessments as restrictive for insert to authenticated
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_update_deny" on public.assessments as restrictive for update to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_delete_deny" on public.authorized_adults as restrictive for delete to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_insert_deny" on public.authorized_adults as restrictive for insert to authenticated
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_update_deny" on public.authorized_adults as restrictive for update to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.certificates as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.dismissal_logs as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.learning_assessments as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.leave_requests as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.messages as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.notifications as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));
create policy "receptionist_deny" on public.portfolios as restrictive for all to authenticated
  using ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text))
  with check ((( SELECT get_my_role() AS get_my_role) IS DISTINCT FROM 'receptionist'::text));

-- 5. Drop messages.channel (134) and its check. Nothing at 130 reads it; re-applying 134
--    recomputes every row from the profiles (its backfill), so no information is lost.
alter table public.messages drop column channel;
-- End of the generated restore.
notify pgrst, 'reload schema';
commit;
