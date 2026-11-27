-- RWR-r5 §9 « Enforced writers », PR A2 (M-A2, migration 137), against the real index and
-- deferred triggers. Rolled back; synthetic data only.
--  1. Structure: crm_tasks_one_open_per_lead is a valid unique partial index; the three
--     constraint triggers are deferrable, initially deferred; their functions are private.
--  2. Each forbidden state is refused at commit (SET CONSTRAINTS ALL IMMEDIATE stands in
--     for COMMIT inside this rolled-back transaction): a second open action, an active
--     prospect with none, an action or a planned test left on a closed or merged
--     prospect, a planned test outside the open appointment or enrolment action.
--  3. Writers of the §4.2 inventory, each followed by the commit-time check: intake
--     (manual), exchange, appointment with test, test result through the CRM command (an
--     Admissions table update as staff changes no row since 141), reassignment, close and reopen,
--     enrolment start keeping the test on « Finaliser l'inscription », then conversion
--     keeping it. Every suite that drives these writers (intake resubmission included)
--     also runs with the same commit-time check: test-crm-next-action-enforced-suites.mjs.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','a7137000-0000-4000-8000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.act(cmd text,lead uuid,payload jsonb default '{}') returns jsonb language plpgsql as $$ declare result jsonb; begin
 execute format('select public.crm_%I($1,$2)',cmd) into result using gen_random_uuid(),
  jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload;
 return result;
end $$;
-- The deferred checks run now, as at COMMIT; any violation fails the suite here.
create function pg_temp.committed(label text) returns void language plpgsql as $$ begin
 set constraints all immediate; set constraints all deferred;
 raise notice 'commit check passed: %',label;
end $$;
-- The prospect's state after a writer: one open action while active, none once closed or converted.
create function pg_temp.actions(lead uuid) returns integer language sql as $$ select count(*)::integer from public.crm_tasks where lead_id=lead and status='open' $$;
-- A statement that must be refused at commit with this SQLSTATE and hint; its writes are undone.
create function pg_temp.refused_at_commit(statement text,code text,expected_hint text) returns void language plpgsql as $$
declare h text; begin
 begin
  execute statement;
  set constraints all immediate;
 exception when others then
  get stacked diagnostics h=pg_exception_hint;
  set constraints all deferred;
  if sqlstate=code and (expected_hint is null or h=expected_hint) then return; end if;
  raise exception 'Expected % %, got % % (%): %',code,coalesce(expected_hint,''),sqlstate,sqlerrm,h,statement;
 end;
 raise exception 'Unexpected success at commit: %',statement;
end $$;

-- 1. Structure.
do $$ begin
 perform pg_temp.ok((select i.indisunique and i.indisvalid and i.indisready and pg_get_expr(i.indpred,i.indrelid)='(status = ''open''::text)'
  and pg_get_indexdef(i.indexrelid) like '%(lead_id)%' from pg_index i where i.indexrelid='public.crm_tasks_one_open_per_lead'::regclass),'unique partial index on open actions, valid');
 perform pg_temp.ok((select count(*)=3 and bool_and(t.tgdeferrable and t.tginitdeferred and t.tgconstraint<>0 and t.tgfoid='crm_security.next_action_presence()'::regprocedure)
  from pg_trigger t where (t.tgrelid,t.tgname) in (('public.crm_leads'::regclass,'crm_next_action_presence'),('public.crm_tasks'::regclass,'crm_next_action_presence'),
  ('public.placement_tests'::regclass,'crm_planned_test_placement'))),'three deferred constraint triggers');
 perform pg_temp.ok(not has_function_privilege(r,f,'execute'),f||' private from '||r)
 from unnest(array['crm_security.next_action_presence()','crm_security.assert_next_action_state(uuid)']) f cross join unnest(array['anon','authenticated','service_role']) r;
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where status='open' group by lead_id having count(*)>1),'Q04 at zero on this database');
end $$;
\echo PASS structure: valid unique index, three deferred constraint triggers, private functions

-- Fixture: staff, the live hours, and prospects built through the commands.
insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7137000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'enforced-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,4)i;
update public.profiles set role=(array['director','admin','receptionist','teacher'])[right(id::text,1)::integer],
 full_name='Enforced staff '||right(id::text,1) where id::text like 'a7137000-%';
do $p$ begin perform pg_temp.actor(1); perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["08:00","21:00"]],"2":[["08:00","21:00"]],"3":[["08:00","21:00"]],"4":[["08:00","21:00"]],"5":[["08:00","21:00"]],"6":[["08:00","21:00"]],"7":[["08:00","21:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
create function pg_temp.prospect(name text) returns uuid language plpgsql as $$ begin
 perform pg_temp.actor(3);
 return (public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Enforced '||name,'learner_name','Enforced learner '||name,
  'email','enforced-'||gen_random_uuid()||'@example.invalid','source_label','Manual'))->'lead'->>'id')::uuid;
end $$;
create function pg_temp.with_test(lead uuid) returns uuid language plpgsql as $$ begin
 perform pg_temp.act('log_exchange',lead,jsonb_build_object('channel','phone','result','spoke','next',jsonb_build_object('task_type','center_visit','with_test',true,
  'due_at',crm_security.window_at(crm_security.current_policy_id(),'opening',now()+interval '3 days'))));
 return (select placement_test_id from public.crm_tasks where id=crm_security.next_action_id(lead));
end $$;
do $$ begin perform pg_temp.committed('fixture'); end $$;

-- 2. Forbidden states are refused at commit.
do $$ declare l uuid:=pg_temp.prospect('neg'); t uuid:=crm_security.next_action_id(l); p uuid; begin
 -- A second open action: refused at once by the unique index.
 perform pg_temp.refused_at_commit(format($q$insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key) values(%L,'callback',now()+interval '1 day','manual','enforced:dup:'||gen_random_uuid())$q$,l),
  '23505',null);
 -- An active prospect left with no open action.
 perform pg_temp.refused_at_commit(format($q$update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='x' where id=%L$q$,t),
  '23514','crm_next_action.exactly_one');
 -- A prospect closed while its action stays open.
 perform pg_temp.refused_at_commit(format($q$update public.crm_leads set status='LOST',closure_reason='price',closed_at=now() where id=%L$q$,l),
  '23514','crm_next_action.closed_has_action');
 -- A merged prospect keeping its action.
 perform pg_temp.refused_at_commit(format($q$update public.crm_leads set merged_into_lead_id=%L where id=%L$q$,pg_temp.prospect('neg-target'),l),
  '23514','crm_next_action.closed_has_action');
 -- A planned test the open action does not carry.
 perform pg_temp.refused_at_commit(format($q$insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id) values('Enforced learner',current_date+4,'11:00','Planifié',%L)$q$,l),
  '23514','crm_placement.test_without_action');
 -- An appointment cancelled while its planned test stays: the test has no action left.
 p:=pg_temp.with_test(l); t:=crm_security.next_action_id(l);
 perform pg_temp.committed('appointment with test');
 perform pg_temp.refused_at_commit(format($q$update public.crm_tasks set placement_test_id=null where id=%L$q$,t),
  '23514','crm_placement.test_without_action');
 -- A closed prospect keeping a planned test (its actions cancelled by hand).
 perform pg_temp.refused_at_commit(format($q$update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='x',placement_test_id=null where lead_id=%1$L and status='open';
  update public.crm_leads set status='NOT_QUALIFIED',closure_reason='program_not_suitable',closed_at=now() where id=%1$L$q$,l),
  '23514','crm_placement.closed_has_test');
 perform pg_temp.ok(pg_temp.actions(l)=1 and crm_security.next_action_id(l)=t and (select status='Planifié' from public.placement_tests where id=p),'every refused write undone');
end $$;
\echo PASS refused at commit: second action, none, closed or merged with work left, test outside its action

-- 3. Writers, each checked as at commit.
do $$ declare l uuid; p uuid; t uuid; e uuid; s uuid; r jsonb; begin
 -- Intake (manual) and an exchange.
 l:=pg_temp.prospect('w1'); perform pg_temp.committed('manual intake');
 perform pg_temp.ok(pg_temp.actions(l)=1,'intake: one action');
 perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"no_answer"}'); perform pg_temp.committed('failed call');
 perform pg_temp.ok(pg_temp.actions(l)=1,'failed call: one action');
 -- Appointment with a test, then the result through the CRM command.
 p:=pg_temp.with_test(l); perform pg_temp.committed('appointment with test');
 perform pg_temp.ok(pg_temp.actions(l)=1 and p is not null,'appointment carries the test');
 -- RWR-r5 C2 (141, invariant 5): a result needs the start time to have passed; the test moves to yesterday.
 set local session_replication_role=replica;
 update public.placement_tests set date_test=(now() at time zone public.centre_utc_offset())::date-1 where id=p;
 set local session_replication_role=origin;
 perform public.crm_update_placement_test(gen_random_uuid(),jsonb_build_object('placement_id',p,'expected_updated_at',(select updated_at from public.placement_tests where id=p),
  'expected_version',(select version from public.crm_leads where id=l),'date_test',(select date_test from public.placement_tests where id=p),
  'heure',(select heure from public.placement_tests where id=p),'status','Résultat saisi','niveau_recommande','B1'));
 perform pg_temp.committed('test result (CRM command)');
 perform pg_temp.ok(pg_temp.actions(l)=1 and (select task_type='post_test_followup' from public.crm_tasks where id=crm_security.next_action_id(l)),'result: « Proposer l''inscription » is the one action');
 -- Reassignment, close, reopen.
 perform pg_temp.act('reassign',l,jsonb_build_object('owner_id','a7137000-0000-4000-8000-000000000002'::uuid)); perform pg_temp.committed('reassignment');
 perform pg_temp.ok(pg_temp.actions(l)=1 and (select assigned_to='a7137000-0000-4000-8000-000000000002'::uuid from public.crm_tasks where id=crm_security.next_action_id(l)),'reassignment: one action, new owner');
 perform pg_temp.act('close_prospect',l,'{"status":"LOST","reason":"price"}'); perform pg_temp.committed('close');
 perform pg_temp.ok(pg_temp.actions(l)=0,'closed: no action');
 perform pg_temp.act('reopen_prospect',l,'{"reason":"Revient","next":{"task_type":"callback","due_preset":"tomorrow"}}'); perform pg_temp.committed('reopen');
 perform pg_temp.ok(pg_temp.actions(l)=1,'reopened: one action');

 -- An Admissions table update as staff: since RWR-r5 C2 (141) the receptionist's update
 -- policy is gone (staff use the commands), so the direct write changes no row.
 l:=pg_temp.prospect('w2'); p:=pg_temp.with_test(l); perform pg_temp.committed('appointment with test (admissions)');
 perform pg_temp.actor(3); execute 'set local role authenticated';
 update public.placement_tests set status='Passé' where id=p;
 execute 'reset role';
 perform pg_temp.ok((select status='Planifié' from public.placement_tests where id=p),'admissions table update as staff: no row changed');
 perform pg_temp.committed('admissions table update as staff');
 perform pg_temp.ok(pg_temp.actions(l)=1,'admissions update: one action');

 -- Enrolment start (crm_start_enrollment, which « Inscrire et encaisser » runs before the
 -- payment; called here from a postgres session, its API grant being revoked), linking a
 -- legacy unconfirmed enrolment as test-crm-rcc-a2 does, keeps the appointment's planned
 -- test on « Finaliser l'inscription »; the payment then converts the prospect, which
 -- keeps the test and holds no action.
 l:=pg_temp.prospect('w3'); p:=pg_temp.with_test(l); perform pg_temp.committed('appointment with test (enrolment start)');
 insert into public.students(full_name,date_naissance,status,session_type) values('Enforced legacy learner','2015-03-01','Prospect','Yearly') returning id into s;
 perform set_config('eh.membership_sync','on',true),set_config('eh.enrollment_command','on',true);
 insert into public.enrollments(student_id,session_type,school_year,status,level) values(s,'Yearly','2026/2027','Submitted','Child 2') returning id into e;
 perform set_config('eh.membership_sync','',true),set_config('eh.enrollment_command','',true);
 r:=jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'student_choice','existing','student_id',s,
  'session_type','Yearly','school_year','2026/2027','enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from public.enrollments where id=e),
  'followup_at',null,'initial_status','Confirmed');
 perform pg_temp.actor(3);
 perform public.crm_start_enrollment(gen_random_uuid(),r);
 perform pg_temp.committed('enrolment start');
 t:=crm_security.next_action_id(l);
 perform pg_temp.ok((select status<>'CONVERTED' from public.crm_leads where id=l) and pg_temp.actions(l)=1
  and (select task_type='enrollment_followup' and placement_test_id=p from public.crm_tasks where id=t)
  and (select status='Planifié' from public.placement_tests where id=p),'enrolment start: « Finaliser l''inscription » carries the kept test');
 select enrollment_id into e from public.crm_leads where id=l; select student_id into s from public.enrollments where id=e;
 perform pg_temp.actor(2);
 perform public.create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'session_type','Yearly','school_year','2026/2027','gross_amount',1500,
  'payment_amount',500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 perform pg_temp.committed('payment and conversion');
 perform pg_temp.ok((select status='CONVERTED' from public.crm_leads where id=l) and pg_temp.actions(l)=0 and (select status='Planifié' from public.placement_tests where id=p),
  'conversion: no action, the carried test kept');

 -- « Inscrire et encaisser » with its payment: enrolment start and conversion in one transaction.
 l:=pg_temp.prospect('w4'); p:=pg_temp.with_test(l); perform pg_temp.committed('appointment with test (enrol and collect)');
 select jsonb_build_object('enrollment',jsonb_build_object('lead_id',x.id,'expected_version',x.version,'student_choice','new','learner_name',x.learner_name,
  'candidate_review',crm_security.candidate_token(x.id,x.learner_name,null),'session_type','Yearly','school_year','2026/2027'),
  'payment',jsonb_build_object('gross_amount',1500,'payment_amount',500,'payment_method','Espèces')) into r from public.crm_leads x where x.id=l;
 perform pg_temp.actor(3); execute 'set local role authenticated';
 r:=public.crm_enroll_and_collect(gen_random_uuid(),r);
 execute 'reset role';
 perform pg_temp.committed('enrol and collect');
 perform pg_temp.ok((select status='CONVERTED' from public.crm_leads where id=l) and pg_temp.actions(l)=0 and (select status='Planifié' from public.placement_tests where id=p),
  'enrol and collect: converted, no action, the test kept');
end $$;
\echo PASS enforced writers: intake, exchange, appointment, test results, reassignment, close, reopen, enrolment start, conversion
rollback;
