-- RWR-r5 PR C2 (migration 141), §6.2 level tests and §7 invariant 5. Rolled back;
-- synthetic data only (invented names). Dates come from the server: the Casablanca
-- business date and a published hours version open every day 08:00–21:00, so every
-- slot below (tomorrow 10:00, in two days 11:00) is in hours on any weekday, at any time.
--  1. Grants and policies: the three learner test commands are executable by
--     authenticated only; the helpers by no API role; staff write no row through the
--     table (receptionist and admin); management deletes through RLS; teachers keep
--     their insert and update policies.
--  2. book_student_placement_test: future, in hours, HH:MM required, stable-id replay,
--     identity conflict, no result, one « Planifié » test per person, CRM access gate.
--  3. update_placement_test_result: no result before the start time; « Passé » never
--     chosen; « Annuler » needs a reason and records who and when; « Absent » and
--     « Annulé » only from « Planifié »; never planned again; reschedule only while
--     planned (future, in hours); stale edits refused; levels by programme and age.
--  4. The trigger on every row (direct postgres writes stand in for teachers and
--     system paths): no result before the start, no pre-filled result, one planned test
--     per person across a prospect and its linked learner.
--  4b. A future « Planifié » test holding a pre-141 level (« A1 » from the old form):
--     cancel (command and CRM close), move, « Absent » after start; a new level or a
--     score before the start is still refused.
--  5. crm_update_placement_test: « Passé » never chosen; the level follows the
--     prospect's programme and age.
--  5b. A visit outcome whose linked test is set later than the visit: refused until the
--     test's start, nothing written; recorded once the test's time has come.
--  6. delete_placement_test: admin and director, a learner's own test only, stale refused.
--  7. Age bounds 141 derived from the programme audience.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '22023',expected_hint text default null) returns void language plpgsql as $$
declare h text; begin
 begin execute statement; exception when others then
  get stacked diagnostics h=pg_exception_hint;
  if sqlstate=code and (expected_hint is null or h=expected_hint) then return; end if;
  raise exception 'Expected % %, got % % (%): %',code,coalesce(expected_hint,''),sqlstate,sqlerrm,h,statement;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','a7141000-0000-4000-8000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone public.centre_utc_offset())::date $$;
create function pg_temp.book(test uuid,student uuid,d date,h text) returns jsonb language sql as $$
 select public.book_student_placement_test(test,jsonb_build_object('student_id',student,'date_test',d,'heure',h,'examinateur','Synthetic examiner')) $$;
create function pg_temp.edit(test uuid,changes jsonb) returns jsonb language sql as $$
 select public.update_placement_test_result(test,(select updated_at from public.placement_tests where id=test),changes) $$;
-- A test in the past (yesterday 10:00) planned for a learner, as a system path would leave it.
create function pg_temp.past_test(student uuid) returns uuid language sql as $$
 insert into public.placement_tests(student_id,student_name,date_test,heure,status)
 select s.id,s.full_name,pg_temp.today()-1,'10:00','Planifié' from public.students s where s.id=student returning id $$;
create temp table ids(k text primary key, id uuid);
create function pg_temp.id(name text) returns uuid language sql as $$ select id from ids where k=name $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7141000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'placement-rules-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,4)i;
update public.profiles set role=(array['director','admin','receptionist','teacher'])[right(id::text,1)::integer],full_name='Placement staff '||right(id::text,1)
 where id::text like 'a7141000-%';
do $p$ begin perform pg_temp.actor(1); perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["08:00","21:00"]],"2":[["08:00","21:00"]],"3":[["08:00","21:00"]],"4":[["08:00","21:00"]],"5":[["08:00","21:00"]],"6":[["08:00","21:00"]],"7":[["08:00","21:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
-- Learners (system writes: no category check; birth dates relative to the business date).
insert into ids values ('adult',gen_random_uuid()),('child',gen_random_uuid()),('teen_adults',gen_random_uuid()),('other',gen_random_uuid());
insert into public.students(id,full_name,status,session_type,date_naissance,age_category) values
 (pg_temp.id('adult'),'Synthetic adult learner','Prospect','Adults',(pg_temp.today()-interval '30 years')::date,'Adults (18+)'),
 (pg_temp.id('child'),'Synthetic child learner','Prospect','Yearly',(pg_temp.today()-interval '9 years')::date,'Young Learners (6-12)'),
 (pg_temp.id('teen_adults'),'Synthetic teen in Adults','Prospect','Adults',(pg_temp.today()-interval '15 years')::date,null),
 (pg_temp.id('other'),'Synthetic other learner','Prospect','Yearly',null,null);

-- ===== 1. Grants and policies.
do $$ declare fn text; r text; begin
 foreach fn in array array['public.book_student_placement_test(uuid,jsonb)','public.update_placement_test_result(uuid,timestamptz,jsonb)',
   'public.delete_placement_test(uuid,timestamptz)'] loop
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and (select coalesce(proacl::text,'') !~ '(^|[{,])=X' from pg_proc where oid=fn::regprocedure),'authenticated only: '||fn);
 end loop;
 for fn in select p.oid::regprocedure::text from pg_proc p where p.pronamespace='academic_security'::regnamespace
   and p.proname in ('category_ages','level_ages','level_allowed','age_on','student_rules','test_starts','placement_rules','placement_row',
     'assert_student_slot','normalize_class_days','closed_on','class_days_from','parse_class_days') loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.ok(not has_function_privilege(r,fn,'execute'),fn||' private from '||r);
  end loop;
 end loop;
 perform pg_temp.ok((select count(*)=13 from pg_proc where pronamespace='academic_security'::regnamespace and proname in ('category_ages','level_ages','level_allowed',
   'age_on','student_rules','test_starts','placement_rules','placement_row','assert_student_slot','normalize_class_days','closed_on','class_days_from','parse_class_days')),'13 helpers found');
 perform pg_temp.ok(exists(select 1 from pg_trigger where tgrelid='public.placement_tests'::regclass and tgname='placement_tests_rules' and not tgisinternal and tgenabled='O'),
  'placement_tests_rules enabled');
 perform pg_temp.ok((select array_agg(polname::text order by polname) from pg_policy where polrelid='public.placement_tests'::regclass and polcmd in ('a','w','*'))
  =array['crm_placement_operational_only','placement teacher insert','placement teacher update'],'write policies: teachers only (and the CRM restrictive one)');
end $$;
-- Staff direct writes: refused for the receptionist and the admin (no policy), deletion by RLS for management only.
do $$ declare t uuid; who integer; begin
 insert into public.placement_tests(student_name,date_test,heure,status) values('Direct read',pg_temp.today()-1,'10:00','Planifié') returning id into t;
 foreach who in array array[2,3] loop
  perform pg_temp.actor(who); execute 'set local role authenticated';
  perform pg_temp.denied(format($q$insert into public.placement_tests(student_name,date_test,heure,status) values('Direct',%L,'10:00','Planifié')$q$,pg_temp.today()+1),'42501');
  update public.placement_tests set notes='direct' where id=t;
  perform pg_temp.ok(not found,'no direct update for actor '||who);
  if who=3 then delete from public.placement_tests where id=t; perform pg_temp.ok(not found,'receptionist: no delete'); end if;
  execute 'reset role';
 end loop;
end $$;
\echo PASS 1 grants, private helpers, staff write no row through the table, teachers keep their policies

-- ===== 2. book_student_placement_test.
do $$ declare r jsonb; t uuid:=gen_random_uuid(); d date:=pg_temp.today()+1; begin
 perform pg_temp.actor(3); insert into ids values('t_adult',t);
 r:=pg_temp.book(t,pg_temp.id('adult'),d,'10:00');
 perform pg_temp.ok(r->'placement'->>'status'='Planifié' and r->'placement'->>'niveau_recommande' is null and r->'placement'->>'score' is null
  and (r->'placement'->>'is_crm')::boolean is false,'booked: planned, no level, no score');
 perform pg_temp.ok((select crm_lead_id is null and student_id=pg_temp.id('adult') and heure='10:00' and date_test=d and student_name='Synthetic adult learner'
  from public.placement_tests where id=t),'stored for the learner');
 r:=pg_temp.book(t,pg_temp.id('adult'),d,'10:00');
 perform pg_temp.ok((r->>'replayed')::boolean and r->'placement'->>'id'=t::text,'same id and payload: replayed');
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',t,pg_temp.id('adult'),d,'11:00'),'23505');
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('child'),pg_temp.today()-1,'10:00'),'22023','placement.future_required');
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('child'),d,'10h'),'22023','placement.time_required');
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('child'),d,'22:00'),'22023','crm_hours.outside_opening');
 perform pg_temp.denied(format($q$select public.book_student_placement_test(%L,jsonb_build_object('student_id',%L,'date_test',%L,'heure','10:00','niveau_recommande','B1'))$q$,
  gen_random_uuid(),pg_temp.id('child'),d),'22023','placement.invalid');
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',gen_random_uuid(),gen_random_uuid(),d,'10:00'),'22023','placement.student_unavailable');
 -- One planned test per person (a second day, so no overlap): the trigger refuses it.
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('adult'),d+1,'11:00'),'22023','placement.already_planned');
 -- The CRM access gate: a teacher has no access.
 perform pg_temp.actor(4);
 perform pg_temp.denied(format('select pg_temp.book(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('child'),d,'10:00'),'42501');
 perform pg_temp.actor(2);
 r:=pg_temp.book(gen_random_uuid(),pg_temp.id('child'),d,'15:00');
 perform pg_temp.ok(r->'placement'->>'status'='Planifié','the admin books too');
 insert into ids values('t_child',(r->'placement'->>'id')::uuid);
end $$;
\echo PASS 2 learner booking: future, in hours, HH:MM, replay, conflict, no result, one planned per person, CRM gate

-- ===== 3. update_placement_test_result.
do $$ declare t uuid:=pg_temp.id('t_adult'); r jsonb; was timestamptz; p uuid; begin
 perform pg_temp.actor(3);
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi","niveau_recommande":"Intermediate 1"}')$q$,t),'22023','placement.result_before_start');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"score":50}')$q$,t),'22023','placement.no_prefilled_result');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Absent"}')$q$,t),'22023','placement.result_before_start');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Passé"}')$q$,t),'22023','placement.passe_derived');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Annulé"}')$q$,t),'22023','placement.cancel_reason_required');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"notes":"x","cancel_reason":"y"}')$q$,t),'22023','placement.invalid');
 perform pg_temp.denied(format($q$select public.update_placement_test_result(%L,%L,'{"notes":"stale"}')$q$,t,now()-interval '1 day'),'PT409');
 -- Reschedule: future, in hours, while planned.
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,jsonb_build_object('date_test',%L))$q$,t,pg_temp.today()-1),'22023','placement.future_required');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"heure":"22:30"}')$q$,t),'22023','crm_hours.outside_opening');
 r:=pg_temp.edit(t,jsonb_build_object('date_test',pg_temp.today()+2,'heure','11:00','notes','Déplacé'));
 perform pg_temp.ok(r->'placement'->>'date_test'=(pg_temp.today()+2)::text and r->'placement'->>'heure'='11:00','rescheduled');
 -- « Annuler » with a reason: who, when, why.
 r:=pg_temp.edit(t,'{"status":"Annulé","cancel_reason":"Famille indisponible"}');
 perform pg_temp.ok((select status='Annulé' and cancel_reason='Famille indisponible' and cancelled_at is not null
  and cancelled_by='a7141000-0000-4000-8000-000000000003'::uuid from public.placement_tests where id=t),'cancelled with reason, by and at');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Planifié"}')$q$,t),'22023','placement.not_replannable');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Absent"}')$q$,t),'22023','placement.not_planned');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,jsonb_build_object('date_test',%L))$q$,t,pg_temp.today()+3),'22023','placement.not_planned');
 -- After the start time: « Absent », then a result with a level of the programme and age.
 p:=pg_temp.past_test(pg_temp.id('adult'));
 r:=pg_temp.edit(p,'{"status":"Absent"}');
 perform pg_temp.ok(r->'placement'->>'status'='Absent','absent after the start time');
 p:=pg_temp.past_test(pg_temp.id('adult'));
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi"}')$q$,p),'22023','placement.level_required');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi","niveau_recommande":"B1"}')$q$,p),'22023','placement.level_not_offered');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi","niveau_recommande":"Child 2"}')$q$,p),'22023','placement.level_not_offered');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi","niveau_recommande":"Intermediate 2","score":101}')$q$,p),'22023','placement.invalid');
 r:=pg_temp.edit(p,'{"status":"Résultat saisi","niveau_recommande":"Intermediate 2","score":70}');
 perform pg_temp.ok(r->'placement'->>'niveau_recommande'='Intermediate 2' and (r->'placement'->>'score')::numeric=70,'result of the programme');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Passé"}')$q$,p),'22023','placement.passe_derived');
 -- Age: a 15-year-old in the adults programme gets no adult level (programme_levels bounds 18+).
 p:=pg_temp.past_test(pg_temp.id('teen_adults'));
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi","niveau_recommande":"Beginning 1"}')$q$,p),'22023','placement.level_not_offered');
 -- A child: a Yearly level; an assigned group must be open.
 p:=pg_temp.past_test(pg_temp.id('other'));
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,jsonb_build_object('status','Affecté','niveau_recommande','Child 2','groupe_affecte_id',%L))$q$,p,gen_random_uuid()),'22023','placement.group_unavailable');
 r:=pg_temp.edit(p,'{"status":"Résultat saisi","niveau_recommande":"Child 2"}');
 perform pg_temp.ok(r->'placement'->>'status'='Résultat saisi','a Yearly level for a Yearly learner');
end $$;
\echo PASS 3 learner test edits: result after start, Passé never chosen, cancel with reason, absent, no replan, reschedule rules, stale, levels by programme and age

-- ===== 4. The trigger on every row (postgres writes: teachers' and system paths).
do $$ declare p uuid; l uuid; r jsonb; h text; begin
 perform pg_temp.denied(format($q$insert into public.placement_tests(student_name,date_test,heure,status,niveau_recommande) values('Direct',%L,'10:00','Planifié','A1')$q$,pg_temp.today()+5),
  '22023','placement.no_prefilled_result');
 perform pg_temp.denied(format($q$insert into public.placement_tests(student_name,date_test,heure,status,niveau_recommande) values('Direct',%L,'10:00','Résultat saisi','A1')$q$,pg_temp.today()+5),
  '22023','placement.result_before_start');
 perform pg_temp.denied(format($q$insert into public.placement_tests(student_name,date_test,status,score) values('Direct',%L,'Planifié',40)$q$,pg_temp.today()),
  '22023','placement.no_prefilled_result');
 insert into public.placement_tests(student_name,date_test,heure,status,niveau_recommande) values('Direct past',pg_temp.today()-1,'10:00','Résultat saisi','A1') returning id into p;
 perform pg_temp.ok(p is not null,'a past result is accepted');
 insert into public.placement_tests(student_name,date_test,heure,status) values('Direct future',pg_temp.today()+5,'10:00','Planifié') returning id into p;
 perform pg_temp.denied(format($q$update public.placement_tests set status='Absent' where id=%L$q$,p),'22023','placement.result_before_start');
 perform pg_temp.denied(format($q$update public.placement_tests set score=12 where id=%L$q$,p),'22023','placement.result_before_start');
 update public.placement_tests set notes='Editing the notes stays possible' where id=p;
 -- One planned test across a prospect and its linked learner.
 perform pg_temp.actor(3);
 l:=(public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Synthetic parent','learner_name','Synthetic child learner',
  'email','placement-rules-'||gen_random_uuid()||'@example.invalid','source_label','Manual'))->'lead'->>'id')::uuid;
 update public.crm_leads set student_id=pg_temp.id('child') where id=l;
 begin
  r:=public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'channel','phone','result','spoke',
   'next',jsonb_build_object('task_type','center_visit','with_test',true,'due_at',((pg_temp.today()+4)+time '16:00') at time zone public.centre_utc_offset())));
  raise exception 'FAIL: a prospect test booked while the linked learner has one';
 exception when others then
  get stacked diagnostics h=pg_exception_hint;
  if h is distinct from 'placement.already_planned' then raise; end if;
 end;
end $$;
\echo PASS 4 trigger on every row: no result before start, no pre-filled result, one planned per person across a prospect and its learner

-- ===== 4b. A future « Planifié » test that already holds a level (review B1): the pre-C2
-- booking form sent « A1 » by default, so such rows exist before 141. A level or score
-- counts as a result only when this update writes or changes it: the test can still be
-- cancelled (both paths), moved and marked « Absent » after its start; a new level or a
-- score before the start is still refused.
do $$ declare t uuid; r jsonb; begin
 insert into ids select 'legacy_'||i,gen_random_uuid() from generate_series(0,3) i;
 insert into ids select 'legacy_test_'||i,gen_random_uuid() from generate_series(0,3) i;
 insert into public.students(id,full_name,status,session_type,date_naissance,age_category)
  select pg_temp.id('legacy_'||i),'Synthetic legacy learner '||i,'Prospect','Adults',(pg_temp.today()-interval '30 years')::date,'Adults (18+)' from generate_series(0,3) i;
 -- As the pre-141 form left them (written past the 141 trigger, as a pre-141 row is):
 -- three tomorrow 10:00, one yesterday 10:00.
 set local session_replication_role=replica;
 insert into public.placement_tests(id,student_id,student_name,date_test,heure,status,niveau_recommande)
  select pg_temp.id('legacy_test_'||i),pg_temp.id('legacy_'||i),'Synthetic legacy learner '||i,
   pg_temp.today()+case when i=3 then -1 else 1 end,'10:00','Planifié','A1' from generate_series(0,3) i;
 set local session_replication_role=origin;
 perform pg_temp.actor(3);
 -- Cancel through the learner command.
 t:=pg_temp.id('legacy_test_0');
 r:=pg_temp.edit(t,'{"status":"Annulé","cancel_reason":"Famille indisponible"}');
 perform pg_temp.ok((select status='Annulé' and cancel_reason='Famille indisponible' and niveau_recommande='A1' from public.placement_tests where id=t),
  'a future test with a stored level is cancelled through update_placement_test_result');
 -- Cancel through the CRM close path.
 t:=pg_temp.id('legacy_test_1');
 perform crm_security.cancel_planned_test(t,'Prospect fermé');
 perform pg_temp.ok((select status='Annulé' and cancel_reason='Prospect fermé' from public.placement_tests where id=t),
  'a future test with a stored level is cancelled through crm_security.cancel_planned_test');
 -- Move it; then a new level or a score before the start is still refused, through the command and the table.
 t:=pg_temp.id('legacy_test_2');
 r:=pg_temp.edit(t,jsonb_build_object('date_test',pg_temp.today()+2,'heure','11:00'));
 perform pg_temp.ok(r->'placement'->>'date_test'=(pg_temp.today()+2)::text and r->'placement'->>'heure'='11:00','a future test with a stored level is moved');
 perform pg_temp.denied(format($q$select pg_temp.edit(%L,'{"status":"Résultat saisi","niveau_recommande":"Intermediate 1"}')$q$,t),'22023','placement.result_before_start');
 perform pg_temp.denied(format($q$update public.placement_tests set niveau_recommande='A2' where id=%L$q$,t),'22023','placement.result_before_start');
 perform pg_temp.denied(format($q$update public.placement_tests set score=40 where id=%L$q$,t),'22023','placement.result_before_start');
 perform pg_temp.denied(format($q$update public.placement_tests set status='Absent' where id=%L$q$,t),'22023','placement.result_before_start');
 update public.placement_tests set notes='Keeping the stored level is no new result' where id=t;
 perform pg_temp.ok((select niveau_recommande='A1' and status='Planifié' from public.placement_tests where id=t),'the stored level stays, the test stays planned');
 -- After its start: « Absent » on a test with a stored level.
 t:=pg_temp.id('legacy_test_3');
 r:=pg_temp.edit(t,'{"status":"Absent"}');
 perform pg_temp.ok(r->'placement'->>'status'='Absent','« Absent » after the start on a test with a stored level');
end $$;
\echo PASS 4b a future planned test with a stored level: cancelled (command and CRM close), moved, absent after start; a new level or score before start refused

-- ===== 5. crm_update_placement_test (live 136 body + 141 rules).
do $$ declare l uuid; p uuid; q jsonb; r jsonb; begin
 perform pg_temp.actor(3);
 l:=(public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Synthetic adult prospect','learner_name','Synthetic adult prospect',
  'email','placement-rules-'||gen_random_uuid()||'@example.invalid','source_label','Manual','session_type','Adults'))->'lead'->>'id')::uuid;
 perform public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'channel','phone','result','spoke',
  'next',jsonb_build_object('task_type','center_visit','with_test',true,'due_at',((pg_temp.today()+3)+time '10:00') at time zone public.centre_utc_offset())));
 p:=(select placement_test_id from public.crm_tasks where id=crm_security.next_action_id(l));
 perform pg_temp.ok(p is not null,'the appointment carries a test');
 insert into ids values('crm_test',p);
 q:=jsonb_build_object('placement_id',p,'expected_updated_at',(select updated_at from public.placement_tests where id=p),'expected_version',(select version from public.crm_leads where id=l),
  'date_test',(select date_test from public.placement_tests where id=p),'heure',(select heure from public.placement_tests where id=p));
 perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q||'{"status":"Passé"}'),'22023','placement.passe_derived');
 perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q||'{"status":"Résultat saisi","niveau_recommande":"Beginning 2"}'),
  '22023','placement.result_before_start');
 -- After the start time (the test moves to yesterday): the level follows the prospect's programme.
 set local session_replication_role=replica;
 update public.placement_tests set date_test=pg_temp.today()-1 where id=p;
 set local session_replication_role=origin;
 q:=q||jsonb_build_object('expected_updated_at',(select updated_at from public.placement_tests where id=p),'date_test',pg_temp.today()-1);
 perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q||'{"status":"Résultat saisi","niveau_recommande":"Child 2"}'),
  '22023','placement.level_not_offered');
 r:=public.crm_update_placement_test(gen_random_uuid(),q||'{"status":"Résultat saisi","niveau_recommande":"Beginning 2","score":61}');
 perform pg_temp.ok((select status='Résultat saisi' and niveau_recommande='Beginning 2' from public.placement_tests where id=p),'a prospect''s result in its programme');
end $$;
\echo PASS 5 CRM test edit: Passé never chosen, result after start, level of the prospect programme

-- ===== 5b. A visit outcome when the linked test is set later than the visit: refused until
-- the test's start (the outcome marks the test « Passé »), with its own hint; nothing is
-- written; once the test's time has come, the same outcome is recorded.
do $$ declare l uuid; a uuid; p uuid; h text; m text; v integer; begin
 perform pg_temp.actor(3);
 l:=(public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Synthetic visit prospect','learner_name','Synthetic visit prospect',
  'email','placement-rules-'||gen_random_uuid()||'@example.invalid','source_label','Manual','session_type','Adults'))->'lead'->>'id')::uuid;
 perform public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'channel','phone','result','spoke',
  'next',jsonb_build_object('task_type','center_visit','with_test',true,'due_at',((pg_temp.today()+3)+time '10:00') at time zone public.centre_utc_offset())));
 a:=crm_security.next_action_id(l);
 p:=(select placement_test_id from public.crm_tasks where id=a);
 -- The visit's time has come (an hour ago); the test stays in three days.
 set local session_replication_role=replica;
 update public.crm_tasks set due_at=now()-interval '1 hour' where id=a;
 set local session_replication_role=origin;
 v:=(select version from public.crm_leads where id=l);
 begin
  perform public.crm_record_appointment_outcome(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',v,'action_id',a,'outcome_code','came_will_return'));
  raise exception 'FAIL: a visit outcome recorded before its linked test starts';
 exception when others then
  get stacked diagnostics h=pg_exception_hint, m=message_text;
  if h is distinct from 'placement.result_before_start' then raise; end if;
 end;
 perform pg_temp.ok(m='Le résultat se saisit après l’heure du test.','the refusal names the test''s start');
 perform pg_temp.ok((select version=v from public.crm_leads where id=l) and (select status='Planifié' from public.placement_tests where id=p)
  and crm_security.next_action_id(l)=a,'nothing written by the refused outcome');
 -- The test's time has come too: the same outcome is recorded and the test is « Passé ».
 set local session_replication_role=replica;
 update public.placement_tests set date_test=pg_temp.today()-1 where id=p;
 set local session_replication_role=origin;
 perform public.crm_record_appointment_outcome(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',v,'action_id',a,'outcome_code','came_will_return'));
 perform pg_temp.ok((select status='Passé' from public.placement_tests where id=p),'after the test''s start the outcome marks the test « Passé »');
end $$;
\echo PASS 5b visit outcome with a later linked test: refused until the test starts (hint placement.result_before_start), nothing written; recorded after

-- ===== 6. delete_placement_test.
do $$ declare p uuid:=pg_temp.past_test(pg_temp.id('other')); begin
 perform pg_temp.actor(3);
 perform pg_temp.denied(format('select public.delete_placement_test(%L,%L)',p,(select updated_at from public.placement_tests where id=p)),'42501');
 perform pg_temp.actor(2);
 perform pg_temp.denied(format('select public.delete_placement_test(%L,%L)',p,now()-interval '1 day'),'PT409');
 perform pg_temp.denied(format('select public.delete_placement_test(%L,%L)',pg_temp.id('crm_test'),(select updated_at from public.placement_tests where id=pg_temp.id('crm_test'))),
  '22023','placement.crm_use_prospect');
 perform public.delete_placement_test(p,(select updated_at from public.placement_tests where id=p));
 perform pg_temp.ok(not exists(select 1 from public.placement_tests where id=p),'admin deletes a learner''s own test');
 perform pg_temp.actor(1);
 p:=pg_temp.past_test(pg_temp.id('other'));
 perform public.delete_placement_test(p,(select updated_at from public.placement_tests where id=p));
 perform pg_temp.ok(not exists(select 1 from public.placement_tests where id=p),'director deletes too');
 perform pg_temp.denied(format($q$select public.update_placement_test_result(%L,now(),'{"notes":"x"}')$q$,pg_temp.id('crm_test')),'22023','placement.crm_use_prospect');
end $$;
\echo PASS 6 deletion: management only, learner tests only, stale refused

-- ===== 7. Age bounds (141 seed from the audience).
do $$ begin
 perform pg_temp.ok((select bool_and(pl.min_age=18 and pl.max_age is null) from public.programme_levels pl join public.programmes p on p.code=pl.programme_code where p.audience='adultes'),'adults: 18 and over');
 perform pg_temp.ok((select bool_and(pl.min_age is null and pl.max_age=17) from public.programme_levels pl join public.programmes p on p.code=pl.programme_code where p.audience in ('enfants','ados')),'children and teenagers: under 18');
 perform pg_temp.ok((select bool_and(pl.min_age is null and pl.max_age is null) from public.programme_levels pl join public.programmes p on p.code=pl.programme_code where p.audience='tous'),'open programmes: no bound');
 perform pg_temp.ok(academic_security.level_allowed('Adults','Beginning 1',30) and not academic_security.level_allowed('Adults','Beginning 1',15)
  and academic_security.level_allowed('Adults','Beginning 1',null) and academic_security.level_allowed(null,'Child 2',null)
  and not academic_security.level_allowed('Yearly','B1',9) and academic_security.level_allowed('Other','B1',70),'level_allowed by programme and age');
end $$;
\echo PASS 7 age bounds from the programme audience
rollback;
