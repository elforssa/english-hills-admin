-- Online learning pilot (plan online-learning.md, revision OL-r4, ADR-008).
-- Additive and forward-only. Owner decisions: Q1 A, Q2 C1, Q3 A, Q4 A, Q5 A,
-- Q6 A, Q7 A, Q8 A, Q9 A, Q10 A, Q11 A, Q13 A, Q14 A, Q15 A, Q16 A; the
-- provider (Q12) is chosen later, so only the fake adapter exists in code.
--
-- Changes to existing objects, and nothing else:
--   * five course-type constraints gain 'Online' and 'Online One-to-One' (D1);
--   * crm_start_enrollment, operational_security.valid_session_level and
--     save_receptionist_enrollment are re-created from their live definitions
--     (112, 096, 096) with exactly one line changed each: the hard-coded
--     programme list gains the same two values (Q2 = C1, Q16 = A);
--   * notifications_type_check keeps its current list verbatim, read from the
--     catalog, and appends the two online notification types (D9, S4);
--   * three new triggers: groups (no group teacher on an online group; course
--     type locked), online_courses (its group is online) and enrollments
--     (online seat capacity at group assignment).
-- No existing row is rewritten, no existing policy or grant changes, and no
-- object created here reads or writes a retired workshop table.
begin;

-- ---------------------------------------------------------------------------
-- D1 — course-type vocabulary, rebuilt from the latest cumulative definitions
-- (groups/students 049, enrollments 072, charges and receipts 055).
-- ---------------------------------------------------------------------------
alter table public.groups drop constraint groups_session_type_check;
alter table public.groups add constraint groups_session_type_check check (session_type in (
  'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
  'One-to-One','Mise à niveau','Other','Online','Online One-to-One'));
alter table public.students drop constraint students_session_type_check;
alter table public.students add constraint students_session_type_check check (session_type in (
  'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
  'One-to-One','Mise à niveau','Other','Online','Online One-to-One'));
alter table public.enrollments drop constraint enrollments_session_type_check;
alter table public.enrollments add constraint enrollments_session_type_check check (session_type is null or session_type in (
  'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
  'One-to-One','Mise à niveau','Other','Online','Online One-to-One'));
alter table public.charges drop constraint charges_session_type_check;
alter table public.charges add constraint charges_session_type_check check (session_type in (
  'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
  'One-to-One','Mise à niveau','Other','Legacy','Online','Online One-to-One'));
alter table public.receipts drop constraint receipts_session_type_check;
alter table public.receipts add constraint receipts_session_type_check check (session_type is null or session_type in (
  'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
  'One-to-One','Mise à niveau','Other','Legacy','Online','Online One-to-One'));

-- ---------------------------------------------------------------------------
-- Q2 = C1: crm_start_enrollment re-created from its live 112 body. The single
-- changed line is the accepted-programme array; signature, security, search
-- path, locks, hints, replay and follow-up logic are byte-identical, and
-- CREATE OR REPLACE keeps the owner and the 112 grants.
-- ---------------------------------------------------------------------------
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
 exception when serialization_failure then
  if sqlerrm='Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' then
   raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='40001',hint='crm_enrollment.enrollment_in_progress'; end if;
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
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='40001',hint='crm_enrollment.lead_changed'; end if;
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
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='40001',hint='crm_enrollment.candidates_changed'; end if;
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
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='40001',hint='crm_enrollment.enrollment_changed'; end if;
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
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='40001',hint='crm_enrollment.concurrent_change';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.record_rejected';
end $function$;

-- ---------------------------------------------------------------------------
-- Q16 = A (B3): the two migration-096 programme lists, re-created from their
-- live definitions with exactly one changed line each. The helper stays
-- immutable, security invoker and non-executable by every API role; the
-- command keeps its signature, defaults, security definer mode and the 096
-- grant (authenticated only). save_receptionist_student and
-- save_receptionist_group accept the new programmes through the helper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION operational_security.valid_session_level(p_session text, p_level text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select p_session in ('Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
    'One-to-One','Mise à niveau','Other','Online','Online One-to-One') and (p_level is null or case
    when p_session='Yearly' then p_level='Pre-Child' or p_level ~ '^(Child|Junior) [1-6]$'
    when p_session='Adults' then p_level ~ '^(Beginning|Intermediate) [1-6]$' or p_level ~ '^Advanced [1-5]$'
    else p_level in ('A1','A2','B1','B2','C1','C2') end)
$function$;

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

-- ---------------------------------------------------------------------------
-- D9 — notification types. The current list is copied verbatim from the
-- catalog (whatever the landing order with the workshop-removal release) and
-- the two online types are appended; no value is ever removed.
-- ---------------------------------------------------------------------------
do $$
declare v_def text; v_values text[]; v_expected text;
begin
  select pg_get_constraintdef(c.oid) into strict v_def from pg_constraint c
  where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_type_check';
  select array_agg(m.v[1] order by m.n) into v_values
  from regexp_matches(v_def, '''([a-z_]+)''::text', 'g') with ordinality as m(v, n);
  select 'CHECK ((type = ANY (ARRAY[' || string_agg(quote_literal(x.v) || '::text', ', ' order by x.n) || '])))'
    into v_expected from unnest(v_values) with ordinality as x(v, n);
  if v_values is null or v_def is distinct from v_expected or 'general' <> all(v_values)
     or 'online_lesson_cancelled' = any(v_values) or 'online_lesson_rescheduled' = any(v_values) then
    raise exception 'Unexpected notifications_type_check definition: %', v_def;
  end if;
  v_values := v_values || array['online_lesson_cancelled', 'online_lesson_rescheduled'];
  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check (type in (%s))',
    (select string_agg(quote_literal(x.v), ',' order by x.n) from unnest(v_values) with ordinality as x(v, n)));
end $$;

-- ---------------------------------------------------------------------------
-- D2–D10 — online tables. Direct API writes are revoked; operations staff
-- read six of them under RLS; passes and provider evidence have no API read.
-- ---------------------------------------------------------------------------
create schema online_security;
revoke all on schema online_security from public, anon, authenticated, service_role;

create table public.online_courses (
  group_id uuid primary key references public.groups(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  audience text not null check (audience in ('adult', 'child')),
  capacity integer not null default 10 check (capacity between 1 and 12),
  lesson_minutes integer not null default 90 check (lesson_minutes between 15 and 240),
  join_open_minutes integer not null default 15 check (join_open_minutes between 0 and 60),
  join_grace_minutes integer not null default 10 check (join_grace_minutes between 0 and 60),
  host_open_minutes integer not null default 30 check (host_open_minutes between 0 and 120),
  provider text check (provider is null or provider ~ '^[a-z][a-z0-9-]{1,31}$'),
  -- Opaque provider reference, never an address.
  provider_room_ref text check (provider_room_ref is null or (strpos(provider_room_ref, '://') = 0
    and provider_room_ref ~ '^[A-Za-z0-9._:-]{1,200}$')),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  term_start date not null,
  term_end date not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint online_courses_term_check check (term_end >= term_start and term_end <= term_start + 182),
  constraint online_courses_active_room_check check (status <> 'active'
    or (provider is not null and provider_room_ref is not null))
);
create index online_courses_teacher_idx on public.online_courses(teacher_id);

create table public.online_lesson_patterns (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.online_courses(group_id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, as extract(dow)
  start_time time not null check (extract(second from start_time) = 0), -- Casablanca civil time
  minutes integer not null check (minutes between 15 and 240),
  valid_from date not null,
  valid_to date not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint online_lesson_patterns_valid_check check (valid_to >= valid_from)
);
create index online_lesson_patterns_group_idx on public.online_lesson_patterns(group_id, valid_from);

create table public.online_lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.online_courses(group_id) on delete restrict,
  pattern_id uuid references public.online_lesson_patterns(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  is_substitute boolean not null default false,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  cancelled_at timestamptz,
  cancelled_by uuid,
  report text check (report is null or char_length(report) <= 400),
  report_by uuid,
  completed_at timestamptz,
  detached boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint online_lessons_group_start_key unique (group_id, starts_at),
  constraint online_lessons_span_check check (ends_at > starts_at and ends_at <= starts_at + interval '4 hours'),
  constraint online_lessons_cancel_check check ((status = 'cancelled') = (cancelled_at is not null))
);
create index online_lessons_teacher_idx on public.online_lessons(teacher_id, starts_at);
create index online_lessons_starts_idx on public.online_lessons(starts_at);

create table public.online_lesson_guests (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.online_lessons(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  kind text not null check (kind in ('trial', 'override')),
  note text check (note is null or char_length(note) <= 200),
  added_by uuid not null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid
);
create unique index online_lesson_guests_active_key on public.online_lesson_guests(lesson_id, student_id)
  where removed_at is null;
create index online_lesson_guests_student_idx on public.online_lesson_guests(student_id);

create table public.online_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.online_lessons(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null check (status in ('Présent', 'Absent', 'Retard', 'Justifié')),
  note text check (note is null or char_length(note) <= 200),
  marked_by uuid not null,
  marked_at timestamptz not null default now(),
  constraint online_attendance_lesson_student_key unique (lesson_id, student_id)
);

create table public.online_join_tokens (
  id uuid primary key default gen_random_uuid(),
  jti uuid not null unique default gen_random_uuid(),
  lesson_id uuid not null references public.online_lessons(id) on delete restrict,
  participant_kind text not null check (participant_kind in ('learner', 'host', 'observer')),
  student_id uuid references public.students(id) on delete restrict,
  teacher_id uuid references public.teachers(id) on delete restrict,
  profile_id uuid not null,
  display_label text not null check (char_length(display_label) between 1 and 60),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or revoke_reason in
    ('cancelled', 'rescheduled', 'guest_removed', 'course_closed', 'teacher_changed', 'consent_revoked')),
  constraint online_join_tokens_learner_check check ((participant_kind = 'learner') = (student_id is not null)),
  constraint online_join_tokens_host_check check ((participant_kind = 'host') = (teacher_id is not null)),
  constraint online_join_tokens_expiry_check check (expires_at > issued_at)
);
create index online_join_tokens_open_idx on public.online_join_tokens(lesson_id) where revoked_at is null;

create table public.online_consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  kind text not null default 'video_minor' check (kind = 'video_minor'),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null,
  note text check (note is null or char_length(note) <= 200),
  revoked_at timestamptz,
  revoked_by uuid
);
create unique index online_consents_active_key on public.online_consents(student_id, kind) where revoked_at is null;

-- Provider join/leave evidence (Q14 = A). Never attendance.
create table public.online_join_events (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.online_join_tokens(id) on delete restrict,
  kind text not null check (kind in ('joined', 'left')),
  at timestamptz not null,
  provider_participant_ref text check (provider_participant_ref is null or char_length(provider_participant_ref) <= 200),
  received_at timestamptz not null default now(),
  constraint online_join_events_once_key unique (token_id, kind, at)
);

do $$ declare t text; begin
  foreach t in array array['online_courses', 'online_lesson_patterns', 'online_lessons', 'online_lesson_guests',
    'online_attendance', 'online_join_tokens', 'online_consents', 'online_join_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['online_courses', 'online_lesson_patterns', 'online_lessons', 'online_lesson_guests',
    'online_attendance', 'online_consents'] loop
    execute format('grant select on table public.%I to authenticated', t);
    execute format('create policy online_staff_read on public.%I for select to authenticated using '
      '(public.get_my_role() in (''director'', ''admin'', ''receptionist''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private helpers (online_security). Refusals carry a closed online.<reason>
-- hint: forbidden, not_found, invalid_input, stale (40001 only), course_exists,
-- course_closed, course_not_draft, course_inactive, teacher_unavailable,
-- term_invalid, pattern_invalid, scope_invalid, lesson_overlap, lesson_in_use,
-- lesson_past, lesson_cancelled, window_closed, not_eligible, student_required,
-- consent_missing, capacity, already_enrolled, guest_exists, not_on_roster,
-- room_ref_invalid, pass_invalid, teacher_on_course, course_type_locked,
-- group_not_online.
-- ---------------------------------------------------------------------------
create function online_security.is_online_type(p_session text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_session in ('Online', 'Online One-to-One'), false)
$$;

create function online_security.fail(p_reason text, p_code text, p_message text) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$ begin
  raise exception '%', p_message using errcode = p_code, hint = 'online.' || p_reason;
end $$;

create function online_security.caller_role() returns text
language sql stable set search_path = pg_catalog, pg_temp as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create function online_security.require_role(p_roles text[]) returns text
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare v_role text := online_security.caller_role();
begin
  if auth.uid() is null or v_role is null or not (v_role = any(p_roles)) then
    perform online_security.fail('forbidden', '42501', 'Action non autorisée.');
  end if;
  return v_role;
end $$;

-- The teacher row linked to the caller by e-mail, the rule the portals use.
create function online_security.caller_teacher_id() returns uuid
language sql stable set search_path = pg_catalog, pg_temp as $$
  select t.id from public.teachers t join public.profiles p on p.id = auth.uid()
  where p.role = 'teacher' and t.deleted_at is null and t.email is not null and t.email = p.email
  order by t.created_at, t.id limit 1
$$;

-- First given-name token plus the initial of the last token; mirrored by
-- src/lib/online/label.mjs and asserted identical by the SQL suite.
create function online_security.base_label(p_name text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare v_parts text[]; v_first text;
begin
  v_parts := regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '[ \t\n\r\f\v]+', ' ', 'g')), ' ');
  if v_parts[1] is null or v_parts[1] = '' then return 'Participant'; end if;
  v_first := upper(left(v_parts[1], 1)) || substr(left(v_parts[1], 30), 2);
  if cardinality(v_parts) = 1 then return v_first; end if;
  return v_first || ' ' || upper(left(v_parts[cardinality(v_parts)], 1)) || '.';
end $$;

-- A label unique inside one course: equal labels get " 2", " 3" by learner id.
create function online_security.student_label(p_student uuid, p_group uuid) returns text
language sql stable set search_path = pg_catalog, pg_temp as $$
  with members as (
    select s.id, online_security.base_label(s.full_name) as label from public.students s
    where s.id = p_student
       or s.id in (select e.student_id from public.enrollments e where e.group_id = p_group and e.status <> 'Rejected')
       or s.id in (select g.student_id from public.online_lesson_guests g
                   join public.online_lessons l on l.id = g.lesson_id where l.group_id = p_group)
  ), ranked as (
    select m.id, m.label, row_number() over (partition by m.label order by m.id) as n from members m
  )
  select r.label || case when r.n > 1 then ' ' || r.n else '' end from ranked r where r.id = p_student
$$;

create function online_security.teacher_label(p_teacher uuid) returns text
language sql stable set search_path = pg_catalog, pg_temp as $$
  select online_security.base_label(t.full_name) from public.teachers t where t.id = p_teacher
$$;

-- Migration-109 display contract: instants stay UTC, civil values in Casablanca.
create function online_security.local_date(p_at timestamptz) returns date
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (p_at at time zone 'Africa/Casablanca')::date
$$;
create function online_security.local_time(p_at timestamptz) returns text
language sql stable set search_path = pg_catalog, pg_temp as $$
  select to_char(p_at at time zone 'Africa/Casablanca', 'HH24:MI')
$$;
create function online_security.today() returns date
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (now() at time zone 'Africa/Casablanca')::date
$$;
create function online_security.french_when(p_at timestamptz) returns text
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])
      [extract(dow from p_at at time zone 'Africa/Casablanca')::integer + 1]
    || ' ' || to_char(p_at at time zone 'Africa/Casablanca', 'DD/MM/YYYY') || ' à '
    || online_security.local_time(p_at)
$$;

create function online_security.lesson_json(l public.online_lessons) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('id', l.id, 'group_id', l.group_id, 'starts_at', l.starts_at, 'ends_at', l.ends_at,
    'local_date', online_security.local_date(l.starts_at), 'local_time', online_security.local_time(l.starts_at),
    'local_end_time', online_security.local_time(l.ends_at), 'status', l.status, 'version', l.version)
$$;

-- Seat rule (D4): a Confirmed or Validated enrolment in the group, or an
-- active guest row for the lesson. Trial enrolments alone do not qualify (Q4).
create function online_security.holds_seat(p_lesson uuid, p_group uuid, p_student uuid) returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.students s where s.id = p_student and s.deleted_at is null) and (
    exists (select 1 from public.enrollments e where e.student_id = p_student and e.group_id = p_group
      and e.status in ('Confirmed', 'Validated'))
    or exists (select 1 from public.online_lesson_guests g where g.lesson_id = p_lesson
      and g.student_id = p_student and g.removed_at is null))
$$;

create function online_security.has_consent(p_student uuid) returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.online_consents c where c.student_id = p_student
    and c.kind = 'video_minor' and c.revoked_at is null)
$$;

create function online_security.course_for_update(p_group uuid, p_expected_version bigint)
returns public.online_courses
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype;
begin
  select * into c from public.online_courses where group_id = p_group for update;
  if not found then perform online_security.fail('not_found', '22023', 'Cours en ligne introuvable.'); end if;
  if p_expected_version is null or c.version <> p_expected_version then
    perform online_security.fail('stale', '40001', 'Ce cours a changé ; actualisez puis réessayez.');
  end if;
  return c;
end $$;

create function online_security.lesson_for_update(p_lesson uuid, p_expected_version bigint)
returns public.online_lessons
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare l public.online_lessons%rowtype;
begin
  select * into l from public.online_lessons where id = p_lesson;
  if not found then perform online_security.fail('not_found', '22023', 'Cours introuvable.'); end if;
  -- Course first, then lesson: the same lock order as every course command.
  perform 1 from public.online_courses where group_id = l.group_id for update;
  select * into l from public.online_lessons where id = p_lesson for update;
  if p_expected_version is null or l.version <> p_expected_version then
    perform online_security.fail('stale', '40001', 'Ce cours a changé ; actualisez puis réessayez.');
  end if;
  return l;
end $$;

-- Lessons of a course never overlap, and each is separated from the next by
-- the grace period plus the earliest opening, so a pass of lesson A is never
-- usable during lesson B in the shared course room (D6, temporal scoping).
create function online_security.assert_no_overlap(p_group uuid) returns void
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype;
begin
  select * into strict c from public.online_courses where group_id = p_group;
  if exists (select 1 from public.online_lessons a join public.online_lessons b
      on b.group_id = a.group_id and b.id <> a.id and b.status <> 'cancelled' and b.starts_at >= a.starts_at
      and b.starts_at < a.ends_at + make_interval(mins => c.join_grace_minutes
        + greatest(c.join_open_minutes, c.host_open_minutes))
    where a.group_id = p_group and a.status <> 'cancelled') then
    perform online_security.fail('lesson_overlap', '23514', 'Deux cours de ce groupe se chevauchent ou sont trop rapprochés.');
  end if;
end $$;

create function online_security.pattern_slots(p_group uuid, p_from date, p_to date)
returns table(pattern_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path = pg_catalog, pg_temp as $$
  select p.id, (d.day::date + p.start_time) at time zone 'Africa/Casablanca',
    ((d.day::date + p.start_time) at time zone 'Africa/Casablanca') + make_interval(mins => p.minutes)
  from public.online_lesson_patterns p
  cross join lateral generate_series(greatest(p.valid_from, p_from)::timestamp,
    least(p.valid_to, p_to)::timestamp, interval '1 day') as d(day)
  where p.group_id = p_group and extract(dow from d.day) = p.weekday
$$;

-- Regenerates every scheduled, non-detached future lesson between two civil
-- dates from the course's patterns. Past, cancelled, completed and detached
-- lessons are kept; a lesson that already has guests, attendance or passes is
-- never deleted silently. Idempotent for an unchanged set of patterns.
create function online_security.reconcile_lessons(p_group uuid, p_from date, p_to date) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype; r record; v_created integer; v_removed integer := 0; v_moved integer := 0;
begin
  select * into strict c from public.online_courses where group_id = p_group;
  for r in select l.id, l.ends_at, s.pattern_id, s.ends_at as slot_end from public.online_lessons l
      left join online_security.pattern_slots(p_group, p_from, p_to) s on s.starts_at = l.starts_at
      where l.group_id = p_group and l.status = 'scheduled' and not l.detached and l.starts_at > now()
        and online_security.local_date(l.starts_at) between p_from and p_to loop
    if r.slot_end is null then
      if exists (select 1 from public.online_attendance a where a.lesson_id = r.id)
         or exists (select 1 from public.online_lesson_guests g where g.lesson_id = r.id and g.removed_at is null)
         or exists (select 1 from public.online_join_tokens t where t.lesson_id = r.id) then
        perform online_security.fail('lesson_in_use', '23514',
          'Un cours concerné a déjà des invités, des présences ou des accès ; modifiez-le individuellement.');
      end if;
      delete from public.online_lessons where id = r.id;
      v_removed := v_removed + 1;
    else
      update public.online_lessons set pattern_id = r.pattern_id, ends_at = r.slot_end,
        version = version + 1, updated_at = now(), updated_by = auth.uid()
      where id = r.id and (pattern_id is distinct from r.pattern_id or ends_at <> r.slot_end);
      if r.ends_at <> r.slot_end then
        perform online_security.revoke_passes(r.id, null, 'rescheduled');
        v_moved := v_moved + 1;
      end if;
    end if;
  end loop;
  insert into public.online_lessons(group_id, pattern_id, starts_at, ends_at, teacher_id, updated_by)
  select p_group, s.pattern_id, s.starts_at, s.ends_at, c.teacher_id, auth.uid()
  from online_security.pattern_slots(p_group, p_from, p_to) s
  where s.starts_at > now()
    and not exists (select 1 from public.online_lessons l where l.group_id = p_group and l.starts_at = s.starts_at);
  get diagnostics v_created = row_count;
  perform online_security.assert_no_overlap(p_group);
  return jsonb_build_object('created', v_created, 'removed', v_removed, 'resized', v_moved);
end $$;

-- groups.jours / groups.horaire keep a true derived text for the existing
-- group list and timetable (D2).
create function online_security.current_patterns(p_group uuid)
returns table(weekday smallint, start_time time, minutes integer)
language sql stable set search_path = pg_catalog, pg_temp as $$
  select distinct p.weekday, p.start_time, p.minutes from public.online_lesson_patterns p
  where p.group_id = p_group and p.valid_to >= online_security.today()
$$;

create function online_security.refresh_group_schedule(p_group uuid) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_days text; v_ranges text; v_distinct integer;
  v_names constant text[] := array['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
begin
  select count(*) into v_distinct
  from (select distinct p.start_time, p.minutes from online_security.current_patterns(p_group) p) x;
  select string_agg(v_names[d.weekday + 1], ', ' order by (d.weekday + 6) % 7) into v_days
  from (select distinct p.weekday from online_security.current_patterns(p_group) p) d;
  if v_distinct = 1 then
    select to_char(p.start_time, 'HH24:MI') || '–' || to_char(p.start_time + make_interval(mins => p.minutes), 'HH24:MI')
      into v_ranges from online_security.current_patterns(p_group) p limit 1;
  elsif v_distinct > 1 then
    select string_agg(v_names[p.weekday + 1] || ' ' || to_char(p.start_time, 'HH24:MI') || '–'
        || to_char(p.start_time + make_interval(mins => p.minutes), 'HH24:MI'), ', '
        order by (p.weekday + 6) % 7, p.start_time)
      into v_ranges from online_security.current_patterns(p_group) p;
  end if;
  update public.groups set jours = v_days, horaire = v_ranges where id = p_group;
end $$;

create function online_security.revoke_passes(p_lesson uuid, p_student uuid, p_reason text) returns integer
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_count integer;
begin
  update public.online_join_tokens set revoked_at = now(), revoke_reason = p_reason
  where lesson_id = p_lesson and revoked_at is null and expires_at > now()
    and (p_student is null or student_id = p_student)
    and (p_reason <> 'teacher_changed' or participant_kind = 'host');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Recipients of a lesson notice: the e-mail of each seated learner and of
-- their parent when present, one row per distinct address.
create function online_security.lesson_recipients(p_lesson uuid)
returns table(student_id uuid, email text, name text)
language sql stable set search_path = pg_catalog, pg_temp as $$
  with learners as (
    select s.id, s.full_name, s.email, s.parent_email from public.students s
    join public.online_lessons l on l.id = p_lesson
    where s.deleted_at is null and (
      s.id in (select e.student_id from public.enrollments e where e.group_id = l.group_id
        and e.status in ('Confirmed', 'Validated'))
      or s.id in (select g.student_id from public.online_lesson_guests g where g.lesson_id = l.id and g.removed_at is null))
  ), addresses as (
    select id, btrim(email) as email, full_name as name from learners where nullif(btrim(email), '') is not null
    union all
    select id, btrim(parent_email), 'Parent de ' || full_name from learners where nullif(btrim(parent_email), '') is not null
  )
  select distinct on (lower(a.email)) a.id, a.email, a.name from addresses a order by lower(a.email), a.id
$$;

create function online_security.notify(p_lessons uuid[], p_type text, p_subject text, p_message text)
returns uuid[]
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_ids uuid[];
begin
  with r as (
    select distinct on (lower(x.email)) x.student_id, x.email, x.name
    from unnest(p_lessons) as u(lesson_id) cross join lateral online_security.lesson_recipients(u.lesson_id) x
    order by lower(x.email), x.student_id
  ), inserted as (
    insert into public.notifications(type, recipient_email, recipient_name, student_id, subject, message, sent)
    select p_type, r.email, r.name, r.student_id, p_subject, p_message, false from r
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from inserted;
  return v_ids;
end $$;

-- Who may join, and with which pass (D4, D6). Never raises: the result says
-- ok or names one closed reason. Relationship is checked before any state so
-- an unrelated caller learns nothing about the lesson.
create function online_security.evaluate_join(p_lesson uuid, p_student uuid) returns jsonb
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare v_role text := online_security.caller_role(); l public.online_lessons%rowtype; c public.online_courses%rowtype;
  v_kind text; v_student uuid; v_teacher uuid; v_label text; v_opens timestamptz; v_closes timestamptz;
  v_candidates uuid[];
begin
  if auth.uid() is null or v_role is null then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  select * into l from public.online_lessons where id = p_lesson;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_eligible'); end if;
  select * into strict c from public.online_courses where group_id = l.group_id;
  if v_role = 'teacher' then
    v_teacher := online_security.caller_teacher_id();
    if v_teacher is null or v_teacher <> l.teacher_id then
      return jsonb_build_object('ok', false, 'reason', 'not_eligible');
    end if;
    v_kind := 'host';
    v_label := online_security.teacher_label(v_teacher);
    v_opens := l.starts_at - make_interval(mins => c.host_open_minutes);
  elsif v_role in ('director', 'admin') then
    -- Q6 = A: management may observe any active lesson; the pass is logged.
    v_kind := 'observer';
    v_label := 'Équipe English Hills';
    v_opens := l.starts_at - make_interval(mins => c.join_open_minutes);
  elsif v_role in ('parent', 'student') then
    if p_student is not null then
      if not exists (select 1 from public.students s where s.id = p_student and s.deleted_at is null
          and s.id in (select public.get_visible_student_ids()))
         or not online_security.holds_seat(l.id, l.group_id, p_student) then
        return jsonb_build_object('ok', false, 'reason', 'not_eligible');
      end if;
      v_student := p_student;
    else
      select array_agg(s.id order by s.id) into v_candidates from public.students s
      where s.deleted_at is null and s.id in (select public.get_visible_student_ids())
        and online_security.holds_seat(l.id, l.group_id, s.id);
      if coalesce(cardinality(v_candidates), 0) = 0 then
        return jsonb_build_object('ok', false, 'reason', 'not_eligible');
      elsif cardinality(v_candidates) > 1 or v_role = 'parent' then
        return jsonb_build_object('ok', false, 'reason', 'student_required');
      end if;
      v_student := v_candidates[1];
    end if;
    v_kind := 'learner';
    v_opens := l.starts_at - make_interval(mins => c.join_open_minutes);
  else
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  v_closes := l.ends_at + make_interval(mins => c.join_grace_minutes);
  if c.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'course_inactive', 'opens_at', v_opens, 'closes_at', v_closes);
  end if;
  if l.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'lesson_cancelled', 'opens_at', v_opens, 'closes_at', v_closes);
  end if;
  if now() < v_opens or now() > v_closes then
    return jsonb_build_object('ok', false, 'reason', 'window_closed', 'opens_at', v_opens, 'closes_at', v_closes);
  end if;
  if v_kind = 'learner' then
    if c.audience = 'child' and not online_security.has_consent(v_student) then
      return jsonb_build_object('ok', false, 'reason', 'consent_missing', 'opens_at', v_opens, 'closes_at', v_closes);
    end if;
    if (select count(distinct t.student_id) from public.online_join_tokens t where t.lesson_id = l.id
        and t.participant_kind = 'learner' and t.revoked_at is null and t.expires_at > now()
        and t.student_id <> v_student) >= c.capacity then
      return jsonb_build_object('ok', false, 'reason', 'capacity', 'opens_at', v_opens, 'closes_at', v_closes);
    end if;
    v_label := online_security.student_label(v_student, l.group_id);
  end if;
  return jsonb_build_object('ok', true, 'kind', v_kind, 'student_id', v_student, 'teacher_id', v_teacher,
    'label', v_label, 'opens_at', v_opens, 'closes_at', v_closes, 'expires_at', v_closes);
end $$;

-- Roster window for teachers (D5): 24 h before the start to 7 days after the
-- end, active course, course teacher or this lesson's teacher.
create function online_security.teacher_sees_lesson(l public.online_lessons, p_teacher uuid) returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select p_teacher is not null and now() between l.starts_at - interval '24 hours' and l.ends_at + interval '7 days'
    and exists (select 1 from public.online_courses c where c.group_id = l.group_id and c.status = 'active'
      and (c.teacher_id = p_teacher or l.teacher_id = p_teacher))
$$;

-- ---------------------------------------------------------------------------
-- Triggers (D2, D4).
-- ---------------------------------------------------------------------------
create function online_security.guard_online_group() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ begin
  if online_security.is_online_type(new.session_type) and new.teacher_id is not null then
    perform online_security.fail('teacher_on_course', '23514',
      'Un groupe en ligne n’a pas d’enseignant de groupe ; l’enseignant se choisit sur le cours en ligne.');
  end if;
  if tg_op = 'UPDATE' and new.session_type is distinct from old.session_type
     and not online_security.is_online_type(new.session_type)
     and exists (select 1 from public.online_courses c where c.group_id = new.id) then
    perform online_security.fail('course_type_locked', '23514', 'Le programme d’un cours en ligne ne peut pas redevenir présentiel.');
  end if;
  return new;
end $$;
create trigger online_group_guard before insert or update of teacher_id, session_type on public.groups
  for each row execute function online_security.guard_online_group();

create function online_security.guard_online_course() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ begin
  -- The share lock serializes with a concurrent course-type change of the group.
  perform 1 from public.groups g where g.id = new.group_id and online_security.is_online_type(g.session_type) for share;
  if not found then
    perform online_security.fail('group_not_online', '23514', 'Ce groupe n’a pas un programme en ligne.');
  end if;
  return new;
end $$;
create trigger online_course_group_guard before insert or update of group_id on public.online_courses
  for each row execute function online_security.guard_online_course();

-- Capacity at group assignment of any non-Rejected enrolment, never on a
-- status-only change (payment-driven confirmation, the 070 sync) except when
-- a Rejected enrolment comes back. The 074 student-form placement writes
-- enrollments.group_id and therefore passes through here; no depth guard.
create function online_security.enforce_online_capacity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_session text; v_capacity integer; v_taken integer;
begin
  if new.group_id is null or new.status is not distinct from 'Rejected' then return new; end if;
  if tg_op = 'UPDATE' and new.group_id is not distinct from old.group_id
     and old.status is distinct from 'Rejected' then return new; end if;
  select g.session_type into v_session from public.groups g where g.id = new.group_id;
  if not online_security.is_online_type(v_session) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('online:seats:' || new.group_id::text, 0));
  select c.capacity into v_capacity from public.online_courses c where c.group_id = new.group_id;
  v_capacity := coalesce(v_capacity, case when v_session = 'Online One-to-One' then 1 else 10 end);
  select count(*) into v_taken from public.enrollments e
  where e.group_id = new.group_id and e.status is distinct from 'Rejected' and e.id <> new.id;
  if v_taken >= v_capacity then
    perform online_security.fail('capacity', '23514', 'Ce cours en ligne est complet.');
  end if;
  return new;
end $$;
create trigger online_enrollment_capacity before insert or update of group_id, status on public.enrollments
  for each row execute function online_security.enforce_online_capacity();

revoke all on all functions in schema online_security from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Management and operations commands (D2–D10). Every command is SECURITY
-- DEFINER with a fixed search path, checks the stored role, takes the course
-- row lock before a lesson lock, and raises 40001 only for a stale version.
-- ---------------------------------------------------------------------------
create function public.online_save_course(p_group uuid, p_expected_version bigint, p_course jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype; g public.groups%rowtype; v_old_teacher uuid;
  v_teacher uuid; v_audience text; v_capacity integer; v_minutes integer; v_open integer; v_grace integer; v_host integer;
  v_start date; v_end date; v_seats integer;
begin
  perform online_security.require_role(array['director', 'admin']);
  if p_course is null or jsonb_typeof(p_course) <> 'object' or exists (select 1 from jsonb_object_keys(p_course) k
      where k <> all(array['teacher_id', 'audience', 'capacity', 'lesson_minutes', 'join_open_minutes',
        'join_grace_minutes', 'host_open_minutes', 'term_start', 'term_end'])) then
    perform online_security.fail('invalid_input', '22023', 'Champs du cours invalides.');
  end if;
  select * into g from public.groups where id = p_group;
  if not found or not online_security.is_online_type(g.session_type) then
    perform online_security.fail('group_not_online', '23514', 'Ce groupe n’a pas un programme en ligne.');
  end if;
  if p_expected_version is not null then
    c := online_security.course_for_update(p_group, p_expected_version);
    if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est clôturé.'); end if;
  elsif exists (select 1 from public.online_courses where group_id = p_group) then
    perform online_security.fail('course_exists', '23505', 'Ce groupe a déjà un cours en ligne.');
  end if;
  begin
    v_teacher := coalesce(nullif(p_course->>'teacher_id', '')::uuid, c.teacher_id);
    v_audience := coalesce(p_course->>'audience', c.audience);
    v_capacity := coalesce(nullif(p_course->>'capacity', '')::integer, c.capacity,
      case when g.session_type = 'Online One-to-One' then 1 else 10 end);
    v_minutes := coalesce(nullif(p_course->>'lesson_minutes', '')::integer, c.lesson_minutes, 90);
    v_open := coalesce(nullif(p_course->>'join_open_minutes', '')::integer, c.join_open_minutes, 15);
    v_grace := coalesce(nullif(p_course->>'join_grace_minutes', '')::integer, c.join_grace_minutes, 10);
    v_host := coalesce(nullif(p_course->>'host_open_minutes', '')::integer, c.host_open_minutes, 30);
    v_start := coalesce(nullif(p_course->>'term_start', '')::date, c.term_start);
    v_end := coalesce(nullif(p_course->>'term_end', '')::date, c.term_end);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range then
    perform online_security.fail('invalid_input', '22023', 'Champs du cours invalides.');
  end;
  if v_teacher is null or not exists (select 1 from public.teachers t where t.id = v_teacher and t.deleted_at is null) then
    perform online_security.fail('teacher_unavailable', '23514', 'Choisissez un enseignant actif.');
  end if;
  if v_audience is null or v_audience not in ('adult', 'child') or v_capacity not between 1 and 12
     or v_minutes not between 15 and 240 or v_open not between 0 and 60 or v_grace not between 0 and 60
     or v_host not between 0 and 120 then
    perform online_security.fail('invalid_input', '22023', 'Champs du cours invalides.');
  end if;
  if v_start is null or v_end is null or v_end < v_start or v_end > v_start + 182 then
    perform online_security.fail('term_invalid', '22023', 'La période doit durer au plus 26 semaines.');
  end if;
  -- The same seat lock as the enrolment capacity trigger and the guest command.
  perform pg_advisory_xact_lock(hashtextextended('online:seats:' || p_group::text, 0));
  select count(*) into v_seats from public.enrollments e where e.group_id = p_group and e.status is distinct from 'Rejected';
  if v_seats > v_capacity then
    perform online_security.fail('capacity', '23514', 'La capacité est inférieure au nombre d’inscrits.');
  end if;
  if c.group_id is null then
    insert into public.online_courses(group_id, teacher_id, audience, capacity, lesson_minutes, join_open_minutes,
      join_grace_minutes, host_open_minutes, term_start, term_end, created_by, updated_by)
    values (p_group, v_teacher, v_audience, v_capacity, v_minutes, v_open, v_grace, v_host, v_start, v_end,
      auth.uid(), auth.uid()) returning * into c;
  else
    if exists (select 1 from public.online_lessons l where l.group_id = p_group and l.status = 'scheduled'
        and online_security.local_date(l.starts_at) not between v_start and v_end) then
      perform online_security.fail('term_invalid', '22023', 'Des cours planifiés sont hors de cette période.');
    end if;
    v_old_teacher := c.teacher_id;
    update public.online_courses set teacher_id = v_teacher, audience = v_audience, capacity = v_capacity,
      lesson_minutes = v_minutes, join_open_minutes = v_open, join_grace_minutes = v_grace,
      host_open_minutes = v_host, term_start = v_start, term_end = v_end, version = version + 1,
      updated_at = now(), updated_by = auth.uid()
    where group_id = p_group returning * into c;
    if v_old_teacher <> v_teacher then
      -- Future lessons follow the course teacher unless a substitute was set.
      perform online_security.revoke_passes(l.id, null, 'teacher_changed') from public.online_lessons l
      where l.group_id = p_group and l.status = 'scheduled' and l.ends_at > now() and not l.is_substitute;
      update public.online_lessons set teacher_id = v_teacher, version = version + 1, updated_at = now(),
        updated_by = auth.uid()
      where group_id = p_group and status = 'scheduled' and ends_at > now() and not is_substitute;
      update public.online_lessons set is_substitute = (teacher_id <> v_teacher), version = version + 1,
        updated_at = now(), updated_by = auth.uid()
      where group_id = p_group and status = 'scheduled' and ends_at > now() and is_substitute
        and teacher_id = v_teacher;
    end if;
    perform online_security.assert_no_overlap(p_group);
  end if;
  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status);
end $$;

create function public.online_save_pattern(p_group uuid, p_patterns jsonb, p_from_date date, p_expected_version bigint)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype; v_item jsonb; v_from date; v_result jsonb; v_version bigint;
  v_weekday integer; v_time time; v_minutes integer;
begin
  perform online_security.require_role(array['director', 'admin']);
  c := online_security.course_for_update(p_group, p_expected_version);
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est clôturé.'); end if;
  if p_patterns is null or jsonb_typeof(p_patterns) <> 'array' or jsonb_array_length(p_patterns) > 7 then
    perform online_security.fail('pattern_invalid', '22023', 'Horaire hebdomadaire invalide.');
  end if;
  for v_item in select x from jsonb_array_elements(p_patterns) x loop
    if jsonb_typeof(v_item) <> 'object' or exists (select 1 from jsonb_object_keys(v_item) k
        where k <> all(array['weekday', 'start_time', 'minutes'])) then
      perform online_security.fail('pattern_invalid', '22023', 'Horaire hebdomadaire invalide.');
    end if;
    begin
      v_weekday := (v_item->>'weekday')::integer;
      v_time := (v_item->>'start_time')::time;
      v_minutes := coalesce(nullif(v_item->>'minutes', '')::integer, c.lesson_minutes);
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
        or numeric_value_out_of_range then
      perform online_security.fail('pattern_invalid', '22023', 'Horaire hebdomadaire invalide.');
    end;
    if v_weekday is null or v_weekday not between 0 and 6 or v_time is null or extract(second from v_time) <> 0
       or v_minutes not between 15 and 240 then
      perform online_security.fail('pattern_invalid', '22023', 'Horaire hebdomadaire invalide.');
    end if;
  end loop;
  if (select count(distinct ((x->>'weekday')::integer, (x->>'start_time')::time)) from jsonb_array_elements(p_patterns) x)
     <> jsonb_array_length(p_patterns) then
    perform online_security.fail('pattern_invalid', '22023', 'Horaire hebdomadaire en double.');
  end if;
  v_from := greatest(coalesce(p_from_date, online_security.today()), c.term_start);
  if v_from > c.term_end then
    perform online_security.fail('term_invalid', '22023', 'La date de début est après la fin de la période.');
  end if;
  update public.online_lesson_patterns set valid_to = v_from - 1
  where group_id = p_group and valid_from < v_from and valid_to >= v_from;
  delete from public.online_lesson_patterns where group_id = p_group and valid_from >= v_from;
  insert into public.online_lesson_patterns(group_id, weekday, start_time, minutes, valid_from, valid_to, created_by)
  select p_group, (x->>'weekday')::smallint, (x->>'start_time')::time,
    coalesce(nullif(x->>'minutes', '')::integer, c.lesson_minutes), v_from, c.term_end, auth.uid()
  from jsonb_array_elements(p_patterns) x;
  v_result := online_security.reconcile_lessons(p_group, v_from, c.term_end);
  perform online_security.refresh_group_schedule(p_group);
  update public.online_courses set version = version + 1, updated_at = now(), updated_by = auth.uid()
  where group_id = p_group returning version into v_version;
  return v_result || jsonb_build_object('version', v_version, 'from_date', v_from);
end $$;

create function public.online_update_lesson(p_lesson uuid, p_expected_version bigint, p_changes jsonb, p_scope text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_role text; l public.online_lessons%rowtype; c public.online_courses%rowtype; p public.online_lesson_patterns%rowtype;
  g public.groups%rowtype; v_date date; v_time time; v_minutes integer; v_start timestamptz; v_end timestamptz;
  v_old_start timestamptz; v_from date; v_pattern uuid; v_first uuid; v_ids uuid[] := '{}'; v_version bigint;
begin
  v_role := online_security.require_role(array['director', 'admin', 'receptionist']);
  if p_scope is null or p_scope not in ('this', 'following') then
    perform online_security.fail('scope_invalid', '22023', 'Choisissez « ce cours » ou « ce cours et les suivants ».');
  end if;
  -- "This and the following" moves the weekly pattern, a management action (D13).
  if p_scope = 'following' and v_role not in ('director', 'admin') then
    perform online_security.fail('forbidden', '42501', 'Action non autorisée.');
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_changes) k where k <> all(array['date', 'start_time', 'minutes'])) then
    perform online_security.fail('invalid_input', '22023', 'Modification invalide.');
  end if;
  l := online_security.lesson_for_update(p_lesson, p_expected_version);
  select * into strict c from public.online_courses where group_id = l.group_id;
  select * into strict g from public.groups where id = l.group_id;
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est clôturé.'); end if;
  if l.status = 'cancelled' then perform online_security.fail('lesson_cancelled', '23514', 'Ce cours est annulé.'); end if;
  if l.status = 'completed' or l.starts_at <= now() then
    perform online_security.fail('lesson_past', '23514', 'Ce cours a déjà commencé.');
  end if;
  begin
    v_date := coalesce(nullif(p_changes->>'date', '')::date, online_security.local_date(l.starts_at));
    v_time := coalesce(nullif(p_changes->>'start_time', '')::time, (l.starts_at at time zone 'Africa/Casablanca')::time);
    v_minutes := coalesce(nullif(p_changes->>'minutes', '')::integer,
      (extract(epoch from l.ends_at - l.starts_at) / 60)::integer);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range then
    perform online_security.fail('invalid_input', '22023', 'Modification invalide.');
  end;
  if extract(second from v_time) <> 0 or v_minutes not between 15 and 240 then
    perform online_security.fail('invalid_input', '22023', 'Modification invalide.');
  end if;
  v_start := (v_date + v_time) at time zone 'Africa/Casablanca';
  v_end := v_start + make_interval(mins => v_minutes);
  if v_start <= now() then perform online_security.fail('lesson_past', '23514', 'La nouvelle date est passée.'); end if;
  if v_date not between c.term_start and c.term_end then
    perform online_security.fail('term_invalid', '22023', 'La nouvelle date est hors de la période du cours.');
  end if;
  v_old_start := l.starts_at;
  if p_scope = 'this' then
    if v_start = l.starts_at and v_end = l.ends_at then
      return jsonb_build_object('lesson_id', l.id, 'version', l.version, 'notification_ids', '[]'::jsonb);
    end if;
    begin
      update public.online_lessons set starts_at = v_start, ends_at = v_end, detached = true, version = version + 1,
        updated_at = now(), updated_by = auth.uid()
      where id = l.id returning * into l;
    exception when unique_violation then
      perform online_security.fail('lesson_overlap', '23514', 'Un autre cours de ce groupe commence à cette heure.');
    end;
    perform online_security.revoke_passes(l.id, null, 'rescheduled');
    perform online_security.assert_no_overlap(l.group_id);
    v_ids := online_security.notify(array[l.id], 'online_lesson_rescheduled', 'Cours en ligne déplacé — ' || g.name,
      'Le cours en ligne « ' || g.name || ' » du ' || online_security.french_when(v_old_start)
      || ' est déplacé au ' || online_security.french_when(v_start) || '.');
    v_version := l.version;
  else
    if l.pattern_id is null then
      perform online_security.fail('scope_invalid', '22023', 'Ce cours ne suit pas l’horaire hebdomadaire.');
    end if;
    select * into strict p from public.online_lesson_patterns where id = l.pattern_id for update;
    v_from := least(online_security.local_date(l.starts_at), v_date);
    if p.valid_from < v_from then
      update public.online_lesson_patterns set valid_to = v_from - 1 where id = p.id;
    else
      delete from public.online_lesson_patterns where id = p.id;
    end if;
    insert into public.online_lesson_patterns(group_id, weekday, start_time, minutes, valid_from, valid_to, created_by)
    values (l.group_id, extract(dow from v_date)::smallint, v_time, v_minutes, v_from, greatest(p.valid_to, v_from), auth.uid())
    returning id into v_pattern;
    perform online_security.reconcile_lessons(l.group_id, v_from, greatest(p.valid_to, v_from));
    perform online_security.refresh_group_schedule(l.group_id);
    update public.online_courses set version = version + 1, updated_at = now(), updated_by = auth.uid()
    where group_id = l.group_id;
    select id into v_first from public.online_lessons where pattern_id = v_pattern and starts_at > now()
    order by starts_at limit 1;
    if v_first is not null then
      v_ids := online_security.notify(array[v_first], 'online_lesson_rescheduled', 'Horaire du cours en ligne modifié — ' || g.name,
        'À partir du ' || online_security.french_when(v_old_start) || ', le cours en ligne « ' || g.name
        || ' » a lieu le ' || online_security.french_when(
          (select starts_at from public.online_lessons where id = v_first)) || ' puis chaque semaine à la même heure.');
    end if;
    select version into v_version from public.online_lessons where id = v_first;
  end if;
  return jsonb_build_object('lesson_id', coalesce(v_first, l.id), 'version', v_version, 'notification_ids', to_jsonb(v_ids));
end $$;

create function public.online_set_lesson_teacher(p_lesson uuid, p_expected_version bigint, p_teacher uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare l public.online_lessons%rowtype; c public.online_courses%rowtype;
begin
  perform online_security.require_role(array['director', 'admin']);
  l := online_security.lesson_for_update(p_lesson, p_expected_version);
  select * into strict c from public.online_courses where group_id = l.group_id;
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est clôturé.'); end if;
  if l.status = 'cancelled' then perform online_security.fail('lesson_cancelled', '23514', 'Ce cours est annulé.'); end if;
  if l.status = 'completed' or l.ends_at <= now() then
    perform online_security.fail('lesson_past', '23514', 'Ce cours est terminé.');
  end if;
  if p_teacher is null or not exists (select 1 from public.teachers t where t.id = p_teacher and t.deleted_at is null) then
    perform online_security.fail('teacher_unavailable', '23514', 'Choisissez un enseignant actif.');
  end if;
  if p_teacher <> l.teacher_id then
    update public.online_lessons set teacher_id = p_teacher, is_substitute = (p_teacher <> c.teacher_id),
      version = version + 1, updated_at = now(), updated_by = auth.uid()
    where id = l.id returning * into l;
    perform online_security.revoke_passes(l.id, null, 'teacher_changed');
  end if;
  return jsonb_build_object('lesson_id', l.id, 'version', l.version, 'is_substitute', l.is_substitute);
end $$;

create function public.online_cancel_lesson(p_lesson uuid, p_expected_version bigint, p_reason text, p_scope text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare l public.online_lessons%rowtype; c public.online_courses%rowtype; g public.groups%rowtype;
  v_reason text := btrim(p_reason); v_lessons uuid[]; v_ids uuid[]; v_lesson uuid; v_count integer;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  if p_scope is null or p_scope not in ('this', 'following') then
    perform online_security.fail('scope_invalid', '22023', 'Choisissez « ce cours » ou « ce cours et les suivants ».');
  end if;
  if v_reason is null or char_length(v_reason) not between 1 and 200 then
    perform online_security.fail('invalid_input', '22023', 'Indiquez un motif (200 caractères au plus).');
  end if;
  l := online_security.lesson_for_update(p_lesson, p_expected_version);
  select * into strict c from public.online_courses where group_id = l.group_id;
  select * into strict g from public.groups where id = l.group_id;
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est clôturé.'); end if;
  if l.status = 'cancelled' then perform online_security.fail('lesson_cancelled', '23514', 'Ce cours est déjà annulé.'); end if;
  if l.status = 'completed' or l.ends_at <= now() then
    perform online_security.fail('lesson_past', '23514', 'Ce cours est terminé.');
  end if;
  if p_scope = 'this' then
    v_lessons := array[l.id];
  else
    select array_agg(x.id order by x.starts_at) into v_lessons from (
      select id, starts_at from public.online_lessons where group_id = l.group_id and status = 'scheduled'
        and starts_at >= l.starts_at for update) x;
  end if;
  update public.online_lessons set status = 'cancelled', cancel_reason = v_reason, cancelled_at = now(),
    cancelled_by = auth.uid(), version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = any(v_lessons);
  foreach v_lesson in array v_lessons loop
    perform online_security.revoke_passes(v_lesson, null, 'cancelled');
  end loop;
  v_count := cardinality(v_lessons);
  v_ids := online_security.notify(v_lessons, 'online_lesson_cancelled', 'Cours en ligne annulé — ' || g.name,
    case when v_count = 1 then 'Le cours en ligne « ' || g.name || ' » du ' || online_security.french_when(l.starts_at)
      || ' est annulé. Motif : ' || v_reason || '.'
    else 'Les cours en ligne « ' || g.name || ' » à partir du ' || online_security.french_when(l.starts_at)
      || ' sont annulés (' || v_count || ' cours). Motif : ' || v_reason || '.' end);
  return jsonb_build_object('cancelled', v_count, 'version', (select version from public.online_lessons where id = l.id),
    'notification_ids', to_jsonb(v_ids));
end $$;

create function public.online_add_guest(p_lesson uuid, p_student uuid, p_kind text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare l public.online_lessons%rowtype; c public.online_courses%rowtype; v_id uuid; v_note text := nullif(btrim(p_note), '');
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  if p_kind is null or p_kind not in ('trial', 'override') or char_length(v_note) > 200 then
    perform online_security.fail('invalid_input', '22023', 'Invité invalide.');
  end if;
  select * into l from public.online_lessons where id = p_lesson;
  if not found then perform online_security.fail('not_found', '22023', 'Cours introuvable.'); end if;
  select * into strict c from public.online_courses where group_id = l.group_id for update;
  select * into strict l from public.online_lessons where id = p_lesson for update;
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est clôturé.'); end if;
  if l.status = 'cancelled' then perform online_security.fail('lesson_cancelled', '23514', 'Ce cours est annulé.'); end if;
  if l.status = 'completed' or l.ends_at <= now() then
    perform online_security.fail('lesson_past', '23514', 'Ce cours est terminé.');
  end if;
  if not exists (select 1 from public.students s where s.id = p_student and s.deleted_at is null) then
    perform online_security.fail('not_found', '22023', 'Apprenant introuvable.');
  end if;
  if exists (select 1 from public.online_lesson_guests g where g.lesson_id = l.id and g.student_id = p_student
      and g.removed_at is null) then
    perform online_security.fail('guest_exists', '23505', 'Cet apprenant est déjà invité à ce cours.');
  end if;
  if exists (select 1 from public.enrollments e where e.student_id = p_student and e.group_id = l.group_id
      and e.status in ('Confirmed', 'Validated')) then
    perform online_security.fail('already_enrolled', '23514', 'Cet apprenant est déjà inscrit à ce cours.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('online:seats:' || l.group_id::text, 0));
  if (select count(*) from public.enrollments e where e.group_id = l.group_id and e.status is distinct from 'Rejected')
     + (select count(*) from public.online_lesson_guests g where g.lesson_id = l.id and g.removed_at is null)
     >= c.capacity then
    perform online_security.fail('capacity', '23514', 'Ce cours en ligne est complet.');
  end if;
  insert into public.online_lesson_guests(lesson_id, student_id, kind, note, added_by)
  values (l.id, p_student, p_kind, v_note, auth.uid()) returning id into v_id;
  return jsonb_build_object('guest_id', v_id);
end $$;

create function public.online_remove_guest(p_guest uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_guest public.online_lesson_guests%rowtype; v_group uuid; v_revoked integer;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  select l.group_id into v_group from public.online_lesson_guests g join public.online_lessons l on l.id = g.lesson_id
  where g.id = p_guest;
  if v_group is null then perform online_security.fail('not_found', '22023', 'Invité introuvable.'); end if;
  perform 1 from public.online_courses where group_id = v_group for update;
  select * into v_guest from public.online_lesson_guests where id = p_guest for update;
  if v_guest.removed_at is not null then perform online_security.fail('not_found', '22023', 'Invité introuvable.'); end if;
  update public.online_lesson_guests set removed_at = now(), removed_by = auth.uid() where id = p_guest;
  v_revoked := online_security.revoke_passes(v_guest.lesson_id, v_guest.student_id, 'guest_removed');
  return jsonb_build_object('removed', true, 'revoked', v_revoked);
end $$;

create function public.online_record_consent(p_student uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_id uuid; v_note text := nullif(btrim(p_note), '');
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  if char_length(v_note) > 200 then perform online_security.fail('invalid_input', '22023', 'Note trop longue.'); end if;
  if not exists (select 1 from public.students s where s.id = p_student and s.deleted_at is null) then
    perform online_security.fail('not_found', '22023', 'Apprenant introuvable.');
  end if;
  insert into public.online_consents(student_id, kind, recorded_by, note)
  values (p_student, 'video_minor', auth.uid(), v_note)
  on conflict (student_id, kind) where revoked_at is null do nothing returning id into v_id;
  if v_id is not null then return jsonb_build_object('consent_id', v_id, 'created', true); end if;
  select id into strict v_id from public.online_consents where student_id = p_student and kind = 'video_minor'
    and revoked_at is null;
  return jsonb_build_object('consent_id', v_id, 'created', false);
end $$;

create function public.online_revoke_consent(p_student uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_count integer; v_revoked integer;
begin
  perform online_security.require_role(array['director', 'admin']);
  update public.online_consents set revoked_at = now(), revoked_by = auth.uid()
  where student_id = p_student and kind = 'video_minor' and revoked_at is null;
  get diagnostics v_count = row_count;
  update public.online_join_tokens t set revoked_at = now(), revoke_reason = 'consent_revoked'
  from public.online_lessons l join public.online_courses c on c.group_id = l.group_id
  where t.lesson_id = l.id and c.audience = 'child' and t.student_id = p_student
    and t.revoked_at is null and t.expires_at > now();
  get diagnostics v_revoked = row_count;
  return jsonb_build_object('revoked', v_count, 'passes_revoked', v_revoked);
end $$;

create function public.online_activate_course(p_group uuid, p_expected_version bigint, p_provider text, p_room_ref text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype;
begin
  perform online_security.require_role(array['director', 'admin']);
  c := online_security.course_for_update(p_group, p_expected_version);
  if c.status <> 'draft' then
    perform online_security.fail('course_not_draft', '23514', 'Seul un cours en préparation peut être activé.');
  end if;
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9-]{1,31}$' then
    perform online_security.fail('invalid_input', '22023', 'Fournisseur invalide.');
  end if;
  if p_room_ref is null or strpos(p_room_ref, '://') > 0 or p_room_ref !~ '^[A-Za-z0-9._:-]{1,200}$' then
    perform online_security.fail('room_ref_invalid', '22023', 'Référence de salle invalide.');
  end if;
  update public.online_courses set status = 'active', provider = p_provider, provider_room_ref = p_room_ref,
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where group_id = p_group returning * into c;
  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status);
end $$;

create function public.online_close_course(p_group uuid, p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
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
  -- The opaque reference goes back to management only, so the route can close the provider room.
  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status,
    'provider', c.provider, 'room_ref', c.provider_room_ref, 'revoked', v_revoked);
end $$;

-- ---------------------------------------------------------------------------
-- Join passes (D6). The pass is per person and per lesson and expires at the
-- lesson end plus grace. No pass read ever returns the provider room; only the
-- server resolves it, as the service role, right after issuing.
-- ---------------------------------------------------------------------------
create function public.online_issue_join(p_lesson uuid, p_student uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v jsonb; t public.online_join_tokens%rowtype;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist', 'teacher', 'parent', 'student']);
  -- One issue at a time per lesson keeps the capacity count exact.
  perform pg_advisory_xact_lock(hashtextextended('online:join:' || p_lesson::text, 0));
  v := online_security.evaluate_join(p_lesson, p_student);
  if (v->>'ok')::boolean is not true then
    perform online_security.fail(v->>'reason', case when v->>'reason' = 'capacity' then '23514' else '42501' end,
      'Accès au cours refusé.');
  end if;
  insert into public.online_join_tokens(lesson_id, participant_kind, student_id, teacher_id, profile_id, display_label, expires_at)
  values (p_lesson, v->>'kind', (v->>'student_id')::uuid, (v->>'teacher_id')::uuid, auth.uid(), v->>'label',
    (v->>'expires_at')::timestamptz)
  returning * into t;
  return jsonb_build_object('token_id', t.id, 'jti', t.jti, 'lesson_id', t.lesson_id,
    'participant_kind', t.participant_kind,
    'provider_role', case when t.participant_kind = 'host' then 'host' else 'participant' end,
    'display_label', t.display_label, 'expires_at', t.expires_at);
end $$;

-- The same evaluation without issuing a pass: the room page re-reads it
-- every 30 seconds and leaves when the learner no longer qualifies.
create function public.online_check_join(p_lesson uuid, p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v jsonb;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist', 'teacher', 'parent', 'student']);
  v := online_security.evaluate_join(p_lesson, p_student);
  return jsonb_build_object('ok', (v->>'ok')::boolean, 'reason', v->>'reason', 'opens_at', v->'opens_at',
    'closes_at', v->'closes_at');
end $$;

-- Service role only: the join route resolves a freshly issued, open pass.
create function public.online_resolve_join(p_jti uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare r record;
begin
  select t.display_label, t.participant_kind, t.expires_at, t.revoked_at, t.issued_at, c.provider,
    c.provider_room_ref, c.status as course_status, l.status as lesson_status
  into r from public.online_join_tokens t join public.online_lessons l on l.id = t.lesson_id
  join public.online_courses c on c.group_id = l.group_id where t.jti = p_jti;
  if not found or r.revoked_at is not null or r.expires_at <= now() or r.issued_at < now() - interval '5 minutes'
     or r.course_status <> 'active' or r.lesson_status = 'cancelled' or r.provider_room_ref is null then
    perform online_security.fail('pass_invalid', '42501', 'Accès au cours refusé.');
  end if;
  return jsonb_build_object('provider', r.provider, 'room_ref', r.provider_room_ref, 'display_label', r.display_label,
    'provider_role', case when r.participant_kind = 'host' then 'host' else 'participant' end,
    'expires_at', r.expires_at);
end $$;

-- Service role only: provider join/leave evidence after signature checks.
create function public.online_record_join_event(p_jti uuid, p_kind text, p_at timestamptz, p_ref text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_token uuid; v_id uuid;
begin
  if p_kind is null or p_kind not in ('joined', 'left') or p_at is null or not isfinite(p_at)
     or p_at > now() + interval '5 minutes' or char_length(p_ref) > 200 then
    perform online_security.fail('invalid_input', '22023', 'Événement invalide.');
  end if;
  select id into v_token from public.online_join_tokens where jti = p_jti;
  if v_token is null then return jsonb_build_object('recorded', false); end if;
  insert into public.online_join_events(token_id, kind, at, provider_participant_ref)
  values (v_token, p_kind, p_at, p_ref) on conflict on constraint online_join_events_once_key do nothing
  returning id into v_id;
  return jsonb_build_object('recorded', v_id is not null);
end $$;

-- ---------------------------------------------------------------------------
-- Attendance and report (D8): the lesson's effective teacher inside the
-- access window, or operations staff. Provider events never write here.
-- ---------------------------------------------------------------------------
create function public.online_save_attendance(p_lesson uuid, p_expected_version bigint, p_rows jsonb,
  p_report text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_role text; v_teacher uuid; l public.online_lessons%rowtype; c public.online_courses%rowtype; v_row jsonb;
  v_student uuid; v_status text; v_note text; v_report text := nullif(btrim(p_report), '');
begin
  v_role := online_security.require_role(array['director', 'admin', 'receptionist', 'teacher']);
  select * into l from public.online_lessons where id = p_lesson;
  if v_role = 'teacher' then
    v_teacher := online_security.caller_teacher_id();
    if l.id is null or v_teacher is null or l.teacher_id <> v_teacher
       or not online_security.teacher_sees_lesson(l, v_teacher) then
      perform online_security.fail('forbidden', '42501', 'Action non autorisée.');
    end if;
  elsif l.id is null then
    perform online_security.fail('not_found', '22023', 'Cours introuvable.');
  end if;
  l := online_security.lesson_for_update(p_lesson, p_expected_version);
  select * into strict c from public.online_courses where group_id = l.group_id;
  if l.status = 'cancelled' then perform online_security.fail('lesson_cancelled', '23514', 'Ce cours est annulé.'); end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 40
     or char_length(v_report) > 400 then
    perform online_security.fail('invalid_input', '22023', 'Présences invalides.');
  end if;
  for v_row in select x from jsonb_array_elements(p_rows) x loop
    if jsonb_typeof(v_row) <> 'object' or exists (select 1 from jsonb_object_keys(v_row) k
        where k <> all(array['student_id', 'status', 'note'])) then
      perform online_security.fail('invalid_input', '22023', 'Présences invalides.');
    end if;
    begin
      v_student := (v_row->>'student_id')::uuid;
    exception when invalid_text_representation then
      perform online_security.fail('invalid_input', '22023', 'Présences invalides.');
    end;
    v_status := v_row->>'status';
    v_note := nullif(btrim(v_row->>'note'), '');
    if v_student is null or v_status is null or v_status not in ('Présent', 'Absent', 'Retard', 'Justifié')
       or char_length(v_note) > 200 then
      perform online_security.fail('invalid_input', '22023', 'Présences invalides.');
    end if;
    if not online_security.holds_seat(l.id, l.group_id, v_student) then
      perform online_security.fail('not_on_roster', '23514', 'Cet apprenant ne participe pas à ce cours.');
    end if;
    insert into public.online_attendance(lesson_id, student_id, status, note, marked_by)
    values (l.id, v_student, v_status, v_note, auth.uid())
    on conflict on constraint online_attendance_lesson_student_key do update
      set status = excluded.status, note = excluded.note, marked_by = excluded.marked_by, marked_at = now();
  end loop;
  update public.online_lessons set
    report = case when p_report is null then report else v_report end,
    report_by = case when p_report is null then report_by else auth.uid() end,
    status = case when now() >= starts_at then 'completed' else status end,
    completed_at = case when now() >= starts_at then coalesce(completed_at, now()) else completed_at end,
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = l.id returning * into l;
  return jsonb_build_object('lesson_id', l.id, 'version', l.version, 'status', l.status);
end $$;

-- ---------------------------------------------------------------------------
-- Reads. Teacher projections carry exactly six roster keys (invariant 2);
-- family reads carry no contact or finance field; staff reads are bounded.
-- ---------------------------------------------------------------------------
create function public.online_list_my_lessons(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_teacher uuid; v_from date; v_to date; v_result jsonb;
begin
  perform online_security.require_role(array['teacher']);
  v_teacher := online_security.caller_teacher_id();
  v_from := coalesce(p_from, online_security.today() - 7);
  v_to := coalesce(p_to, online_security.today() + 28);
  if v_to < v_from or v_to - v_from > 93 then
    perform online_security.fail('invalid_input', '22023', 'Période invalide.');
  end if;
  if v_teacher is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(online_security.lesson_json(l) || jsonb_build_object('course_name', g.name,
      'session_type', g.session_type, 'is_substitute', l.is_substitute, 'i_am_host', l.teacher_id = v_teacher,
      'roster_open', online_security.teacher_sees_lesson(l, v_teacher),
      'host_opens_at', l.starts_at - make_interval(mins => c.host_open_minutes),
      'join_closes_at', l.ends_at + make_interval(mins => c.join_grace_minutes),
      'report_present', l.report is not null,
      'attendance_count', (select count(*) from public.online_attendance a where a.lesson_id = l.id))
    order by l.starts_at), '[]'::jsonb) into v_result
  from public.online_lessons l join public.online_courses c on c.group_id = l.group_id and c.status = 'active'
  join public.groups g on g.id = l.group_id
  where (l.teacher_id = v_teacher or c.teacher_id = v_teacher)
    and online_security.local_date(l.starts_at) between v_from and v_to;
  return v_result;
end $$;

create function public.online_get_lesson_roster(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_teacher uuid; l public.online_lessons%rowtype; c public.online_courses%rowtype; g public.groups%rowtype;
  v_roster jsonb;
begin
  perform online_security.require_role(array['teacher']);
  v_teacher := online_security.caller_teacher_id();
  select * into l from public.online_lessons where id = p_lesson;
  if not found or not online_security.teacher_sees_lesson(l, v_teacher) then return null; end if;
  select * into strict c from public.online_courses where group_id = l.group_id;
  select * into strict g from public.groups where id = l.group_id;
  select coalesce(jsonb_agg(jsonb_build_object('student_id', m.student_id,
      'display_label', online_security.student_label(m.student_id, l.group_id), 'niveau_cefr', s.niveau_cefr,
      'attendance_status', a.status, 'attendance_note', a.note, 'is_guest', m.is_guest)
    order by online_security.student_label(m.student_id, l.group_id)), '[]'::jsonb) into v_roster
  from (select distinct on (x.student_id) x.student_id, x.is_guest from (
      select e.student_id, false as is_guest from public.enrollments e
      where e.group_id = l.group_id and e.status in ('Confirmed', 'Validated')
      union all
      select gu.student_id, true from public.online_lesson_guests gu where gu.lesson_id = l.id and gu.removed_at is null
    ) x order by x.student_id, x.is_guest) m
  join public.students s on s.id = m.student_id and s.deleted_at is null
  left join public.online_attendance a on a.lesson_id = l.id and a.student_id = m.student_id;
  return jsonb_build_object('lesson', online_security.lesson_json(l) || jsonb_build_object('course_name', g.name,
      'i_am_host', l.teacher_id = v_teacher, 'can_write', l.teacher_id = v_teacher, 'is_substitute', l.is_substitute,
      'report', l.report, 'host_opens_at', l.starts_at - make_interval(mins => c.host_open_minutes),
      'join_closes_at', l.ends_at + make_interval(mins => c.join_grace_minutes)),
    'roster', v_roster);
end $$;

create function online_security.family_lessons(p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare v_from date := coalesce(p_from, online_security.today() - 1); v_to date := coalesce(p_to, online_security.today() + 28);
  v_result jsonb;
begin
  if v_to < v_from or v_to - v_from > 93 then
    perform online_security.fail('invalid_input', '22023', 'Période invalide.');
  end if;
  with learners as (
    select s.id, s.full_name from public.students s
    where s.deleted_at is null and s.id in (select public.get_visible_student_ids())
  ), seats as (
    select k.id as student_id, l.id as lesson_id from learners k
    join public.enrollments e on e.student_id = k.id and e.status in ('Confirmed', 'Validated')
    join public.online_lessons l on l.group_id = e.group_id
    union
    select k.id, gu.lesson_id from learners k
    join public.online_lesson_guests gu on gu.student_id = k.id and gu.removed_at is null
  )
  select coalesce(jsonb_agg(online_security.lesson_json(l) || jsonb_build_object('student_id', k.id,
      'student_name', k.full_name, 'course_name', g.name, 'teacher_label', online_security.teacher_label(l.teacher_id),
      'join_opens_at', l.starts_at - make_interval(mins => c.join_open_minutes),
      'join_closes_at', l.ends_at + make_interval(mins => c.join_grace_minutes),
      'consent_missing', c.audience = 'child' and not online_security.has_consent(k.id))
    order by l.starts_at, k.full_name), '[]'::jsonb) into v_result
  from seats st join learners k on k.id = st.student_id
  join public.online_lessons l on l.id = st.lesson_id
  join public.online_courses c on c.group_id = l.group_id and c.status = 'active'
  join public.groups g on g.id = l.group_id
  where online_security.local_date(l.starts_at) between v_from and v_to;
  return v_result;
end $$;

create function public.online_list_lessons_for_me(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$ begin
  perform online_security.require_role(array['student']);
  return online_security.family_lessons(p_from, p_to);
end $$;

create function public.online_list_lessons_for_my_children(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$ begin
  perform online_security.require_role(array['parent']);
  return online_security.family_lessons(p_from, p_to);
end $$;

create function public.online_list_courses() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_result jsonb;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  select coalesce(jsonb_agg(jsonb_build_object('group_id', g.id, 'name', g.name, 'session_type', g.session_type,
      'niveau', g.niveau, 'annee', g.annee, 'jours', g.jours, 'horaire', g.horaire,
      'seats_taken', (select count(*) from public.enrollments e where e.group_id = g.id and e.status is distinct from 'Rejected'),
      'course', case when c.group_id is null then null else jsonb_build_object('status', c.status, 'audience', c.audience,
        'capacity', c.capacity, 'teacher_id', c.teacher_id, 'teacher_name', t.full_name, 'term_start', c.term_start,
        'term_end', c.term_end, 'version', c.version) end,
      'next_lesson', (select online_security.lesson_json(l) from public.online_lessons l where l.group_id = g.id
        and l.status = 'scheduled' and l.ends_at > now() order by l.starts_at limit 1))
    order by g.name, g.id), '[]'::jsonb) into v_result
  from public.groups g left join public.online_courses c on c.group_id = g.id
  left join public.teachers t on t.id = c.teacher_id
  where online_security.is_online_type(g.session_type);
  return v_result;
end $$;

create function public.online_get_course(p_group uuid, p_lesson uuid default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare g public.groups%rowtype; c public.online_courses%rowtype; l public.online_lessons%rowtype;
  v_course jsonb; v_detail jsonb;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  select * into g from public.groups where id = p_group;
  if not found or not online_security.is_online_type(g.session_type) then
    perform online_security.fail('not_found', '22023', 'Cours en ligne introuvable.');
  end if;
  select * into c from public.online_courses where group_id = p_group;
  if c.group_id is not null then
    v_course := jsonb_build_object('status', c.status, 'audience', c.audience, 'capacity', c.capacity,
      'teacher_id', c.teacher_id, 'teacher_name', (select full_name from public.teachers where id = c.teacher_id),
      'lesson_minutes', c.lesson_minutes, 'join_open_minutes', c.join_open_minutes,
      'join_grace_minutes', c.join_grace_minutes, 'host_open_minutes', c.host_open_minutes,
      'term_start', c.term_start, 'term_end', c.term_end, 'provider', c.provider,
      'room_ready', c.provider_room_ref is not null, 'version', c.version,
      'patterns', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'weekday', p.weekday,
          'start_time', to_char(p.start_time, 'HH24:MI'), 'minutes', p.minutes, 'valid_from', p.valid_from,
          'valid_to', p.valid_to) order by (p.weekday + 6) % 7, p.start_time)
        from public.online_lesson_patterns p where p.group_id = p_group and p.valid_to >= online_security.today()), '[]'::jsonb),
      'lessons', coalesce((select jsonb_agg(online_security.lesson_json(x) || jsonb_build_object(
          'teacher_id', x.teacher_id, 'teacher_name', t.full_name, 'is_substitute', x.is_substitute,
          'detached', x.detached, 'cancel_reason', x.cancel_reason, 'report', x.report,
          'guest_count', (select count(*) from public.online_lesson_guests gu where gu.lesson_id = x.id and gu.removed_at is null),
          'attendance_count', (select count(*) from public.online_attendance a where a.lesson_id = x.id))
        order by x.starts_at) from public.online_lessons x left join public.teachers t on t.id = x.teacher_id
        where x.group_id = p_group), '[]'::jsonb));
  end if;
  if p_lesson is not null then
    select * into l from public.online_lessons where id = p_lesson and group_id = p_group;
    if not found then perform online_security.fail('not_found', '22023', 'Cours introuvable.'); end if;
    v_detail := online_security.lesson_json(l) || jsonb_build_object('teacher_id', l.teacher_id,
      'teacher_name', (select full_name from public.teachers where id = l.teacher_id), 'is_substitute', l.is_substitute,
      'cancel_reason', l.cancel_reason, 'report', l.report,
      'guests', coalesce((select jsonb_agg(jsonb_build_object('id', gu.id, 'student_id', gu.student_id,
          'full_name', s.full_name, 'kind', gu.kind, 'note', gu.note, 'added_at', gu.added_at) order by gu.added_at)
        from public.online_lesson_guests gu join public.students s on s.id = gu.student_id
        where gu.lesson_id = l.id and gu.removed_at is null), '[]'::jsonb),
      'attendance', coalesce((select jsonb_agg(jsonb_build_object('student_id', m.student_id, 'full_name', s.full_name,
          'is_guest', m.is_guest, 'status', a.status, 'note', a.note,
          'first_pass_at', (select min(t.issued_at) from public.online_join_tokens t where t.lesson_id = l.id
            and t.student_id = m.student_id),
          'joined_at', (select min(ev.at) from public.online_join_events ev join public.online_join_tokens t on t.id = ev.token_id
            where t.lesson_id = l.id and t.student_id = m.student_id and ev.kind = 'joined'))
        order by s.full_name) from (select distinct on (x.student_id) x.student_id, x.is_guest from (
            select e.student_id, false as is_guest from public.enrollments e
            where e.group_id = l.group_id and e.status in ('Confirmed', 'Validated')
            union all
            select gu.student_id, true from public.online_lesson_guests gu where gu.lesson_id = l.id and gu.removed_at is null
          ) x order by x.student_id, x.is_guest) m
        join public.students s on s.id = m.student_id and s.deleted_at is null
        left join public.online_attendance a on a.lesson_id = l.id and a.student_id = m.student_id), '[]'::jsonb));
  end if;
  return jsonb_build_object('group', jsonb_build_object('id', g.id, 'name', g.name, 'session_type', g.session_type,
      'niveau', g.niveau, 'annee', g.annee, 'jours', g.jours, 'horaire', g.horaire, 'updated_at', g.updated_at),
    'course', v_course,
    'roster', coalesce((select jsonb_agg(jsonb_build_object('student_id', s.id, 'full_name', s.full_name,
        'niveau_cefr', s.niveau_cefr, 'enrollment_id', e.id, 'enrollment_status', e.status,
        'has_consent', online_security.has_consent(s.id),
        'unpaid', exists (select 1 from public.charge_balances cb where cb.student_id = s.id
          and cb.voided_at is null and cb.balance > 0)) order by s.full_name)
      from public.enrollments e join public.students s on s.id = e.student_id and s.deleted_at is null
      where e.group_id = p_group and e.status is distinct from 'Rejected'), '[]'::jsonb),
    'lesson', v_detail);
end $$;

create function public.online_teacher_lesson_counts(p_month date) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_start date; v_result jsonb;
begin
  perform online_security.require_role(array['director', 'admin']);
  if p_month is null then perform online_security.fail('invalid_input', '22023', 'Mois requis.'); end if;
  v_start := date_trunc('month', p_month)::date;
  select coalesce(jsonb_agg(jsonb_build_object('teacher_id', x.teacher_id, 'teacher_name', t.full_name,
      'lessons', x.lessons, 'minutes', x.minutes) order by t.full_name, x.teacher_id), '[]'::jsonb) into v_result
  from (select l.teacher_id, count(*) as lessons, sum(extract(epoch from l.ends_at - l.starts_at) / 60)::integer as minutes
        from public.online_lessons l where l.status = 'completed'
          and online_security.local_date(l.starts_at) >= v_start
          and online_security.local_date(l.starts_at) < (v_start + interval '1 month')::date
        group by l.teacher_id) x
  join public.teachers t on t.id = x.teacher_id;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Execution boundary: no API role on online_security; authenticated only on
-- the public commands and reads; two server-only functions for the service
-- role. Each function checks the caller's stored role itself.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema online_security from public, anon, authenticated, service_role;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'online\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $$;
grant execute on function
  public.online_save_course(uuid, bigint, jsonb),
  public.online_save_pattern(uuid, jsonb, date, bigint),
  public.online_update_lesson(uuid, bigint, jsonb, text),
  public.online_set_lesson_teacher(uuid, bigint, uuid),
  public.online_cancel_lesson(uuid, bigint, text, text),
  public.online_add_guest(uuid, uuid, text, text),
  public.online_remove_guest(uuid),
  public.online_record_consent(uuid, text),
  public.online_revoke_consent(uuid),
  public.online_activate_course(uuid, bigint, text, text),
  public.online_close_course(uuid, bigint),
  public.online_issue_join(uuid, uuid),
  public.online_check_join(uuid, uuid),
  public.online_save_attendance(uuid, bigint, jsonb, text),
  public.online_list_my_lessons(date, date),
  public.online_get_lesson_roster(uuid),
  public.online_list_lessons_for_me(date, date),
  public.online_list_lessons_for_my_children(date, date),
  public.online_list_courses(),
  public.online_get_course(uuid, uuid),
  public.online_teacher_lesson_counts(date)
to authenticated;
grant execute on function public.online_resolve_join(uuid), public.online_record_join_event(uuid, text, timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Catalog assertions, scoped to the objects this migration creates (the
-- global scan belongs to the workshop-removal release): none mentions the
-- retired workshop token, and no online group carries a group teacher.
-- ---------------------------------------------------------------------------
do $$
declare v_token constant text := 'prem' || 'ium';
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'online_security' or (n.nspname = 'public' and p.proname like 'online\_%'))
        and (p.prosrc ilike '%' || v_token || '%' or p.proname ilike '%' || v_token || '%'))
    or exists (select 1 from pg_class r where r.relnamespace = 'public'::regnamespace and r.relname like 'online\_%'
      and r.relname ilike '%' || v_token || '%')
    or exists (select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid
      where r.relnamespace = 'public'::regnamespace and r.relname like 'online\_%'
        and (c.conname ilike '%' || v_token || '%' or pg_get_constraintdef(c.oid) ilike '%' || v_token || '%'))
    or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename like 'online\_%'
      and (p.policyname ilike '%' || v_token || '%' or coalesce(p.qual, '') ilike '%' || v_token || '%'
        or coalesce(p.with_check, '') ilike '%' || v_token || '%'))
    or exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname like 'online\_%'
      and pg_get_triggerdef(t.oid) ilike '%' || v_token || '%')
    or exists (select 1 from pg_class i join pg_index x on x.indexrelid = i.oid join pg_class r on r.oid = x.indrelid
      where r.relnamespace = 'public'::regnamespace and r.relname like 'online\_%'
        and pg_get_indexdef(i.oid) ilike '%' || v_token || '%') then
    raise exception 'An object created by the online learning migration references a retired workshop object';
  end if;
  if exists (select 1 from public.groups g where online_security.is_online_type(g.session_type) and g.teacher_id is not null) then
    raise exception 'An online group carries groups.teacher_id';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
