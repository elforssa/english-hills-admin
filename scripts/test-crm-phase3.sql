-- Local only. Synthetic fixtures and policies are rolled back.
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
select pg_temp.ok((select version=1 and created_by=auth.uid() and stale_contacting_minutes=2880 and first_contact_sla_minutes=15 and post_test_sla_minutes=120 from public.crm_followup_policies where id=(select id from phase3_policy)),'first real-schedule policy');
do $$ declare p public.crm_followup_policies%rowtype; h jsonb; v jsonb; before_count integer; i integer; begin
 select * into p from public.crm_followup_policies where id=(select id from phase3_policy);
 for i in 2..3 loop
  perform pg_temp.actor(i);
  perform pg_temp.denied(format('select public.crm_create_followup_policy(gen_random_uuid(),%L::jsonb)',jsonb_build_object('weekly_hours',p.weekly_hours)),'42501');
 end loop;
 perform pg_temp.actor(1);
 foreach h in array array[
  jsonb_set(p.weekly_hours,'{2}','[["10:00","12:30"],["12:00","20:00"]]'),
  jsonb_set(p.weekly_hours,'{2}','[["20:00","10:00"]]'),
  jsonb_set(p.weekly_hours,'{2}','[["25:00","26:00"]]'),
  jsonb_set(p.weekly_hours,'{2}','[[null,"20:00"]]')
 ] loop
  perform pg_temp.denied(format('select public.crm_create_followup_policy(gen_random_uuid(),%L::jsonb)',jsonb_build_object('weekly_hours',h)));
 end loop;
 perform pg_temp.denied(format('select public.crm_create_followup_policy(gen_random_uuid(),%L::jsonb)',jsonb_build_object('weekly_hours',p.weekly_hours,'timezone','UTC')));
 perform pg_temp.denied(format('select public.crm_create_followup_policy(gen_random_uuid(),%L::jsonb)',jsonb_build_object('weekly_hours',p.weekly_hours,'attempt_offsets',jsonb_build_array(0,0,1))));
 perform pg_temp.denied('update public.crm_followup_policies set weekly_hours=''{}''','42501');
end $$;
\echo PASS director policy bootstrap, schedule validation, role denial and immutable publication

-- Expected local-clock results: calendar arithmetic, including Casablanca DST.
do $$ declare p uuid:=(select id from phase3_policy); item record; got timestamptz; raw text; begin
 for item in select * from (values
 ('2026-09-21 16:00','2026-09-21 16:00'),
 ('2026-09-21 20:00','2026-09-22 10:00'),
 ('2026-09-22 10:15','2026-09-22 10:15'),
 ('2026-09-22 12:30','2026-09-22 15:20'),
 ('2026-09-22 14:00','2026-09-22 15:20'),
 ('2026-09-22 19:00','2026-09-22 19:00'),
 ('2026-09-26 20:01','2026-09-28 15:00'),
 ('2026-09-27 11:00','2026-09-28 15:00'),
 ('2026-02-15 10:00','2026-02-16 15:00')) v(input,expected) loop
  got:=crm_security.next_window(p,item.input::timestamp at time zone 'Africa/Casablanca');
  perform pg_temp.ok(got=item.expected::timestamp at time zone 'Africa/Casablanca','window '||item.input);
 end loop;
 got:=crm_security.attempt_due(p,'2026-09-21',2,'2026-09-21 15:15 Africa/Casablanca','2026-09-21 15:15 Africa/Casablanca');
 perform pg_temp.ok(got='2026-09-21 18:15 Africa/Casablanca'::timestamptz,'180 minute first day gap');
 got:=crm_security.attempt_due(p,'2026-09-21',2,'2026-09-21 18:15 Africa/Casablanca','2026-09-21 18:15 Africa/Casablanca');
 perform pg_temp.ok(got='2026-09-22 10:00 Africa/Casablanca'::timestamptz,'late day-one roll forward');
 got:=crm_security.attempt_due(p,'2026-09-21',3,'2026-09-25 18:30 Africa/Casablanca','2026-09-25 18:30 Africa/Casablanca');
 perform pg_temp.ok(got='2026-09-26 10:00 Africa/Casablanca'::timestamptz,'late attempt no catchup burst');
 foreach raw in array array['0612345678','612345678','+212612345678','00212612345678','06 12-34.56(78)'] loop
  perform pg_temp.ok(crm_security.normalize_phone(raw)='+212612345678','phone vector '||raw);
 end loop;
 perform pg_temp.ok(crm_security.normalize_phone('+33612345678')='+33612345678','preserve international');
 perform pg_temp.ok(crm_security.normalize_phone('abc0612345678') is null and crm_security.normalize_phone('06123') is null and crm_security.normalize_phone('') is null,'invalid and blank phone');
end $$;
\echo PASS calendar windows, Sunday, lunch, timezone, late calls and phone vectors

select pg_temp.actor(3);
do $$ declare k uuid:=gen_random_uuid(); r jsonb; again jsonb; l uuid; other uuid; students bigint; enrollments bigint; tasks bigint; payload jsonb;
begin
 select count(*) into students from public.students;select count(*) into enrollments from public.enrollments;
 payload:='{"display_name":"Synthetic contact","learner_name":"Child One","phone":"612345678","source_label":"Walk-in"}';
 r:=public.crm_create_manual_lead(k,payload);again:=public.crm_create_manual_lead(k,payload);
 perform pg_temp.ok(r=again,'exact idempotent response');l:=(r->'lead'->>'id')::uuid;
 perform pg_temp.denied(format('select public.crm_create_manual_lead(%L,%L::jsonb)',k,payload||'{"learner_name":"Changed"}'));
 other:=pg_temp.intake();
 perform pg_temp.ok((select contact_id from public.crm_leads where id=l)<>(select contact_id from public.crm_leads where id=other),'shared phone never merges');
 perform pg_temp.ok((select count(*) from public.students)=students and (select count(*) from public.enrollments)=enrollments,'no center record creation');
 perform pg_temp.ok((select count(*)=1 from public.crm_submissions where lead_id=l),'manual submission');
 perform pg_temp.ok((select status='NEW' and first_submission_id=latest_submission_id and followup_policy_id=(select id from phase3_policy) from public.crm_leads where id=l),'intake structural evidence and policy');
 select count(*) into tasks from public.crm_tasks where lead_id=l;
 perform pg_temp.act('add_note',l,'{"note":"A note"}');
 perform pg_temp.act('record_whatsapp',l,'{"kind":"whatsapp_sent"}');
 perform pg_temp.ok((select status='NEW' and crm_security.failed_count(crm_leads)=0 from public.crm_leads where id=l),'notes/messages do not engage or count');
 perform pg_temp.ok((select count(*) from public.crm_tasks where lead_id=l)=tasks,'notes/messages do not change tasks');
 perform pg_temp.denied(format('select pg_temp.act(''add_note'',%L,''{"note":"stale","expected_version":1}'')',l),'40001');
 perform pg_temp.denied(format('select pg_temp.act(''add_note'',%L,''{"note":"forged","status":"CONVERTED"}'')',l));
end $$;
\echo PASS manual intake, shared phone, no center records, idempotency, stale versions and non-counting actions

-- Backdate only synthetic lead creation to record genuine historical timestamps.
do $$ declare l uuid:=pg_temp.intake(); r jsonb; i integer; at_time timestamptz:=now()-interval '10 days'; t uuid; v bigint;
begin
 update public.crm_leads set created_at=now()-interval '11 days',outreach_anchor_date=(at_time at time zone 'Africa/Casablanca')::date where id=l;
 for i in 1..5 loop
  if i<5 then perform pg_temp.denied(format('select pg_temp.act(''close_lost'',%L,''{"reason":"unreachable"}'')',l)); end if;
  r:=pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome',(array['no_answer','busy','declined','unreachable','no_answer'])[i],'occurred_at',at_time));
  perform pg_temp.ok((r->>'failed_attempts')::integer=i and r->'lead'->>'status'='CONTACTING','attempt ordinal and lifecycle '||i);
  perform pg_temp.ok((select count(*)=case when i<5 then 1 else 0 end from public.crm_tasks where lead_id=l and status='open'),'single generated next task '||i);
  perform pg_temp.denied(format('select pg_temp.act(''record_call_outcome'',%L,%L::jsonb)',l,jsonb_build_object('outcome','no_answer','occurred_at',at_time+interval '1 minute')));
  at_time:=at_time+interval '1 day';
 end loop;
 perform pg_temp.ok((r->>'unreachable_eligible')::boolean,'five failures allow but do not force closure');
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',pg_temp.next_task()));
 select id into t from public.crm_tasks where lead_id=l and status='open';
 perform pg_temp.act('record_call_outcome',l,jsonb_build_object('task_id',t,'outcome','busy','occurred_at',at_time));
 perform pg_temp.ok((select crm_security.failed_count(crm_leads)=6 from public.crm_leads where id=l),'sixth explicit followup allowed');
 perform pg_temp.act('close_lost',l,'{"reason":"unreachable"}');
 perform pg_temp.ok((select status='LOST' from public.crm_leads where id=l),'manual unreachable closure');
 perform pg_temp.act('reopen_lead',l,jsonb_build_object('reason','Renewed inquiry','next_task',pg_temp.next_task()));
 perform pg_temp.ok((select status='CONTACTING' and outreach_cycle=2 and crm_security.failed_count(crm_leads)=0 from public.crm_leads where id=l),'reopen resets sequence and preserves history');
 perform pg_temp.ok((select count(*)=6 from public.crm_activities where lead_id=l and event_type='contact_attempted'),'old attempts preserved');
 perform pg_temp.denied(format('select pg_temp.act(''close_lost'',%L,''{"reason":"unreachable"}'')',l));
end $$;
\echo PASS all five failed calls, spacing, sixth followup, explicit closure and new-cycle reopen

do $$ declare l uuid; r jsonb; reason text; cmd text; t uuid; v bigint; before_count integer;
begin
 foreach cmd in array array['record_call_outcome','record_whatsapp','record_conversation'] loop
  l:=pg_temp.intake();
  r:=pg_temp.act(cmd,l,jsonb_build_object('next_task',pg_temp.next_task(),'note','Meaningful conversation')||case cmd
   when 'record_call_outcome' then '{"outcome":"spoke_with_contact"}'::jsonb
   when 'record_whatsapp' then '{"kind":"meaningful_whatsapp_conversation"}'::jsonb
   else '{"channel":"in_person"}'::jsonb end);
  perform pg_temp.ok(r->'lead'->>'status'='ENGAGED' and (r->>'failed_attempts')::integer=0,'evidence-bearing engagement '||cmd);
  perform pg_temp.act('qualify_lead',l,jsonb_build_object('qualification_step','enrollment','next_task',pg_temp.next_task('enrollment_followup')));
  perform pg_temp.ok((select status='QUALIFIED' from public.crm_leads where id=l),'engaged to qualified');
  perform pg_temp.act('close_lost',l,'{"reason":"price"}');
  perform pg_temp.act('reopen_lead',l,jsonb_build_object('reason','Asked again','next_task',pg_temp.next_task()));
  perform pg_temp.ok((select status='ENGAGED' and qualification_step is null from public.crm_leads where id=l),'reopen does not silently requalify');
 end loop;
 l:=pg_temp.intake();
 perform pg_temp.denied(format('select pg_temp.act(''qualify_lead'',%L,%L::jsonb)',l,jsonb_build_object('qualification_step','enrollment','next_task',pg_temp.next_task('enrollment_followup'))));
 perform pg_temp.denied(format('select pg_temp.act(''qualify_lead'',%L,''{"conversation_channel":"phone","note":"Interested","qualification_step":"enrollment"}'')',l));
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','Interested and ready','qualification_step','placement_test','next_task',pg_temp.next_task('confirm_placement_test')));
 perform pg_temp.ok((select status='QUALIFIED' from public.crm_leads where id=l),'compound qualification');
 l:=pg_temp.intake();
 perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','wrong_number','next_task',pg_temp.next_task('whatsapp_followup')));
 perform pg_temp.ok((select status='NEW' and crm_security.failed_count(crm_leads)=0 from public.crm_leads where id=l),'wrong number not unreachable');
 foreach reason in array array['not_interested','price','schedule','location','chose_competitor','postponed','other'] loop
  l:=pg_temp.intake();
  if reason='other' then perform pg_temp.denied(format('select pg_temp.act(''close_lost'',%L,''{"reason":"other"}'')',l)); end if;
  perform pg_temp.act('close_lost',l,jsonb_build_object('reason',reason,'note','Synthetic explanation'));
  perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'lost cancels tasks');
 end loop;
 foreach reason in array array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other'] loop
  l:=pg_temp.intake();
  if reason='other' then perform pg_temp.denied(format('select pg_temp.act(''close_not_qualified'',%L,''{"reason":"other"}'')',l)); end if;
  perform pg_temp.act('close_not_qualified',l,jsonb_build_object('reason',reason,'note','Synthetic explanation'));
  perform pg_temp.ok((select status='NOT_QUALIFIED' from public.crm_leads where id=l) and not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'not-qualified preserves lead/cancels tasks');
 end loop;
end $$;
\echo PASS conversations, qualification evidence, wrong-number behavior and all closure reasons

-- Task identity/version invariants, explicit ownership and final-task protection.
do $$ declare l uuid:=pg_temp.intake(); t public.crm_tasks%rowtype; r jsonb; k uuid:=gen_random_uuid(); data jsonb; begin
 select * into t from public.crm_tasks where lead_id=l and status='open';
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task_id',t.id,'task',jsonb_build_object('due_at',now()+interval '2 days')));
 perform pg_temp.ok((select version=t.version+1 and status='open' from public.crm_tasks where id=t.id),'reschedule preserves task');
 perform pg_temp.denied(format('select pg_temp.act(''schedule_task'',%L,%L::jsonb)',l,jsonb_build_object('task_id',t.id,'expected_task_version',t.version,'task',jsonb_build_object('due_at',now()+interval '3 days'))),'40001');
 perform pg_temp.denied(format('select pg_temp.act(''complete_task'',%L,%L::jsonb)',l,jsonb_build_object('task_id',t.id,'outcome','done')));
 perform pg_temp.denied(format('select pg_temp.act(''cancel_task'',%L,%L::jsonb)',l,jsonb_build_object('task_id',t.id,'reason','No next task')));
 perform pg_temp.act('cancel_task',l,jsonb_build_object('task_id',t.id,'reason','Switch channel','next_task',pg_temp.next_task('whatsapp_followup')));
 select * into t from public.crm_tasks where lead_id=l and status='open';
 perform pg_temp.act('reassign',l,jsonb_build_object('owner_id','80000000-0000-0000-0000-000000000002','task_id',t.id,'assigned_to','80000000-0000-0000-0000-000000000003'));
 data:=jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),'task_id',t.id,'expected_task_version',(select version from public.crm_tasks where id=t.id),'outcome','message sent','next_task',pg_temp.next_task());
 r:=public.crm_complete_task(k,data);
 perform pg_temp.ok(public.crm_complete_task(k,data)=r,'completed task replay exact');
 perform pg_temp.denied(format('select public.crm_complete_task(gen_random_uuid(),%L::jsonb)',data),'40001');
 perform pg_temp.denied(format('select public.crm_complete_task(%L,%L::jsonb)',k,data||'{"outcome":"different"}'));
 perform pg_temp.ok((select completion_activity_id is not null and status='completed' from public.crm_tasks where id=t.id),'completion evidence');
end $$;
\echo PASS reschedule identity, cancellation next task, reassignment, versions and completion retries

-- Additional evidence, current-cycle and private resolution boundaries.
do $$ declare l uuid:=pg_temp.intake(); submission uuid:=gen_random_uuid(); first_touch uuid; r jsonb; task uuid; before_tasks bigint; begin
 perform pg_temp.denied(format('select pg_temp.act(''record_call_outcome'',%L,''{"outcome":"spoke_with_contact"}'')',l));
 perform pg_temp.ok((select status='NEW' from public.crm_leads where id=l),'taskless conversation rolls back atomically');
 perform pg_temp.act('record_call_outcome',l,'{"outcome":"no_answer"}');
 perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','spoke_with_contact','next_task',pg_temp.next_task()));
 perform pg_temp.ok((select status='ENGAGED' and crm_security.failed_count(crm_leads)=0 from public.crm_leads where id=l),'CONTACTING to ENGAGED ends sequence');
 perform pg_temp.denied(format('select pg_temp.act(''close_lost'',%L,''{"reason":"unreachable"}'')',l));
 perform pg_temp.denied(format('select pg_temp.act(''qualify_lead'',%L,%L::jsonb)',l,jsonb_build_object('next_task',pg_temp.next_task())));
 perform pg_temp.denied(format('select pg_temp.act(''qualify_lead'',%L,%L::jsonb)',l,jsonb_build_object('qualification_step','other','next_task',pg_temp.next_task())));
 select first_submission_id into first_touch from public.crm_leads where id=l;
 insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash)
 values(submission,'manual',now(),now(),'server','{}','[]','Synthetic unresolved','needs_review',repeat('e',64));
 perform crm_security.resolve_submission(l,submission,(select version from public.crm_leads where id=l),gen_random_uuid());
 perform pg_temp.ok((select first_submission_id=first_touch from public.crm_leads where id=l),'resolver preserves first touch');
 perform pg_temp.ok((select lead_id=l and resolved_by=auth.uid() and match_status='resolved' from public.crm_submissions where id=submission),'private resolution audit');
 perform pg_temp.denied(format('select crm_security.resolve_submission(%L,%L,%s,gen_random_uuid())',l,submission,(select version from public.crm_leads where id=l)));
 select id into task from public.crm_tasks where lead_id=l and status='open' limit 1;
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task_id',task,'task',jsonb_build_object('due_at',now()+interval '4 days')));
 perform pg_temp.ok((select crm_security.failed_count(crm_leads)=0 from public.crm_leads where id=l),'reschedule cannot count calls');
 perform pg_temp.act('reassign',l,jsonb_build_object('owner_id',null));
 perform pg_temp.ok((select owner_id is null from public.crm_leads where id=l),'shared queue ownership');
end $$;
\echo PASS conversation rollback, current-cycle evidence, qualification requirements and private resolution

-- Lifecycle and outreach are independent: A–J regression scenarios.
do $$ declare l uuid; wanted text; r jsonb; i integer; old_history jsonb;
 first_call timestamptz:=now()-interval '40 days'; conversation_at timestamptz:=now()-interval '35 days';
 fresh_call timestamptz:=now()-interval '14 days'; cycle integer; policy uuid; anchor_day date; begin
 foreach wanted in array array['ENGAGED','QUALIFIED'] loop
  l:=pg_temp.intake();
  update public.crm_leads set created_at=now()-interval '41 days' where id=l;
  for i in 0..1 loop
   perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','no_answer','occurred_at',first_call+i*interval '1 day'));
  end loop;
  select jsonb_agg(to_jsonb(a) order by a.attempt_ordinal) into old_history
   from public.crm_activities a where lead_id=l and outreach_cycle=1 and attempt_ordinal is not null;
  perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','spoke_with_contact','occurred_at',conversation_at,'next_task',pg_temp.next_task()));
  if wanted='QUALIFIED' then
   perform pg_temp.act('qualify_lead',l,jsonb_build_object('qualification_step','enrollment','next_task',pg_temp.next_task('enrollment_followup')));
  end if;
  perform pg_temp.ok((select outreach_cycle=2 and outreach_anchor_date is null and last_attempt_at is null from public.crm_leads where id=l),'conversation clears sequence for '||wanted);
  perform pg_temp.denied(format('select pg_temp.act(''record_call_outcome'',%L,%L::jsonb)',l,jsonb_build_object('outcome','busy','occurred_at',conversation_at-interval '1 hour')));
  for i in 0..4 loop
   r:=pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','no_answer','occurred_at',fresh_call+i*interval '1 day'));
   perform pg_temp.ok(r->'lead'->>'status'=wanted and (r->>'failed_attempts')::integer=i+1,'no lifecycle downgrade and fresh ordinal for '||wanted);
   if i<4 then
    perform pg_temp.ok(not (r->>'unreachable_eligible')::boolean,'no premature eligibility');
    perform pg_temp.denied(format('select pg_temp.act(''close_lost'',%L,''{"reason":"unreachable"}'')',l));
   end if;
   if i=0 then
    select outreach_anchor_date,followup_policy_id into anchor_day,policy from public.crm_leads where id=l;
    perform pg_temp.ok(anchor_day=(fresh_call at time zone 'Africa/Casablanca')::date,'weeks-later call establishes fresh anchor');
    perform pg_temp.ok(exists(select 1 from public.crm_activities where lead_id=l and outreach_cycle=2 and attempt_ordinal=1),'new cycle starts ordinal one');
    perform pg_temp.ok(crm_security.attempt_due(policy,anchor_day,3,fresh_call,fresh_call)=
      crm_security.next_window(policy,greatest((anchor_day+1)::timestamp at time zone 'Africa/Casablanca',fresh_call+interval '180 minutes')),'new anchor controls Day 2 scheduling');
   end if;
  end loop;
  perform pg_temp.ok((r->>'unreachable_eligible')::boolean,'fifth new-cycle failure enables closure for '||wanted);
  perform pg_temp.ok(old_history=(select jsonb_agg(to_jsonb(a) order by a.attempt_ordinal) from public.crm_activities a
    where lead_id=l and outreach_cycle=1 and attempt_ordinal is not null),'historical attempts unchanged');
  perform pg_temp.act('schedule_task',l,jsonb_build_object('task',pg_temp.next_task()));
  r:=pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','busy','occurred_at',fresh_call+interval '5 days'));
  perform pg_temp.ok((r->>'failed_attempts')::integer=6 and r->'lead'->>'status'=wanted,'sixth call consistent without lifecycle downgrade');
  perform pg_temp.act('close_lost',l,'{"reason":"unreachable"}');
  perform pg_temp.ok((select status='LOST' from public.crm_leads where id=l),'unreachable closure allowed for '||wanted);
  perform pg_temp.act('reopen_lead',l,jsonb_build_object('reason','Renewed interest','next_task',pg_temp.next_task()));
  perform pg_temp.ok((select status='ENGAGED' and outreach_cycle=3 and outreach_anchor_date is null and crm_security.failed_count(crm_leads)=0
    from public.crm_leads where id=l),'reopen is compatible with fresh sequence');
  perform pg_temp.denied(format('select pg_temp.act(''record_call_outcome'',%L,%L::jsonb)',l,jsonb_build_object('outcome','no_answer','occurred_at',fresh_call+interval '6 days')));
  r:=pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','no_answer','occurred_at',now()));
  perform pg_temp.ok((r->>'failed_attempts')::integer=1 and r->'lead'->>'status'='ENGAGED','reopened engaged lead counts a fresh ordinal one');
 end loop;
end $$;

-- A later conversation must interrupt outreach without changing ENGAGED or
-- QUALIFIED. Exercise phone, two-way WhatsApp and in-person evidence paths.
do $$ declare l uuid; wanted text; channel text; i integer; r jsonb; base_time timestamptz:=now()-interval '20 days'; begin
 foreach wanted in array array['ENGAGED','QUALIFIED'] loop
  foreach channel in array array['phone','whatsapp','in_person'] loop
   l:=pg_temp.intake();update public.crm_leads set created_at=now()-interval '30 days' where id=l;
   perform pg_temp.act('record_conversation',l,jsonb_build_object('channel','in_person','note','Initial conversation','occurred_at',base_time-interval '1 day','next_task',pg_temp.next_task()));
   if wanted='QUALIFIED' then perform pg_temp.act('qualify_lead',l,jsonb_build_object('qualification_step','enrollment','next_task',pg_temp.next_task('enrollment_followup'))); end if;
   for i in 0..1 loop perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','no_answer','occurred_at',base_time+i*interval '1 day')); end loop;
   if channel='phone' then
    perform pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','spoke_with_contact','occurred_at',base_time+interval '2 days','next_task',pg_temp.next_task()));
   elsif channel='whatsapp' then
    perform pg_temp.act('record_whatsapp',l,jsonb_build_object('kind','meaningful_whatsapp_conversation','occurred_at',base_time+interval '2 days','next_task',pg_temp.next_task()));
   else
    perform pg_temp.act('record_conversation',l,jsonb_build_object('channel','in_person','note','Parent answered again','occurred_at',base_time+interval '2 days','next_task',pg_temp.next_task()));
   end if;
   perform pg_temp.ok((select status=wanted and outreach_cycle=3 and outreach_anchor_date is null and last_attempt_at is null
      from public.crm_leads where id=l),'later conversation interrupts '||wanted||' via '||channel);
   for i in 0..2 loop
    r:=pg_temp.act('record_call_outcome',l,jsonb_build_object('outcome','busy','occurred_at',base_time+interval '10 days'+i*interval '1 day'));
    perform pg_temp.ok((r->>'failed_attempts')::integer=i+1 and r->'lead'->>'status'=wanted,'third-cycle ordinal and lifecycle');
   end loop;
   perform pg_temp.denied(format('select pg_temp.act(''close_lost'',%L,''{"reason":"unreachable"}'')',l));
   perform pg_temp.ok((select count(*)=2 from public.crm_activities where lead_id=l and outreach_cycle=2 and attempt_ordinal is not null),'old two failures preserved but excluded');
  end loop;
 end loop;
end $$;
\echo PASS A-J: cycle isolation, engaged/qualified eligibility, fresh anchors, repeated conversations, preserved history and sixth calls

-- Real browser role privileges and profile authorization (forged metadata ignored).
set local role authenticated;
do $$ declare cmd text; i integer; data jsonb; begin
 perform set_config('request.jwt.claims','{"user_metadata":{"role":"director"}}',true);
 for i in 4..7 loop
  perform pg_temp.actor(i);
  foreach cmd in array array['create_followup_policy','create_manual_lead','add_note','record_call_outcome','record_whatsapp','record_conversation','schedule_task','complete_task','cancel_task','qualify_lead','close_lost','close_not_qualified','reopen_lead','reassign'] loop
   perform pg_temp.denied(format('select public.crm_%I(gen_random_uuid(),''{}'')',cmd),'42501');
  end loop;
 end loop;
 for i in 1..3 loop
  perform pg_temp.actor(i);
  perform public.crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Staff test","learner_name":"Synthetic learner","source_label":"Manual"}');
  perform pg_temp.denied('update public.crm_leads set status=''CONVERTED''','42501');
  perform pg_temp.denied('update public.crm_tasks set status=''completed''','42501');
  perform pg_temp.denied('select crm_security.command(''add_note'',gen_random_uuid(),''{}'')','42501');
 end loop;
end $$;
reset role;
set local role anon;
select pg_temp.denied($q$select public.crm_create_manual_lead(gen_random_uuid(),'{}')$q$,'42501');
reset role;
set local role service_role;
select pg_temp.denied($q$select public.crm_create_manual_lead(gen_random_uuid(),'{}')$q$,'42501');
reset role;
select pg_temp.ok(not exists(select 1 from public.crm_leads where status='CONVERTED' and id in(select lead_id from public.crm_activities where actor_id::text like '80000000-%')),'no conversion');
set constraints all immediate;
rollback;
\echo PASS Phase 3 transactional command regression; synthetic fixtures and policy rolled back
