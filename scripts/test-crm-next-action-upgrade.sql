-- RWR-r5 §9/§10 upgrade: pre-D1 shapes (several or no open actions, tests without
-- their appointment, closed/converted/merged prospects with work left) → d1_plan →
-- d1_apply → post-checks Q04/Q05/Q07/Q29 → d1_revert. Rolled back; no personal data.
-- The shapes are written directly, as the live data holds them before D1.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.at(days integer,hhmm text) returns timestamptz language sql as $$
 select (((now() at time zone public.centre_utc_offset())::date+days)::timestamp+hhmm::time) at time zone public.centre_utc_offset()
$$;
insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a8000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'d1-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,3)i;
update public.profiles set role=(array['director','admin','receptionist'])[right(id::text,1)::integer],full_name='D1 staff '||right(id::text,1) where id::text like 'a8000000-%';
do $p$ begin
 perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000001',true);
 perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},"attempt_offsets":[0,0,1,3,5]}');
end $p$;
create temp table fx(name text primary key,lead uuid,a uuid,b uuid,test uuid,test2 uuid);
create temp table baseline(plan jsonb);
insert into baseline select crm_security.d1_plan();

do $$ declare n text; l uuid; begin
 perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000003',true);
 foreach n in array array['L1_dupes','L2_exact','L3_shared_test','L4_five','L5_test_only','L6_test_and_other','L7_past_appt_test','L8_closed','L9_converted','L10_merged','L11_future_and_past','L12_none','L14_enrol_test','L15_enrol_linked'] loop
  l:=(public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','D1 '||n,'learner_name','D1 learner','email','d1-'||gen_random_uuid()||'@example.invalid','source_label','Manual'))->'lead'->>'id')::uuid;
  -- Start from no open action; each shape adds what it needs.
  update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='Fixture' where lead_id=l and status='open';
  insert into fx(name,lead) values(n,l);
 end loop;
end $$;
set local session_replication_role=replica; -- fixture rows as the live data holds them, without today's booking guards
-- L1: two callbacks (rule a: keep the most recently created).
with x as (insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,created_at)
 select lead,'callback',pg_temp.at(2,'10:00'),'manual','fx:L1:'||g,now()-make_interval(hours=>3-g) from fx cross join generate_series(1,2) g where name='L1_dupes' returning id,created_at)
update fx set a=(select id from x order by created_at limit 1),b=(select id from x order by created_at desc limit 1) where name='L1_dupes';
-- L2: exact duplicates.
with x as (insert into public.crm_tasks(lead_id,task_type,due_at,schedule_kind,source_kind,source_key,created_at)
 select lead,'callback',pg_temp.at(3,'10:00'),'reminder','manual','fx:L2:'||g,now()-interval '1 hour' from fx cross join generate_series(1,2) g where name='L2_exact' returning id)
update fx set a=(select min(id::text)::uuid from x) where name='L2_exact';
-- L3: two open visits linked to one planned future test (shared-test duplicate).
insert into public.placement_tests(id,student_name,date_test,heure,status,crm_lead_id,examinateur)
select gen_random_uuid(),'D1 learner',((now() at time zone public.centre_utc_offset())::date+4),'11:00','Planifié',lead,'Fixture' from fx where name='L3_shared_test';
update fx set test=(select id from public.placement_tests where crm_lead_id=fx.lead) where name='L3_shared_test';
insert into public.crm_tasks(lead_id,task_type,due_at,schedule_kind,placement_test_id,source_kind,source_key,created_at)
select lead,'center_visit',pg_temp.at(4,'11:00'),'appointment',test,'manual','fx:L3:'||g,now()-make_interval(hours=>g) from fx cross join generate_series(1,2) g where name='L3_shared_test';
-- L4: five failed calls, no open action (rule c, no review flag).
insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,channel,outcome,outreach_cycle,attempt_ordinal,source_key)
select lead,now()-make_interval(days=>6-g),'system','contact_attempted','phone','no_answer',(select outreach_cycle from public.crm_leads where id=lead),g,'fx:L4:'||g
from fx cross join generate_series(1,5) g where name='L4_five';
-- L5: a planned test and no action (rule b). L6: a planned test beside a callback (rule b replaces it).
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
select 'D1 learner',((now() at time zone public.centre_utc_offset())::date+5),'10:30','Planifié',lead,'Fixture' from fx where name in ('L5_test_only','L6_test_and_other');
update fx set test=(select id from public.placement_tests where crm_lead_id=fx.lead) where name in ('L5_test_only','L6_test_and_other');
insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key) select lead,'callback',pg_temp.at(1,'16:00'),'manual','fx:L6' from fx where name='L6_test_and_other';
update fx set a=(select id from public.crm_tasks where source_key='fx:L6') where name='L6_test_and_other';
-- L7: a past appointment with a planned test next to a newer callback (rule a keeps the appointment).
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
select 'D1 learner',((now() at time zone public.centre_utc_offset())::date-2),'11:00','Planifié',lead,'Fixture' from fx where name='L7_past_appt_test';
update fx set test=(select id from public.placement_tests where crm_lead_id=fx.lead) where name='L7_past_appt_test';
insert into public.crm_tasks(lead_id,task_type,due_at,schedule_kind,placement_test_id,source_kind,source_key,created_at)
select lead,'center_visit',pg_temp.at(-2,'11:00'),'appointment',test,'manual','fx:L7:appt',now()-interval '3 days' from fx where name='L7_past_appt_test';
insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,created_at)
select lead,'callback',pg_temp.at(1,'16:00'),'manual','fx:L7:cb',now()-interval '1 hour' from fx where name='L7_past_appt_test';
update fx set a=(select id from public.crm_tasks where source_key='fx:L7:appt'),b=(select id from public.crm_tasks where source_key='fx:L7:cb') where name='L7_past_appt_test';
-- L8 closed, L9 converted, L10 merged: each with an open action and a planned future test (rule d;
-- the converted prospect keeps its test, §4.8, review of #208 important 6).
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
select 'D1 learner',((now() at time zone public.centre_utc_offset())::date+6),'10:00','Planifié',lead,'Fixture' from fx where name in ('L8_closed','L9_converted','L10_merged');
update fx set test=(select id from public.placement_tests where crm_lead_id=fx.lead) where name in ('L8_closed','L9_converted','L10_merged');
insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key) select lead,'callback',pg_temp.at(1,'16:00'),'manual','fx:'||name from fx where name in ('L8_closed','L9_converted','L10_merged');
update public.crm_leads set status='LOST',closure_reason='price',closed_at=now() where id=(select lead from fx where name='L8_closed');
-- A converted fixture with trusted synthetic references (as phase5's converted fixture).
do $$ declare st uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); l uuid:=(select lead from fx where name='L9_converted'); begin
 insert into public.students(id,full_name,status,session_type) values(st,'D1 learner','Enrolled','Mise à niveau');
 insert into public.enrollments(id,student_id,status) values(e,st,'Submitted');
 insert into public.crm_activities(id,lead_id,occurred_at,actor_kind,event_type,source_key,enrollment_id) values(a,l,now(),'system','test_evidence','fx:L9:'||l,e);
 update public.crm_leads set status='CONVERTED',student_id=st,enrollment_id=e,converted_at=now(),conversion_activity_id=a where id=l;
end $$;
update public.crm_leads set merged_into_lead_id=(select lead from fx where name='L12_none') where id=(select lead from fx where name='L10_merged');
-- L11: a future appointment without a test next to a past appointment with a planned test.
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
select 'D1 learner',((now() at time zone public.centre_utc_offset())::date-1),'11:00','Planifié',lead,'Fixture' from fx where name='L11_future_and_past';
update fx set test=(select id from public.placement_tests where crm_lead_id=fx.lead) where name='L11_future_and_past';
insert into public.crm_tasks(lead_id,task_type,due_at,schedule_kind,placement_test_id,source_kind,source_key,created_at)
select lead,'center_visit',pg_temp.at(-1,'11:00'),'appointment',test,'manual','fx:L11:past',now()-interval '2 days' from fx where name='L11_future_and_past';
insert into public.crm_tasks(lead_id,task_type,due_at,schedule_kind,source_kind,source_key,created_at)
select lead,'center_visit',pg_temp.at(3,'17:00'),'appointment','manual','fx:L11:future',now()-interval '3 days' from fx where name='L11_future_and_past';
update fx set a=(select id from public.crm_tasks where source_key='fx:L11:future'),b=(select id from public.crm_tasks where source_key='fx:L11:past') where name='L11_future_and_past';
-- Re-review of #208 (owner decision 1): L14 a legacy « Finaliser l'inscription » next to a
-- planned test it does not carry (rule b links the test to it, never replaces it); its action
-- still points at an older test already « Passé », which the link replaces and the revert
-- restores. L15 the 136 shape, an enrolment action already carrying its planned test (no rule).
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
select 'D1 learner',((now() at time zone public.centre_utc_offset())::date+4),'10:00','Planifié',lead,'Fixture' from fx where name in ('L14_enrol_test','L15_enrol_linked');
update fx set test=(select id from public.placement_tests where crm_lead_id=fx.lead) where name in ('L14_enrol_test','L15_enrol_linked');
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
select 'D1 learner',((now() at time zone public.centre_utc_offset())::date-20),'10:00','Passé',lead,'Fixture' from fx where name='L14_enrol_test';
update fx set test2=(select id from public.placement_tests where crm_lead_id=fx.lead and status='Passé') where name='L14_enrol_test';
insert into public.crm_tasks(lead_id,task_type,due_at,placement_test_id,source_kind,source_key)
select lead,'enrollment_followup',pg_temp.at(1,'16:00'),case when name='L15_enrol_linked' then test else test2 end,'manual','fx:'||name from fx where name in ('L14_enrol_test','L15_enrol_linked');
update fx set a=(select id from public.crm_tasks where source_key='fx:'||fx.name) where name in ('L14_enrol_test','L15_enrol_linked');
set local session_replication_role=origin;
-- L12 stays active with no action and fewer than five failures (rule c with the review flag).

-- d1_plan: exact per-rule counts and the cancelled-test count (plan §10).
do $$ begin perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000003',true);
 begin perform crm_security.d1_plan(); raise exception 'FAIL: receptionist read the D1 plan';
 exception when sqlstate '42501' then null; end;
 perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000001',true);
end $$;
do $$ declare base jsonb:=(select plan from baseline); p jsonb:=crm_security.d1_plan(); begin
 perform pg_temp.ok((p->'a'->>'count')::int-(base->'a'->>'count')::int=5,'rule a: L1 L2 L3 L7 L11 '||p::text);
 perform pg_temp.ok((p->'b'->>'count')::int-(base->'b'->>'count')::int=3 and (p->'b'->>'replaced')::int-(base->'b'->>'replaced')::int=1
  and (p->'b'->>'linked')::int-(base->'b'->>'linked')::int=1,'rule b: L5 L6 L14 (one action replaced, one test linked to an enrolment action)');
 perform pg_temp.ok(not exists(select 1 from crm_security.d1_sets() s join fx on fx.lead=s.lead_id where fx.name='L15_enrol_linked'),'L15: a test carried by the enrolment action is in no rule');
 perform pg_temp.ok((p->'c'->>'count')::int-(base->'c'->>'count')::int=2 and (p->'c'->>'after_five_failures')::int-(base->'c'->>'after_five_failures')::int=1,'rule c: L4 (after five) L12');
 perform pg_temp.ok((p->'d'->>'count')::int-(base->'d'->>'count')::int=3,'rule d: L8 L9 L10');
 perform pg_temp.ok((p->'tests_cancelled'->>'count')::int-(base->'tests_cancelled'->>'count')::int=3,'tests cancelled: L8 L10 and L11''s past test (L9 converted keeps its test)');
 perform pg_temp.ok(not exists(select 1 from crm_security.d1_cancelled_tests() c join fx on fx.test=c.test_id where fx.name='L9_converted'),'a converted prospect''s test is not in the cancelled list');
 perform pg_temp.ok(exists(select 1 from crm_security.d1_cancelled_tests() c join fx on fx.test=c.test_id where fx.name='L11_future_and_past' and c.rule='a'),'L11 past test listed under rule a');
 perform pg_temp.ok(not exists(select 1 from crm_security.d1_cancelled_tests() c join fx on fx.test=c.test_id where fx.name in ('L3_shared_test','L7_past_appt_test')),'a test linked to the kept action is never cancelled');
end $$;
\echo PASS d1_plan per-rule counts, samples and cancelled tests

-- B3 (review of #208): a prospect D1 processes under two rules (a: two open actions;
-- b: a planned test without its appointment) has two journal rows of one transaction
-- (same run_at). d1_revert takes the highest journalled version, so it is reverted on
-- every run, whatever the uuids. Twelve runs, each rolled back to this point.
do $$ declare l uuid; p jsonb; r jsonb; runs integer:=0; i integer; begin
 for i in 1..12 loop
  begin
   perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000003',true);
   l:=(public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','D1 L13 two rules','learner_name','D1 learner','email','d1-'||gen_random_uuid()||'@example.invalid','source_label','Manual'))->'lead'->>'id')::uuid;
   set local session_replication_role=replica;
   update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='Fixture' where lead_id=l and status='open';
   insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,created_at)
   select l,'callback',pg_temp.at(2,'10:00'),'manual','fx:L13:'||i||':'||g,now()-make_interval(hours=>3-g) from generate_series(1,2) g;
   insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
   values('D1 learner',((now() at time zone public.centre_utc_offset())::date+6),'11:00','Planifié',l,'Fixture');
   set local session_replication_role=origin;
   perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000001',true);
   perform pg_temp.ok((select count(*)=2 from crm_security.d1_sets() where lead_id=l and rule in ('a','b')),'run '||i||': L13 matches rules a and b');
   p:=crm_security.d1_plan();
   perform crm_security.d1_apply(p);
   perform pg_temp.ok((select count(*)=2 and count(distinct run_at)=1 from public.crm_data_step_journal where step='d1' and entity='crm_leads' and entity_id=l),'run '||i||': two journal rows of one transaction');
   r:=crm_security.d1_revert();
   perform pg_temp.ok((r->>'leads_changed_since')::int=0,'run '||i||': no prospect skipped '||r::text);
   perform pg_temp.ok((select count(*)=2 and bool_and(task_type='callback') from public.crm_tasks where lead_id=l and status='open')
    and (select status='Planifié' from public.placement_tests where crm_lead_id=l),'run '||i||': L13 back to its two callbacks and its planned test');
   raise exception using errcode='EH999',message='roll this run back';
  exception when sqlstate 'EH999' then runs:=runs+1;
  end;
 end loop;
 perform pg_temp.ok(runs=12,'twelve reverted runs');
end $$;
\echo PASS B3 d1_revert reverts a prospect processed under two rules, on every run


-- d1_apply refuses counts that differ from the approved dry run, then applies.
do $$ declare p jsonb:=crm_security.d1_plan(); wrong jsonb; r jsonb; begin
 perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000001',true);
 wrong:=jsonb_set(p,'{a,count}',to_jsonb((p->'a'->>'count')::int+1));
 begin perform crm_security.d1_apply(wrong); raise exception 'FAIL: d1_apply accepted a wrong count';
 exception when sqlstate 'P0001' then if sqlerrm not like 'D1 dry-run count differs%' then raise; end if; end;
 r:=crm_security.d1_apply(p);
 perform pg_temp.ok(current_setting('eh.crm_data_step',true) is distinct from 'd1','D1 bypass flag cleared after the run');
 -- Review of #208 (important 7): the counts checked are the sets acted on, and no
 -- concurrent writer can change them before commit.
 perform pg_temp.ok((select bool_and(coalesce((r->'applied'->>k)::int,0)=(p->k->>'count')::int) from unnest(array['a','b','c','d']) k),'d1_apply acted on exactly the checked sets '||r::text);
 perform pg_temp.ok((select count(distinct relation)=3 from pg_locks where pid=pg_backend_pid() and mode='ShareRowExclusiveLock'
  and relation in ('public.crm_leads'::regclass,'public.crm_tasks'::regclass,'public.placement_tests'::regclass)),'D1 tables locked against writers until commit');
end $$;

-- Post-checks (Q04, Q05, Q07, Q29) and the shape-specific outcomes.
do $$ declare r record; begin
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where status='open' group by lead_id having count(*)>1),'Q04: no prospect with two open actions');
 perform pg_temp.ok(not exists(select 1 from public.crm_leads l where l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')),'Q05: no active prospect without an action');
 perform pg_temp.ok(not exists(select 1 from public.crm_leads l join public.crm_tasks t on t.lead_id=l.id and t.status='open'
  where l.merged_into_lead_id is not null or l.status in ('LOST','NOT_QUALIFIED','CONVERTED')),'Q07: closed, converted and merged prospects hold nothing');
 perform pg_temp.ok(not exists(select 1 from public.crm_leads l join public.placement_tests x on x.crm_lead_id=l.id and x.status='Planifié'
  where l.merged_into_lead_id is not null or l.status in ('LOST','NOT_QUALIFIED')),'Q29: no planned test on a closed or merged prospect');
 select * into r from fx where name='L1_dupes';
 perform pg_temp.ok(crm_security.next_action_id(r.lead)=r.b and (select status='cancelled' and cancellation_reason like '%Doublon%' from public.crm_tasks where id=r.a),'L1 keeps the most recent, cancels the duplicate');
 select * into r from fx where name='L3_shared_test';
 perform pg_temp.ok((select status='Planifié' from public.placement_tests where id=r.test)
  and (select placement_test_id=r.test from public.crm_tasks where id=crm_security.next_action_id(r.lead)),'L3 shared test still planned and linked to the kept visit');
 select * into r from fx where name='L4_five';
 perform pg_temp.ok((select task_type='awaiting_prospect' and due_at is null and review_flag is null from public.crm_tasks where id=crm_security.next_action_id(r.lead)),'L4 « En attente » without relance (OD-17)');
 select * into r from fx where name='L5_test_only';
 perform pg_temp.ok((select task_type='center_visit' and placement_test_id=r.test and due_at=(((now() at time zone public.centre_utc_offset())::date+5)::timestamp+time '10:30') at time zone public.centre_utc_offset()
  from public.crm_tasks where id=crm_security.next_action_id(r.lead)),'L5 appointment created at the test time');
 select * into r from fx where name='L6_test_and_other';
 perform pg_temp.ok((select status='cancelled' and replaced_reason like '%D1%' from public.crm_tasks where id=r.a)
  and (select placement_test_id=r.test from public.crm_tasks where id=crm_security.next_action_id(r.lead)),'L6 callback replaced by the test''s appointment');
 select * into r from fx where name='L14_enrol_test';
 perform pg_temp.ok(crm_security.next_action_id(r.lead)=r.a and (select task_type='enrollment_followup' and status='open' and placement_test_id=r.test from public.crm_tasks where id=r.a)
  and (select status='Planifié' from public.placement_tests where id=r.test),'L14 enrolment action kept and now carries the planned test (never replaced)');
 select * into r from fx where name='L15_enrol_linked';
 perform pg_temp.ok(crm_security.next_action_id(r.lead)=r.a and (select placement_test_id=r.test from public.crm_tasks where id=r.a)
  and (select status='Planifié' from public.placement_tests where id=r.test),'L15 untouched');
 -- Q29 (amended): every planned test of an active prospect belongs to its open appointment or enrolment action.
 perform pg_temp.ok(not exists(select 1 from public.crm_leads l join public.placement_tests x on x.crm_lead_id=l.id and x.status='Planifié'
  where l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and not exists(select 1 from public.crm_tasks t where t.placement_test_id=x.id and t.status='open' and t.task_type in ('center_visit','enrollment_followup'))),'Q29: no planned test of an active prospect without its appointment or enrolment action');
 select * into r from fx where name='L7_past_appt_test';
 perform pg_temp.ok(crm_security.next_action_id(r.lead)=r.a and (select status='cancelled' from public.crm_tasks where id=r.b)
  and (select status='Planifié' from public.placement_tests where id=r.test),'L7 past appointment with its planned test kept; callback cancelled');
 perform pg_temp.ok((select status='Annulé' from public.placement_tests where id=x.test) and not exists(select 1 from public.crm_tasks where lead_id=x.lead and status='open'),x.name||' cleared, test cancelled')
 from fx x where x.name in ('L8_closed','L10_merged');
 select * into r from fx where name='L9_converted';
 perform pg_temp.ok((select status='Planifié' from public.placement_tests where id=r.test) and not exists(select 1 from public.crm_tasks where lead_id=r.lead and status='open'),'L9 converted: actions cleared, test kept (§4.8)');
 select * into r from fx where name='L11_future_and_past';
 perform pg_temp.ok(crm_security.next_action_id(r.lead)=r.a and (select status='Annulé' from public.placement_tests where id=r.test),'L11 future appointment kept, past test cancelled');
 select * into r from fx where name='L12_none';
 perform pg_temp.ok((select task_type='awaiting_prospect' and review_flag='d1_review' from public.crm_tasks where id=crm_security.next_action_id(r.lead)),'L12 « En attente » flagged « À revoir (D1) »');
 perform pg_temp.ok((select count(*)>0 from public.crm_data_step_journal where step='d1' and entity='crm_tasks'),'journal lists the actions D1 opened');
end $$;
\echo PASS d1_apply: Q04, Q05, Q07, Q29 (both shapes) at zero and every shape resolved as planned

-- d1_revert (before M-A2): D1's own actions cancelled, the exact cancelled rows reopened,
-- future tests replanned, past ones left cancelled and listed.
do $$ declare r jsonb; x record; begin
 perform set_config('request.jwt.claim.sub','a8000000-0000-0000-0000-000000000001',true);
 r:=crm_security.d1_revert();
 select * into x from fx where name='L1_dupes';
 perform pg_temp.ok((select count(*)=2 from public.crm_tasks where lead_id=x.lead and status='open'),'L1 duplicates reopened '||r::text);
 select * into x from fx where name='L5_test_only';
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=x.lead and status='open'),'L5 appointment D1 created is cancelled');
 select * into x from fx where name='L8_closed';
 perform pg_temp.ok((select status='Planifié' from public.placement_tests where id=x.test),'L8 future test replanned');
 select * into x from fx where name='L11_future_and_past';
 perform pg_temp.ok((select status='Annulé' from public.placement_tests where id=x.test)
  and r->'tests_left_cancelled' @> jsonb_build_array(jsonb_build_object('test_id',x.test,'lead_id',x.lead)),'L11 past test left cancelled and listed');
 select * into x from fx where name='L14_enrol_test';
 perform pg_temp.ok((select status='open' and placement_test_id=x.test2 from public.crm_tasks where id=x.a) and (r->>'unlinked')::int>=1
  and (select status='Planifié' from public.placement_tests where id=x.test),'L14 link undone, enrolment action and test as before');
 select * into x from fx where name='L15_enrol_linked';
 perform pg_temp.ok((select placement_test_id=x.test from public.crm_tasks where id=x.a),'L15 still linked');
 perform pg_temp.ok((r->>'leads_changed_since')::int=0,'no prospect changed since D1');
end $$;
\echo PASS d1_revert restores the pre-D1 rows
rollback;
