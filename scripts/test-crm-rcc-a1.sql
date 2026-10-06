-- RCC-A1 outcome-led follow-up: local-only synthetic fixtures, fully rolled back.
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
 perform set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
-- Trusted fixture driver only; production callers must provide their versions.
create function pg_temp.data(lead uuid,payload jsonb) returns jsonb language plpgsql as $$ declare data jsonb; begin
 data:=jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload;
 if payload->>'task_id' is not null and not(payload ? 'expected_task_version') then
  data:=data||jsonb_build_object('expected_task_version',(select version from public.crm_tasks where id=(payload->>'task_id')::uuid)); end if;
 return data;
end $$;
create function pg_temp.act(cmd text,lead uuid,payload jsonb default '{}',request uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$ declare result jsonb; begin
 execute format('select public.crm_%I($1,$2)',cmd) into result using request,pg_temp.data(lead,payload); return result;
end $$;
create function pg_temp.intake() returns uuid language plpgsql as $$ declare r jsonb; begin
 r:=public.crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Synthetic guardian","learner_name":"Synthetic learner","phone":"0612345678","source_label":"Manual"}');
 return (r->'lead'->>'id')::uuid;
end $$;
-- The task a command created, identified by its request-scoped source key.
create function pg_temp.created(request uuid) returns public.crm_tasks language sql as $$
 select * from public.crm_tasks where source_key like 'command:%:'||request||':%'
$$;
create function pg_temp.call_task(lead uuid) returns uuid language sql as $$
 select id from public.crm_tasks where lead_id=lead and status='open' and task_type in ('first_contact','contact_attempt','callback') order by due_at,id limit 1
$$;
-- Independent oracle for preset resolution: first configured opening at or after
-- the Casablanca target, computed from the stored weekly hours without next_window.
create function pg_temp.opening(policy uuid,target timestamptz) returns timestamptz language plpgsql as $$
declare p public.crm_followup_policies%rowtype; d date; w jsonb; opens timestamptz; closes timestamptz; begin
 select * into strict p from public.crm_followup_policies where id=policy;
 d:=(target at time zone p.timezone)::date;
 for i in 0..14 loop
  for w in select value from jsonb_array_elements(p.weekly_hours->extract(isodow from d)::integer::text) loop
   opens:=(d+(w->>0)::time) at time zone p.timezone; closes:=(d+(w->>1)::time) at time zone p.timezone;
   if greatest(target,opens)<closes then return greatest(target,opens); end if;
  end loop; d:=d+1;
 end loop;
 raise exception 'oracle found no opening';
end $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'rcc-a1-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like 'a1000000-%';
select pg_temp.actor(1);
create temp table a1_policy(id uuid);
insert into a1_policy select (public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid;
select pg_temp.actor(3);

-- Schema: additive nullable metadata, constrained values, no new API privilege.
do $$ begin
 perform pg_temp.ok((select count(*)=2 from information_schema.columns where table_schema='public' and table_name='crm_tasks'
  and column_name in ('schedule_kind','followup_reason') and is_nullable='YES' and column_default is null),'nullable metadata columns without defaults');
 perform pg_temp.ok(not has_table_privilege('authenticated','public.crm_tasks','select') and not has_table_privilege('anon','public.crm_tasks','select'),'crm_tasks remains RPC-only');
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.reminder_due(uuid,text)','execute')
  and not has_function_privilege('anon','crm_security.reminder_due(uuid,text)','execute')
  and not has_function_privilege('service_role','crm_security.reminder_due(uuid,text)','execute'),'preset helper is private');
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.new_task(public.crm_leads,jsonb,text,text,smallint,text)','execute'),'task primitive stays private');
 perform pg_temp.ok((select prosecdef and proconfig=array['search_path=pg_catalog, pg_temp'] from pg_proc where oid='public.crm_record_conversation_decision(uuid,jsonb)'::regprocedure),'decision pinned definer');
 perform pg_temp.ok(has_function_privilege('authenticated','public.crm_record_conversation_decision(uuid,jsonb)','execute')
  and not has_function_privilege('anon','public.crm_record_conversation_decision(uuid,jsonb)','execute')
  and not has_function_privilege('service_role','public.crm_record_conversation_decision(uuid,jsonb)','execute'),'decision grants unchanged');
end $$;
\echo PASS additive nullable task metadata, private helpers and unchanged grants

-- Critical safeguard: the dispatcher keeps migration 103's lifecycle controls and
-- only drops the two prose requirements.
do $$ declare src text:=(select prosrc from pg_proc where oid='crm_security.command(text,uuid,jsonb)'::regprocedure); begin
 perform pg_temp.ok(src like '%perform crm_security.lifecycle_barrier(true);%','103 lifecycle barrier retained');
 perform pg_temp.ok(src like '%crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)%','103 pre-identity keys retained');
 perform pg_temp.ok(src like '%perform crm_security.lifecycle_pending_handoff((data->>''submission_id'')::uuid);%','103 pending-stop handoff retained');
 perform pg_temp.ok((select prosecdef from pg_proc where oid='crm_security.command(text,uuid,jsonb)'::regprocedure),'dispatcher remains security definer');
 perform pg_temp.ok(src not like '%(''phone'',''whatsapp'',''in_person'') or nullif(btrim(data->>''note''),'''') is null%','structured conversation prose optional');
 perform pg_temp.ok(src like '%Valid closure reason and explanation required%' and src like '%Valid qualification step and explanation required%'
  and src like '%Closed lead and reopen reason required%' and src like '%nullif(btrim(data->>''note''),'''') is null then raise exception ''Note required''%','explanation checks retained');
end $$;
\echo PASS crm_security.command retains 103 lifecycle barrier, pre-identity keys and pending-stop handoff

-- Optional prose: structured conversations succeed without notes; standalone notes,
-- Other reasons, cancellation and reopening still require explanations.
do $$ declare l uuid; r jsonb; t uuid; begin
 l:=pg_temp.intake();
 r:=pg_temp.act('record_conversation',l,jsonb_build_object('channel','in_person','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '2 days')));
 perform pg_temp.ok(r->'lead'->>'status'='ENGAGED','in-person conversation without prose engages');
 perform pg_temp.ok((select body is null and channel='in_person' from public.crm_activities where lead_id=l and event_type='conversation_recorded'),'structured channel evidence retained without body');
 perform pg_temp.denied(format('select public.crm_add_note(%L,%L)',gen_random_uuid(),pg_temp.data(l,'{"note":"  "}')));
 perform pg_temp.denied(format('select public.crm_qualify_lead(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('qualification_step','other','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')))));
 t:=pg_temp.call_task(l);
 perform pg_temp.denied(format('select public.crm_cancel_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task_id',t,'reason',' ','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')))));
 perform pg_temp.denied(format('select public.crm_close_not_qualified(%L,%L)',gen_random_uuid(),pg_temp.data(l,'{"reason":"other"}')));
 perform pg_temp.act('close_lost',l,'{"reason":"price"}');
 perform pg_temp.denied(format('select public.crm_reopen_lead(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('reason','','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')))));
 l:=pg_temp.intake();
 r:=pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','qualification_step','placement_test','next_task',jsonb_build_object('task_type','confirm_placement_test','due_at',now()+interval '1 day')));
 perform pg_temp.ok(r->'lead'->>'status'='QUALIFIED','channel-evidenced qualification without prose');
end $$;
\echo PASS routine structured conversations need no prose; standalone note, Other, cancel and reopen still require explanation

-- Bounded reminder presets resolve on the server through the lead's Casablanca policy.
do $$ declare l uuid; r jsonb; req uuid; preset text; due timestamptz; expected timestamptz; today date:=(now() at time zone 'Africa/Casablanca')::date; policy uuid:=(select id from a1_policy); task public.crm_tasks%rowtype; begin
 l:=pg_temp.intake();
 foreach preset in array array['in_2_hours','tomorrow','in_2_days','in_3_days','next_week'] loop
  req:=gen_random_uuid();
  r:=pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','whatsapp_followup','due_preset',preset,'schedule_kind','reminder')),req);
  task:=pg_temp.created(req);
  expected:=pg_temp.opening(policy,case preset when 'in_2_hours' then now()+interval '2 hours'
   else (today+case preset when 'tomorrow' then 1 when 'in_2_days' then 2 when 'in_3_days' then 3 else 7 end)::timestamp at time zone 'Africa/Casablanca' end);
  perform pg_temp.ok(task.due_at=expected,'preset '||preset||' resolves to configured Casablanca opening');
  perform pg_temp.ok(task.schedule_kind='reminder' and task.followup_reason is null,'preset '||preset||' is an internal reminder');
 end loop;
 -- A preset without an explicit kind is still a reminder.
 req:=gen_random_uuid();
 r:=pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','tomorrow')),req);
 perform pg_temp.ok((pg_temp.created(req)).schedule_kind='reminder','preset implies reminder');
 -- Agreed appointments need their agreed time; presets cannot become appointments.
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','tomorrow','schedule_kind','appointment')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','tomorrow','due_at',now()+interval '1 day')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','due_preset','tomorrow')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','in_a_month')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset',null)))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','due_at',now()+interval '1 day','schedule_kind','reminder')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','contact_attempt','due_at',now()+interval '1 day','schedule_kind','reminder')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day','schedule_kind','meeting')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','due_at',now()+interval '1 day','followup_reason','considering')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day','followup_reason','busy')))));
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_at',now()-interval '1 minute')))));
 -- Explicit-date compatibility: legacy payloads keep NULL kind and calling-window adjustment.
 due:=pg_temp.opening(policy,((today+8)::timestamp+time '12:45') at time zone 'Africa/Casablanca');
 req:=gen_random_uuid();
 r:=pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_at',((today+8)::timestamp+time '12:45') at time zone 'Africa/Casablanca')),req);
 task:=pg_temp.created(req);
 perform pg_temp.ok(task.due_at=due and task.schedule_kind is null and task.followup_reason is null,'legacy explicit callback keeps window adjustment and NULL kind');
 r:=pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',((today+9)::timestamp+time '11:00') at time zone 'Africa/Casablanca')));
 perform pg_temp.ok((select schedule_kind='appointment' and due_at=((today+9)::timestamp+time '11:00') at time zone 'Africa/Casablanca' from public.crm_tasks where lead_id=l and task_type='center_visit' and status='open'),'explicit agreed appointment keeps its exact agreed time');
 -- Rescheduling keeps the identity, kind and reason; presets are not a reschedule input.
 select * into task from public.crm_tasks where lead_id=l and task_type='center_visit' and status='open';
 perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task_id',task.id,'task',jsonb_build_object('due_preset','tomorrow')))));
 r:=pg_temp.act('schedule_task',l,jsonb_build_object('task_id',task.id,'task',jsonb_build_object('due_at',now()+interval '10 days')));
 perform pg_temp.ok((select schedule_kind='appointment' and version=task.version+1 from public.crm_tasks where id=task.id),'reschedule preserves identity and kind');
end $$;
\echo PASS server-side Casablanca presets, appointment/reminder separation and explicit-date compatibility

-- Outcome-led decisions: the receptionist records what happened; commands derive status.
do $$ declare l uuid; r jsonb; r2 jsonb; d jsonb; req uuid; t uuid; task public.crm_tasks%rowtype; qualified_events integer; step text; begin
 -- New lead, phone conversation, parent needs time: engaged, En réflexion reminder.
 l:=pg_temp.intake();t:=pg_temp.call_task(l);
 r:=pg_temp.act('record_conversation_decision',l,jsonb_build_object('task_id',t,'decision','considering','next_task',jsonb_build_object('task_type','callback','due_preset','in_2_days','schedule_kind','reminder')));
 perform pg_temp.ok(r->'lead'->>'status'='ENGAGED' and (r->>'failed_attempts')::integer=0,'considering conversation engages a new lead');
 perform pg_temp.ok((select status='completed' from public.crm_tasks where id=t),'selected call task completed');
 select * into task from public.crm_tasks where lead_id=l and status='open';
 perform pg_temp.ok(task.task_type='callback' and task.schedule_kind='reminder' and task.followup_reason='considering'
  and (select count(*)=1 from public.crm_tasks where lead_id=l and status='open'),'single En réflexion reminder');
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='conversation_recorded' and outcome='spoke_with_contact' and body is null),'phone conversation evidence without prose');
 -- Qualified lead who needs time stays QUALIFIED; no new lifecycle-relevant event.
 l:=pg_temp.intake();
 perform pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','qualify','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day','schedule_kind','appointment')));
 select count(*) into qualified_events from public.crm_activities where lead_id=l and event_type in ('lead_qualified','lead_lost','lead_not_qualified','lead_reopened','lead_converted');
 select qualification_step into step from public.crm_leads where id=l;
 r:=pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','considering','channel','whatsapp','next_task',jsonb_build_object('task_type','whatsapp_followup','due_preset','next_week')));
 perform pg_temp.ok(r->'lead'->>'status'='QUALIFIED' and (select qualification_step=step from public.crm_leads where id=l),'qualified + needs time stays QUALIFIED with unchanged step');
 perform pg_temp.ok(qualified_events=(select count(*) from public.crm_activities where lead_id=l and event_type in ('lead_qualified','lead_lost','lead_not_qualified','lead_reopened','lead_converted')),'En réflexion emits no lifecycle status event');
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and status='open' and followup_reason='considering' and schedule_kind='reminder' and task_type='whatsapp_followup'),'WhatsApp En réflexion reminder');
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and status='open' and task_type='enrollment_followup' and schedule_kind='appointment'),'existing agreed appointment untouched');
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='whatsapp_conversation'),'WhatsApp channel evidence');
 -- Agreed callback in person; considering an agreed time may be an appointment.
 l:=pg_temp.intake();
 r:=pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','callback','channel','in_person','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '3 days','schedule_kind','appointment')));
 perform pg_temp.ok(r->'lead'->>'status'='ENGAGED' and (select count(*)=1 from public.crm_activities where lead_id=l and event_type='conversation_recorded' and channel='in_person'),'in-person agreed callback');
 perform pg_temp.ok((select schedule_kind='appointment' and followup_reason is null and status='open' from public.crm_tasks where lead_id=l and task_type='callback'),'agreed callback appointment');
 r:=pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','considering','channel','in_person','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '4 days','schedule_kind','appointment')));
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and status='open' and followup_reason='considering' and schedule_kind='appointment'),'considering with agreed time; previous callback superseded');
 -- Qualification by WhatsApp without prose, with an agreed center visit.
 l:=pg_temp.intake();
 r:=pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','qualify','channel','whatsapp','qualification_step','center_visit','next_task',jsonb_build_object('task_type','center_visit','due_at',now()+interval '2 days','schedule_kind','appointment')));
 perform pg_temp.ok(r->'lead'->>'status'='QUALIFIED' and (select count(*)=1 from public.crm_activities where lead_id=l and event_type='conversation_recorded' and channel='whatsapp'),'WhatsApp qualification without prose');
 -- Closures: structured reason suffices except Other.
 l:=pg_temp.intake();
 r:=pg_temp.act('record_conversation_decision',l,'{"decision":"lost","reason":"not_interested"}');
 perform pg_temp.ok(r->'lead'->>'status'='LOST' and not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'not interested closes without prose or dummy task');
 l:=pg_temp.intake();
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),pg_temp.data(l,'{"decision":"not_qualified","reason":"other"}')));
 perform pg_temp.ok(not exists(select 1 from public.crm_activities where lead_id=l and event_type='conversation_recorded') and (select status='NEW' and version=1 from public.crm_leads where id=l),'Other closure without explanation rolls back evidence');
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('decision','qualify','qualification_step','other','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')))));
 r:=pg_temp.act('record_conversation_decision',l,'{"decision":"not_qualified","reason":"other","note":"Hors zone desservie"}');
 perform pg_temp.ok(r->'lead'->>'status'='NOT_QUALIFIED','Other closure with explanation');
 -- Invalid outcome combinations.
 l:=pg_temp.intake();t:=pg_temp.call_task(l);
 foreach d in array array[
  jsonb_build_object('decision','considering','next_task',jsonb_build_object('task_type','center_visit','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','considering','qualification_step','placement_test','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','considering','reason','postponed','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','considering'),
  jsonb_build_object('decision','callback','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day','followup_reason','considering')),
  jsonb_build_object('decision','callback','channel','email','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','callback','channel','whatsapp','task_id',t,'next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','postpone','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','lost','reason','not_interested','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')),
  jsonb_build_object('decision','callback','note',repeat('x',4001),'next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day'))] loop
  perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),pg_temp.data(l,d)));
 end loop;
 perform pg_temp.ok((select status='NEW' and version=1 from public.crm_leads where id=l) and (select status='open' from public.crm_tasks where id=t),'invalid outcomes leave lead and task untouched');
 -- Idempotency: exact replay returns the stored result; presets are not re-resolved.
 req:=gen_random_uuid();d:=pg_temp.data(l,jsonb_build_object('task_id',t,'decision','considering','next_task',jsonb_build_object('task_type','callback','due_preset','tomorrow')));
 r:=public.crm_record_conversation_decision(req,d);
 r2:=public.crm_record_conversation_decision(req,d);
 perform pg_temp.ok(r=r2 and (select count(*)=1 from public.crm_tasks where lead_id=l and status='open') and (select count(*)=1 from public.crm_command_requests where request_key=req),'exact replay is idempotent');
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',req,d||'{"note":"changed"}'));
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d),'40001');
 -- Non-operational roles remain denied.
 for i in 4..7 loop
  perform pg_temp.actor(i);perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),pg_temp.data(l,'{"decision":"lost","reason":"not_interested"}')),'42501');
  perform pg_temp.denied(format('select public.crm_schedule_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','tomorrow')))),'42501');
 end loop;
 perform pg_temp.actor(3);
end $$;
\echo PASS outcome-led decisions derive status, keep QUALIFIED for En réflexion, preserve idempotency and role denials

-- Failed-call cadence is unchanged and coexists with an En réflexion reminder.
do $$ declare l uuid; r jsonb; begin
 l:=pg_temp.intake();
 perform pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','considering','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 hour')));
 r:=pg_temp.act('record_call_outcome',l,'{"outcome":"no_answer"}');
 perform pg_temp.ok((r->>'failed_attempts')::integer=1 and r->'lead'->>'status'='ENGAGED','failed call counts after conversation without status change');
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and status='open' and task_type='contact_attempt' and attempt_ordinal=2 and schedule_kind is null),'cadence slot 2 created as system work');
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and status='open' and followup_reason='considering'),'En réflexion reminder survives the failed call');
end $$;
\echo PASS failed-call cadence unchanged alongside En réflexion

-- Task completion keeps its 200-character outcome contract (the UI now matches it).
do $$ declare l uuid; t uuid; begin
 l:=pg_temp.intake();
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',now()+interval '1 day')));
 select id into t from public.crm_tasks where lead_id=l and task_type='center_visit' and status='open';
 perform pg_temp.denied(format('select public.crm_complete_task(%L,%L)',gen_random_uuid(),pg_temp.data(l,jsonb_build_object('task_id',t,'outcome',repeat('x',201)))));
 perform pg_temp.act('complete_task',l,jsonb_build_object('task_id',t,'outcome',repeat('x',200)));
 perform pg_temp.ok((select status='completed' from public.crm_tasks where id=t),'200-character completion outcome accepted');
end $$;
\echo PASS completion outcome limit is 200 characters

-- Bounded reads expose the additive fields to receptionist surfaces.
do $$ declare l uuid; detail jsonb; opp jsonb; begin
 l:=pg_temp.intake();
 perform pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','considering','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '30 minutes','schedule_kind','appointment','assigned_to','a1000000-0000-0000-0000-000000000003')));
 detail:=public.crm_get_workspace_detail(l);
 perform pg_temp.ok(detail->'next_task'->>'schedule_kind'='appointment' and detail->'next_task'->>'followup_reason'='considering','workspace next task metadata');
 perform pg_temp.ok(detail->'open_tasks'->0->>'followup_reason'='considering' and detail->'open_tasks'->0->>'schedule_kind'='appointment','open task metadata');
 perform pg_temp.ok(exists(select 1 from unnest(array['overdue','today','tomorrow','upcoming']) b,
  jsonb_array_elements(public.crm_get_work_queue(b,'me',null,'all',null,null,50)->'rows') x
  where x->'lead'->>'id'=l::text and x->>'followup_reason'='considering' and x->>'schedule_kind'='appointment'),'work queue metadata');
 opp:=public.crm_get_opportunities('all','',(select contact_id from public.crm_leads where id=l),'all',null,null,null,'all',null,'list',null,25,null);
 perform pg_temp.ok(exists(select 1 from jsonb_each(opp->'pages') pg,jsonb_array_elements(pg.value->'rows') x where x->>'id'=l::text
  and x->'next_task'->>'followup_reason'='considering' and x->'next_task'->>'schedule_kind'='appointment'),'opportunity row metadata');
end $$;
\echo PASS reads expose schedule kind and En réflexion metadata

rollback;
