-- RCC-A2 enrollment initiation acceptance: synthetic local fixtures, fully rolled back.
-- Every reason asserts the unchanged SQLSTATE and message plus the exact hint.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.uid(i integer) returns uuid language sql as $$ select ('a2000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.uid(i)::text,true);
end $$;
create function pg_temp.act(cmd text,lead uuid,payload jsonb default '{}',request uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$ declare result jsonb; begin
 execute format('select public.crm_%I($1,$2)',cmd) into result
 using request,jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload;
 return result;
end $$;
create temp sequence a2_n;
create temp table a2_seen(reason text);
-- Unique names and telephones keep every candidate set empty unless a test adds one.
create function pg_temp.raw_lead(learner text default null) returns uuid language plpgsql as $$ declare n bigint:=nextval('a2_n'); begin
 perform pg_temp.actor(3);
 return (public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','A2 parent '||n,
  'learner_name',coalesce(learner,'A2n'||n||' Learner'),'phone','06'||lpad((40000000+n)::text,8,'0'),'source_label','Manual'))->'lead'->>'id')::uuid;
end $$;
create function pg_temp.lead(task text default 'confirm_placement_test',step text default 'placement_test') returns uuid language plpgsql as $$ declare l uuid:=pg_temp.raw_lead(); begin
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','A2 synthetic','qualification_step',step,
  'next_task',jsonb_build_object('task_type',task,'due_at',now()+interval '2 days')));
 return l;
end $$;
create function pg_temp.new_data(l uuid,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('lead_id',l,'expected_version',x.version,'student_choice','new','learner_name',x.learner_name,
 'candidate_review',crm_security.candidate_token(l,x.learner_name,null),'session_type','Yearly','school_year','2026/2027')||extra
 from public.crm_leads x where x.id=l
$$;
create function pg_temp.existing_data(l uuid,s uuid,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'student_choice','existing',
 'student_id',s,'session_type','Yearly','school_year','2026/2027')||extra
$$;
create function pg_temp.pick(l uuid,s uuid,e uuid) returns jsonb language sql as $$
 select pg_temp.existing_data(l,s,jsonb_build_object('enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from public.enrollments where id=e)))
$$;
create function pg_temp.student(name text,deleted boolean default false) returns uuid language sql as $$
 insert into public.students(full_name,date_naissance,telephone,status,session_type,deleted_at)
 values(name||' '||nextval('a2_n'),'2015-03-01','07'||lpad((50000000+currval('a2_n'))::text,8,'0'),'Prospect','Yearly',case when deleted then now() end) returning id
$$;
create function pg_temp.enrollment(s uuid,status text,session text default 'Yearly',grp uuid default null) returns uuid language sql as $$
 insert into public.enrollments(student_id,session_type,school_year,status,level,group_id) values(s,session,'2026/2027',status,'Child 2',grp) returning id
$$;
create function pg_temp.start(data jsonb,request uuid default gen_random_uuid(),who integer default 3) returns jsonb language plpgsql as $$ declare r jsonb; begin
 perform pg_temp.actor(who);execute 'set local role authenticated';
 r:=public.crm_start_enrollment(request,data);
 execute 'reset role';return r;
end $$;
-- Asserts the exact SQLSTATE, the unchanged message and the exact hint (or none).
create function pg_temp.rejects(data jsonb,code text,message text,reason text,request uuid default gen_random_uuid(),who integer default 3) returns void language plpgsql as $$
declare st text; msg text; h text; begin
 begin perform pg_temp.start(data,request,who);
 exception when others then get stacked diagnostics st=returned_sqlstate,msg=message_text,h=pg_exception_hint;
  if st is distinct from code or msg is distinct from message or nullif(h,'') is distinct from 'crm_enrollment.'||reason then
   raise exception 'FAIL %: expected % "%", got % "%" [%]',coalesce(reason,'no hint'),code,message,st,msg,h; end if;
  insert into a2_seen values(reason);return;
 end;
 raise exception 'FAIL %: unexpected success',coalesce(reason,'no hint');
end $$;
create function pg_temp.counts() returns jsonb language sql as $$
 select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.crm_tasks),
 (select count(*) from public.crm_activities),(select count(*) from public.crm_command_requests),(select count(*) from public.crm_leads where enrollment_id is not null))
$$;
create function pg_temp.untouched() returns jsonb language sql as $$
 select jsonb_build_array((select count(*) from public.charges),(select count(*) from public.receipts),(select count(*) from public.financial_events),
 (select count(*) from public.crm_lifecycle_pending_intents),(select count(*) from public.crm_external_deliveries),(select count(*) from public.crm_external_delivery_attempts))
$$;
create temp table a2_baseline as select pg_temp.untouched() v;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select pg_temp.uid(i),'rcc-a2-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like 'a2000000-%';
select pg_temp.actor(1);
create temp table a2_policy as select (public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid id;

-- Happy path: a new learner with every optional field blank.
do $$ declare l uuid:=pg_temp.lead(); d jsonb:=pg_temp.new_data(l); key uuid:=gen_random_uuid(); before jsonb:=pg_temp.counts(); r jsonb; t public.crm_tasks%rowtype; begin
 r:=pg_temp.start(d,key);
 select * into strict t from public.crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open';
 perform pg_temp.ok(r->'enrollment'->>'status'='Submitted' and r->'lead'->>'status'='QUALIFIED','Submitted pre-enrollment keeps the opportunity QUALIFIED');
 perform pg_temp.ok((select status='QUALIFIED' and enrollment_id=(r->'enrollment'->>'id')::uuid and student_id=(r->'enrollment'->>'student_id')::uuid from public.crm_leads where id=l),'lead linked, not converted');
 perform pg_temp.ok(exists(select 1 from public.crm_activities where lead_id=l and event_type='enrollment_started'),'enrollment_started activity');
 perform pg_temp.ok(t.due_at=crm_security.next_window((select followup_policy_id from public.crm_leads where id=l),now()+interval '1 day') and t.schedule_kind is null,'default follow-up tomorrow at the next window, no schedule kind');
 perform pg_temp.ok(r->'enrollment_followup'=jsonb_build_object('id',t.id,'created',true)||crm_security.scheduled_civil(t.due_at),'result carries the created follow-up and its civil time');
 perform pg_temp.ok((select date_naissance is null from public.students where id=(r->'enrollment'->>'student_id')::uuid),'blank birth date accepted');
 perform pg_temp.ok(pg_temp.counts()->>0=((before->>0)::int+1)::text and pg_temp.counts()->>1=((before->>1)::int+1)::text,'one student and one enrollment');
 before:=pg_temp.counts();
 perform pg_temp.ok(pg_temp.start(d,key)=r,'exact same-key replay returns the stored result');
 perform pg_temp.ok(pg_temp.counts()=before,'replay writes nothing');
 -- Replay precedes validation; the lead is now linked yet the same key still replays.
 perform pg_temp.rejects(d||'{"notes":"changed"}','22023','Request key payload conflict','request_conflict',key);
 perform pg_temp.rejects(pg_temp.new_data(l),'22023','Qualified unlinked lead required','lead_already_enrolled');
 perform pg_temp.ok(pg_temp.counts()=before,'rejections write nothing');
end $$;
select 'PASS blank optional fields, default follow-up result, exact replay before validation';

-- Lead, payload, program and status reasons; every failure writes nothing.
do $$ declare l uuid:=pg_temp.lead(); n uuid:=pg_temp.raw_lead(); before jsonb:=pg_temp.counts(); d jsonb; begin
 d:=pg_temp.new_data(l);
 perform pg_temp.rejects(d||'{"unknown":1}','22023','Valid bounded enrollment request required','request_invalid');
 perform pg_temp.rejects(d||jsonb_build_object('lead_id',gen_random_uuid()),'22023','Qualified unlinked lead required','lead_unavailable');
 perform pg_temp.rejects(pg_temp.new_data(n),'22023','Qualified unlinked lead required','lead_not_qualified');
 perform pg_temp.rejects(d||'{"lead_id":"not-a-uuid"}','22023','Invalid enrollment fields or incompatible group','record_rejected');
 perform pg_temp.rejects(d||'{"expected_version":999}','40001','Stale lead version; refresh and retry','lead_changed');
 perform pg_temp.rejects(d||'{"session_type":"Bogus"}','22023','Invalid enrollment program or school year','program_invalid');
 perform pg_temp.rejects(d-'session_type','22023','Invalid enrollment program or school year','program_invalid');
 perform pg_temp.rejects(d||'{"school_year":"2026-2027"}','22023','Invalid enrollment program or school year','school_year_invalid');
 perform pg_temp.rejects(d||'{"school_year":"2026/2028"}','22023','Invalid enrollment program or school year','school_year_invalid');
 perform pg_temp.rejects(d||jsonb_build_object('notes',repeat('x',2001)),'22023','Invalid enrollment program or school year','notes_too_long');
 perform pg_temp.rejects(d||'{"initial_status":"Confirmed"}','42501','Only pre-confirmation enrollment initiation is permitted','initial_status_not_permitted');
 perform pg_temp.rejects(d-'student_choice','22023','Explicit student choice required','learner_choice_required');
 perform pg_temp.rejects(d||'{"learner_name":"A"}','22023','Invalid new learner','learner_name_invalid');
 perform pg_temp.rejects(d-'learner_name','22023','Invalid new learner','learner_name_invalid');
 perform pg_temp.rejects(d||jsonb_build_object('student_id',gen_random_uuid()),'22023','Invalid new learner','request_invalid');
 perform pg_temp.rejects(d||jsonb_build_object('enrollment_id',gen_random_uuid()),'22023','Invalid new learner','request_invalid');
 perform pg_temp.rejects(d||'{"candidate_review":"stale"}','40001','Student candidates changed; review again','candidates_changed');
 -- Error ordering: the historical winning message, now with its reason.
 perform pg_temp.rejects(d||'{"birth_date":"garbage","session_type":"Bogus"}','22023','Invalid enrollment fields or incompatible group','birth_date_invalid');
 perform pg_temp.rejects(d||'{"initial_status":"Trial","level":"Beginning 1"}','22023','Invalid level for selected program','level_invalid');
 -- A level outside every programme still fails at the student row first, as in 084.
 perform pg_temp.rejects(d||'{"level":"Bogus"}','22023','Invalid enrollment fields or incompatible group','record_rejected');
 -- Access denial keeps today's error and carries no hint.
 for i in 4..7 loop perform pg_temp.rejects(d,'42501','CRM access denied',null,gen_random_uuid(),i); end loop;
 perform pg_temp.ok(pg_temp.counts()=before,'rejections write nothing');
end $$;
select 'PASS lead/payload/program/status/choice/name reasons, winning-error order and access denial without hint';

-- Birth date: Casablanca civil date for enrollment initiation, any session TimeZone.
do $$ declare zone text:=current_setting('TimeZone'); today date:=(now() at time zone 'Africa/Casablanca')::date; l uuid; r jsonb; s uuid; begin
 l:=pg_temp.lead();
 foreach zone in array array['Pacific/Kiritimati','Pacific/Pago_Pago','UTC'] loop
  perform set_config('TimeZone',zone,true);
  perform pg_temp.rejects(pg_temp.new_data(l,jsonb_build_object('birth_date',today+1)),'22023','Invalid new learner','birth_date_future');
 end loop;
 perform pg_temp.rejects(pg_temp.new_data(l,'{"birth_date":"not-a-date"}'),'22023','Invalid enrollment fields or incompatible group','birth_date_invalid');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"birth_date":"2020-02-30"}'),'22023','Invalid enrollment fields or incompatible group','birth_date_invalid');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"birth_date":"infinity"}'),'22023','Invalid new learner','birth_date_invalid');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"birth_date":"-infinity"}'),'22023','Invalid new learner','birth_date_invalid');
 perform set_config('TimeZone','Pacific/Pago_Pago',true);
 r:=pg_temp.start(pg_temp.new_data(l,jsonb_build_object('birth_date',today)));
 perform pg_temp.ok((select date_naissance=today from public.students where id=(r->'enrollment'->>'student_id')::uuid),'Casablanca today accepted');
 perform set_config('TimeZone','Pacific/Kiritimati',true);
 l:=pg_temp.lead();r:=pg_temp.start(pg_temp.new_data(l,jsonb_build_object('birth_date',today)));
 perform pg_temp.ok(r->'enrollment'->>'status'='Submitted','Casablanca today accepted ahead of Casablanca');
 perform set_config('TimeZone','UTC',true);
 l:=pg_temp.lead();r:=pg_temp.start(pg_temp.new_data(l,'{"birth_date":"2015-04-02"}'));
 perform pg_temp.ok((select date_naissance='2015-04-02' from public.students where id=(r->'enrollment'->>'student_id')::uuid),'valid past date accepted');
 -- The existing-learner path does not write or validate a future birth date.
 l:=pg_temp.lead();s:=pg_temp.student('A2 existing');
 r:=pg_temp.start(pg_temp.existing_data(l,s,jsonb_build_object('birth_date',today+30)));
 perform pg_temp.ok((select date_naissance='2015-03-01' from public.students where id=s) and r->'enrollment'->>'student_id'=s::text,'existing-learner path unaffected');
end $$;
select 'PASS birth date: Casablanca today accepted, tomorrow rejected in every session TimeZone, malformed/infinite invalid, existing path unaffected';

-- Manual lead creation keeps its own current_date rule (B2 scope).
do $$ declare st text; msg text; begin
 perform pg_temp.actor(3);execute 'set local role authenticated';
 begin perform public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','A2 manual birth','learner_name','A2 manual learner','phone','0698765432','source_label','Manual','learner_birth_date',current_date+1));
 exception when others then get stacked diagnostics st=returned_sqlstate,msg=message_text; end;
 execute 'reset role';
 perform pg_temp.ok(st='22023' and msg='Birth date cannot be in the future','manual lead keeps its current_date check: '||coalesce(st,'none')||' '||coalesce(msg,''));
end $$;

-- New-learner confirmation when candidates exist.
do $$ declare l uuid:=pg_temp.lead(); name text; d jsonb; r jsonb; begin
 name:=(select learner_name from public.crm_leads where id=l);
 insert into public.students(full_name,status,session_type) values(name||' homonyme','Prospect','Yearly');
 d:=pg_temp.new_data(l);
 perform pg_temp.rejects(d,'22023','Explicit new learner decision required','new_learner_confirmation_required');
 r:=pg_temp.start(d||'{"confirm_new":true}');
 perform pg_temp.ok(r->'enrollment'->>'student_name'=name,'confirmed new learner created');
end $$;

-- Linked learner: context projection, server authority and no lead identity data.
do $$ declare s uuid:=pg_temp.student('A2 linked'); s2 uuid:=pg_temp.student('A2 other'); gone uuid:=pg_temp.student('A2 archived',true);
 l uuid:=pg_temp.lead(); free uuid:=pg_temp.lead(); dead uuid:=pg_temp.lead(); before jsonb; ctx jsonb; r jsonb; begin
 update public.crm_leads set student_id=s where id=l;
 update public.crm_leads set student_id=gone where id=dead;
 perform pg_temp.actor(3);execute 'set local role authenticated';
 ctx:=public.crm_get_enrollment_context(l);
 perform pg_temp.ok(ctx->'linked_student'=(select jsonb_build_object('id',id,'name',full_name,'birth_date',date_naissance,'available',true) from public.students where id=s),'active linked learner projected');
 perform pg_temp.ok(public.crm_get_enrollment_context(free)->'linked_student'='null'::jsonb,'unlinked lead projects null');
 perform pg_temp.ok(public.crm_get_enrollment_context(dead)->'linked_student'=jsonb_build_object('id',gone,'available',false),'archived linked learner exposes no name or birth date');
 execute 'reset role';
 before:=pg_temp.counts();
 perform pg_temp.rejects(pg_temp.new_data(l),'22023','Invalid new learner','learner_already_linked');
 perform pg_temp.rejects(pg_temp.existing_data(l,s2),'22023','Student unavailable or inconsistent','learner_link_mismatch');
 perform pg_temp.rejects(pg_temp.existing_data(l,gen_random_uuid()),'22023','Student unavailable or inconsistent','learner_link_mismatch');
 perform pg_temp.rejects(pg_temp.existing_data(dead,gone),'22023','Student unavailable or inconsistent','linked_learner_unavailable');
 perform pg_temp.rejects(pg_temp.existing_data(free,gen_random_uuid()),'22023','Student unavailable or inconsistent','learner_unavailable');
 perform pg_temp.rejects(pg_temp.existing_data(free,gone),'22023','Student unavailable or inconsistent','learner_unavailable');
 perform pg_temp.ok(pg_temp.counts()=before,'no student or enrollment written by a linkage rejection');
 -- I3: the linked path never depends on the lead's learner name or birth date.
 update public.crm_leads set learner_name=null,learner_birth_date=null where id=l;
 r:=pg_temp.start(pg_temp.existing_data(l,s));
 perform pg_temp.ok(r->'enrollment'->>'student_id'=s::text and r->'lead'->>'status'='QUALIFIED','NULL lead name: linked learner enrolled');
 perform pg_temp.ok((select count(*) from public.students)=(before->>0)::int,'no learner created on the linked path');
 l:=pg_temp.lead();s:=pg_temp.student('A2 linked short');update public.crm_leads set student_id=s,learner_name='A',learner_birth_date=null where id=l;
 r:=pg_temp.start(pg_temp.existing_data(l,s));
 perform pg_temp.ok(r->'enrollment'->>'student_id'=s::text,'one-character lead name: linked learner enrolled');
end $$;
select 'PASS linked_student projection, linked-learner authority reasons and linked path without lead identity data';

-- Existing enrollments: selection, linkage elsewhere, staleness and group integrity.
do $$ declare s uuid:=pg_temp.student('A2 enrolled'); e1 uuid; e2 uuid; rej uuid; other uuid; a uuid:=pg_temp.lead(); b uuid:=pg_temp.lead(); r jsonb; g uuid; x uuid; nul uuid; before jsonb; begin
 e1:=pg_temp.enrollment(s,'Submitted');
 r:=pg_temp.start(pg_temp.pick(a,s,e1));
 perform pg_temp.ok(r->'enrollment'->>'id'=e1::text and r->'lead'->>'status'='QUALIFIED','unlinked existing enrollment linked');
 perform pg_temp.actor(3);
 perform pg_temp.ok((select bool_and((row->>'already_linked')::boolean) from jsonb_array_elements(public.crm_find_enrollment_candidates(s,'Yearly','2026/2027')->'rows') row),'candidate read flags the linked enrollment');
 before:=pg_temp.counts();
 perform pg_temp.rejects(pg_temp.existing_data(b,s),'22023','Existing enrollment requires explicit selection','existing_enrollment_linked_elsewhere');
 perform pg_temp.rejects(pg_temp.pick(b,s,e1),'22023','Enrollment unavailable or incompatible','enrollment_already_linked');
 rej:=pg_temp.enrollment(s,'Rejected');other:=pg_temp.enrollment(pg_temp.student('A2 stranger'),'Submitted');
 perform pg_temp.rejects(pg_temp.pick(b,s,rej),'22023','Enrollment unavailable or incompatible','enrollment_incompatible');
 perform pg_temp.rejects(pg_temp.pick(b,s,other),'22023','Enrollment unavailable or incompatible','enrollment_incompatible');
 perform pg_temp.rejects(pg_temp.pick(b,s,gen_random_uuid()),'22023','Enrollment unavailable or incompatible','enrollment_incompatible');
 e2:=pg_temp.enrollment(s,'Under Review');
 perform pg_temp.rejects(pg_temp.existing_data(b,s),'22023','Existing enrollment requires explicit selection','existing_enrollment_requires_selection');
 perform pg_temp.rejects(pg_temp.pick(b,s,e2)||'{"expected_enrollment_updated_at":"2000-01-01T00:00:00Z"}','40001','Stale enrollment; refresh and retry','enrollment_changed');
 perform pg_temp.rejects(pg_temp.pick(b,s,e2)||'{"expected_enrollment_updated_at":"garbage"}','22023','Invalid enrollment fields or incompatible group','record_rejected');
 -- An enrollment whose own group no longer matches it (session NULL bypasses the row trigger).
 insert into public.groups(name,session_type,niveau) values('A2 adults group','Adults','Beginning 1') returning id into g;
 x:=pg_temp.student('A2 mismatched');insert into public.enrollments(student_id,session_type,school_year,status,group_id) values(x,null,'2026/2027','Submitted',g) returning id into e1;
 perform pg_temp.rejects(pg_temp.pick(pg_temp.lead(),x,e1),'22023','Enrollment group must match session and level','enrollment_group_incompatible');
 x:=pg_temp.student('A2 statusless');nul:=pg_temp.enrollment(x,null);
 perform pg_temp.rejects(pg_temp.existing_data(pg_temp.lead(),x),'22023','Existing enrollment status requires review','existing_enrollment_needs_review');
 perform pg_temp.ok((pg_temp.counts()->>0)::int=(before->>0)::int+3 and (select enrollment_id is null from public.crm_leads where id=b),'only the three fixture students exist; rejections linked nothing');
 r:=pg_temp.start(pg_temp.pick(b,s,e2));
 perform pg_temp.ok(r->'enrollment'->>'status'='Under Review' and r->'lead'->>'status'='QUALIFIED','Under Review enrollment linked without conversion');
end $$;
select 'PASS existing enrollment selection, linked elsewhere, incompatible, stale and group integrity reasons';

-- Groups, levels and Trial.
do $$ declare l uuid:=pg_temp.lead(); g1 uuid; g2 uuid; d jsonb; r jsonb; begin
 insert into public.groups(name,session_type,niveau) values('A2 child group','Yearly','Child 2') returning id into g1;
 insert into public.groups(name,session_type,niveau) values('A2 adult group','Adults','Beginning 1') returning id into g2;
 d:=pg_temp.new_data(l);
 perform pg_temp.rejects(d||jsonb_build_object('group_id',g2),'22023','Enrollment group must match session and level','group_incompatible');
 perform pg_temp.rejects(d||jsonb_build_object('group_id',gen_random_uuid()),'22023','Enrollment group must match session and level','group_incompatible');
 perform pg_temp.rejects(d||'{"level":"Beginning 1"}','22023','Invalid level for selected program','level_invalid');
 perform pg_temp.rejects(d||'{"initial_status":"Trial"}','22023','Invalid enrollment fields or incompatible group','trial_requires_group');
 perform pg_temp.rejects(d||'{"initial_status":"Trial","level":"Child 3"}'||jsonb_build_object('group_id',g1),'22023','Enrollment group must match session and level','group_incompatible');
 r:=pg_temp.start(d||jsonb_build_object('initial_status','Trial','group_id',g1));
 perform pg_temp.ok(r->'enrollment'->>'status'='Trial' and r->'enrollment'->>'group_name'='A2 child group' and r->'lead'->>'status'='QUALIFIED','Trial with a group starts without conversion');
end $$;
select 'PASS group, level and Trial reasons; Trial with group';

-- Follow-up: explicit, past, malformed, empty, infinite, null, kept, duplicates.
do $$ declare l uuid; r jsonb; t public.crm_tasks%rowtype; target timestamptz:=now()+interval '3 days'; before jsonb; keep uuid; a uuid; c uuid; e uuid; begin
 l:=pg_temp.lead();before:=pg_temp.counts();
 perform pg_temp.rejects(pg_temp.new_data(l,jsonb_build_object('followup_at',now()-interval '30 days')),'22023','Valid future task required','followup_in_past');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"followup_at":"garbage"}'),'22023','Invalid enrollment fields or incompatible group','followup_invalid');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"followup_at":""}'),'22023','Invalid enrollment fields or incompatible group','followup_invalid');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"followup_at":"infinity"}'),'22023','Finite due time required','followup_invalid');
 perform pg_temp.rejects(pg_temp.new_data(l,'{"followup_at":"-infinity"}'),'22023','Finite due time required','followup_invalid');
 perform pg_temp.ok(pg_temp.counts()=before,'follow-up rejections leave no student, enrollment, task or activity');
 r:=pg_temp.start(pg_temp.new_data(l,jsonb_build_object('followup_at',target)));
 select * into strict t from public.crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open';
 perform pg_temp.ok(t.due_at=crm_security.next_window((select followup_policy_id from public.crm_leads where id=l),target),'explicit time resolved to the calling window');
 perform pg_temp.ok(r->'enrollment_followup'=jsonb_build_object('id',t.id,'created',true)||crm_security.scheduled_civil(t.due_at),'created follow-up and civil time in the result');
 l:=pg_temp.lead();r:=pg_temp.start(pg_temp.new_data(l,'{"followup_at":null}'));
 perform pg_temp.ok((r->'enrollment_followup'->>'created')::boolean,'JSON null keeps the default');
 -- An existing enrollment follow-up is kept; a supplied past value is still ignored.
 l:=pg_temp.lead('enrollment_followup','enrollment');
 select id into keep from public.crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open';
 r:=pg_temp.start(pg_temp.new_data(l,jsonb_build_object('followup_at',now()-interval '30 days')));
 select * into strict t from public.crm_tasks where id=keep;
 perform pg_temp.ok(t.status='open' and r->'enrollment_followup'=jsonb_build_object('id',keep,'created',false)||crm_security.scheduled_civil(t.due_at),'kept follow-up reported with created=false');
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open'),'still exactly one');
 -- Several open enrollment follow-ups: the earliest is retained and reported.
 l:=pg_temp.lead('enrollment_followup','enrollment');select id into a from public.crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open';
 perform pg_temp.actor(3);
 keep:=crm_security.new_task((select x from public.crm_leads x where id=l),jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day'),'a2-dup-early:'||l);
 c:=crm_security.new_task((select x from public.crm_leads x where id=l),jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '3 days'),'a2-dup-late:'||l);
 r:=pg_temp.start(pg_temp.new_data(l));e:=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.ok(r->'enrollment_followup'->>'id'=keep::text and not (r->'enrollment_followup'->>'created')::boolean,'earliest retained follow-up reported, never the last cancelled duplicate');
 perform pg_temp.ok(r->'enrollment_followup'=jsonb_build_object('id',keep,'created',false)||crm_security.scheduled_civil((select due_at from public.crm_tasks where id=keep)),'retained task time');
 perform pg_temp.ok((select bool_and(status='cancelled' and cancellation_reason='Suivi de cette inscription déjà prévu') from public.crm_tasks where id in(a,c)),'duplicates cancelled with today''s reason');
 perform pg_temp.ok((select count(*)=2 from public.crm_activities where source_key in('enrollment-duplicate:'||e||':'||a,'enrollment-duplicate:'||e||':'||c)),'duplicates cancelled with today''s source keys');
end $$;
select 'PASS follow-up default, explicit window resolution, past/malformed/empty/infinite reasons, kept and earliest-retained results';

-- Owner and policy reasons, with no partial writes.
do $$ declare l uuid:=pg_temp.lead(); before jsonb; p uuid; begin
 update public.crm_leads set owner_id=pg_temp.uid(4) where id=l;
 before:=pg_temp.counts();
 perform pg_temp.rejects(pg_temp.new_data(l),'22023','Assignee must be operational staff','owner_not_operational');
 perform pg_temp.ok(pg_temp.counts()=before and (select enrollment_id is null from public.crm_leads where id=l),'owner rejection leaves no partial writes');
 -- validate_policy prevents a policy without windows; only a direct synthetic row reaches it.
 insert into public.crm_followup_policies select (jsonb_populate_record(null::public.crm_followup_policies,to_jsonb(x)||jsonb_build_object('id',gen_random_uuid(),
  'version',(select max(version)+1 from public.crm_followup_policies),'effective_from',now()+interval '100 years','weekly_hours','{"1":[],"2":[],"3":[],"4":[],"5":[],"6":[],"7":[]}'::jsonb))).*
 from public.crm_followup_policies x where x.id=(select id from a2_policy) returning id into p;
 l:=pg_temp.lead();update public.crm_leads set followup_policy_id=p where id=l;
 perform pg_temp.rejects(pg_temp.new_data(l),'22023','Policy has no available calling window','followup_policy_unavailable');
end $$;
select 'PASS owner_not_operational and followup_policy_unavailable without partial writes';

-- Linking a confirmed enrollment converts as today; no enrollment follow-up then.
do $$ declare s uuid:=pg_temp.student('A2 confirmed'); e uuid; l uuid:=pg_temp.lead(); r jsonb; begin
 e:=pg_temp.enrollment(s,'Confirmed');
 r:=pg_temp.start(pg_temp.pick(l,s,e),gen_random_uuid(),2);
 perform pg_temp.ok(r->'lead'->>'status'='CONVERTED' and r->'enrollment_followup'='null'::jsonb,'confirmed link converts; follow-up null');
 perform pg_temp.ok((select count(*)=0 from public.crm_tasks where lead_id=l and status='open'),'conversion closed commercial tasks');
 l:=pg_temp.lead();r:=pg_temp.start(pg_temp.new_data(l),gen_random_uuid(),1);
 perform pg_temp.ok(r->'lead'->>'status'='QUALIFIED','director initiation does not convert');
end $$;

-- Handler mapping: a unique violation still becomes 40001, now with a reason.
do $$ declare s uuid:=pg_temp.student('A2 unique'); e uuid; l uuid:=pg_temp.lead(); begin
 e:=pg_temp.enrollment(s,'Submitted');
 insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,body) values(l,now(),'system','note_added','enrollment-started:'||l||':'||e,'A2 synthetic collision');
 perform pg_temp.rejects(pg_temp.pick(l,s,e),'40001','Concurrent enrollment change; refresh and retry','concurrent_change');
end $$;

-- Security, authority and dormancy.
do $$ declare st text; begin
 begin execute 'set local role anon';perform public.crm_start_enrollment(gen_random_uuid(),'{}');
 exception when others then get stacked diagnostics st=returned_sqlstate; end;
 execute 'reset role';
 perform pg_temp.ok(st='42501','anon cannot execute');
 perform pg_temp.ok(not exists(select 1 from pg_proc where proname='enrollment_reject'),'no private raise helper added');
 perform pg_temp.ok(has_function_privilege('authenticated','public.crm_start_enrollment(uuid,jsonb)','execute') and not has_function_privilege('anon','public.crm_start_enrollment(uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.crm_get_enrollment_context(uuid)','execute') and not has_function_privilege('anon','public.crm_get_enrollment_context(uuid)','execute'),'execution grants unchanged');
 perform pg_temp.ok((select prosecdef and proconfig=array['search_path=pg_catalog, pg_temp'] from pg_proc where oid='public.crm_start_enrollment(uuid,jsonb)'::regprocedure),'security definer and search path unchanged');
 perform pg_temp.ok(not exists(select 1 from cron.job where jobname='crm-lifecycle-primary' and active),'lifecycle cron inactive');
 perform pg_temp.ok(pg_temp.untouched()=(select v from a2_baseline),'no finance, lifecycle intent or external delivery rows from initiation');
end $$;

-- Closed vocabulary: every server reason except the cross-session intent lock was produced.
do $$ declare missing text; begin
 select string_agg(r,', ') into missing from unnest(array['request_invalid','request_conflict','lead_unavailable','lead_already_enrolled','lead_not_qualified','lead_changed',
  'program_invalid','school_year_invalid','notes_too_long','initial_status_not_permitted','learner_already_linked','learner_link_mismatch','linked_learner_unavailable',
  'learner_unavailable','learner_choice_required','learner_name_invalid','birth_date_future','birth_date_invalid','candidates_changed','new_learner_confirmation_required',
  'enrollment_incompatible','enrollment_already_linked','enrollment_group_incompatible','enrollment_changed','existing_enrollment_needs_review',
  'existing_enrollment_requires_selection','existing_enrollment_linked_elsewhere','group_incompatible','level_invalid','trial_requires_group','followup_invalid',
  'followup_in_past','owner_not_operational','followup_policy_unavailable','concurrent_change','record_rejected']) r where r not in(select reason from a2_seen where reason is not null);
 perform pg_temp.ok(missing is null,'reasons not produced: '||coalesce(missing,''));
 perform pg_temp.ok((select bool_and(reason~'^[a-z_]+$') from a2_seen where reason is not null),'hints are plain tokens');
end $$;
select 'PASS RCC-A2 SQL acceptance: every reason with unchanged SQLSTATE/message and exact hint; authority, grants and dormancy unchanged';
rollback;
