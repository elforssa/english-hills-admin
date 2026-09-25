-- Phase 6 enrollment integration: synthetic local fixtures, fully rolled back.
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
 select jsonb_build_object('task_type',typ,'due_at',now()+interval '1 day')
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
 select jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),
 'date_test',((now() at time zone 'Africa/Casablanca')::date+2),'heure','10:30','examinateur','Examinatrice test','notes','Projet anglais',
 'task_id',(select id from public.crm_tasks where lead_id=l and status='open' and task_type='confirm_placement_test' order by due_at,id limit 1),
 'expected_task_version',(select version from public.crm_tasks where lead_id=l and status='open' and task_type='confirm_placement_test' order by due_at,id limit 1))
$$;
create function pg_temp.center_counts() returns jsonb language sql as $$
 select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.charges),(select count(*) from public.receipts))
$$;
create function pg_temp.start_data(l uuid) returns jsonb language sql as $$
 select jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),
 'student_choice','new','learner_name','Phase6 learner','birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2',
 'candidate_review',crm_security.candidate_token(l,'Phase6 learner','2014-05-10'),'confirm_new',true)
$$;
create function pg_temp.finances() returns jsonb language sql as $$ select jsonb_build_array((select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events)) $$;

do $$ declare l uuid:=pg_temp.qualified(); d jsonb:=pg_temp.start_data(l); key uuid:=gen_random_uuid(); r jsonb; e uuid; s uuid; counts jsonb:=pg_temp.finances(); ns bigint; ne bigint; a uuid; converted timestamptz; begin
 select count(*) into ns from students;select count(*) into ne from enrollments;
 execute 'set local role authenticated';
 r:=public.crm_start_enrollment(key,d);e:=(r->'enrollment'->>'id')::uuid;s:=(r->'enrollment'->>'student_id')::uuid;
 perform pg_temp.ok(public.crm_start_enrollment(key,d)=r,'exact request replay');
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',key,d||'{"notes":"changed"}'));
 execute 'reset role';
 perform pg_temp.ok((select count(*)=ns+1 from students) and (select count(*)=ne+1 from enrollments),'one explicit student and enrollment');
 perform pg_temp.ok(pg_temp.finances()=counts,'no finance at enrollment start');
 perform pg_temp.ok((select status='Prospect' and niveau_cefr='Child 2' and parent_email is null from students where id=s),'correct new Prospect student');
 perform pg_temp.ok((select student_id=s and enrollment_id=e and status='QUALIFIED' from crm_leads where id=l),'Submitted does not convert');
 perform pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open'),'one enrollment followup');
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),pg_temp.start_data(l)));
 update enrollments set status=null where id=e;
 perform pg_temp.ok((select status='QUALIFIED' from crm_leads where id=l),'NULL enrollment status never converts');
 update enrollments set status='Under Review' where id=e;
 perform pg_temp.ok((select status='QUALIFIED' from crm_leads where id=l),'Under Review does not convert');
 update students set status='Enrolled' where id=s;
 perform pg_temp.ok((select status='QUALIFIED' from crm_leads where id=l),'student status does not convert');
 perform pg_temp.actor(2);execute 'set local role authenticated';update enrollments set status='Confirmed' where id=e;execute 'reset role';
 select conversion_activity_id,converted_at into a,converted from crm_leads where id=l;
 perform pg_temp.ok((select status='CONVERTED' and not conversion_review_required from crm_leads where id=l),'admin center workflow converts');
 perform pg_temp.ok((select event_type='lead_converted' and enrollment_id=e and attribution_submission_id=(select first_submission_id from crm_leads where id=l) from crm_activities where id=a),'trusted first-touch evidence');
 perform pg_temp.ok(not exists(select 1 from crm_tasks where lead_id=l and status='open'),'conversion cancels all sales tasks');
 insert into groups(id,name,session_type,niveau) values('84000000-0000-0000-0000-000000000001','Phase6 child group','Yearly','Child 2');
 update enrollments set group_id='84000000-0000-0000-0000-000000000001' where id=e;
 update enrollments set status='Validated',notes='Again' where id=e;
 perform pg_temp.ok((select status='Validated' from enrollments where id=e),'Confirmed plus group validation retained');
 perform pg_temp.ok((select conversion_activity_id=a and converted_at=converted from crm_leads where id=l),'conversion timestamp and activity once');
 perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='lead_converted'),'exactly one conversion');
 update enrollments set status='Rejected' where id=e;
 update enrollments set status='Rejected',notes='Repeated' where id=e;
 perform pg_temp.ok((select status='CONVERTED' and conversion_review_required and conversion_activity_id=a from crm_leads where id=l),'downgrade preserves conversion and requests review');
 perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='conversion_review_required'),'one review per actual downgrade');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.crm_get_today(100)->'needs_attention')x where x->>'id'=l::text),'converted not sales queue');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(public.crm_search_leads('Phase6',null,null,100,0)->'rows')x where x->>'id'=l::text) is false,'search uses CRM learner, not student rename');
 perform pg_temp.denied(format('update crm_leads set enrollment_id=null where id=%L',l),'42501');
 perform pg_temp.denied(format('delete from crm_activities where id=%L',a),'42501');
 perform pg_temp.ok(pg_temp.finances()=counts,'confirmation itself does not create finance');
 perform pg_temp.actor(3);
end $$;

do $$ declare l uuid; r jsonb; d jsonb; e uuid; s uuid; other uuid; before_students bigint; candidate jsonb; counts jsonb:=pg_temp.finances(); begin
 insert into students(full_name,date_naissance,telephone,status,session_type) values('Sibling A','2013-01-01','0612345678','Prospect','Yearly') returning id into s;
 insert into students(full_name,date_naissance,telephone,status,session_type) values('Sibling B','2015-01-01','0612345678','Prospect','Yearly') returning id into other;
 l:=pg_temp.qualified();candidate:=public.crm_find_student_candidates(l,'Sibling A','2013-01-01');
 perform pg_temp.ok((candidate->>'total')::int>=2,'shared phone surfaces siblings without selecting');
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),pg_temp.start_data(l)||'{"confirm_new":false}'));
 select count(*) into before_students from students;
 d:=pg_temp.start_data(l)-array['candidate_review','confirm_new'];d:=d||jsonb_build_object('student_choice','existing','student_id',other);
 r:=public.crm_start_enrollment(gen_random_uuid(),d);e:=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.ok((select count(*)=before_students from students) and (select student_id=other from crm_leads where id=l),'explicit sibling selected; no merge or new student');
 l:=pg_temp.qualified();d:=pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',other);
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d));
 perform pg_temp.ok((public.crm_find_enrollment_candidates(other,'Yearly','2026/2027')->>'total')::int=1,'existing enrollment is offered');
 update enrollments set status=null where id=e;
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d));
 perform pg_temp.ok((select count(*)=1 from enrollments where student_id=other),'unknown legacy status cannot allow a duplicate enrollment');
 update enrollments set status='Submitted' where id=e;
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d||jsonb_build_object('enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from enrollments where id=e))));
 -- A genuinely separate enrollment exists before CRM linkage.
 insert into enrollments(student_id,status,session_type,school_year,level) values(s,'Confirmed','Yearly','2026/2027','Child 2') returning id into e;
 d:=pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',s,'enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from enrollments where id=e));
 r:=public.crm_start_enrollment(gen_random_uuid(),d);
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'already confirmed links and converts immediately');
 perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='lead_converted'),'one already-confirmed evidence');
 l:=pg_temp.qualified();d:=pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',s,'enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from enrollments where id=e));
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d));
 -- Explicitly chosen Validated enrollment, with matching group.
 insert into enrollments(student_id,status,session_type,school_year,level,group_id) values(s,'Validated','Yearly','2027/2028','Child 2','84000000-0000-0000-0000-000000000001') returning id into e;
 d:=d||jsonb_build_object('enrollment_id',e,'school_year','2027/2028','expected_enrollment_updated_at',(select updated_at from enrollments where id=e));
 r:=public.crm_start_enrollment(gen_random_uuid(),d);perform pg_temp.ok(r->'lead'->>'status'='CONVERTED','direct Validated existing link converts');
 -- Same-name different DOB never auto-merges.
 insert into students(full_name,date_naissance,status) values('Phase6 learner','2010-01-01','Prospect');
 l:=pg_temp.qualified();candidate:=public.crm_find_student_candidates(l,'Phase6 learner','2014-05-10');
 perform pg_temp.ok((candidate->>'total')::int>0,'same-name different DOB is a candidate requiring choice');
 d:=pg_temp.start_data(l);insert into students(full_name,status) values('Phase6 learner','Prospect');
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d),'40001');
 -- Archived records and mismatched enrollment identities are denied.
 update students set deleted_at=now() where id=other;
 d:=pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',other);
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d));
 perform pg_temp.ok(pg_temp.finances()=counts,'existing and new paths have no finance');
end $$;

do $$ declare l uuid; d jsonb; r jsonb; e uuid; s uuid; state text; a uuid; begin
 foreach state in array array['LOST','NOT_QUALIFIED'] loop
  l:=pg_temp.qualified();r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));e:=(r->'enrollment'->>'id')::uuid;
  perform pg_temp.act(case when state='LOST' then 'close_lost' else 'close_not_qualified' end,l,jsonb_build_object('reason',case when state='LOST' then 'price' else 'outside_scope' end));
  select id into a from crm_activities where lead_id=l and event_type=case when state='LOST' then 'lead_lost' else 'lead_not_qualified' end;
  update enrollments set status='Confirmed' where id=e;
  perform pg_temp.ok((select status='CONVERTED' and conversion_review_required and closed_at is null and closure_reason is null from crm_leads where id=l),'closed lead real enrollment wins');
  perform pg_temp.ok(exists(select 1 from crm_activities where id=a),'historical closure preserved');
  perform pg_temp.ok(not exists(select 1 from crm_tasks where lead_id=l and status='open'),'closed-converted has no open tasks');
  perform pg_temp.ok(not(public.crm_get_workspace_detail(l)->>'conversion_review_required')::boolean,'review flag hidden from receptionist');
  perform pg_temp.actor(1);perform pg_temp.ok((public.crm_get_workspace_detail(l)->>'conversion_review_required')::boolean,'director sees review flag');perform pg_temp.actor(3);
 end loop;
 -- Trial respects existing group rules and never converts.
 l:=pg_temp.qualified();d:=pg_temp.start_data(l)||'{"initial_status":"Trial"}';
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d));
 r:=public.crm_start_enrollment(gen_random_uuid(),d||'{"group_id":"84000000-0000-0000-0000-000000000001"}');
 perform pg_temp.ok(r->'lead'->>'status'='QUALIFIED' and r->'enrollment'->>'status'='Trial','Trial is not conversion');
 perform pg_temp.ok((select status='Trial' from students where id=(r->'enrollment'->>'student_id')::uuid),'Trial student follows existing sync');
 -- No need for auth.uid during legitimate system confirmation/task cleanup.
 perform set_config('request.jwt.claim.sub','',true);update enrollments set status='Confirmed' where id=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'system confirmation works');perform pg_temp.actor(3);
end $$;

do $$ declare l uuid; d jsonb; r jsonb; e uuid; s uuid; p uuid; state text; fn regprocedure; begin
 foreach state in array array['NEW','ENGAGED','LOST','NOT_QUALIFIED'] loop
  l:=pg_temp.intake();
  if state='ENGAGED' then perform pg_temp.act('record_conversation',l,jsonb_build_object('channel','phone','note','Conversation','next_task',pg_temp.next_task()));
  elsif state='LOST' then perform pg_temp.act('close_lost',l,'{"reason":"price"}');
  elsif state='NOT_QUALIFIED' then perform pg_temp.act('close_not_qualified',l,'{"reason":"outside_scope"}');end if;
  perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),pg_temp.start_data(l)));
 end loop;
 l:=pg_temp.qualified();d:=pg_temp.start_data(l);
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d||'{"initial_status":"Confirmed"}'),'42501');
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d||'{"initial_status":"Validated"}'),'42501');
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d||'{"school_year":"2026/2030"}'));
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d||'{"session_type":"Adults","level":"Child 2"}'));
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d||'{"session_type":"Adults","level":"Beginning 1","group_id":"84000000-0000-0000-0000-000000000001"}'));
 for i in 4..7 loop
  perform pg_temp.actor(i);execute 'set local role authenticated';
  perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),d),'42501');
  perform pg_temp.denied(format('select public.crm_find_student_candidates(%L,''Name'')',l),'42501');
  execute 'reset role';
 end loop;
 perform pg_temp.actor(3);execute 'set local role authenticated';
 perform pg_temp.denied(format('update crm_leads set student_id=gen_random_uuid() where id=%L',l),'42501');
 execute 'reset role';
 -- Placement result is optional; when present it remains linked and unchanged.
 p:=(public.crm_book_placement_test(gen_random_uuid(),pg_temp.booking(l))->'placement'->>'id')::uuid;
 update placement_tests set status='Résultat saisi',niveau_recommande='Child 2' where id=p;
 perform pg_temp.ok(public.crm_get_enrollment_context(l)->>'recommended_level'='Child 2','trusted placement result available for prefill');
 r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));e:=(r->'enrollment'->>'id')::uuid;s:=(r->'enrollment'->>'student_id')::uuid;
 perform pg_temp.ok((select crm_lead_id=l and student_id is null and niveau_recommande='Child 2' from placement_tests where id=p),'placement lineage preserved; nullable student deliberately unchanged');
 -- Existing financial RPC remains the only financial writer; enrollment transition is the signal.
 perform pg_temp.actor(1);
 alter table public.receipts disable trigger on_receipt_created;
 r:=public.create_charge_payment(jsonb_build_object('student_id',s,'session_type','Other','school_year','2026/2027',
  'service_detail','Synthetic non-tuition service','gross_amount',100,'payment_amount',10,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 perform pg_temp.ok((select status='QUALIFIED' from crm_leads where id=l) and (select status='Submitted' from enrollments where id=e),'receipt and student Enrolled alone do not convert');
 r:=public.create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'session_type','Yearly','school_year','2026/2027',
  'plan_type','Standard','gross_amount',1000,'payment_amount',100,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'payment-driven enrollment confirmation converts');
 perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='lead_converted'),'payment conversion once');
 perform pg_temp.ok(not exists(select 1 from crm_activities where lead_id=l and (receipt_id is not null or financial_event_id is not null)),'no revenue attribution');
 alter table public.receipts enable trigger on_receipt_created;
 foreach fn in array array['public.crm_start_enrollment(uuid,jsonb)'::regprocedure,'public.crm_find_student_candidates(uuid,text,date,integer,integer)'::regprocedure,'public.crm_find_enrollment_candidates(uuid,text,text,integer,integer)'::regprocedure,'public.crm_enrollment_groups(text,text,integer,integer)'::regprocedure,'public.crm_get_enrollment_context(uuid)'::regprocedure] loop
  perform pg_temp.ok((select prosecdef and proconfig=array['search_path=pg_catalog, pg_temp'] from pg_proc where oid=fn),'pinned definer '||fn);
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute') and not has_function_privilege('service_role',fn,'execute'),'RPC grants '||fn);
 end loop;
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.evaluate_conversion(uuid,timestamptz,text,text)','execute'),'conversion evaluator private');
end $$;
-- Payment intent safeguard: rejected commands must undo ALL inner writes.
do $$ declare l uuid:=pg_temp.qualified(); r jsonb; d jsonb; e uuid; s uuid; b uuid; before_rows jsonb; before_student jsonb; key uuid:=gen_random_uuid(); begin
 r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));e:=(r->'enrollment'->>'id')::uuid;s:=(r->'enrollment'->>'student_id')::uuid;
 perform pg_temp.actor(1);
 alter table public.receipts disable trigger on_receipt_created;
 d:=jsonb_build_object('student_id',s,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1000,'payment_amount',100,'payment_method','Espèces','idempotency_key',key);
 select jsonb_build_array(pg_temp.finances(),(select count(*) from enrollments),(select count(*) from financial_requests)) into before_rows;
 select to_jsonb(x) into before_student from students x where id=s;
 execute 'set local role authenticated';
 perform pg_temp.denied(format('select public.create_charge_payment(%L)',d));
 execute 'reset role';
 perform pg_temp.ok(before_rows=jsonb_build_array(pg_temp.finances(),(select count(*) from enrollments),(select count(*) from financial_requests)),'omitted enrollment rejects without partial finance/enrollment/request writes');
 perform pg_temp.ok(before_student=(select to_jsonb(x) from students x where id=s),'rejected payment preserves entire student');
 perform pg_temp.ok((select enrollment_id=e and status='QUALIFIED' from crm_leads where id=l),'rejected payment preserves canonical link');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(public.receipt_enrollment_candidates(s)) x where x->>'id'=e::text and (x->>'crm_linked')::boolean),'receipt safe CRM marker');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.receipt_enrollment_candidates(s)) x where x ?| array['crm_lead_id','campaign_id','attribution','phone','email']),'receipt candidate contains no marketing/contact secrets');
 -- Historical unlinked charge with unknown year must also require selection.
 insert into charges(student_id,session_type,service_description,plan_type,gross_amount,created_by)
 values(s,'Yearly','Synthetic unknown-year charge','Standard',1000,auth.uid()) returning id into b;
 select jsonb_build_array(pg_temp.finances(),(select count(*) from enrollments)) into before_rows;
 perform pg_temp.denied(format('select public.create_charge_payment(%L)',d||jsonb_build_object('charge_id',b,'idempotency_key',gen_random_uuid())));
 perform pg_temp.ok(before_rows=jsonb_build_array(pg_temp.finances(),(select count(*) from enrollments)),'unknown-year charge cannot bypass CRM intent protection');
 -- Explicit different program and explicit same-program history are legitimate.
 foreach b in array array[gen_random_uuid(),gen_random_uuid()] loop
  insert into enrollments(id,student_id,status,session_type,school_year) values(b,s,'Submitted','Adults','2027/2028');
  r:=public.create_charge_payment(d||jsonb_build_object('session_type','Adults','school_year','2027/2028','plan_type',null,'enrollment_id',b,'idempotency_key',gen_random_uuid()));
  perform pg_temp.ok((r->>'enrollment_id')::uuid=b and (select status='QUALIFIED' and enrollment_id=e from crm_leads where id=l),'explicit unrelated enrollment does not convert or relink A');
 end loop;
 insert into enrollments(student_id,status,session_type,school_year) values(s,'Submitted','Yearly','2026/2027') returning id into b;
 r:=public.create_charge_payment(d||jsonb_build_object('enrollment_id',b,'idempotency_key',gen_random_uuid()));
 perform pg_temp.ok((r->>'enrollment_id')::uuid=b and (select status='QUALIFIED' from crm_leads where id=l),'explicit same-program separate enrollment allowed without converting A');
 -- Zero CRM intent in another year preserves implicit creation.
 r:=public.create_charge_payment(d||jsonb_build_object('school_year','2028/2029','idempotency_key',gen_random_uuid()));
 perform pg_temp.ok((r->>'enrollment_id')::uuid<>e and (select status='QUALIFIED' from crm_leads where id=l),'unrelated year implicit enrollment unchanged');
 -- Correct explicit A and identical retry preserve financial idempotency.
 d:=d||jsonb_build_object('enrollment_id',e);
 r:=public.create_charge_payment(d);
 select jsonb_build_array(pg_temp.finances(),(select count(*) from enrollments)) into before_rows;
 perform pg_temp.ok((public.create_charge_payment(d)->>'replayed')::boolean,'financial retry remains idempotent');
 perform pg_temp.ok(before_rows=jsonb_build_array(pg_temp.finances(),(select count(*) from enrollments)),'retry creates no extra money or enrollment');
 perform pg_temp.ok((r->>'enrollment_id')::uuid=e and (select status='CONVERTED' from crm_leads where id=l),'explicit payment confirms canonical enrollment');
 perform pg_temp.ok((select count(*)=1 from crm_activities where lead_id=l and event_type='lead_converted'),'explicit payment conversion exactly once');
 perform pg_temp.denied(format('select public.create_charge_payment(%L)',d||jsonb_build_object('enrollment_id',b)),'P0001');
 -- Ambiguous existing CRM intents also require explicit selection.
 perform pg_temp.actor(3);l:=pg_temp.qualified();
 r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',s,'enrollment_id',b,'expected_enrollment_updated_at',(select updated_at from enrollments where id=b)));
 perform pg_temp.actor(1);
 perform pg_temp.denied(format('select public.create_charge_payment(%L)',d-'enrollment_id'||jsonb_build_object('idempotency_key',gen_random_uuid())));
 -- Receipt-only helper cannot broaden receptionist/other role access.
 for i in 3..7 loop
  perform pg_temp.actor(i);execute 'set local role authenticated';
  perform pg_temp.denied(format('select public.receipt_enrollment_candidates(%L)',s),'42501');execute 'reset role';
 end loop;
 perform pg_temp.actor(3);
 alter table public.receipts enable trigger on_receipt_created;
end $$;

-- Additional authority, reconciliation and identity boundary checks.
do $$ declare l uuid; r jsonb; e uuid; first_student uuid; second_student uuid; before_count bigint; begin
 for i in 1..3 loop
  perform pg_temp.actor(i);l:=pg_temp.qualified();
  perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '2 days')));
  perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '3 days')));
  r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));
  perform pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=l and task_type='enrollment_followup' and status='open'),'one reconciled enrollment followup for each operational role');
  perform pg_temp.ok(not(r->'enrollment' ?| array['charges','receipts','balance','financial_events','attribution','documents_urls']),'safe enrollment summary');
 end loop;
 perform pg_temp.actor(3);
 first_student:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.denied(format('select public.save_receptionist_enrollment(%L,%L,null,''Confirmed'')',first_student,e),'42501');
 insert into students(full_name,status,session_type) values('Wrong learner','Prospect','Yearly') returning id into second_student;
 l:=pg_temp.qualified();
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',second_student,'enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from enrollments where id=e))));
 perform pg_temp.denied(format('select public.crm_start_enrollment(%L,%L)',gen_random_uuid(),pg_temp.start_data(l)||'{"role":"director"}'));
end $$;
set constraints all immediate;
rollback;
\echo PASS Phase 6 enrollment initiation, identity decisions, trusted conversion, downgrade/closure, tasks, placement, finance and security
