-- Phase 7 synthetic financial evidence. Local only; all changes roll back.
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

alter table public.receipts disable trigger on_receipt_created;
create function pg_temp.flush_revenue() returns void language plpgsql as $$ begin
 set constraints all immediate;
 set constraints all deferred;
end $$;
create function pg_temp.pay(s uuid,e uuid,amount numeric default 500,charge uuid default null) returns jsonb language plpgsql as $$ begin
 perform pg_temp.actor(1);
 return public.create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'charge_id',charge,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',amount,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
end $$;
create function pg_temp.revenue(l uuid) returns numeric language sql as $$ select coalesce(sum(amount_delta),0) from crm_revenue_entries where lead_id=l $$;

-- Future payments, installments, first touch, multiple charges, actual void/delete.
do $$ declare l uuid:=pg_temp.qualified(); r jsonb; s uuid;e uuid;c uuid; receipt uuid; second uuid; first_touch uuid; submission uuid:=gen_random_uuid(); entries bigint; converted timestamptz; begin
 r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));s:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
 select first_submission_id into first_touch from crm_leads where id=l;
 insert into crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash)
 values(submission,'manual',now()+interval '1 second',now()+interval '1 second','server','{}','[]','Later submission','needs_review',repeat('e',64));
 perform crm_security.resolve_submission(l,submission,(select version from crm_leads where id=l),gen_random_uuid());
 perform pg_temp.ok((select latest_submission_id=submission and first_submission_id=first_touch from crm_leads where id=l),'distinct latest touch');
 r:=pg_temp.pay(s,e);c:=(r->>'charge_id')::uuid;receipt:=(r->>'receipt_id')::uuid;
 perform pg_temp.ok(pg_temp.revenue(l)=0,'event trigger waits until final financial links');
 perform pg_temp.flush_revenue();
 perform pg_temp.ok(pg_temp.revenue(l)=500,'first installment attributed automatically at transaction end');
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l),'conversion still enrollment governed');
 select converted_at into converted from crm_leads where id=l;
 r:=pg_temp.pay(s,e,500,c);second:=(r->>'receipt_id')::uuid;perform pg_temp.flush_revenue();
 r:=pg_temp.pay(s,e,500,c);perform pg_temp.flush_revenue();
 perform pg_temp.ok(pg_temp.revenue(l)=1500,'three independent installments, not charge total');
 perform pg_temp.ok((select bool_and(attribution_submission_id=first_touch and currency='MAD') from crm_revenue_entries where lead_id=l),'frozen first touch, explicit currency');
 perform pg_temp.ok((select bool_and(x.effective_at=f.created_at and x.receipt_business_date=r.date) from crm_revenue_entries x join financial_events f on f.id=x.financial_event_id join receipts r on r.id=x.receipt_id where x.lead_id=l),'trusted event time and separate receipt business date');
 select count(*) into entries from crm_revenue_entries;
 perform public.crm_reconcile_receipt_revenue(receipt);perform public.crm_reconcile_receipt_revenue(receipt);
 perform pg_temp.ok((select count(*)=entries from crm_revenue_entries),'repeated event reconciliation no duplicate');
 perform public.void_financial_receipt(second,'Synthetic reversal',gen_random_uuid());perform pg_temp.flush_revenue();
 perform pg_temp.ok(pg_temp.revenue(l)=1000,'one installment reversal');
 perform pg_temp.ok((select converted_at=converted and status='CONVERTED' from crm_leads where id=l),'reversal never un-converts');
 -- Separate charge for same enrollment, then void + deletion + additional charge event.
 r:=pg_temp.pay(s,e,1500);receipt:=(r->>'receipt_id')::uuid;perform pg_temp.flush_revenue();
 perform pg_temp.ok(pg_temp.revenue(l)=2500,'multiple charges independent');
 perform public.void_financial_receipt(receipt,'Synthetic void',gen_random_uuid());perform pg_temp.flush_revenue();
 perform public.delete_mistaken_receipt(receipt,'Synthetic mistaken receipt',gen_random_uuid());perform pg_temp.flush_revenue();
 perform pg_temp.ok(pg_temp.revenue(l)=1000,'void then deletion does not double subtract');
 perform pg_temp.ok((select count(*)=3 and sum(amount_delta)=0 and count(*) filter(where amount_delta=0)=1 from crm_revenue_entries where receipt_id=receipt),'zero delta marks later correction processed');
 perform pg_temp.ok(not exists(select 1 from financial_events f where f.receipt_id=receipt and f.event_type in ('payment_recorded','payment_voided') and not exists(select 1 from crm_revenue_entries x where x.financial_event_id=f.id)),'zero correction not pending forever');
 perform pg_temp.ok((public.crm_get_revenue_entries_for_lead(l)->>'recognized')::numeric=1000,'director technical read');
 perform pg_temp.ok(not exists(select 1 from crm_activities where lead_id=l and (receipt_id is not null or financial_event_id is not null)),'no operational timeline finance leakage');
end $$;

-- Unattributed money remains discoverable; a delayed explicit link catches it.
do $$ declare s uuid;e uuid;b uuid;l uuid;other uuid;r jsonb;receipt uuid; begin
 insert into students(full_name,status,session_type) values('Phase7 delayed learner','Prospect','Yearly') returning id into s;
 insert into enrollments(student_id,status,session_type,school_year) values(s,'Submitted','Yearly','2026/2027') returning id into e;
 r:=pg_temp.pay(s,e,1000);receipt:=(r->>'receipt_id')::uuid;perform pg_temp.flush_revenue();
 perform pg_temp.ok(not exists(select 1 from crm_revenue_entries where receipt_id=receipt),'no enrollment CRM link means no attribution');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(public.crm_get_revenue_reconciliation_queue(100)) x where x->>'receipt_id'=receipt::text and x->>'status'='unattributed'),'old unlinked financial event discoverable');
 l:=pg_temp.qualified();r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l)||jsonb_build_object('student_choice','existing','student_id',s,'enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from enrollments where id=e)));
 perform pg_temp.flush_revenue();perform pg_temp.ok(pg_temp.revenue(l)=1000,'delayed enrollment link automatically reconciles older money');
 insert into enrollments(student_id,status,session_type,school_year) values(s,'Submitted','Yearly','2026/2027') returning id into b;
 r:=pg_temp.pay(s,b,500);receipt:=(r->>'receipt_id')::uuid;perform pg_temp.flush_revenue();
 perform pg_temp.ok(pg_temp.revenue(l)=1000 and not exists(select 1 from crm_revenue_entries where receipt_id=receipt),'same student different enrollment never guesses');
 other:=pg_temp.qualified();r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(other)||jsonb_build_object('student_choice','existing','student_id',s,'enrollment_id',b,'expected_enrollment_updated_at',(select updated_at from enrollments where id=b)));
 perform pg_temp.flush_revenue();perform pg_temp.ok(pg_temp.revenue(l)=1000 and pg_temp.revenue(other)=500,'two same-student opportunities have independent explicit revenue');
end $$;

-- Trusted inner finance can record money before enrollment confirmation. The
-- fixture completes explicit financial links without promoting the enrollment.
do $$ declare l uuid:=pg_temp.qualified();r jsonb;s uuid;e uuid;b uuid;receipt uuid;c uuid;event uuid;state jsonb; begin
 r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));s:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.actor(1);
 r:=public.create_charge_payment_financial(jsonb_build_object('student_id',s,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',1000,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 receipt:=(r->>'receipt_id')::uuid;c:=(r->>'charge_id')::uuid;
 perform pg_temp.flush_revenue();perform pg_temp.ok(pg_temp.revenue(l)=0,'missing legacy links do not infer from student');
 update receipts set enrollment_id=e where id=receipt;
 perform pg_temp.ok(public.crm_reconcile_receipt_revenue(receipt)->>'status'='missing_links','missing charge enrollment stays unattributed');
 insert into enrollments(student_id,status,session_type,school_year) values(s,'Submitted','Adults','2027/2028') returning id into b;
 update charges set enrollment_id=b where id=c;
 perform pg_temp.ok(public.crm_reconcile_receipt_revenue(receipt)->>'status'='review_financial_identity','conflicting financial links require review');
 update charges set enrollment_id=e where id=c;
 select jsonb_build_array((select status from crm_leads where id=l),(select status from students where id=s),(select status from enrollments where id=e)) into state;
 perform public.crm_reconcile_revenue_batch(100);
 perform pg_temp.ok(pg_temp.revenue(l)=1000 and (select status='QUALIFIED' from crm_leads where id=l),'money before conversion attributable independently');
 perform pg_temp.ok(state=jsonb_build_array((select status from crm_leads where id=l),(select status from students where id=s),(select status from enrollments where id=e)),'reconciliation never changes lifecycle/student/enrollment');
 update enrollments set status='Confirmed' where id=e;perform pg_temp.flush_revenue();
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l) and pg_temp.revenue(l)=1000,'confirmation converts separately');
 -- Existing attributed evidence cannot silently move to another enrollment.
 update receipts set enrollment_id=b where id=receipt;update charges set enrollment_id=b where id=c;
 perform pg_temp.ok(public.crm_reconcile_receipt_revenue(receipt)->>'status'='review_frozen_attribution','no automatic reassignment to unrelated enrollment');
 perform pg_temp.ok(pg_temp.revenue(l)=1000,'frozen ledger survives inconsistent source edit for review');
 update receipts set enrollment_id=e where id=receipt;update charges set enrollment_id=e where id=c;
 update crm_leads set merged_into_lead_id=(select id from crm_leads where id<>l limit 1) where id=l;
 perform pg_temp.ok(public.crm_reconcile_receipt_revenue(receipt)->>'status'='review_crm_identity','merged opportunity requires review without rewriting evidence');
 update crm_leads set merged_into_lead_id=null where id=l;
 -- Event/charge inconsistency is reviewable, not a second attribution.
 insert into financial_events(event_type,receipt_id,actor_id) values('payment_voided',receipt,auth.uid()) returning id into event;
 perform pg_temp.flush_revenue();
 perform pg_temp.ok(not exists(select 1 from crm_revenue_entries where financial_event_id=event),'mismatched event charge not attributed');
end $$;

-- Confirmation is independent of money.
do $$ declare l uuid:=pg_temp.qualified();r jsonb;begin
 r:=public.crm_start_enrollment(gen_random_uuid(),pg_temp.start_data(l));
 update enrollments set status='Confirmed' where id=(r->'enrollment'->>'id')::uuid;
 perform pg_temp.flush_revenue();
 perform pg_temp.ok((select status='CONVERTED' from crm_leads where id=l) and pg_temp.revenue(l)=0,'converted with zero revenue is legitimate');
end $$;

-- Append-only and complete role boundary; no browser direct read or write.
do $$ declare i integer;entry uuid;receipt uuid;lead uuid;begin
 select id,receipt_id,lead_id into entry,receipt,lead from crm_revenue_entries limit 1;
 perform pg_temp.denied(format('update crm_revenue_entries set amount_delta=0 where id=%L',entry),'42501');
 perform pg_temp.denied(format('delete from crm_revenue_entries where id=%L',entry),'42501');
 perform pg_temp.denied('truncate crm_revenue_entries','42501');
 for i in 1..7 loop
  perform pg_temp.actor(i);execute 'set local role authenticated';
  perform pg_temp.denied('select * from crm_revenue_entries','42501');
  perform pg_temp.denied('insert into crm_revenue_entries default values','42501');
  perform pg_temp.denied('update crm_revenue_entries set amount_delta=0','42501');
  perform pg_temp.denied('delete from crm_revenue_entries','42501');
  perform pg_temp.denied('truncate crm_revenue_entries','42501');
  if i=1 then perform public.crm_get_revenue_entries_for_lead(lead);perform public.crm_reconcile_receipt_revenue(receipt);
  else
   perform pg_temp.denied(format('select public.crm_get_revenue_entries_for_lead(%L)',lead),'42501');
   perform pg_temp.denied(format('select public.crm_reconcile_receipt_revenue(%L)',receipt),'42501');
   perform pg_temp.denied('select public.crm_reconcile_revenue_batch()','42501');
   perform pg_temp.denied('select public.crm_get_revenue_reconciliation_queue()','42501');
  end if;
  execute 'reset role';
 end loop;
 perform pg_temp.ok(not has_function_privilege('anon','public.crm_reconcile_receipt_revenue(uuid)','execute') and not has_function_privilege('service_role','public.crm_reconcile_receipt_revenue(uuid)','execute'),'no anon/service-only RPC');
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.reconcile_receipt_revenue(uuid)','execute'),'private helper inaccessible');
 perform pg_temp.ok((select relrowsecurity from pg_class where oid='crm_revenue_entries'::regclass),'ledger RLS enabled');
end $$;
set constraints all immediate;
rollback;
\echo PASS Phase 7 attribution, installments, void/delete, delayed links, frozen first touch, no lifecycle inference and security
