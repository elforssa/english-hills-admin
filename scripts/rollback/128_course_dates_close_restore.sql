-- Restore for migration 128 (Courses with dates — close a finished course, plan CDC-r3).
-- Forward-applicable: run only after the application is rolled back to the 127 build
-- (application first, then database; plan "Release and rollback order with the old
-- application" and "Recovery"), and only with its own owner approval. It drops the new
-- director commands, the year-close preview, the family helper, the course helpers, the two
-- new triggers (groups_course_guard, enrollment_course_guard) and their functions, and the
-- two new read policies; re-creates « groups read all auth » with its 124 text; returns
-- guard_group_year (and groups_year_guard), save_receptionist_group and
-- crm_enrollment_groups to their 125 bodies, and close_school_year and
-- enforce_group_capacity to their 120 bodies, verbatim (pg_get_functiondef of a clean 127
-- build). It keeps the four group columns, the order check, maintenance.course_close_journal
-- and every closed mark: they become inert (dropping them is a separate decision). While
-- the restore is in effect closed courses are no longer protected and parents and
-- students again read every group row. It changes no data and refuses, changing nothing,
-- unless migration 128 is applied. The ledger row 128 is removed by the operator wrapper,
-- not here.
begin;

do $$ begin
  if to_regprocedure('public.close_course(uuid,integer,text,uuid[],uuid[])') is null then
    raise exception 'Restore 128: migration 128 is not applied' using errcode = '55000';
  end if;
end $$;

drop policy "groups read family" on public.groups;
drop policy "groups read staff" on public.groups;
create policy "groups read all auth" on public.groups for select to authenticated
  using (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (COALESCE(( SELECT get_my_role() AS get_my_role), 'pending'::text) <> 'pending'::text)));
drop function public.family_group_ids();

drop function public.list_courses_to_close();
drop function public.close_course_preview(uuid);
drop function public.close_course(uuid, integer, text, uuid[], uuid[]);
drop function public.reopen_course(uuid, timestamptz);
drop function public.close_school_year_preview(text);

drop trigger enrollment_course_guard on public.enrollments;
drop function academic_security.guard_course_placement();
drop trigger groups_course_guard on public.groups;
drop function academic_security.guard_course_group();

drop function academic_security.year_close_rows(text);
drop function academic_security.course_close_replay(uuid);
drop function academic_security.course_late_deposits(uuid, date);
drop function academic_security.course_engagements(uuid);
drop function academic_security.course_link_charges(uuid);
drop function academic_security.course_unplaced(uuid);
drop function academic_security.course_of_one_allows(uuid, integer, uuid);
drop function academic_security.course_dates_required(text);

-- BEGIN 127 FUNCTIONS (125: guard_group_year, save_receptionist_group, crm_enrollment_groups;
-- 120: close_school_year, enforce_group_capacity)
CREATE OR REPLACE FUNCTION academic_security.guard_group_year()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' and nullif(btrim(new.annee), '') is null then
    new.annee := replace(public.centre_school_year(), '/', '-');
  end if;
  if tg_op = 'UPDATE' and new.annee is not distinct from old.annee then return new; end if;
  -- A group's year is never cleared once set.
  if tg_op = 'UPDATE' and nullif(btrim(new.annee), '') is null then
    raise exception 'Renseignez l’année scolaire du groupe.' using errcode = '22023', hint = 'egc.group_year_missing';
  end if;
  if nullif(btrim(new.annee), '') is not null and academic_security.school_year_of(new.annee) is null then
    raise exception 'Année scolaire du groupe invalide : utilisez le format 2026/2027.'
      using errcode = '22023', hint = 'egc.group_year_invalid';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.enrollments e where e.group_id = old.id
      and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      and academic_security.school_year_of(e.school_year) is distinct from academic_security.school_year_of(new.annee)) then
    raise exception 'Réaffectez les apprenants avant de changer l’année scolaire du groupe.'
      using errcode = '23514', hint = 'egc.group_year_locked';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_receptionist_group(p_group uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare g public.groups%rowtype;
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
        g.terme is distinct from p_changes->>'terme' or g.annee is distinct from coalesce(nullif(btrim(p_changes->>'annee'),''),g.annee) or
        g.categorie is distinct from p_changes->>'categorie' then
        raise exception 'Group create identity conflict' using errcode='23505'; end if;
      id:=g.id; updated_at:=g.updated_at;
    end if;
  else
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into g from public.groups where groups.id=p_group for update;
    if not found or g.updated_at is distinct from p_expected_updated_at then
      raise exception 'Group unavailable or stale' using errcode='PT409'; end if;
    v_session:=case when p_changes ? 'session_type' then p_changes->>'session_type' else g.session_type end;
    v_level:=case when p_changes ? 'niveau' then p_changes->>'niveau' else g.niveau end;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and
      operational_security.valid_session_level(v_session,v_level) is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and (
      exists(select 1 from public.enrollments e where e.group_id=p_group)
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
end $function$
;

CREATE OR REPLACE FUNCTION public.crm_enrollment_groups(p_session text, p_level text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 with eligible as(select id,name,niveau,session_type,annee from public.groups where session_type=p_session and (p_level is null or niveau=p_level)),
 page as(select * from eligible order by name,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from page p),'[]'::jsonb)) into result;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.close_school_year(p_school_year text, p_expected_count integer, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_count integer; v_student uuid; v_ended integer := 0;
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not academic_security.valid_school_year(p_school_year) then
    raise exception 'Année scolaire invalide.' using errcode = '22023', hint = 'egc.school_year_required';
  end if;
  if not academic_security.valid_reason(p_reason) then
    raise exception 'Motif requis (200 caractères au plus).' using errcode = '22023', hint = 'egc.reason_required';
  end if;
  -- Every affected learner is locked in id order before the count is checked.
  perform 1 from public.students s where s.id in (select e.student_id from public.enrollments e
    where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial'))
    order by s.id for update;
  select count(*) into v_count from public.enrollments e
  where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
  if v_count is distinct from p_expected_count then perform academic_security.stale(); end if;
  for v_student in select distinct e.student_id from public.enrollments e
      where e.school_year = p_school_year and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      order by 1 loop
    v_ended := v_ended + academic_security.leave(v_student, 'Alumni', p_reason, array(select e.id from public.enrollments e
      where e.student_id = v_student and e.school_year = p_school_year
        and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')));
  end loop;
  perform academic_security.log('close_school_year', null, null, null,
    jsonb_build_object('school_year', p_school_year, 'ended', v_ended, 'reason', btrim(p_reason)));
  -- The number of enrollments actually ended.
  return v_ended;
end $function$
;

CREATE OR REPLACE FUNCTION academic_security.enforce_group_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_session text; v_capacity integer;
begin
  if new.group_id is null or new.status is not distinct from 'Rejected' then return new; end if;
  if tg_op = 'UPDATE' and new.group_id is not distinct from old.group_id
     and old.status is distinct from 'Rejected' then return new; end if;
  select g.session_type, g.capacite_max into v_session, v_capacity from public.groups g where g.id = new.group_id;
  if not found or online_security.is_online_type(v_session) or v_capacity is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('group:seats:' || new.group_id::text, 0));
  if academic_security.seats_taken(new.group_id, new.student_id) >= v_capacity
     and current_setting('eh.capacity_override', true) is distinct from 'on' then
    raise exception 'Ce groupe est complet.' using errcode = '23514', hint = 'egc.capacity';
  end if;
  return new;
end $function$
;

-- END 127 FUNCTIONS

drop trigger groups_year_guard on public.groups;
create trigger groups_year_guard before insert or update of annee on public.groups
  for each row execute function academic_security.guard_group_year();

notify pgrst, 'reload schema';

commit;
