-- Phase 6: explicit enrollment initiation and evidence-based conversion only.
begin;
alter table public.crm_leads drop constraint crm_leads_conversion;
alter table public.crm_leads add constraint crm_leads_conversion check (
 (status='CONVERTED' and enrollment_id is not null and student_id is not null and conversion_activity_id is not null and converted_at is not null)
 or (status<>'CONVERTED' and conversion_activity_id is null and converted_at is null));

create function crm_security.protect_enrollment_link() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if old.enrollment_id is not null and (new.enrollment_id is distinct from old.enrollment_id or new.student_id is distinct from old.student_id) then
  raise exception 'CRM enrollment link is immutable' using errcode='42501'; end if;
 if old.converted_at is not null and (new.converted_at is distinct from old.converted_at or new.conversion_activity_id is distinct from old.conversion_activity_id or new.status<>'CONVERTED') then
  raise exception 'Historical conversion is immutable' using errcode='42501'; end if;
 return new;
end $$;
create trigger crm_enrollment_link_immutable before update on public.crm_leads for each row execute function crm_security.protect_enrollment_link();

create function crm_security.enrollment_year(e public.enrollments) returns text
language sql stable set search_path=pg_catalog,pg_temp as $$
 select coalesce(e.school_year,y::text||'/'||(y+1)::text) from (
 select extract(year from coalesce(e.date_inscription,(e.created_at at time zone 'Africa/Casablanca')::date))::integer
 - case when extract(month from coalesce(e.date_inscription,(e.created_at at time zone 'Africa/Casablanca')::date))<9 then 1 else 0 end y)x
$$;
create function crm_security.enrollment_summary(e public.enrollments) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',e.id,'student_id',s.id,'student_name',s.full_name,'status',e.status,
 'session_type',coalesce(e.session_type,s.session_type),'school_year',crm_security.enrollment_year(e),
 'level',e.level,'group_name',g.name,'updated_at',e.updated_at)
 from public.students s left join public.groups g on g.id=e.group_id where s.id=e.student_id
$$;

-- The candidate set is evidence for an operator decision, never an identity match.
create function crm_security.student_candidates(lead uuid,learner text,birth date) returns setof public.students
language sql stable set search_path=pg_catalog,pg_temp as $$
 select s.* from public.students s join public.crm_leads l on l.id=lead join public.crm_contacts c on c.id=l.contact_id
 where s.deleted_at is null and (
  (length(btrim(learner))>=2 and position(lower(btrim(learner)) in lower(s.full_name))>0)
  or (birth is not null and s.date_naissance=birth and split_part(lower(btrim(s.full_name)),' ',1)=split_part(lower(btrim(learner)),' ',1))
  or (c.phone_e164 is not null and crm_security.normalize_phone(s.telephone)=c.phone_e164)
  or (c.email_normalized is not null and c.email_normalized in (lower(s.email),lower(s.parent_email)))
 )
$$;
create function crm_security.candidate_token(lead uuid,learner text,birth date) returns text
language sql stable set search_path=pg_catalog,pg_temp as $$
 select encode(sha256(convert_to(coalesce(string_agg(s.id::text||':'||s.updated_at::text,',' order by s.id),''),'UTF8')),'hex')
 from crm_security.student_candidates(lead,learner,birth)s
$$;
create function public.crm_find_student_candidates(p_lead uuid,p_name text,p_birth_date date default null,p_limit integer default 10,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 if p_name is null or length(btrim(p_name)) not between 2 and 120 then raise exception 'Valid learner name required' using errcode='22023'; end if;
 select jsonb_build_object('review_token',crm_security.candidate_token(p_lead,p_name,p_birth_date),
 'total',(select count(*) from crm_security.student_candidates(p_lead,p_name,p_birth_date)),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.full_name,'birth_date',s.date_naissance,'phone',s.telephone,
 'session_type',s.session_type,'level',s.niveau_cefr,'group_name',g.name) order by s.full_name,s.id),'[]'::jsonb)) into result
 from(select * from crm_security.student_candidates(p_lead,p_name,p_birth_date) order by full_name,id limit p_limit offset p_offset)s
 left join public.groups g on g.id=s.groupe_id;
 return result;
end $$;
create function public.crm_find_enrollment_candidates(p_student uuid,p_session text,p_year text,p_limit integer default 10,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 with eligible as(select e.* from public.enrollments e join public.students s on s.id=e.student_id where e.student_id=p_student and s.deleted_at is null
 and coalesce(e.session_type,s.session_type)=p_session and crm_security.enrollment_year(e)=p_year and e.status<>'Rejected'),
 page as(select * from eligible order by created_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(crm_security.enrollment_summary(e)||jsonb_build_object('already_linked',exists(select 1 from public.crm_leads where enrollment_id=e.id)) order by e.created_at desc,e.id) from page e),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.crm_enrollment_groups(p_session text,p_level text default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 with eligible as(select id,name,niveau,session_type from public.groups where session_type=p_session and (p_level is null or niveau=p_level)),
 page as(select * from eligible order by name,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from page p),'[]'::jsonb)) into result;
 return result;
end $$;

-- One evaluator serves both enrollment transitions and linking existing records.
-- For a pre-existing confirmed record, now() is the trusted observation time;
-- no unsupported historical confirmation timestamp is inferred from updated_at.
create function crm_security.evaluate_conversion(lead uuid,happened timestamptz,previous_status text default null,evidence text default 'linked_confirmed_enrollment') returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
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
end $$;
create function crm_security.enrollment_status_transition() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare lead uuid; begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 select id into lead from public.crm_leads where enrollment_id=new.id;
 if lead is not null then perform crm_security.evaluate_conversion(lead,statement_timestamp(),case when tg_op='UPDATE' then old.status end,'enrollment_status_transition'); end if;
 return new;
end $$;
-- After the existing enrollment/student synchronization, including nested updates.
create trigger zz_crm_enrollment_status after insert or update of status on public.enrollments for each row execute function crm_security.enrollment_status_transition();

create function crm_security.valid_enrollment_level(session text,level text) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select level is null or case session when 'Yearly' then level='Pre-Child' or level~'^(Child|Junior) [1-6]$'
 when 'Adults' then level~'^(Beginning|Intermediate) [1-6]$' or level~'^Advanced [1-5]$'
 else level=any(array['A1','A2','B1','B2','C1','C2']) end
$$;
-- Serialize overlapping CRM linkage/payment intentions without waiting on an
-- opposite lead/student lock order. A collision rolls back and requires review.
create function crm_security.lock_enrollment_intent(student uuid) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if student is not null and not pg_try_advisory_xact_lock(hashtextextended('crm:enrollment-intent:'||student,0)) then
  raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='40001';
 end if;
end $$;

create function public.crm_start_enrollment(p_request_key uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; c public.crm_contacts%rowtype;
 s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; a uuid; t public.crm_tasks%rowtype; keep_task uuid;
 learner text; birth date; session text; year text; level text; initial_status text; due timestamptz; result jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
 or p_data-array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date','candidate_review','confirm_new','enrollment_id','expected_enrollment_updated_at','session_type','school_year','level','group_id','initial_status','followup_at','notes']<>'{}'::jsonb then
  raise exception 'Valid bounded enrollment request required' using errcode='22023'; end if;
 perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':start_enrollment:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='start_enrollment' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 if not found or l.status<>'QUALIFIED' or l.merged_into_lead_id is not null or l.enrollment_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='40001'; end if;
 select * into strict c from public.crm_contacts where id=l.contact_id;
 learner:=btrim(p_data->>'learner_name');birth:=nullif(p_data->>'birth_date','')::date;
 session:=p_data->>'session_type';year:=p_data->>'school_year';level:=nullif(p_data->>'level','');initial_status:=coalesce(p_data->>'initial_status','Submitted');
 if session is null or session<>all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other'])
 or year is null or year!~'^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer<>left(year,4)::integer+1
 or length(p_data->>'notes')>2000 then raise exception 'Invalid enrollment program or school year' using errcode='22023'; end if;
 if initial_status not in ('Submitted','Trial') then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501'; end if;
 if p_data->>'student_choice'='new' then
  if l.student_id is not null or p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null
  or learner is null or length(learner) not between 2 and 120 or birth>current_date or not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023'; end if;
  -- Serializes new-student decisions for equal names, including separate leads.
  perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner),0));
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='40001'; end if;
  if exists(select 1 from crm_security.student_candidates(l.id,learner,birth)) and coalesce((p_data->>'confirm_new')::boolean,false) is not true then raise exception 'Explicit new learner decision required' using errcode='22023'; end if;
  insert into public.students(full_name,date_naissance,telephone,email,parent_email,status,session_type,niveau_cefr,notes)
  values(learner,birth,coalesce(c.phone_e164,c.phone_raw),case when c.contact_kind='adult_learner' then c.email_normalized end,
   case when c.contact_kind<>'adult_learner' then c.email_normalized end,'Prospect',session,level,
   case when c.contact_kind<>'adult_learner' then 'Contact : '||coalesce(c.display_name,'Non renseigné') end) returning * into s;
 elsif p_data->>'student_choice'='existing' then
  select * into s from public.students where id=(p_data->>'student_id')::uuid and deleted_at is null for update;
  if not found or (l.student_id is not null and l.student_id<>s.id) then raise exception 'Student unavailable or inconsistent' using errcode='22023'; end if;
 else raise exception 'Explicit student choice required' using errcode='22023'; end if;
 if p_data->>'enrollment_id' is not null then
  select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
  if not found or e.student_id is distinct from s.id or e.status is null or e.status='Rejected'
  or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year
  or exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023'; end if;
  if e.group_id is not null then
   select * into g from public.groups where id=e.group_id for share;
   if not found or g.session_type is distinct from session or (e.level is not null and g.niveau is distinct from e.level) then
    raise exception 'Enrollment group must match session and level' using errcode='22023'; end if;
  end if;
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='40001'; end if;
 else
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment status requires review' using errcode='22023'; end if;
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected' and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023'; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023'; end if;
   level:=g.niveau;
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023'; end if;
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
   due:=crm_security.next_window(l.followup_policy_id,coalesce((p_data->>'followup_at')::timestamptz,now()+interval '1 day'));
   perform crm_security.new_task(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le parent.'),'enrollment-followup:'||l.id||':'||e.id,'enrollment');
  else
   keep_task:=t.id;
   for t in select * from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' and id<>keep_task order by id for update loop
    perform crm_security.finish_task(t,true,'Suivi de cette inscription déjà prévu','enrollment-duplicate:'||e.id||':'||t.id);
   end loop;
  end if;
 end if;
 result:=crm_security.result(l.id,'enrollment-started:'||l.id||':'||e.id)||jsonb_build_object('enrollment',crm_security.enrollment_summary(e));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'start_enrollment',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='40001';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023';
end $$;

create or replace function public.crm_get_workspace_detail(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.operational_card(l.id)||jsonb_build_object('contact',jsonb_build_object('display_name',c.display_name,'phone',coalesce(c.phone_e164,c.phone_raw),
 'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),'email',c.email_normalized),
 'enrollment',(select crm_security.enrollment_summary(e) from public.enrollments e where e.id=l.enrollment_id),
 'conversion_review_required',case when public.get_my_role()='director' then l.conversion_review_required else false end,
 'qualification_step',l.qualification_step,'closure_reason',l.closure_reason,'closure_note',l.closure_note,'last_conversation_at',l.last_conversation_at,
 'outreach_cycle',l.outreach_cycle,'failed_attempts',crm_security.failed_count(l),
 'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
 'open_tasks',public.crm_list_open_tasks(l.id,null,100,0),
 'confirm_placement_task',(select jsonb_build_object('id',t.id,'version',t.version) from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='confirm_placement_test' order by t.due_at,t.id limit 1),
 'placement_count',(select count(*) from public.placement_tests where crm_lead_id=l.id),
 'open_task_count',(select count(*) from public.crm_tasks where lead_id=l.id and status='open')) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $$;
create function public.crm_get_enrollment_context(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select jsonb_build_object('learner_name',l.learner_name,'birth_date',l.learner_birth_date,'age',l.learner_age,
 'session_type',l.session_type,'program_interest',l.program_interest_text,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'email',c.email_normalized,'student_id',l.student_id,
 'recommended_level',(select p.niveau_recommande from public.placement_tests p where p.crm_lead_id=l.id and p.status in ('Résultat saisi','Affecté')
 and exists(select 1 from public.crm_activities a where a.placement_test_id=p.id and a.event_type='placement_result_entered') order by p.updated_at desc,p.id limit 1)) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $$;
-- Forward replacement of 074: only CRM intent locking and implicit-create guard differ.
create or replace function public.create_charge_payment(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
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
  if auth.uid() is null or (public.get_my_role() in ('admin','director')) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
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
$$;
-- Receipt staff receive only existing operational enrollment fields and a
-- boolean marker; no lead IDs, contact, campaign or attribution data.
create function public.receipt_enrollment_candidates(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 if auth.uid() is null or (public.get_my_role() in ('admin','director')) is not true then
  raise exception 'Forbidden' using errcode='42501'; end if;
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
end $$;
revoke all on function public.receipt_enrollment_candidates(uuid) from public,anon,authenticated,service_role;
grant execute on function public.receipt_enrollment_candidates(uuid) to authenticated;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_start_enrollment(uuid,jsonb),public.crm_find_student_candidates(uuid,text,date,integer,integer),
 public.crm_find_enrollment_candidates(uuid,text,text,integer,integer),public.crm_enrollment_groups(text,text,integer,integer),public.crm_get_enrollment_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_start_enrollment(uuid,jsonb),public.crm_find_student_candidates(uuid,text,date,integer,integer),
 public.crm_find_enrollment_candidates(uuid,text,text,integer,integer),public.crm_enrollment_groups(text,text,integer,integer),public.crm_get_enrollment_context(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
