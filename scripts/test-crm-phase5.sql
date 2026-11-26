-- Phase 5 placement integration: synthetic local fixtures, fully rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '22023') returns void language plpgsql as $$ begin
 begin execute statement; exception when others then
  if sqlstate=code then return; end if;
  raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','80000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
-- Trusted fixture driver only; production callers must provide their versions.
create function pg_temp.act(cmd text,lead uuid,payload jsonb default '{}',request uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$ declare data jsonb; result jsonb; begin
 data:=jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload;
 if payload->>'task_id' is not null and not(payload ? 'expected_task_version') then
  data:=data||jsonb_build_object('expected_task_version',(select version from public.crm_tasks where id=(payload->>'task_id')::uuid)); end if;
 execute format('select public.crm_%I($1,$2)',cmd) into result using request,data; return result;
end $$;
create function pg_temp.intake() returns uuid language plpgsql as $$ declare r jsonb; begin
 r:=public.crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Synthetic guardian","learner_name":"Synthetic learner","phone":"0612345678","source_label":"Manual"}');
 return (r->'lead'->>'id')::uuid;
end $$;
create function pg_temp.next_task(typ text default 'callback') returns jsonb language sql as $$
 select jsonb_build_object('task_type',typ,'due_at',crm_security.window_at(crm_security.current_policy_id(),case when typ='center_visit' then 'opening' else 'calling' end,now()+interval '1 day'))
$$;
insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('80000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase3-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '80000000-%';
select pg_temp.actor(1);
select pg_temp.ok(not exists(select 1 from public.crm_followup_policies),'unseeded policy baseline');
select pg_temp.denied($q$select pg_temp.intake()$q$);

create temp table phase3_policy(id uuid);
insert into phase3_policy select (public.crm_create_followup_policy('80000000-0000-0000-0000-000000000100',
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid;
select pg_temp.actor(3);
create function pg_temp.qualified() returns uuid language plpgsql as $$ declare l uuid:=pg_temp.intake(); begin
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','Parent souhaite un test','qualification_step','placement_test','next_task',pg_temp.next_task('confirm_placement_test')));
 return l;
end $$;
create function pg_temp.booking(l uuid) returns jsonb language sql as $$
 select jsonb_build_object('lead_id',l,'expected_version',(select x.version from public.crm_leads x where x.id=l),
 'date_test',(crm_security.window_at(crm_security.current_policy_id(),'opening',((now() at time zone public.centre_utc_offset())::date+2+time '10:30') at time zone public.centre_utc_offset()) at time zone public.centre_utc_offset())::date,'heure',to_char(crm_security.window_at(crm_security.current_policy_id(),'opening',((now() at time zone public.centre_utc_offset())::date+2+time '10:30') at time zone public.centre_utc_offset()) at time zone public.centre_utc_offset(),'HH24:MI'),'examinateur','Examinatrice test','notes','Projet anglais',
 'task_id',(select id from public.crm_tasks where lead_id=l and status='open' and task_type='confirm_placement_test' order by due_at,id limit 1),
 'expected_task_version',(select version from public.crm_tasks where lead_id=l and status='open' and task_type='confirm_placement_test' order by due_at,id limit 1))
$$;
-- Weekday-independent move target (Verify run 45784920732, a Thursday: the booking lands on
-- Saturday and « date_test+1 » on the closed Sunday). The server picks it, as
-- scripts/lib/centre-days.mjs does for the Node suites: the first centre date from `from_day`
-- on which hh:mm is inside the current policy's opening hours (closed dates included).
create function pg_temp.open_day(from_day date,hhmm text) returns date language sql as $$
 select d from (select from_day+n d from generate_series(0,30) n) x
 where crm_security.window_at(crm_security.current_policy_id(),'opening',(d+hhmm::time) at time zone public.centre_utc_offset())
       =(d+hhmm::time) at time zone public.centre_utc_offset()
 order by d limit 1
$$;
create function pg_temp.center_counts() returns jsonb language sql as $$
 select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.charges),(select count(*) from public.receipts))
$$;
do $$ declare l uuid:=pg_temp.qualified(); req uuid:=gen_random_uuid(); d jsonb:=pg_temp.booking(l); r jsonb; p uuid; before_counts jsonb:=pg_temp.center_counts(); before_time timestamptz; q jsonb; t public.crm_tasks%rowtype; version bigint; other uuid; moved date; begin
 r:=public.crm_book_placement_test(req,d);p:=(r->'placement'->>'id')::uuid;
 perform pg_temp.ok(pg_temp.center_counts()=before_counts,'booking never creates student/enrollment/charge/receipt');
 perform pg_temp.ok((select student_id is null and crm_lead_id=l and status='Planifié' and niveau_recommande is null from public.placement_tests where id=p),'nullable student and no fake A1');
 perform pg_temp.ok((select status='QUALIFIED' from public.crm_leads where id=l),'booking preserves qualified');
 -- RWR-r5 §4.2: the booked test is the appointment; it becomes the one next action.
 perform pg_temp.ok((select count(*)=1 and bool_and(task_type='center_visit' and placement_test_id=p) from public.crm_tasks where lead_id=l and status='open'),'booking leaves the appointment with its test as the one next action');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.crm_get_today(100)->'needs_attention')x where x->>'id'=l::text),'future appointment is a valid next step');
 perform pg_temp.ok(public.crm_book_placement_test(req,d)=r,'booking replay exact');
 perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',req,d||'{"notes":"changed"}'));
 perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),pg_temp.booking(l)));
 perform pg_temp.ok((select count(*)=1 from public.placement_tests where crm_lead_id=l),'new key does not duplicate planned test');
 perform pg_temp.ok(not exists(select 1 from public.crm_activities where lead_id=l and event_type in ('placement_test_attended','placement_result_entered')),'booking has no result/attendance');
 -- Trusted edit retries are immutable and reject stale/forged fields.
 q:=jsonb_build_object('placement_id',p,'expected_updated_at',(select updated_at from public.placement_tests where id=p),'expected_version',(select x.version from public.crm_leads x where x.id=l),
  'date_test',(select date_test from public.placement_tests where id=p),'heure',(select heure from public.placement_tests where id=p),'status','Planifié','notes','Précision opérationnelle');
 req:=gen_random_uuid();r:=public.crm_update_placement_test(req,q);
 perform pg_temp.ok(public.crm_update_placement_test(req,q)=r,'placement edit exact replay');
 perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',req,q||'{"notes":"changed"}'));
 perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q||'{"expected_updated_at":"1970-01-01T00:00:00Z"}'),'PT409');
 perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q||jsonb_build_object('crm_lead_id',l)));
 -- Ordinary generic edits must preserve and audit the same row. The move goes to the
 -- next open day at 11:30 (never the closed Sunday), chosen before the role switch.
 moved:=pg_temp.open_day((select date_test from public.placement_tests where id=p)+1,'11:30');
 perform pg_temp.ok(moved is not null,'an open day at 11:30 for the move');
 execute 'set local role authenticated';
 update public.placement_tests set date_test=moved,heure='11:30' where id=p;
 perform pg_temp.denied(format('update public.placement_tests set crm_lead_id=null where id=%L',p),'42501');
 delete from public.placement_tests where id=p;
 perform pg_temp.ok((select count(*)=1 from public.placement_tests where id=p),'receptionist delete is denied by RLS');
 perform pg_temp.denied(format('insert into public.placement_tests(student_name,date_test,heure,crm_lead_id) values(''Bypass'',current_date+1,''10:00'',%L)',l),'42501');
 execute 'reset role';
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='placement_test_rescheduled'),'generic reschedule recorded');
 perform pg_temp.denied(format('update public.placement_tests set crm_lead_id=null where id=%L',p),'42501');
 perform pg_temp.denied(format('delete from public.placement_tests where id=%L',p),'42501');
 other:=pg_temp.qualified();perform pg_temp.denied(format('update public.placement_tests set crm_lead_id=%L where id=%L',other,p),'42501');
 perform pg_temp.denied(format('update public.placement_tests set status=''Résultat saisi'' where id=%L',p));
 update public.crm_leads set owner_id='80000000-0000-0000-0000-000000000003' where id=l;
 execute 'set local role authenticated';
 update public.placement_tests set status='Résultat saisi',niveau_recommande='A2',score=72 where id=p;
 update public.placement_tests set notes='Résultat précisé' where id=p;
 update public.placement_tests set status='Passé' where id=p;
 update public.placement_tests set status='Résultat saisi',niveau_recommande='B1' where id=p;
 execute 'reset role';
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='placement_test_attended'),'direct result implies attendance exactly once');
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='placement_result_entered'),'result edits/regression never duplicate milestone');
 select * into strict t from public.crm_tasks where lead_id=l and task_type='post_test_followup';
 perform pg_temp.ok(t.assigned_to='80000000-0000-0000-0000-000000000003'::uuid and t.placement_test_id=p and t.source_kind='placement_result','task owner and placement provenance');
 perform pg_temp.ok(t.due_at=crm_security.placement_followup_due((select followup_policy_id from public.crm_leads where id=l),(select occurred_at from public.crm_activities where id=t.source_activity_id)),'exact policy SLA from result occurrence');
 perform pg_temp.ok(pg_temp.center_counts()=before_counts and (select status='QUALIFIED' from public.crm_leads where id=l),'result never converts or creates center/finance records');
 perform pg_temp.ok(public.crm_get_placement(p)->>'niveau_recommande'='B1','operational reader receives latest real level');
 perform pg_temp.ok(not(public.crm_get_placement(p) ?| array['crm_lead_id','source_key','student_id','raw_payload']),'safe placement response');
 perform pg_temp.ok((public.crm_get_placement(p)->>'lead_version')::bigint=(select x.version from public.crm_leads x where x.id=l),'NF-2: the placement read carries the prospect version an edit must send');
 update public.crm_tasks set due_at=now()-interval '1 minute' where id=t.id;
 q:=public.crm_get_today(100);
 perform pg_temp.ok((select count(*)=1 from jsonb_array_elements(q->'needs_attention')x where x->>'id'=l::text and x->'post_test_result'->>'niveau_recommande'='B1'),'result followup appears once with current level');
 -- Historical completed tests permit a legitimate new planned test.
 r:=public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l));
 perform pg_temp.ok((select count(*)=2 from public.placement_tests where crm_lead_id=l),'historical retest permitted');
end $$;

do $$ declare l uuid; p uuid; r jsonb; state text; req uuid; d jsonb; student uuid; before_count jsonb; begin
 foreach state in array array['Passé','Affecté'] loop
  l:=pg_temp.qualified();r:=public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l));p:=(r->'placement'->>'id')::uuid;
  -- RWR-r5 §4.6: a manual prospect belongs to its creator; clear it to keep the unowned case.
  update public.crm_leads set owner_id=null where id=l;
  update public.placement_tests set status=state,niveau_recommande=case when state='Affecté' then 'A2' end where id=p;
  perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='placement_test_attended'),'attendance implied by '||state);
  perform pg_temp.ok((select count(*)=case when state='Affecté' then 1 else 0 end from public.crm_activities where lead_id=l and event_type='placement_result_entered'),'result milestone for '||state);
  if state='Affecté' then perform pg_temp.ok((select count(*)=1 and bool_and(assigned_to is null) from public.crm_tasks where lead_id=l and task_type='post_test_followup'),'unowned result goes to shared queue');end if;
 end loop;
 foreach state in array array['LOST','NOT_QUALIFIED'] loop
  l:=pg_temp.qualified();p:=(public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l))->'placement'->>'id')::uuid;
  perform pg_temp.act(case when state='LOST' then 'close_lost' else 'close_not_qualified' end,l,jsonb_build_object('reason',case when state='LOST' then 'price' else 'outside_scope' end));
  update public.placement_tests set status='Résultat saisi',niveau_recommande='A2' where id=p;
  perform pg_temp.ok((select status=state from public.crm_leads where id=l),'closed lifecycle preserved');
  perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'closed result has no open sales task');
  perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='placement_result_entered'),'closed result still has milestone');
  perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),pg_temp.booking(l)));
 end loop;
 l:=pg_temp.intake();perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),pg_temp.booking(l)));
 perform pg_temp.act('record_conversation',l,jsonb_build_object('channel','phone','note','Conversation','next_task',pg_temp.next_task()));
 perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),pg_temp.booking(l)));
 l:=pg_temp.qualified();d:=pg_temp.booking(l);perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),d||'{"expected_version":999}'),'PT409');
 perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),d||'{"expected_task_version":999}'),'PT409');
 -- Existing non-CRM tests retain default/result/edit/delete behavior.
 execute 'set local role authenticated';
 insert into public.placement_tests(student_name,date_test,niveau_recommande) values('Non CRM',current_date,'A1') returning id into p;
 update public.placement_tests set status='Résultat saisi',niveau_recommande='A2' where id=p;
 execute 'reset role';
 perform pg_temp.ok(not exists(select 1 from public.crm_activities where placement_test_id=p),'non-CRM saves never produce CRM milestones');
 perform pg_temp.actor(2);execute 'set local role authenticated';delete from public.placement_tests where id=p;execute 'reset role';
 perform pg_temp.ok(not exists(select 1 from public.placement_tests where id=p),'non-CRM admin deletion preserved');
 for i in 4..7 loop
  perform pg_temp.actor(i);execute 'set local role authenticated';
  perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),d),'42501');
  perform pg_temp.denied(format('select public.crm_list_placements(%L)',l),'42501');
  perform pg_temp.ok((select count(*)=0 from public.placement_tests where crm_lead_id is not null),'non-operational role cannot read linked tests');
  execute 'reset role';
 end loop;
 perform pg_temp.actor(3);
end $$;

do $$ declare policy uuid:=(select id from phase3_policy); l uuid:=pg_temp.qualified(); p uuid; q jsonb; fn regprocedure; begin
 perform pg_temp.ok(crm_security.placement_followup_due(policy,('2026-09-22 11:30'::timestamp at time zone public.centre_utc_offset()))=('2026-09-22 15:20'::timestamp at time zone public.centre_utc_offset()),'120 minute SLA rolls over lunch');
 perform pg_temp.ok(crm_security.placement_followup_due(policy,('2026-09-22 19:30'::timestamp at time zone public.centre_utc_offset()))=('2026-09-23 10:00'::timestamp at time zone public.centre_utc_offset()),'SLA rolls after closing');
 perform pg_temp.ok(crm_security.placement_followup_due(policy,('2026-09-27 10:00'::timestamp at time zone public.centre_utc_offset()))=('2026-09-28 15:00'::timestamp at time zone public.centre_utc_offset()),'SLA rolls closed Sunday');
 p:=(public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l))->'placement'->>'id')::uuid;
 -- A new global policy cannot change this lead's frozen policy.
 perform pg_temp.actor(1);
 perform public.crm_create_followup_policy(gen_random_uuid(),jsonb_build_object('weekly_hours',(select weekly_hours from public.crm_followup_policies where id=policy),'post_test_sla_minutes',900));
 perform pg_temp.actor(3);
 update public.placement_tests set status='Résultat saisi',niveau_recommande='A2' where id=p;
 perform pg_temp.ok((select policy_id=policy and due_at=crm_security.placement_followup_due(policy,now()) from public.crm_tasks where placement_test_id=p and task_type='post_test_followup'),'result uses frozen lead policy');
 -- Appointment appears once in Casablanca agenda, not as a confirmation task.
 l:=pg_temp.qualified();p:=(public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l))->'placement'->>'id')::uuid;
 -- RWR-r5: moving a test moves its appointment, which must be in the future and
 -- inside opening hours, so the late-today agenda case is a fixture written without
 -- the booking triggers: the test and its appointment at 23:59 today, whatever the
 -- clock (review of #208: no temporary all-day policy, no midnight flake). now() is
 -- fixed for the transaction, so the fixture and the read see the same day.
 set local session_replication_role=replica;
 update public.placement_tests set date_test=(now() at time zone public.centre_utc_offset())::date,heure='23:59' where id=p;
 update public.crm_tasks set due_at=((now() at time zone public.centre_utc_offset())::date+time '23:59') at time zone public.centre_utc_offset()
 where placement_test_id=p and status='open' and task_type='center_visit';
 set local session_replication_role=origin;
 q:=public.crm_get_today(100);
 perform pg_temp.ok((select count(*)=1 from jsonb_array_elements(q->'today_schedule')x where (x->>'kind'='placement' and x->>'id'=p::text) or (x->>'kind'='task' and x->'placement'->>'id'=p::text)),'one placement in agenda (the appointment with its test)');
 -- RWR-r5: the appointment is the next action, so it is listed as due (today, or
 -- overdue in the last minute of the day), never as missing (priority 4).
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(q->'needs_attention')x where x->>'id'=l::text and (x->>'priority')::integer not in (1,3)),'today appointment does not invent missing task');
 foreach fn in array array['public.crm_book_placement_test(uuid,jsonb)'::regprocedure,'public.crm_update_placement_test(uuid,jsonb)'::regprocedure,'public.crm_get_placement(uuid)'::regprocedure,'public.crm_list_placements(uuid,integer,integer)'::regprocedure] loop
  perform pg_temp.ok((select prosecdef and proconfig=array['search_path=pg_catalog, pg_temp'] from pg_proc where oid=fn),'pinned definer '||fn);
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute') and not has_function_privilege('service_role',fn,'execute'),'RPC grants '||fn);
 end loop;
 perform pg_temp.ok(not has_column_privilege('authenticated','public.placement_tests','crm_lead_id','INSERT') and not has_column_privilege('authenticated','public.placement_tests','crm_lead_id','UPDATE'),'link column restricted');
end $$;
-- Future-state integrity fixtures only: no conversion command is implemented.
do $$ declare l uuid:=pg_temp.qualified(); p uuid; student uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); enrollment uuid:=gen_random_uuid(); evidence uuid:=gen_random_uuid(); counts jsonb; begin
 p:=(public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l))->'placement'->>'id')::uuid;
 insert into public.students(id,full_name,status) values(student,'Synthetic linked student','Prospect'),(other,'Other synthetic student','Prospect');
 perform pg_temp.denied(format('update public.placement_tests set student_id=%L where id=%L',student,p));
 update public.crm_leads set student_id=student where id=l;
 update public.placement_tests set student_id=student where id=p;
 perform pg_temp.denied(format('update public.placement_tests set student_id=%L where id=%L',other,p));
 perform pg_temp.denied(format('update public.crm_leads set student_id=%L where id=%L',other,l));
 -- EAP (127): a Submitted row is a legacy fixture, written under the two-flag exemption.
 perform set_config('eh.membership_sync','on',true),set_config('eh.enrollment_command','on',true);
 insert into public.enrollments(id,student_id,status) values(enrollment,student,'Submitted');
 perform set_config('eh.membership_sync','',true),set_config('eh.enrollment_command','',true);
 insert into public.crm_activities(id,lead_id,occurred_at,actor_kind,event_type,source_key,enrollment_id)
 values(evidence,l,now(),'system','test_evidence','phase5-converted-fixture:'||l,enrollment);
 update public.crm_leads set status='CONVERTED',enrollment_id=enrollment,converted_at=now(),conversion_activity_id=evidence where id=l;
 -- RWR-r5: the booked appointment is an open action; a real conversion closes it, so the fixture does too.
 perform crm_security.finish_task(t,true,'Converted fixture','phase5-converted-fixture:'||t.id) from public.crm_tasks t where t.lead_id=l and t.status='open';
 counts:=pg_temp.center_counts();
 update public.placement_tests set status='Résultat saisi',niveau_recommande='A2' where id=p;
 perform pg_temp.ok((select status='CONVERTED' from public.crm_leads where id=l) and not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'converted result does not reopen sales');
 perform pg_temp.ok(counts=pg_temp.center_counts(),'converted result creates no center/finance records');
 perform pg_temp.denied(format('select public.crm_book_placement_test(%L,%L)',gen_random_uuid(),pg_temp.booking(l)));
 perform pg_temp.ok((select is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='placement_tests' and column_name='crm_lead_id'),'nullable CRM link');
 perform pg_temp.ok(exists(select 1 from pg_constraint where conrelid='public.placement_tests'::regclass and confrelid='public.crm_leads'::regclass and contype='f'),'CRM FK');
 perform pg_temp.ok(to_regclass('public.placement_tests_one_planned_crm') is not null and to_regclass('public.placement_tests_crm_lead_idx') is not null,'placement indexes');
end $$;
rollback;
\echo PASS Phase 5 placement booking, link security, milestones, followup, frozen SLA, agenda, safe reads and non-CRM regression
