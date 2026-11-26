-- Restore for migration 141 (RWR-r5 PR C2, M-C1 academic part: level tests, attendance,
-- learner files, OD-9 A).
--
-- Rollback order: run only with its own owner approval, after the application is back
-- on a pre-C2 build (the C2 screens call book_student_placement_test,
-- update_placement_test_result, delete_placement_test and save_attendance with the
-- override, and send class_days). D7 (group class days), if it ran: select
-- crm_security.d7_revert(); first (while 141 is applied). This file refuses while a D7
-- run is kept, because it drops groups.class_days.
--
-- What it does:
--  * restores the 140 bodies of the four functions 141 re-created in place
--    (crm_update_placement_test, enforce_attendance_integrity, save_receptionist_group,
--    save_receptionist_student) and the four-argument save_attendance (141 replaced it
--    by a five-argument one) and the 139 phone_search_key, then checks each prosrc md5
--    against the 140 one;
--  * restores the placement_tests policies 141 replaced (« placement admin all » and the
--    receptionist insert and update policies, as 124 left them);
--  * drops the two triggers 141 added (students_rules_guard, placement_tests_rules) and
--    the class-days trigger, groups.class_days with its check, and every function 141
--    added (learner test commands, helpers, D7);
--  * puts back the empty age bounds 141 set from the programme audience.
-- What it keeps: every row (tests booked, cancelled or marked absent under 141 keep their
-- status; attendance rows are untouched). The ledger row 141 is removed by the operator
-- wrapper, not here.
begin;

do $$ begin
  if to_regprocedure('public.book_student_placement_test(uuid,jsonb)') is null then
    raise exception 'Restore 141: migration 141 is not applied' using errcode = '55000';
  end if;
  if exists (select 1 from public.crm_data_step_journal where step = 'd7')
     and not exists (select 1 from public.crm_data_step_journal where step = 'd7_revert') then
    raise exception 'Restore 141: D7 ran; run crm_security.d7_revert() first' using errcode = '55000';
  end if;
  if exists (select 1 from public.groups where class_days is not null) then
    raise notice 'Restore 141: groups hold class days written under 141; they are dropped with the column (« jours » text kept)';
  end if;
end $$;

-- Triggers first (they call the helpers dropped below).
drop trigger students_rules_guard on public.students;
drop trigger placement_tests_rules on public.placement_tests;
drop trigger groups_class_days_normalize on public.groups;

-- Placement policies (124 text).
drop policy "placement admin read" on public.placement_tests;
drop policy "placement admin delete" on public.placement_tests;
create policy "placement admin all" on public.placement_tests for all
  using ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'director'::text])));
create policy receptionist_placement_insert on public.placement_tests for insert to authenticated
  with check (((( SELECT get_my_role() AS get_my_role) = 'receptionist'::text) AND ((student_id IS NULL) OR (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = placement_tests.student_id) AND (s.deleted_at IS NULL)))))));
create policy receptionist_placement_update on public.placement_tests for update to authenticated
  using ((( SELECT get_my_role() AS get_my_role) = 'receptionist'::text))
  with check (((( SELECT get_my_role() AS get_my_role) = 'receptionist'::text) AND ((student_id IS NULL) OR (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = placement_tests.student_id) AND (s.deleted_at IS NULL)))))));

-- Prior bodies (live 140 definitions, verbatim).
drop function public.save_attendance(uuid, uuid, date, text, boolean);
CREATE OR REPLACE FUNCTION public.crm_update_placement_test(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; p public.placement_tests%rowtype; result jsonb; l public.crm_leads%rowtype; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['placement_id','expected_updated_at','expected_version','date_test','heure','examinateur','notes','status','score','niveau_recommande']<>'{}'::jsonb then raise exception 'Valid placement edit required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':update_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='update_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into p from public.placement_tests where id=(p_data->>'placement_id')::uuid and crm_lead_id is not null;
 if not found then raise exception 'CRM placement not found' using errcode='22023'; end if;
 -- NF-2: the prospect version the user saw (lead lock before placement lock,
 -- the order every placement trigger already uses).
 -- The placement check runs first so a stale test keeps its existing message (119
 -- contract); the prospect check (NF-2) follows. Both rows are locked before either.
 select * into l from public.crm_leads where id=p.crm_lead_id for update;
 select * into p from public.placement_tests where id=p.id for update;
 if p.updated_at is distinct from (p_data->>'expected_updated_at')::timestamptz then raise exception 'Stale placement version; refresh and retry' using errcode='PT409'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
 update public.placement_tests set date_test=(p_data->>'date_test')::date,heure=p_data->>'heure',examinateur=p_data->>'examinateur',notes=p_data->>'notes',
 status=p_data->>'status',score=(p_data->>'score')::numeric,niveau_recommande=nullif(p_data->>'niveau_recommande','') where id=p.id returning * into p;
 result:=jsonb_build_object('placement',crm_security.placement_summary(p))||crm_security.result(p.crm_lead_id,'placement-edit:'||p.id);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'update_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='PT409';
 when unique_violation then raise exception 'Placement already scheduled' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement edit or missing result' using errcode='22023';
end $function$

;

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
$function$

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
    'salle','jours','horaire','capacite_max','terme','annee','categorie','date_debut','date_fin']);
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
      capacite_max,terme,annee,categorie,date_debut,date_fin)
    values(p_group,p_changes->>'name',coalesce(p_changes->>'langue','Anglais'),
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau',v_teacher,
      p_changes->>'salle',p_changes->>'jours',p_changes->>'horaire',
      coalesce((p_changes->>'capacite_max')::integer,12),p_changes->>'terme',
      p_changes->>'annee',p_changes->>'categorie',
      nullif(p_changes->>'date_debut','')::date,nullif(p_changes->>'date_fin','')::date) on conflict on constraint groups_pkey do nothing
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
        g.categorie is distinct from p_changes->>'categorie' or
        g.date_debut is distinct from nullif(p_changes->>'date_debut','')::date or
        g.date_fin is distinct from nullif(p_changes->>'date_fin','')::date then
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
      categorie=case when p_changes ? 'categorie' then p_changes->>'categorie' else g.categorie end,
      date_debut=case when p_changes ? 'date_debut' then nullif(p_changes->>'date_debut','')::date else g.date_debut end,
      date_fin=case when p_changes ? 'date_fin' then nullif(p_changes->>'date_fin','')::date else g.date_fin end
    where groups.id=p_group returning groups.id,groups.updated_at into id,updated_at;
  end if;
  return next;
end $function$

;

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
      'parent_email','age_category','notes','session_type','niveau_cefr','referral_source','photo_url','origin_code']);
    if nullif(btrim(p_changes->>'full_name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau_cefr') is not true then
      raise exception 'Invalid session/level' using errcode='22023'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    -- 140 (§5.4): « Comment avez-vous connu le centre ? » is the origin list.
    if nullif(p_changes->>'origin_code','') is not null and not crm_security.origin_selectable(p_changes->>'origin_code') then
      raise exception 'Origine inconnue.' using errcode='22023', hint='catalogue.origin_unknown'; end if;
    insert into public.students(id,full_name,date_naissance,telephone,email,parent_email,age_category,
      notes,session_type,niveau_cefr,referral_source,photo_url,status,plan_type,origin_code)
    values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
      p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
      p_changes->>'photo_url','Prospect','Standard',nullif(p_changes->>'origin_code','')) on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
        s.full_name is distinct from p_changes->>'full_name' or
        s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
        s.telephone is distinct from public.require_phone(p_changes->>'telephone') or
        s.email is distinct from p_changes->>'email' or s.parent_email is distinct from p_changes->>'parent_email' or
        s.age_category is distinct from p_changes->>'age_category' or s.notes is distinct from p_changes->>'notes' or
        s.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        s.niveau_cefr is distinct from p_changes->>'niveau_cefr' or
        s.referral_source is distinct from p_changes->>'referral_source' or
        s.origin_code is distinct from nullif(p_changes->>'origin_code','') or
        s.photo_url is distinct from p_changes->>'photo_url' then
        raise exception 'Student create identity conflict' using errcode='23505'; end if;
      id:=s.id; updated_at:=s.updated_at;
    end if;
  else
    -- RPW-r2 items 2 and 3: programme, level and source (the admin rule: guard_student_membership
    -- refuses a programme or level change while the learner is in a group) and the two e-mails
    -- (refused while an active or pending family link uses the old address; every change logged).
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url','session_type','niveau_cefr','referral_source','email','parent_email','origin_code']);
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
    if nullif(p_changes->>'origin_code','') is distinct from s.origin_code and nullif(p_changes->>'origin_code','') is not null
       and not crm_security.origin_selectable(p_changes->>'origin_code') then
      raise exception 'Origine inconnue.' using errcode='22023', hint='catalogue.origin_unknown'; end if;
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
      origin_code=case when p_changes ? 'origin_code' then nullif(p_changes->>'origin_code','') else s.origin_code end,
      email=case when p_changes ? 'email' then nullif(btrim(p_changes->>'email'),'') else s.email end,
      parent_email=case when p_changes ? 'parent_email' then nullif(btrim(p_changes->>'parent_email'),'') else s.parent_email end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $function$

;

CREATE OR REPLACE FUNCTION public.save_attendance(p_student uuid, p_group uuid, p_date date, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_count integer;
begin
  if p_student is null or p_group is null or p_date is null
    or p_status not in ('Présent','Absent','Retard','Justifié') then
    raise exception 'Invalid attendance input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'attendance:' || p_student::text || ':' || p_group::text || ':' || p_date::text, 0));
  select count(*), min(a.id::text)::uuid into v_count, v_id
  from public.attendance a where a.student_id = p_student and a.group_id = p_group and a.session_date = p_date;
  if v_count > 1 then
    raise exception 'Conflicting historical attendance rows require review' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.attendance(student_id,group_id,session_date,status)
    values(p_student,p_group,p_date,p_status) returning id into v_id;
  else
    update public.attendance set status = p_status where id = v_id;
  end if;
  return v_id;
end;
$function$

;

revoke all on function public.save_attendance(uuid,uuid,date,text) from public, anon, authenticated;
grant execute on function public.save_attendance(uuid,uuid,date,text) to authenticated, service_role;

-- What 141 added.
drop function public.book_student_placement_test(uuid,jsonb);
drop function public.update_placement_test_result(uuid,timestamptz,jsonb);
drop function public.delete_placement_test(uuid,timestamptz);
drop function crm_security.d7_apply(jsonb);
drop function crm_security.d7_revert();
drop function crm_security.d7_plan();
drop function crm_security.d7_rows();
drop function academic_security.parse_class_days(text);
drop function academic_security.class_days_from(jsonb);
drop function academic_security.closed_on(date);
drop function academic_security.normalize_class_days();
drop function academic_security.assert_student_slot(uuid,timestamptz,uuid);
drop function academic_security.placement_row(public.placement_tests);
drop function academic_security.placement_rules();
drop function academic_security.test_starts(public.placement_tests);
drop function academic_security.student_rules();
drop function academic_security.age_on(date,date);
drop function academic_security.level_allowed(text,text,integer);
drop function academic_security.level_ages(text,text);
drop function academic_security.category_ages(text);
alter table public.groups drop constraint groups_class_days_valid;
alter table public.groups drop column class_days;

-- Age bounds 141 derived from the audience (the 140 seed left them empty).
update public.programme_levels pl set min_age = null
from public.programmes p where p.code = pl.programme_code and p.audience = 'adultes' and pl.min_age = 18 and pl.max_age is null;
update public.programme_levels pl set max_age = null
from public.programmes p where p.code = pl.programme_code and p.audience in ('enfants', 'ados') and pl.min_age is null and pl.max_age = 17;

-- phone_search_key: the 139 body (141 section 5b).
create or replace function public.phone_search_key(query text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select case when length(k)>=6 then k end from (select public.phone_key(query) k) x
$$;

-- The restored bodies are exactly the ones 140 left live (141's section 0 map).
do $$
declare f record;
begin
  for f in select * from jsonb_each_text(jsonb_build_object(
      'public.crm_update_placement_test(uuid,jsonb)', 'ec5421dcdf1fe855716c33a0e0868586',
      'public.enforce_attendance_integrity()', 'eba93c3d81c78116a3af48cd7aa5e2c5',
      'public.save_attendance(uuid,uuid,date,text)', '246adc04e3531d37e59ed2c9b9d9eb35',
      'public.save_receptionist_group(uuid,timestamp with time zone,jsonb)', '23cdb858bb4a50fece6528004da9b8b0',
      'public.save_receptionist_student(uuid,timestamp with time zone,jsonb)', '525b4b0d2f664c8818a055e34bb6d89c',
      'public.phone_search_key(text)', '8be52274875cd6a4e999312e13e39683')) loop
    if (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.key)) is distinct from f.value then
      raise exception 'Restore 141: % is not the 140 body after the restore', f.key using errcode = 'XX000';
    end if;
  end loop;
end $$;

commit;
