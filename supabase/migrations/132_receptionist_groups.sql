-- Receptionist permissions, stage 2 (plan RPW-r2, table A items 9-13, bugs C1-1 to C1-3, C2-1).
-- She uses the management enrollment dialog and group page: level, date and notes of an
-- enrollment (edit_enrollment), a full group with a logged reason (override_capacity) and a
-- placement without a paid enrollment with a logged reason (place_without_paid_enrollment).
-- Director and admin answers are unchanged; a call without a role keeps its 127 answer.
-- The bodies below are the live 127 definitions with only the role tests replaced.
-- The retired reception commands (save_receptionist_enrollment, assign_receptionist_student_group)
-- are not changed and keep working for an old application: they pass no reason, so a full
-- group still answers egc.capacity and an unpaid learner now answers eap.placement_reason_required
-- (was eap.paid_enrollment_required). They are revoked later (follow-up F3).
-- New: groups_capacity_log writes an activity_log row whenever capacite_max changes (all roles, all paths).
begin;

-- The list, with the three stage 2 names (ops).
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
    ('edit_student_programme', array['director','admin']),
    ('manage_teacher_hr', array['director','admin']),
    ('delete_academic_records', array['director','admin']),
    ('manage_own_account', array['director','admin','receptionist','teacher','parent','student'])
  ) as c(capability, roles)
$$;

-- Items 10 and 13.
create or replace function public.save_enrollment_changes(p_enrollment uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare e public.enrollments; g public.groups; v_student uuid; v_status text; v_session text; v_year text;
  v_level text; v_constraint text;
begin
  -- RPW-r2 (items 10, 13): level, date and notes by capability; every other refusal stays.
  perform operational_security.require_capability('edit_enrollment');
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

-- Items 9, 11, 12 (place_learner_in_group and the receipt placement call this core).
create or replace function academic_security.place(p_student uuid, p_group uuid, p_enrollment uuid, p_school_year text, p_student_updated_at timestamp with time zone, p_enrollment_updated_at timestamp with time zone, p_override_reason text, p_require_fresh boolean, p_without_enrollment_reason text DEFAULT NULL::text)
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
    -- RPW-r2 (item 12): a capability; a call without a role (maintenance) keeps its 127 answer.
    if v_role is not null and not operational_security.role_has_capability(v_role, 'place_without_paid_enrollment') then
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
    -- RPW-r2 (item 11): a capability; a call without a role is refused as in 127.
    if v_full and (not operational_security.role_has_capability(coalesce(v_role, ''), 'override_capacity') or char_length(v_reason) > 200) then
      raise exception 'Le dépassement de capacité demande un motif de 200 caractères au plus.'
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

-- C2-1: who changed a group's capacity, when, old -> new.
create function academic_security.log_group_capacity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text;
begin
  if new.capacite_max is not distinct from old.capacite_max then return null; end if;
  select p.email into v_email from public.profiles p where p.id = auth.uid();
  insert into public.activity_log(actor_id, actor_email, action, target_table, target_id, changed_columns, before, after)
  values (auth.uid(), v_email, 'UPDATE', 'groups', new.id, array['capacite_max'],
    jsonb_build_object('capacite_max', old.capacite_max),
    jsonb_build_object('capacite_max', new.capacite_max, 'kind', 'group_capacity', 'author_role', public.get_my_role()));
  return null;
end $$;
revoke all on function academic_security.log_group_capacity() from public, anon, authenticated, service_role;
create trigger groups_capacity_log after update of capacite_max on public.groups
  for each row execute function academic_security.log_group_capacity();

notify pgrst, 'reload schema';

commit;
