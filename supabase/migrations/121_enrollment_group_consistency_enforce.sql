-- Batch D (plan EGC-r2, ADR-010), migration M2: enforcement. Applied only after
-- the owner-approved data clean-up (academic_security.egc_cleanup_c1 .. c5, then
-- egc_cleanup_c6 for the counts). It first refuses, changing nothing, unless every
-- invariant M1 introduced holds for every row; then it validates the constraints,
-- removes the M1 transition branch of the sync and switches every membership
-- reader to enrollments only, through academic_security.is_group_member (definer
-- readers) or public.my_member_group_ids() (the caller-rights announcements policy).
--
-- Re-created from their latest definitions: attendance_student_in_group (063,
-- now with the session date), enforce_attendance_integrity (096, passes the
-- session date), teacher_can_access_student_group (071), can_message_recipient
-- (069), resolve_storage_asset and storage_security.can_write (096),
-- search_students_page (097), sync_student_from_enrollments (M1); policy
-- "announcements audience read" (024).
begin;

-- The invariants M2 requires, one closed label per unmet invariant (none = ready).
create function academic_security.egc_enforcement_failures() returns text[]
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select array_remove(array[
    case when exists (select 1 from public.students s where s.deleted_at is null and s.groupe_id is not null
        and not academic_security.is_group_member(s.id, s.groupe_id))
      then 'I2: a learner-file group is not backed by a membership' end,
    case when exists (select 1 from public.enrollments e where e.status in ('Validated','Trial') and e.group_id is null)
      then 'I1: a Validated or Trial enrollment has no group' end,
    case when exists (select 1 from public.enrollments e where e.status in ('Confirmed','Validated','Trial')
        and (e.session_type is null or e.school_year is null))
      then 'I9: a Confirmed, Validated or Trial enrollment lacks its programme or school year' end,
    case when exists (select 1 from public.enrollments e where (e.status = 'Ended') <> (e.ended_at is not null)
        or (e.status = 'Ended' and e.group_id is not null))
      then 'I1: an Ended enrollment breaks its shape' end,
    case when exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
        where s.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))
      then 'I8: an archived learner has an active enrollment' end], null)
$$;
revoke all on function academic_security.egc_enforcement_failures() from public, anon, authenticated, service_role;

do $$ declare v_failed text[] := academic_security.egc_enforcement_failures();
begin
  if cardinality(v_failed) > 0 then
    raise exception 'EGC M2 refused: %. Run and check the clean-up first.', array_to_string(v_failed, '; ')
      using errcode = '23514';
  end if;
end $$;

alter table public.enrollments validate constraint enrollments_active_requires_group;
alter table public.enrollments validate constraint enrollments_ended_shape;
alter table public.enrollments validate constraint enrollments_confirmed_has_programme;

-- D-3 step 3, strict: no membership, no main group.
create or replace function public.sync_student_from_enrollments(
  p_student uuid, p_force_downgrade boolean, p_previous_group uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_current public.students%rowtype;
  v_status text;
  v_student_status text;
  v_leaver text := current_setting('eh.leaver_status', true);
  v_main uuid;
  v_session text;
  v_level text;
  v_flag text;
begin
  -- No depth guard any more: no trigger on students writes enrollments, so a
  -- nested enrollment write (from another trigger) must still resync.
  if p_student is null then return; end if;
  select * into v_current from public.students where id = p_student for update;
  if not found then return; end if;

  select e.status into v_status
  from public.enrollments e where e.student_id = p_student
  order by case e.status
    when 'Validated' then 0 when 'Trial' then 1 when 'Confirmed' then 2
    when 'Under Review' then 3 when 'Submitted' then 4 else 5 end,
    e.updated_at desc, e.created_at desc, e.id desc
  limit 1;

  -- I7: Enrolled from a confirmed enrollment, Trial from a trial; Alumni and
  -- Inactive only from the leaver/archive core; otherwise the 074 mapping.
  if exists (select 1 from public.enrollments e where e.student_id = p_student and e.status in ('Confirmed','Validated')) then
    v_student_status := 'Enrolled';
  elsif exists (select 1 from public.enrollments e where e.student_id = p_student and e.status = 'Trial') then
    v_student_status := 'Trial';
  elsif v_leaver in ('Alumni','Inactive') then
    v_student_status := v_leaver;
  else
    v_student_status := case v_status
      when 'Rejected' then 'Inactive'
      when 'Ended' then case when v_current.status in ('Alumni','Inactive') then v_current.status else 'Inactive' end
      else 'Prospect' end;
    if not p_force_downgrade and v_current.status in ('Enrolled','Trial','Alumni','Inactive') then
      v_student_status := v_current.status;
    end if;
  end if;

  v_main := academic_security.main_group_for(p_student, v_current.groupe_id, v_current.session_type);
  if v_main is not null then
    select g.session_type, g.niveau into v_session, v_level from public.groups g where g.id = v_main;
  end if;

  v_flag := academic_security.set_flag('eh.membership_sync', 'on');
  update public.students s set
    status = v_student_status,
    groupe_id = v_main,
    session_type = coalesce(v_session, s.session_type),
    niveau_cefr = case when v_session is not null then v_level else s.niveau_cefr end
  where s.id = p_student
    and (s.status is distinct from v_student_status or s.groupe_id is distinct from v_main
      or (v_session is not null and (s.session_type is distinct from v_session or s.niveau_cefr is distinct from v_level)));
  perform academic_security.set_flag('eh.membership_sync', v_flag);
end;
$$;

-- D-7 readers. Attendance: a membership, or an ended enrollment of the learner in
-- that group for a session before its end date, so a leaver's past attendance can
-- still be corrected. The integrity trigger now passes the session date.
drop function public.attendance_student_in_group(uuid, uuid);
create function public.attendance_student_in_group(p_student uuid, p_group uuid, p_session_date date default null)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select academic_security.is_group_member(p_student, p_group)
    or (p_session_date is not null and exists (select 1 from public.enrollments e
      where e.student_id = p_student and e.status = 'Ended' and e.ended_group_id = p_group
        and p_session_date < (e.ended_at at time zone 'Africa/Casablanca')::date))
$$;
revoke all on function public.attendance_student_in_group(uuid, uuid, date) from public, anon, authenticated;

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
  if not public.attendance_student_in_group(new.student_id, new.group_id, new.session_date) then
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

CREATE OR REPLACE FUNCTION public.teacher_can_access_student_group(p_student uuid, p_group uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select public.get_my_role() = 'teacher'
    and public.get_my_teacher_id() is not null
    and exists (
      select 1 from public.groups g
      where g.teacher_id = public.get_my_teacher_id()
        and (p_group is null or g.id = p_group)
        and academic_security.is_group_member(p_student, g.id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_message_recipient(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  with actor as (
    select p.role, p.email, p.linked_student_id
    from public.profiles p where p.id = auth.uid()
  ), target as (
    select pg_catalog.lower(pg_catalog.btrim(p_email)) as email
  ), students_for_actor as (
    select s.id, s.groupe_id from public.students s, actor a
    where a.role in ('parent','student')
      and (s.id = a.linked_student_id
        or pg_catalog.lower(s.email) = pg_catalog.lower(a.email)
        or (a.role = 'parent' and pg_catalog.lower(s.parent_email) = pg_catalog.lower(a.email)))
  ), actor_groups as (
    select g.id as group_id from public.groups g, actor a
    where a.role = 'teacher' and g.teacher_id = public.get_my_teacher_id()
  ), student_groups as (
    select g.id as group_id from public.groups g
    where exists (select 1 from students_for_actor sa where academic_security.is_group_member(sa.id, g.id))
  )
  select exists (
    select 1 from actor a, target t
    where a.role in ('director','admin','teacher','parent','student')
      and t.email <> '' and t.email is not null
      and (
        (a.role in ('director','admin') and (
          exists(select 1 from public.profiles p where p.role <> 'pending' and pg_catalog.lower(p.email) = t.email)
          or exists(select 1 from public.students s where pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
          or exists(select 1 from public.teachers x where pg_catalog.lower(x.email) = t.email)
        ))
        or exists(select 1 from public.profiles p where p.role in ('director','admin') and pg_catalog.lower(p.email) = t.email)
        or (a.role in ('parent','student') and exists (
          select 1 from public.groups g join public.teachers x on x.id = g.teacher_id
          where g.id in (select group_id from student_groups) and pg_catalog.lower(x.email) = t.email
        ))
        or (a.role = 'teacher' and exists (
          select 1 from public.students s where
            exists (select 1 from actor_groups ag where academic_security.is_group_member(s.id, ag.group_id))
            and (pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
        ))
      )
  );
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
           where academic_security.is_group_member(s.id, g.id) and t.email=(select email from public.profiles where id=auth.uid()) and t.deleted_at is null))
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
         where academic_security.is_group_member(s.id, g.id) and t.email=p.email and t.deleted_at is null)))))
     or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
       and s.plan_type='Premium' and (
         (p.role='student' and s.email=p.email) or (p.role='parent' and s.parent_email=p.email))))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$function$;

-- Caller rights (SECURITY INVOKER, staff RLS on enrollments): group name is the
-- main group plus extra_group_count; "Groupe à affecter" is the same for every
-- role; the default list is Enrolled and Trial.
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
      (select count(*) from public.enrollments e where e.student_id = s.id and e.group_id is not null
        and e.status in ('Validated','Trial') and e.group_id is distinct from s.groupe_id) as extra_group_count,
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
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (
        exists (select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null)
        or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
          where e.student_id = s.id and e.group_id is not null and e.status in ('Validated','Trial'))
          and not exists (select 1 from public.enrollments e where e.student_id = s.id
            and e.status in ('Submitted','Under Review','Confirmed'))))))
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
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial'))
  ) into v_result;
  return v_result;
end;
$function$;

-- Parents and students see group announcements for every group their learners
-- are members of.
drop policy "announcements audience read" on public.announcements;
create policy "announcements audience read" on public.announcements for select
  using (
    auth.uid() is not null
    and (
      audience = 'all'
      or (audience = 'parents'  and get_my_role() = 'parent')
      or (audience = 'teachers' and get_my_role() = 'teacher')
      or (
        audience = 'group'
        and group_id in (
          select g.id from public.groups g
          where (get_my_role() = 'teacher' and g.teacher_id = get_my_teacher_id())
             or (get_my_role() in ('parent', 'student') and g.id in (select public.my_member_group_ids()))
        )
      )
    )
  );

notify pgrst, 'reload schema';
commit;
