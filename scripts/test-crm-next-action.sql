-- RWR-r5 PR A1: one next action per prospect (plan §4, §7 invariants 1–5, 8, 10).
-- Local-only synthetic fixtures, fully rolled back. No personal data.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
-- Expect a refusal with this SQLSTATE and, when given, this hint.
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
 perform set_config('request.jwt.claim.sub','a6000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.data(lead uuid,payload jsonb) returns jsonb language sql as $$
 select jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload
$$;
create function pg_temp.act(cmd text,lead uuid,payload jsonb default '{}',request uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$ declare result jsonb; begin
 execute format('select public.crm_%I($1,$2)',cmd) into result using request,pg_temp.data(lead,payload); return result;
end $$;
create function pg_temp.refused(cmd text,lead uuid,payload jsonb,code text default '22023',expected_hint text default null) returns void language plpgsql as $$ begin
 perform pg_temp.denied(format('select public.crm_%I(%L,%L)',cmd,gen_random_uuid(),pg_temp.data(lead,payload)),code,expected_hint);
end $$;
create function pg_temp.intake() returns uuid language plpgsql as $$ declare r jsonb; begin
 r:=public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Synthetic contact','learner_name','Synthetic learner',
  'email','na-'||gen_random_uuid()||'@example.invalid','source_label','Manual'));
 return (r->'lead'->>'id')::uuid;
end $$;
create function pg_temp.na(lead uuid) returns public.crm_tasks language sql as $$
 select * from public.crm_tasks where id=crm_security.next_action_id(lead)
$$;
-- Invariant 1: exactly one open action on an active prospect, and it is the current one.
create function pg_temp.one(lead uuid,label text) returns void language plpgsql as $$ begin
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=lead and status='open')
  and crm_security.next_action_id(lead) is not null,'one next action: '||label);
end $$;
-- A time inside the current policy's window of this kind, days ahead, from hh:mm.
create function pg_temp.at(kind text,days integer,hhmm text default '16:00') returns timestamptz language sql as $$
 select crm_security.window_at(crm_security.current_policy_id(),kind,
  (((now() at time zone public.centre_utc_offset())::date+days)::timestamp+hhmm::time) at time zone public.centre_utc_offset())
$$;
create function pg_temp.backdate(task uuid,minutes integer default 90) returns void language sql as $$
 update public.crm_tasks set due_at=now()-make_interval(mins=>minutes),created_at=least(created_at,now()-make_interval(mins=>minutes+1)) where id=task
$$;
-- Book an appointment the way OD-11 qualifies: through the exchange (« On a parlé »).
-- « Changer » books one only for a prospect already qualified (review of #208, B1).
create function pg_temp.book(lead uuid,due timestamptz,with_test boolean default false) returns jsonb language sql as $$
 select pg_temp.act('log_exchange',lead,jsonb_build_object('channel','phone','result','spoke','next',
  jsonb_build_object('task_type','center_visit','due_at',due,'with_test',with_test)))
$$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a6000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'next-action-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer],
 full_name='Synthetic staff '||right(id::text,1) where id::text like 'a6000000-%';
do $$ begin perform pg_temp.actor(1); end $$;
-- The live calling hours (R0 Q01) and a wider opening window, Sunday closed.
do $p$ begin perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},
   "opening_hours":{"1":[["14:00","20:00"]],"2":[["09:30","20:00"]],"3":[["09:30","20:00"]],"4":[["09:30","20:00"]],"5":[["09:30","20:00"]],"6":[["09:30","20:00"]],"7":[]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
do $$ begin perform pg_temp.actor(3); end $$;

-- Schema and grants: the writer and its helpers are private; the new commands are RPCs.
do $$ declare fn text; begin
 foreach fn in array array['crm_security.set_next_action(public.crm_leads,jsonb,text,text)','crm_security.next_action_id(uuid)',
  'crm_security.assert_in_hours(text,timestamptz)','crm_security.d1_apply(jsonb)','crm_security.d1_revert()','crm_security.d1_plan()'] loop
  perform pg_temp.ok(not has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and not has_function_privilege('service_role',fn,'execute'),'private '||fn);
 end loop;
 foreach fn in array array['public.crm_log_exchange(uuid,jsonb)','public.crm_change_next_action(uuid,jsonb)','public.crm_record_appointment_outcome(uuid,jsonb)',
  'public.crm_close_prospect(uuid,jsonb)','public.crm_reopen_prospect(uuid,jsonb)','public.crm_get_centre_hours()','public.crm_check_action(uuid)'] loop
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and not has_function_privilege('service_role',fn,'execute'),'RPC grant '||fn);
  perform pg_temp.ok((select prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc where oid=fn::regprocedure),'pinned definer '||fn);
 end loop;
 perform pg_temp.ok((select is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='crm_tasks' and column_name='due_at'),'awaiting has no date');
end $$;
\echo PASS private writer, RPC grants, nullable due date

-- T1: every command leaves exactly one action; each new action replaces the current one.
do $$ declare l uuid; r jsonb; t public.crm_tasks; v uuid; begin
 l:=pg_temp.intake();
 perform pg_temp.one(l,'intake');
 perform pg_temp.ok((pg_temp.na(l)).task_type='first_contact' and (select owner_id from public.crm_leads where id=l)='a6000000-0000-0000-0000-000000000003','first contact, owner is the creator (§4.6)');
 -- One-tap « Pas de réponse »: the call is recorded and the next slot replaces the call action.
 r:=pg_temp.act('log_exchange',l,'{"channel":"phone","result":"no_answer"}');
 perform pg_temp.one(l,'no answer');
 perform pg_temp.ok((pg_temp.na(l)).task_type='contact_attempt' and (r->>'failed_attempts')::integer=1,'next slot after no answer');
 perform pg_temp.ok(r ? 'next_action' and r->'next_action'->>'id'=(pg_temp.na(l)).id::text,'command result carries the next action');
 -- « On a parlé » with an agreed callback.
 perform pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result','spoke','note','Rappeler après la paie','next',
  jsonb_build_object('task_type','callback','schedule_kind','appointment','due_at',pg_temp.at('calling',2))));
 perform pg_temp.one(l,'spoke + callback');
 t:=pg_temp.na(l);
 perform pg_temp.ok(t.task_type='callback' and t.due_at=pg_temp.at('calling',2),'agreed time kept exactly');
 perform pg_temp.ok((select status='ENGAGED' from public.crm_leads where id=l),'conversation engages');
 -- « Changer » requires the action the user saw (NF-1).
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',gen_random_uuid(),'next',jsonb_build_object('task_type','whatsapp_followup','due_preset','tomorrow')),'PT409');
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',t.id,'next',jsonb_build_object('task_type','whatsapp_followup','due_preset','tomorrow')));
 perform pg_temp.one(l,'change to WhatsApp');
 perform pg_temp.ok((select status='cancelled' and replaced_reason is not null from public.crm_tasks where id=t.id),'replaced action cancelled with its reason');
 -- « En attente »: no date.
 t:=pg_temp.na(l);
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',t.id,'next',jsonb_build_object('task_type','awaiting_prospect')));
 perform pg_temp.one(l,'awaiting');
 perform pg_temp.ok((pg_temp.na(l)).due_at=crm_security.reminder_due((select followup_policy_id from public.crm_leads where id=l),'in_5_days'),'« En attente » relance defaults to 5 days (OD-5)');
 t:=pg_temp.na(l);
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',t.id,'next',jsonb_build_object('task_type','awaiting_prospect','due_at',null)));
 perform pg_temp.one(l,'awaiting without relance');
 perform pg_temp.ok((pg_temp.na(l)).due_at is null,'« En attente » without a relance date when chosen');
 -- Legacy wrappers obey the single-action rule (R-2 of the audit: « Planifier » no longer adds).
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','tomorrow')));
 perform pg_temp.one(l,'legacy schedule_task replaces');
 perform pg_temp.act('add_note',l,'{"note":"Note seule"}');
 perform pg_temp.one(l,'note keeps the action');
 perform pg_temp.act('reassign',l,jsonb_build_object('owner_id','a6000000-0000-0000-0000-000000000002'));
 perform pg_temp.one(l,'reassign');
 perform pg_temp.ok((pg_temp.na(l)).assigned_to='a6000000-0000-0000-0000-000000000002','the action follows the owner (§4.6)');
end $$;
\echo PASS T1 one action after every command, replacement, NF-1, awaiting, legacy wrappers

-- T2: a closed prospect has no open action, appointment or planned test; reopening works.
do $$ declare l uuid; t public.crm_tasks; p uuid; begin
 l:=pg_temp.intake();
 t:=pg_temp.na(l);
 perform pg_temp.book(l,pg_temp.at('opening',3,'11:00'),true);
 t:=pg_temp.na(l);
 perform pg_temp.one(l,'appointment with test');
 select id into p from public.placement_tests where crm_lead_id=l and status='Planifié';
 perform pg_temp.ok(p is not null and t.task_type='center_visit' and t.placement_test_id=p,'one appointment carries its test');
 perform pg_temp.act('close_prospect',l,'{"status":"LOST","reason":"not_interested"}');
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'closed: no open action');
 perform pg_temp.ok((select status='Annulé' and cancelled_at is not null from public.placement_tests where id=p),'closed: planned test cancelled');
 perform pg_temp.refused('reopen_prospect',l,'{"reason":"Revient"}');
 -- Re-review of #208 (owner decision 3): reopening with an appointment follows « Changer ».
 perform pg_temp.refused('reopen_prospect',l,jsonb_build_object('reason','Revient','next',
  jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',4,'11:00'),'with_test',true)),'22023','crm_next_action.appointment_needs_exchange');
 perform pg_temp.refused('reopen_lead',l,jsonb_build_object('reason','Revient','next_task',
  jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',4,'11:00'))),'22023','crm_next_action.appointment_needs_exchange');
 perform pg_temp.act('reopen_prospect',l,jsonb_build_object('reason','Revient','next',jsonb_build_object('task_type','callback','due_preset','tomorrow')));
 perform pg_temp.one(l,'reopen');
 t:=pg_temp.na(l);
 -- A reopened prospect is not qualified: « Changer » refuses the booking, the exchange books it.
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',t.id,'next',
  jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',4,'11:00'),'with_test',true)),'22023','crm_next_action.appointment_needs_exchange');
 perform pg_temp.book(l,pg_temp.at('opening',4,'11:00'),true);
 perform pg_temp.ok((select count(*)=1 from public.placement_tests where crm_lead_id=l and status='Planifié'),'booking works after reopening (audit: closed then reopened)');
end $$;
\echo PASS T2 closing cancels the action and the planned test; reopen and rebook

-- T3: no two appointments or tests of one person overlap (sibling prospects of one student).
do $$ declare a uuid; b uuid; s uuid:=gen_random_uuid(); slot timestamptz:=pg_temp.at('opening',5,'11:00'); begin
 a:=pg_temp.intake(); b:=pg_temp.intake();
 insert into public.students(id,full_name,status,session_type) values(s,'Synthetic learner','Enrolled','Mise à niveau');
 update public.crm_leads set student_id=s where id in (a,b);
 perform pg_temp.book(a,slot);
 perform pg_temp.refused('log_exchange',b,jsonb_build_object('channel','phone','result','spoke','next',jsonb_build_object('task_type','center_visit','due_at',slot+interval '30 minutes')),'22023','crm_next_action.overlap');
 perform pg_temp.refused('log_exchange',b,jsonb_build_object('channel','phone','result','spoke','next',jsonb_build_object('task_type','center_visit','due_at',slot-interval '30 minutes','with_test',true)),'22023','crm_next_action.overlap');
 perform pg_temp.book(b,pg_temp.at('opening',6,'11:00'));
 perform pg_temp.one(b,'non-overlapping appointment');
end $$;
\echo PASS T3 overlap refused across prospects of one student

-- T3c: a failed call never replaces a kept action; it records the attempt only.
do $$ declare l uuid; t public.crm_tasks; k public.crm_tasks; res text; with_id boolean; attempts integer; kind text; begin
 foreach kind in array array['appointment','enrolment','our_step'] loop
  foreach res in array array['no_answer','busy','declined','unreachable'] loop
   foreach with_id in array array[false,true] loop
    l:=pg_temp.intake();
    perform pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result','spoke','next',case kind
     when 'appointment' then jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',7,'10:00'),'with_test',true)
     when 'enrolment' then jsonb_build_object('task_type','enrollment_followup','due_preset','tomorrow')
     else jsonb_build_object('task_type','whatsapp_followup','due_preset','tomorrow','instructions','Envoyer le prix') end));
    perform pg_temp.ok((select status in ('ENGAGED','QUALIFIED') from public.crm_leads where id=l),'engaged or qualified before the failed call');
    k:=pg_temp.na(l);
    attempts:=(select count(*) from public.crm_activities where lead_id=l and event_type='contact_attempted');
    perform pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result',res)||case when with_id then jsonb_build_object('task_id',k.id) else '{}'::jsonb end);
    t:=pg_temp.na(l);
    perform pg_temp.one(l,format('kept %s after %s (task id %s)',kind,res,with_id));
    perform pg_temp.ok(t.id=k.id and t.status='open' and t.due_at=k.due_at and t.placement_test_id is not distinct from k.placement_test_id
     and t.completion_activity_id is null,format('%s kept, not completed, after %s (task id %s)',kind,res,with_id));
    perform pg_temp.ok((select count(*) from public.crm_activities where lead_id=l and event_type='contact_attempted')=attempts+1,'attempt recorded beside the kept '||kind);
    perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=l and task_type='contact_attempt' and status='open'),'no slot beside the kept '||kind);
    if kind='appointment' then perform pg_temp.ok((select status='Planifié' from public.placement_tests where id=k.placement_test_id),'linked test still planned'); end if;
   end loop;
  end loop;
 end loop;
 -- A call action moves to the next slot.
 l:=pg_temp.intake();
 perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"busy"}');
 perform pg_temp.ok((pg_temp.na(l)).task_type='contact_attempt','a call action moves to the next slot');
end $$;
\echo PASS T3c kept appointment, enrolment and our-step actions survive every failed call

-- T3d: OD-18 — appointments need the « Remplace » token (A); enrolment actions need an explicit cancel (B).
do $$ declare l uuid; k public.crm_tasks; p uuid; begin
 l:=pg_temp.intake();
 perform pg_temp.book(l,pg_temp.at('opening',8,'10:00'),true);
 k:=pg_temp.na(l); p:=k.placement_test_id;
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','callback','due_preset','tomorrow')),'22023','crm_next_action.replace_confirmation');
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','callback','due_preset','tomorrow','replace_action_id',k.id)));
 perform pg_temp.one(l,'appointment replaced with the token');
 perform pg_temp.ok((select status='Annulé' from public.placement_tests where id=p),'replacing the appointment cancels its test');
 -- B: the enrolment action stays until rescheduled, cancelled or given an outcome.
 perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"spoke","next":{"enrol":{"due_preset":"tomorrow"}}}');
 k:=pg_temp.na(l);
 perform pg_temp.ok(k.task_type='enrollment_followup','enrol action');
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','callback','due_preset','tomorrow','replace_action_id',k.id)),'22023','crm_next_action.enrollment_kept');
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','enrollment_followup','due_preset','in_3_days')));
 perform pg_temp.one(l,'enrolment action rescheduled');
 k:=pg_temp.na(l);
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','callback','due_preset','tomorrow','cancel_enrollment_reason','Attend la rentrée')));
 perform pg_temp.one(l,'enrolment action cancelled explicitly');
 perform pg_temp.ok((pg_temp.na(l)).task_type='callback','callback after the explicit cancel');
end $$;
\echo PASS T3d OD-18 A (replace token) and B (enrolment kept until explicit change)

-- T4: hours. Agreed times outside hours are refused; system times always fall inside.
do $$ declare l uuid; k public.crm_tasks; preset text; closing timestamptz; begin
 l:=pg_temp.intake();
 closing:=(((now() at time zone public.centre_utc_offset())::date+2)::timestamp+time '23:00') at time zone public.centre_utc_offset();
 perform pg_temp.refused('log_exchange',l,jsonb_build_object('channel','phone','result','spoke','next',jsonb_build_object('task_type','center_visit','due_at',closing)),'22023','crm_hours.outside_opening');
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',(pg_temp.na(l)).id,'next',jsonb_build_object('task_type','callback','schedule_kind','appointment','due_at',closing)),'22023','crm_hours.outside_calling');
 foreach preset in array array['later_today','tomorrow','in_2_days','in_3_days','in_5_days','next_week'] loop
  begin
   perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',(pg_temp.na(l)).id,'next',jsonb_build_object('task_type','callback','due_preset',preset)));
  exception when sqlstate '22023' then
   if sqlerrm not like '%preset%' and sqlerrm not like '%Valid%' then raise; end if; continue;
  end;
  k:=pg_temp.na(l);
  perform pg_temp.ok(crm_security.window_at(crm_security.current_policy_id(),'calling',k.due_at)=k.due_at,'preset '||preset||' lands inside calling hours');
 end loop;
 -- Five failed calls: every system slot is inside hours (invariant 4).
 perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"no_answer"}');
 perform pg_temp.refused('log_exchange',l,'{"channel":"phone","result":"no_answer"}','22023','crm_exchange.attempt_gap');
 for i in 1..3 loop
  perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"no_answer","real_attempt_override":true}');
  k:=pg_temp.na(l);
  perform pg_temp.ok(k.due_at is null or crm_security.window_at(crm_security.current_policy_id(),'calling',k.due_at)=k.due_at,'system slot '||i||' inside hours');
 end loop;
end $$;
\echo PASS T4 hours refusals and system times inside hours

-- T4b: a new hours version applies to existing prospects at once; cadence stays pinned.
do $$ declare l uuid; pinned uuid; before_hours jsonb; begin
 l:=pg_temp.intake();
 pinned:=(select followup_policy_id from public.crm_leads where id=l);
 before_hours:=public.crm_get_centre_hours();
 perform pg_temp.actor(1);
 perform public.crm_create_followup_policy(gen_random_uuid(),jsonb_build_object('weekly_hours',
  (select jsonb_object_agg(d::text,case when d=7 then '[]'::jsonb else jsonb_build_array(jsonb_build_array('11:00','19:00')) end) from generate_series(1,7) d),
  'attempt_offsets',jsonb_build_array(0,0,2,4,6)));
 perform pg_temp.actor(3);
 perform pg_temp.ok(public.crm_get_centre_hours()<>before_hours and public.crm_get_centre_hours()->'calling_hours'->'2'='[["11:00","19:00"]]'::jsonb,'centre hours read the new version');
 perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"no_answer"}');
 perform pg_temp.ok((select followup_policy_id from public.crm_leads where id=l)=pinned,'cadence policy stays pinned');
 perform pg_temp.ok(((pg_temp.na(l)).due_at at time zone public.centre_utc_offset())::time between '11:00' and '19:00','the next system time uses the new hours');
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',(pg_temp.na(l)).id,'next',jsonb_build_object('task_type','callback','schedule_kind','appointment',
  'due_at',(((now() at time zone public.centre_utc_offset())::date+2)::timestamp+time '10:15') at time zone public.centre_utc_offset())),'22023','crm_hours.outside_calling');
end $$;
\echo PASS T4b new hours version applies at once, cadence pinned

-- T5: no outcome before the appointment starts; outcomes set the test and the next action.
do $$ declare l uuid; k public.crm_tasks; code text; begin
 foreach code in array array['came_enrolled','came_will_return','came_not_interested','no_show'] loop
  l:=pg_temp.intake();
  perform pg_temp.book(l,pg_temp.at('opening',9,'10:00'),true);
  k:=pg_temp.na(l);
  perform pg_temp.refused('record_appointment_outcome',l,jsonb_build_object('action_id',k.id,'outcome_code',code),'22023','crm_appointment.before_start');
  perform pg_temp.backdate(k.id);
  -- Fixture only: move the booked test to the appointment's (now past) day without the booking triggers.
  set local session_replication_role=replica;
  update public.placement_tests set date_test=(now() at time zone public.centre_utc_offset())::date-1 where id=k.placement_test_id;
  set local session_replication_role=origin;
  -- « Venu · pas intéressé » asks the close reason; it is never assumed (§4.8).
  if code='came_not_interested' then
   perform pg_temp.refused('record_appointment_outcome',l,jsonb_build_object('action_id',k.id,'outcome_code',code),'22023','crm_appointment.reason_required');
   perform pg_temp.ok((select status='open' from public.crm_tasks where id=k.id),'refused outcome changes nothing');
  end if;
  perform pg_temp.act('record_appointment_outcome',l,jsonb_build_object('action_id',k.id,'outcome_code',code)
   ||case when code='came_not_interested' then '{"next":{"close":{"status":"LOST","reason":"price"}}}'::jsonb else '{}'::jsonb end);
  perform pg_temp.ok((select status='completed' and outcome_code=code from public.crm_tasks where id=k.id),'appointment completed with '||code);
  perform pg_temp.ok((select status=case when code='no_show' then 'Absent' else 'Passé' end from public.placement_tests where id=k.placement_test_id),'test status after '||code);
  if code='came_not_interested' then
   perform pg_temp.ok((select status='LOST' and closure_reason='price' from public.crm_leads where id=l) and not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'not interested closes with the chosen reason');
  else
   perform pg_temp.one(l,'after '||code);
   perform pg_temp.ok((pg_temp.na(l)).task_type=case code when 'came_enrolled' then 'enrollment_followup' when 'came_will_return' then 'awaiting_prospect' else 'callback' end,'next action after '||code);
  end if;
 end loop;
end $$;
\echo PASS T5 outcomes refused before start; test status and next action per outcome

-- T5b (review of #208, B1): « Changer » never books a new appointment for a prospect
-- not yet qualified (OD-11: the exchange that books it qualifies it); an appointment
-- that already exists on such a prospect (reopened with one, an old tab, D1 rule b)
-- qualifies at its outcome, so enrolment can start.
do $$ declare l uuid; k public.crm_tasks; code text; r jsonb; begin
 l:=pg_temp.intake();
 perform pg_temp.refused('change_next_action',l,jsonb_build_object('expected_action_id',(pg_temp.na(l)).id,'next',
  jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',3,'11:00'))),'22023','crm_next_action.appointment_needs_exchange');
 perform pg_temp.ok((select status='NEW' from public.crm_leads where id=l) and (pg_temp.na(l)).task_type='first_contact','the refused booking changes nothing');
 perform pg_temp.book(l,pg_temp.at('opening',3,'11:00'));
 perform pg_temp.ok((select status='QUALIFIED' and qualification_step='center_visit' from public.crm_leads where id=l),'the exchange books and qualifies (OD-11)');
 -- Once qualified, « Changer » moves or books appointments as before.
 k:=pg_temp.na(l);
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',
  jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',4,'11:00'),'replace_action_id',k.id)));
 perform pg_temp.one(l,'qualified prospect: « Changer » moves the appointment');
 foreach code in array array['came_enrolled','came_will_return'] loop
  l:=pg_temp.intake();
  -- Fixture: an appointment left on a NEW prospect by an old tab (the legacy « Planifier »).
  perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',pg_temp.at('opening',3,'11:00'))));
  k:=pg_temp.na(l);
  perform pg_temp.ok(k.task_type='center_visit' and (select status='NEW' from public.crm_leads where id=l),'fixture: appointment on a NEW prospect');
  perform pg_temp.backdate(k.id);
  perform pg_temp.act('record_appointment_outcome',l,jsonb_build_object('action_id',k.id,'outcome_code',code));
  perform pg_temp.ok((select status='QUALIFIED' and qualification_step=case when code='came_enrolled' then 'enrollment' else 'center_visit' end from public.crm_leads where id=l),code||' qualifies a prospect not yet qualified');
  perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='conversation_recorded' and channel='in_person'),code||' records the in-person conversation');
  perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='lead_engaged')
   and (select count(*)=1 from public.crm_activities where lead_id=l and event_type='lead_qualified'),code||': lifecycle events once each');
  perform pg_temp.one(l,'after '||code||' on an unqualified prospect');
  if code='came_enrolled' then
   -- The dead end of the review: enrolment now starts (the payment wrapper converts).
   r:=public.crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from public.crm_leads where id=l),
    'student_choice','new','learner_name','Synthetic learner B1','birth_date','2015-01-01','session_type','Yearly','school_year','2026/2027','level','Child 2',
    'candidate_review',crm_security.candidate_token(l,'Synthetic learner B1','2015-01-01'::date),'confirm_new',true,'initial_status','Confirmed'));
   perform pg_temp.ok(r->'lead'->>'id'=l::text and (select enrollment_id is not null from public.crm_leads where id=l),'enrolment starts after « Venu · s''inscrit »');
  end if;
 end loop;
end $$;
\echo PASS T5b B1 appointment needs the qualifying exchange; outcomes on a legacy appointment qualify

-- T5c (review of #208, B2): a cancelled or absent test never becomes « Planifié » again,
-- by any path; a result can still be entered on a cancelled test.
do $$ declare l uuid; k public.crm_tasks; p uuid; q jsonb; via text; begin
 foreach via in array array['close','change','no_show'] loop
  l:=pg_temp.intake();
  perform pg_temp.book(l,pg_temp.at('opening',3,'11:00'),true);
  k:=pg_temp.na(l); p:=k.placement_test_id;
  if via='close' then perform pg_temp.act('close_prospect',l,'{"status":"LOST","reason":"price"}');
  elsif via='change' then
   perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','callback','due_preset','tomorrow','replace_action_id',k.id)));
  else
   perform pg_temp.backdate(k.id);
   set local session_replication_role=replica;
   update public.placement_tests set date_test=(now() at time zone public.centre_utc_offset())::date-1 where id=p;
   set local session_replication_role=origin;
   perform pg_temp.act('record_appointment_outcome',l,jsonb_build_object('action_id',k.id,'outcome_code','no_show'));
  end if;
  perform pg_temp.ok((select status=case when via='no_show' then 'Absent' else 'Annulé' end from public.placement_tests where id=p),'fixture: test ended by '||via);
  q:=jsonb_build_object('placement_id',p,'expected_updated_at',(select updated_at from public.placement_tests where id=p),'expected_version',(select version from public.crm_leads where id=l),
   'date_test',(select date_test from public.placement_tests where id=p),'heure',(select heure from public.placement_tests where id=p),'status','Planifié');
  perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q),'22023','crm_placement.not_replannable');
  perform pg_temp.denied(format('update public.placement_tests set status=%L where id=%L','Planifié',p),'22023','crm_placement.not_replannable');
  perform pg_temp.ok((select status<>'Planifié' from public.placement_tests where id=p),'still not planned after '||via);
  -- Re-review of #208: two steps through « Passé » are refused as well (owner decision 2).
  update public.placement_tests set status='Passé' where id=p;
  q:=q||jsonb_build_object('expected_updated_at',(select updated_at from public.placement_tests where id=p),'expected_version',(select version from public.crm_leads where id=l));
  perform pg_temp.denied(format('select public.crm_update_placement_test(%L,%L)',gen_random_uuid(),q),'22023','crm_placement.not_replannable');
  perform pg_temp.denied(format('update public.placement_tests set status=%L where id=%L','Planifié',p),'22023','crm_placement.not_replannable');
  perform pg_temp.ok((select status='Passé' from public.placement_tests where id=p),'two-step replan refused after '||via);
 end loop;
 -- C2 scope: a student's own test (no prospect) keeps today's behaviour.
 insert into public.placement_tests(student_name,date_test,heure,status,cancelled_at,examinateur)
 values('Synthetic student',(now() at time zone public.centre_utc_offset())::date+2,'11:00','Annulé',now(),'Fixture') returning id into p;
 update public.placement_tests set status='Planifié' where id=p;
 update public.placement_tests set status='Passé' where id=p;
 update public.placement_tests set status='Planifié' where id=p;
 perform pg_temp.ok((select status='Planifié' from public.placement_tests where id=p),'a student''s own test can still be planned again');
 delete from public.placement_tests where id=p;
 -- A result on a cancelled test stays allowed (the migration's cancel check).
 perform pg_temp.ok((select count(*)=0 from public.placement_tests where id=p and status='Planifié'),'cancelled fixture');
 l:=pg_temp.intake();
 perform pg_temp.book(l,pg_temp.at('opening',3,'11:00'),true);
 k:=pg_temp.na(l); p:=k.placement_test_id;
 perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',k.id,'next',jsonb_build_object('task_type','callback','due_preset','tomorrow','replace_action_id',k.id)));
 set local session_replication_role=replica;
 update public.placement_tests set date_test=(now() at time zone public.centre_utc_offset())::date-1 where id=p;
 set local session_replication_role=origin;
 update public.placement_tests set status='Résultat saisi',niveau_recommande='A2' where id=p;
 perform pg_temp.ok((select status='Résultat saisi' and cancelled_at is not null from public.placement_tests where id=p),'a result on a cancelled test keeps its cancellation history');
end $$;
\echo PASS T5c B2 a prospect's cancelled or absent test is never planned again (one or two steps); students' tests unchanged

-- T5d (review of #208, important 4): an appointment still to come that an exchange
-- replaces is cancelled « Remplacée », never completed, and is not shown as held.
do $$ declare l uuid; k public.crm_tasks; d date; begin
 l:=pg_temp.intake();
 perform pg_temp.book(l,pg_temp.at('opening',5,'11:00'),true);
 k:=pg_temp.na(l);
 perform pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result','spoke','next',
  jsonb_build_object('task_type','callback','schedule_kind','appointment','due_at',pg_temp.at('calling',2,'16:00'),'replace_action_id',k.id)));
 perform pg_temp.ok((select status='cancelled' and replaced_reason is not null and completed_at is null and outcome_code is null from public.crm_tasks where id=k.id),
  'a future appointment replaced by an exchange is cancelled « Remplacée »');
 perform pg_temp.ok((select status='Annulé' from public.placement_tests where id=k.placement_test_id),'its test is cancelled with it');
 d:=(k.due_at at time zone public.centre_utc_offset())::date;
 perform pg_temp.ok(position(k.id::text in public.crm_get_admissions_calendar(d,d+1,'all',true)::text)=0,'« Inclure terminés » does not show it as a visit that took place');
 perform pg_temp.one(l,'after the exchange');
end $$;
\echo PASS T5d future appointment replaced by an exchange is cancelled, not completed

-- T7b: five failed calls → attempts 1–5, « En attente » after the fifth (OD-17), then « Injoignable ».
do $$ declare l uuid; r jsonb; begin
 l:=pg_temp.intake();
 update public.crm_leads set created_at=now()-interval '20 days',outreach_anchor_date=(now() at time zone public.centre_utc_offset())::date-20 where id=l;
 for i in 1..5 loop
  r:=pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result','no_answer','occurred_at',now()-make_interval(days=>12-2*i)));
 end loop;
 perform pg_temp.ok((r->>'failed_attempts')::integer=5,'five attempts');
 perform pg_temp.ok((select array_agg(attempt_ordinal order by attempt_ordinal)=array[1,2,3,4,5]::smallint[] from public.crm_activities where lead_id=l and event_type='contact_attempted'),'attempts numbered 1–5');
 perform pg_temp.one(l,'after five');
 perform pg_temp.ok((pg_temp.na(l)).task_type='awaiting_prospect','« En attente » after the fifth failure');
 perform pg_temp.act('close_prospect',l,'{"status":"LOST","reason":"unreachable"}');
 perform pg_temp.ok((select status='LOST' from public.crm_leads where id=l),'« Injoignable » accepted');
end $$;
\echo PASS T7b five failed calls, awaiting after the fifth, unreachable closure

-- T8: one user action = one primary history row; the note appears once; a replay adds nothing.
do $$ declare l uuid; req uuid:=gen_random_uuid(); key text; d jsonb; r jsonb; n integer; begin
 l:=pg_temp.intake();
 d:=pg_temp.data(l,jsonb_build_object('channel','phone','result','spoke','note','Note unique de test','next',jsonb_build_object('task_type','callback','due_preset','tomorrow')));
 r:=public.crm_log_exchange(req,d);
 select command_key into key from public.crm_activities where lead_id=l and is_primary order by occurred_at desc limit 1;
 perform pg_temp.ok(key is not null and (select count(*)=1 from public.crm_activities where command_key=key and is_primary),'one primary row per command');
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and body like '%Note unique de test%'),'note text stored once');
 perform pg_temp.ok((select count(*)>1 from public.crm_activities where command_key=key),'secondary rows keep the details');
 perform pg_temp.ok((select count(*) from jsonb_array_elements(public.crm_get_timeline(l)->'rows') x where x->>'id' in (select id::text from public.crm_activities where command_key=key))=1,'timeline shows the action once');
 perform pg_temp.ok((select count(*) from jsonb_array_elements(public.crm_get_timeline(l,null,50,true)->'rows') x where x->>'id' in (select id::text from public.crm_activities where command_key=key))>1,'details show every row');
 n:=(select count(*) from public.crm_activities where lead_id=l);
 perform pg_temp.ok(public.crm_log_exchange(req,d)=r and (select count(*) from public.crm_activities where lead_id=l)=n,'replayed request returns the first result and adds nothing');
 perform pg_temp.one(l,'after replay');
end $$;
\echo PASS T8 one primary history row per action

-- T10: every open action has an owner or sits in the shared default view (me_or_unassigned).
do $$ declare l uuid; q jsonb; begin
 l:=pg_temp.intake();
 update public.crm_leads set owner_id=null where id=l;
 update public.crm_tasks set assigned_to=null where lead_id=l and status='open';
 perform pg_temp.actor(2);
 q:=public.crm_get_work_queue(p_bucket=>case when (pg_temp.na(l)).due_at<now() then 'overdue' when (pg_temp.na(l)).due_at<(select d1 from crm_security.work_boundaries(now())) then 'today'
  when (pg_temp.na(l)).due_at<(select d2 from crm_security.work_boundaries(now())) then 'tomorrow' else 'upcoming' end,p_assignee_mode=>'me_or_unassigned',p_limit=>50);
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(q->'rows')x where x->>'lead_id'=l::text),'unassigned action visible in the default view');
 perform pg_temp.actor(3);
 perform pg_temp.ok(public.crm_check_action(l)->'next_action'->>'id'=(pg_temp.na(l)).id::text,'pre-form check reads the same action');
end $$;
\echo PASS T10 unassigned actions reach the shared default view

-- R-n: replays of the R0 histories (event shapes only, no personal data). Each
-- old sequence produced 2+ open actions; through the same wrappers it now yields one.
do $$ declare l uuid; t public.crm_tasks; begin
 -- R-1 / R-5: « Planifier » a visit, then qualify with step « Visite », then reminders.
 l:=pg_temp.intake();
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',pg_temp.at('opening',3,'17:00'))));
 perform pg_temp.one(l,'R-1 visit planned');
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('qualification_step','center_visit','conversation_channel','phone','note','Visite',
  'next_task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',pg_temp.at('opening',3,'17:00'))));
 perform pg_temp.one(l,'R-1 qualify reuses the visit');
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=l and task_type='center_visit' and status='open'),'R-1 no duplicate visit in the calendar');
 -- R-3: daily reminders created one after another.
 l:=pg_temp.intake();
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('qualification_step','placement_test','conversation_channel','phone','note','Test',
  'next_task',jsonb_build_object('task_type','confirm_placement_test','due_preset','in_3_days')));
 for i in 1..3 loop
  perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','tomorrow','schedule_kind','reminder')));
  perform pg_temp.one(l,'R-3 reminder '||i);
 end loop;
 -- R-2: a visit, then « Injoignable » on a call: the visit is kept, no slot beside it.
 l:=pg_temp.intake();
 perform pg_temp.act('qualify_lead',l,jsonb_build_object('qualification_step','center_visit','conversation_channel','phone','note','Visite',
  'next_task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',pg_temp.at('opening',2,'18:00'))));
 t:=pg_temp.na(l);
 perform pg_temp.act('record_call_outcome',l,'{"outcome":"unreachable"}');
 perform pg_temp.one(l,'R-2 failed call beside a visit');
 perform pg_temp.ok((pg_temp.na(l)).id=t.id,'R-2 visit kept');
 -- R-4: a second visit a week later replaces the first.
 l:=pg_temp.intake();
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',pg_temp.at('opening',1,'12:00'))));
 t:=pg_temp.na(l);
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task_id',t.id,'expected_task_version',t.version,'task',jsonb_build_object('due_at',pg_temp.at('opening',8,'12:00'))));
 perform pg_temp.one(l,'R-4 visit moved, not duplicated');
end $$;
\echo PASS R-n replays of R0 histories yield one action


-- T4c (review of #208, important 3; §4.5): agreed times booked before a change of
-- hours are kept, never moved, and listed « Hors des nouveaux horaires ». Last in
-- the file: it publishes new hours.
do $$ declare v uuid; c uuid; kv public.crm_tasks; kc public.crm_tasks; q jsonb; begin
 v:=pg_temp.intake(); c:=pg_temp.intake();
 perform pg_temp.book(v,pg_temp.at('opening',3,'11:00'));
 perform pg_temp.act('log_exchange',c,jsonb_build_object('channel','phone','result','spoke','next',
  jsonb_build_object('task_type','callback','schedule_kind','appointment','due_at',pg_temp.at('calling',3,'16:00'))));
 kv:=pg_temp.na(v); kc:=pg_temp.na(c);
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.crm_list_outside_hours()->'rows') x where x->>'lead_id' in (v::text,c::text)),'inside the hours: not listed');
 perform pg_temp.actor(1);
 perform public.crm_create_followup_policy(gen_random_uuid(),jsonb_build_object(
  'weekly_hours',(select jsonb_object_agg(d::text,jsonb_build_array(jsonb_build_array('07:00','08:00'))) from generate_series(1,7) d),
  'opening_hours',(select jsonb_object_agg(d::text,jsonb_build_array(jsonb_build_array('07:00','08:00'))) from generate_series(1,7) d)));
 perform pg_temp.actor(3);
 q:=public.crm_list_outside_hours();
 perform pg_temp.ok((select count(*)=1 from jsonb_array_elements(q->'rows') x where x->>'lead_id'=v::text and x->'action'->>'id'=kv.id::text)
  and (select count(*)=1 from jsonb_array_elements(q->'rows') x where x->>'lead_id'=c::text and x->'action'->>'id'=kc.id::text),'the appointment and the agreed callback are listed');
 perform pg_temp.ok((select due_at=kv.due_at and status='open' from public.crm_tasks where id=kv.id) and (select due_at=kc.due_at and status='open' from public.crm_tasks where id=kc.id),'agreed times are kept, never moved');
 perform pg_temp.ok((q->>'total')::integer>=2,'the total counts them');
 perform pg_temp.actor(4);
 perform pg_temp.denied('select public.crm_list_outside_hours()','42501');
 perform pg_temp.actor(3);
end $$;
\echo PASS T4c « Hors des nouveaux horaires » lists kept agreed times outside the current hours

rollback;
