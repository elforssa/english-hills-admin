-- RWR-r5 PR A1 — one next action per prospect (M-A1).
-- Plan: docs/architecture/plans/receptionist-workflow.md §4 (approved at 824252a,
-- OD-3 hours recorded at 811dca9). ADR-019.
--
-- PROVISIONAL NUMBER: migration numbers are claimed at merge. A1 merges after
-- PR #204 (OD-19 = A), whose migrations come first; rename on rebase if needed.
--
-- What this migration does (forward-only, additive schema):
--  * crm_tasks: awaiting_prospect, nullable due_at for it only, appointment
--    outcome, replaced_reason, D1 review flag;
--  * placement_tests: Annulé / Absent with cancellation columns;
--  * crm_followup_policies.opening_hours (NULL = weekly_hours, OD-3 = B);
--  * crm_activities.command_key / is_primary (one history entry per action);
--  * crm_data_step_journal (D1 and later data steps);
--  * crm_security.set_next_action: the single writer of open next actions;
--    every function of the §4.2 writer inventory is rebuilt from its latest
--    live definition (ceiling 130) to call it;
--  * hours split (§4.5): hours from the current published policy, cadence from
--    the prospect's pinned policy;
--  * new commands crm_log_exchange, crm_change_next_action,
--    crm_record_appointment_outcome, crm_close_prospect, crm_reopen_prospect and
--    reads crm_get_centre_hours, crm_check_action; readers use next_action_id;
--  * D1 functions d1_plan / d1_apply / d1_revert (NOT run by this migration).
--
-- Unchanged on purpose: the lifecycle barrier, pre-identity keys and pending-stop
-- handoff (copied verbatim from the live command body, as 103 re-created them),
-- every event type read by the Meta lifecycle, first-touch immutability and the
-- conversion rule of ADR-015 decision 4 (only its task-closing statement moves).

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.crm_tasks drop constraint crm_tasks_task_type_check;
alter table public.crm_tasks add constraint crm_tasks_task_type_check check (task_type = any (array[
 'first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test',
 'post_test_followup','center_visit','enrollment_followup','awaiting_prospect']));
alter table public.crm_tasks alter column due_at drop not null;
alter table public.crm_tasks add constraint crm_tasks_due_required check (due_at is not null or task_type='awaiting_prospect');
alter table public.crm_tasks
 add column outcome_code text,
 add column outcome_at timestamptz,
 add column replaced_reason text,
 add column review_flag text;
alter table public.crm_tasks
 add constraint crm_tasks_outcome_code_check check (outcome_code is null or outcome_code = any (array['came_enrolled','came_will_return','came_not_interested','no_show'])),
 add constraint crm_tasks_outcome_pair check ((outcome_code is null) = (outcome_at is null)),
 add constraint crm_tasks_outcome_completed check (outcome_code is null or (status='completed' and task_type='center_visit')),
 add constraint crm_tasks_replaced_reason_check check (replaced_reason is null or (status='cancelled' and length(btrim(replaced_reason)) between 1 and 500)),
 add constraint crm_tasks_review_flag_check check (review_flag is null or review_flag='d1_review');

alter table public.placement_tests drop constraint placement_tests_status_check;
alter table public.placement_tests add constraint placement_tests_status_check
 check (status = any (array['Planifié','Passé','Résultat saisi','Affecté','Annulé','Absent']));
alter table public.placement_tests
 add column cancelled_at timestamptz,
 add column cancelled_by uuid references public.profiles(id) on delete restrict,
 add column cancel_reason text;
alter table public.placement_tests
 -- « Annulé » always carries its cancellation; a test later brought back (a result
 -- entered from the placements screen) keeps that history rather than failing.
 add constraint placement_tests_cancel_check check (status is distinct from 'Annulé' or cancelled_at is not null),
 add constraint placement_tests_cancel_reason_check check (cancel_reason is null or (cancelled_at is not null and length(btrim(cancel_reason)) between 1 and 500));

-- ALTER ... ADD COLUMN does not fire the immutability trigger (protect_policy):
-- existing versions keep opening_hours NULL, which means « same as weekly_hours ».
alter table public.crm_followup_policies add column opening_hours jsonb;

alter table public.crm_activities
 add column command_key text,
 add column is_primary boolean not null default false;
alter table public.crm_activities add constraint crm_activities_primary_key_check check (not is_primary or command_key is not null);
create index crm_activities_command_idx on public.crm_activities(lead_id, command_key) where command_key is not null;

create table public.crm_data_step_journal(
 id uuid primary key default gen_random_uuid(),
 step text not null check (step ~ '^[a-z][a-z0-9_]*$'),
 entity text not null check (entity ~ '^[a-z][a-z0-9_]*$'),
 entity_id uuid,
 before jsonb,
 after jsonb,
 run_at timestamptz not null default now(),
 run_by uuid references public.profiles(id) on delete restrict
);
create index crm_data_step_journal_step_idx on public.crm_data_step_journal(step, run_at, id);
alter table public.crm_data_step_journal enable row level security;
revoke all on table public.crm_data_step_journal from public, anon, authenticated, service_role;
-- No table grant (079: audited RPCs are the only browser read boundary). The
-- director reads the journal through crm_list_data_step_journal (§10 reads).

-- ---------------------------------------------------------------------------
-- 2. Hours (§4.5): one versioned source; hours from the current version.
-- ---------------------------------------------------------------------------
create or replace function crm_security.current_policy_id()
 returns uuid language plpgsql stable set search_path to 'pg_catalog','pg_temp' as $function$
declare result uuid; begin
 select id into result from public.crm_followup_policies
 where effective_from<=now() and (retired_at is null or retired_at>now()) order by effective_from desc, version desc limit 1;
 if result is null then raise exception 'No effective follow-up policy; ask a director to publish one' using errcode='22023'; end if;
 return result;
end $function$;

create or replace function crm_security.closed_dates(policy uuid)
 returns date[] language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select coalesce(array_agg(value::date order by value),'{}'::date[])
 from public.crm_followup_policies p cross join lateral jsonb_array_elements_text(p.date_exceptions) value
 where p.id=policy and jsonb_typeof(p.date_exceptions)='array' and value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
$function$;

-- kind 'calling' = weekly_hours; 'opening' = opening_hours (NULL = weekly_hours).
-- Closed dates (date_exceptions) have no window of either kind.
create or replace function crm_security.window_at(policy uuid, kind text, target timestamptz)
 returns timestamptz language plpgsql stable set search_path to 'pg_catalog','pg_temp' as $function$
declare p public.crm_followup_policies%rowtype; hours jsonb; closed date[]; d date; w jsonb; opens timestamptz; closes timestamptz; i integer;
begin
 select * into strict p from public.crm_followup_policies where id=policy;
 if target is null or not isfinite(target) then raise exception 'Finite due time required' using errcode='22023'; end if;
 hours:=case kind when 'calling' then p.weekly_hours when 'opening' then coalesce(p.opening_hours,p.weekly_hours) end;
 if hours is null then raise exception 'Unknown hours kind' using errcode='22023'; end if;
 closed:=crm_security.closed_dates(policy);
 d:=(target at time zone public.centre_utc_offset())::date;
 for i in 0..370 loop
  if not (d = any(closed)) then
   for w in select value from jsonb_array_elements(hours->extract(isodow from d)::integer::text) loop
    opens:=(d+(w->>0)::time) at time zone public.centre_utc_offset();
    closes:=(d+(w->>1)::time) at time zone public.centre_utc_offset();
    if greatest(target,opens)<closes then return greatest(target,opens); end if;
   end loop;
  end if;
  d:=d+1;
 end loop;
 raise exception 'Policy has no available calling window' using errcode='22023';
end $function$;

-- Same signature as before; now honours closed dates. Every rewritten caller
-- passes current_policy_id() for hours (§4.5).
create or replace function crm_security.next_window(policy uuid, target timestamptz)
 returns timestamptz language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select crm_security.window_at(policy,'calling',target)
$function$;

create or replace function crm_security.assert_in_hours(kind text, ts timestamptz)
 returns void language plpgsql stable set search_path to 'pg_catalog','pg_temp' as $function$
begin
 if ts is null or not isfinite(ts) then raise exception 'Finite time required' using errcode='22023'; end if;
 if crm_security.window_at(crm_security.current_policy_id(),kind,ts)<>ts then
  if kind='opening' then raise exception 'Time is outside opening hours' using errcode='22023',hint='crm_hours.outside_opening';
  else raise exception 'Agreed callback time is outside calling hours' using errcode='22023',hint='crm_hours.outside_calling'; end if;
 end if;
end $function$;

-- Cadence (offsets, gap) from the pinned policy; hours from the current one.
create or replace function crm_security.attempt_due(policy uuid, anchor date, ordinal integer, last_call timestamptz, as_of timestamptz)
 returns timestamptz language plpgsql stable set search_path to 'pg_catalog','pg_temp' as $function$
declare p public.crm_followup_policies%rowtype; target timestamptz;
begin
 select * into strict p from public.crm_followup_policies where id=policy;
 if ordinal not between 1 and 5 or anchor is null or as_of is null then raise exception 'Invalid attempt scheduling input' using errcode='22023'; end if;
 target:=(anchor+p.attempt_offsets[ordinal])::timestamp at time zone public.centre_utc_offset();
 target:=greatest(target,as_of,coalesce(last_call,as_of)+make_interval(mins=>p.minimum_attempt_gap_minutes));
 return crm_security.next_window(crm_security.current_policy_id(),target);
end $function$;

create or replace function crm_security.placement_followup_due(policy uuid, happened timestamptz)
 returns timestamptz language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select crm_security.next_window(crm_security.current_policy_id(),happened+make_interval(mins=>p.post_test_sla_minutes)) from public.crm_followup_policies p where p.id=policy
$function$;

create or replace function crm_security.reminder_due(policy uuid, preset text)
 returns timestamptz language plpgsql stable set search_path to 'pg_catalog','pg_temp' as $function$
declare today date; target timestamptz;
begin
 perform 1 from public.crm_followup_policies where id=policy;
 if not found then raise exception 'Unknown follow-up policy' using errcode='22023'; end if;
 today:=(now() at time zone public.centre_utc_offset())::date;
 target:=case preset
  when 'in_2_hours' then now()+interval '2 hours'
  when 'tomorrow' then (today+1)::timestamp at time zone public.centre_utc_offset()
  when 'in_2_days' then (today+2)::timestamp at time zone public.centre_utc_offset()
  when 'in_3_days' then (today+3)::timestamp at time zone public.centre_utc_offset()
  when 'in_5_days' then (today+5)::timestamp at time zone public.centre_utc_offset()
  when 'next_week' then (today+7)::timestamp at time zone public.centre_utc_offset()
 end;
 if target is null then raise exception 'Unknown reminder preset' using errcode='22023'; end if;
 return crm_security.next_window(crm_security.current_policy_id(),target);
end $function$;

create or replace function crm_security.validate_hours_set(hours jsonb, exceptions jsonb)
 returns void language plpgsql immutable set search_path to 'pg_catalog','pg_temp' as $function$
declare d integer; w jsonb; previous_end text; starts text; ends text; x text;
begin
 if hours is not null then
  if jsonb_typeof(hours) is distinct from 'object' or hours-array['1','2','3','4','5','6','7']<>'{}'::jsonb then raise exception 'Invalid opening hours' using errcode='22023'; end if;
  for d in 1..7 loop
   if jsonb_typeof(hours->d::text) is distinct from 'array' then raise exception 'Supply all seven weekdays' using errcode='22023'; end if;
   previous_end:=null;
   for w in select value from jsonb_array_elements(hours->d::text) loop
    if jsonb_typeof(w) is distinct from 'array' or jsonb_array_length(w)<>2 or jsonb_typeof(w->0)<>'string' or jsonb_typeof(w->1)<>'string' then raise exception 'Invalid window' using errcode='22023'; end if;
    starts:=w->>0; ends:=w->>1;
    if starts !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or ends !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or starts>=ends or (previous_end is not null and starts<previous_end) then
     raise exception 'Windows must be ordered, non-overlapping and start before end' using errcode='22023'; end if;
    previous_end:=ends;
   end loop;
  end loop;
 end if;
 if jsonb_typeof(exceptions) is distinct from 'array' or jsonb_array_length(exceptions)>366 then raise exception 'Closed dates must be a list' using errcode='22023'; end if;
 for x in select value from jsonb_array_elements_text(exceptions) loop
  if x !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or x::date::text<>x then raise exception 'Closed dates use YYYY-MM-DD' using errcode='22023'; end if;
 end loop;
end $function$;

-- ---------------------------------------------------------------------------
-- 3. Ownership (§4.6): director-chosen default owner for intake (OD-6).
-- ---------------------------------------------------------------------------
create or replace function crm_security.reception_default_owner()
 returns uuid language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare v text; owner uuid; begin
 select value into v from public.app_config where key='crm_reception_default_owner';
 if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
 owner:=v::uuid;
 if not exists(select 1 from public.profiles where id=owner and role in ('director','admin','receptionist')) then return null; end if;
 return owner;
end $function$;
revoke all on function crm_security.reception_default_owner() from public, anon, authenticated, service_role;

create or replace function public.crm_set_reception_default_owner(p_owner uuid)
 returns jsonb language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
begin
 perform crm_security.require_reader(true);
 if p_owner is null then
  delete from public.app_config where key='crm_reception_default_owner';
 else
  perform crm_security.assert_staff(p_owner);
  insert into public.app_config(key,value,label) values('crm_reception_default_owner',p_owner::text,'Responsable par défaut des nouveaux prospects (Meta, site)')
  on conflict(key) do update set value=excluded.value,updated_at=now();
 end if;
 return jsonb_build_object('owner_id',crm_security.reception_default_owner());
end $function$;
revoke all on function public.crm_set_reception_default_owner(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_set_reception_default_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. History (§4.7): every command writes one primary row; the rows it writes
--    on the way (task_created, task_cancelled, lead_engaged…) carry the same
--    command_key and no body.
-- ---------------------------------------------------------------------------
create or replace function crm_security.event(lead uuid, kind text, source text, note text default null, channel text default null, outcome text default null,
 task uuid default null, happened timestamptz default null, cycle integer default null, ordinal smallint default null,
 from_state text default null, to_state text default null, submission uuid default null)
 returns uuid language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$
declare result uuid; ckey text:=nullif(current_setting('eh.crm_command_key',true),''); begin
 if kind<>all(array['lead_created','submission_received','note_added','contact_attempted','call_no_answer','call_busy','call_declined','call_unreachable','call_wrong_number',
 'conversation_recorded','whatsapp_sent','whatsapp_conversation','task_created','task_completed','task_rescheduled','task_cancelled',
 'lead_engaged','lead_qualified','lead_lost','lead_not_qualified','lead_reopened','lead_reassigned','task_reassigned']) then
  raise exception 'Unknown CRM event' using errcode='22023'; end if;
 if length(note)>4000 then raise exception 'Note too long' using errcode='22023'; end if;
 insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,channel,outcome,task_id,outreach_cycle,attempt_ordinal,from_status,to_status,submission_id,command_key)
 values(lead,coalesce(happened,now()),auth.uid(),'user',kind,source,case when ckey is null then note end,channel,outcome,task,cycle,ordinal,from_state,to_state,submission,ckey) returning id into result;
 return result;
end $function$;

create or replace function crm_security.action_label(t public.crm_tasks)
 returns text language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select case when t.id is null then 'Aucune prochaine action' else
  case t.task_type
   when 'first_contact' then 'Premier contact'
   when 'contact_attempt' then 'Appel de suivi'
   when 'callback' then case when t.schedule_kind='appointment' then 'Rappel convenu' else 'Rappel' end
   when 'whatsapp_followup' then 'À faire par nous (WhatsApp)'
   when 'confirm_placement_test' then 'Confirmer le test de niveau'
   when 'post_test_followup' then 'Proposer l’inscription'
   when 'center_visit' then 'Rendez-vous au centre'
   when 'enrollment_followup' then 'Finaliser l’inscription'
   when 'awaiting_prospect' then 'En attente du prospect'
   else t.task_type end
  ||case when t.due_at is null then ''
    when t.task_type='awaiting_prospect' then ' (relance '||to_char(t.due_at at time zone public.centre_utc_offset(),'DD/MM')||')'
    else ' '||to_char(t.due_at at time zone public.centre_utc_offset(),'DD/MM HH24:MI') end
  ||case when t.task_type='center_visit' and t.placement_test_id is not null then ' (avec test)' else '' end
 end
$function$;

create or replace function crm_security.primary_event(lead uuid, command text, note text, channel text default null, outcome text default null,
 before_label text default null, after_label text default null, happened timestamptz default null, extra jsonb default '{}'::jsonb)
 returns uuid language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$
declare result uuid; ckey text:=nullif(current_setting('eh.crm_command_key',true),''); summary text; begin
 if ckey is null then raise exception 'Primary history row requires a command key' using errcode='XX000'; end if;
 if length(note)>4000 then raise exception 'Note too long' using errcode='22023'; end if;
 summary:=concat_ws(' · ',nullif(extra->>'result_label',''),
  case when before_label is distinct from after_label then coalesce(before_label,'Aucune prochaine action')||' → '||coalesce(after_label,'Aucune prochaine action') end);
 insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,channel,outcome,details,command_key,is_primary)
 values(lead,coalesce(happened,now()),auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'action_recorded',ckey||':primary',
  nullif(btrim(note),''),channel,outcome,
  jsonb_strip_nulls(jsonb_build_object('command',command,'summary',nullif(summary,''),'before',before_label,'after',after_label))||(extra-'result_label'),ckey,true)
 returning id into result;
 return result;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. Primitives, called only by set_next_action (inventory test).
-- ---------------------------------------------------------------------------
drop function crm_security.new_task(public.crm_leads,jsonb,text,text,smallint,text);
create function crm_security.new_task(l public.crm_leads, spec jsonb, source text, kind text default 'manual', ordinal smallint default null,
 event_source text default null, supersedes uuid default null, test uuid default null, source_activity uuid default null, skip_checks boolean default false,
 intake_actor text default null)
 returns uuid language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$
declare t uuid; due timestamptz; assignee uuid; typ text; schedule text; reason text; hours uuid:=crm_security.current_policy_id();
begin
 if jsonb_typeof(spec) is distinct from 'object' or spec-array['task_type','due_at','due_preset','schedule_kind','followup_reason','assigned_to','instructions']<>'{}'::jsonb then raise exception 'Next task required' using errcode='22023'; end if;
 typ:=spec->>'task_type'; schedule:=spec->>'schedule_kind'; reason:=spec->>'followup_reason';
 if typ is null or typ<>all(array['first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup','awaiting_prospect']) then
  raise exception 'Valid future task required' using errcode='22023'; end if;
 -- Cadence slots and waiting are neither kind; a center visit is always agreed.
 if typ='center_visit' then schedule:=coalesce(schedule,'appointment'); end if;
 if schedule is not null and (schedule not in ('appointment','reminder') or typ in ('first_contact','contact_attempt','awaiting_prospect')
  or (typ='center_visit' and schedule<>'appointment')) then raise exception 'Invalid follow-up kind' using errcode='22023'; end if;
 if reason is not null and (reason<>'considering' or typ not in ('callback','whatsapp_followup')) then
  raise exception 'Invalid follow-up reason' using errcode='22023'; end if;
 if spec ? 'due_preset' then
  -- An agreed appointment needs its agreed time, so presets are reminders only.
  if spec ? 'due_at' or (typ<>'awaiting_prospect' and coalesce(schedule,'reminder')<>'reminder')
   or typ not in ('callback','whatsapp_followup','confirm_placement_test','post_test_followup','enrollment_followup','awaiting_prospect') then
   raise exception 'Reminder preset requires an internal reminder without explicit time' using errcode='22023'; end if;
  if typ<>'awaiting_prospect' then schedule:='reminder'; end if;
  due:=crm_security.reminder_due(l.followup_policy_id,spec->>'due_preset');
 else due:=(spec->>'due_at')::timestamptz; end if;
 if due is null and typ<>'awaiting_prospect' then raise exception 'Valid future task required' using errcode='22023'; end if;
 if due is not null and (not isfinite(due) or (due<now() and not skip_checks)) then raise exception 'Valid future task required' using errcode='22023'; end if;
 if due is not null and not skip_checks then
  if schedule='appointment' then
   -- Agreed times are kept exactly: refused outside hours, never shifted (invariant 4).
   perform crm_security.assert_in_hours(case when typ='center_visit' then 'opening' else 'calling' end,due);
  else
   -- System and reminder times always come from the same calling windows.
   due:=crm_security.next_window(hours,due);
  end if;
 end if;
 assignee:=case when spec ? 'assigned_to' then (spec->>'assigned_to')::uuid else l.owner_id end;
 perform crm_security.assert_staff(assignee);
 if length(spec->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
 insert into public.crm_tasks(lead_id,task_type,assigned_to,due_at,instructions,source_kind,source_key,policy_id,outreach_cycle,attempt_ordinal,schedule_kind,followup_reason,
  supersedes_task_id,placement_test_id,source_activity_id)
 values(l.id,typ,assignee,due,spec->>'instructions',kind,source,l.followup_policy_id,
 case when ordinal is not null then l.outreach_cycle end,ordinal,schedule,reason,supersedes,test,source_activity) returning id into t;
 if intake_actor is not null then
  -- External intake keeps its own actor and key (accept_external_submission, 125).
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,task_id)
  values(l.id,now(),auth.uid(),intake_actor,'task_created',event_source,t);
 else
  perform crm_security.event(l.id,'task_created',coalesce(event_source,source)||':created',null,null,null,t);
 end if;
 return t;
end $function$;

drop function crm_security.finish_task(public.crm_tasks,boolean,text,text);
create function crm_security.finish_task(t public.crm_tasks, cancelled boolean, reason text, source text, replaced text default null, outcome text default null)
 returns void language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$ declare a uuid; begin
 if t.status<>'open' then raise exception 'Task is not open' using errcode='PT409'; end if;
 if cancelled and nullif(btrim(reason),'') is null then raise exception 'Cancellation reason required' using errcode='22023'; end if;
 a:=crm_security.event(t.lead_id,case when cancelled then 'task_cancelled' else 'task_completed' end,source,reason,null,null,t.id);
 update public.crm_tasks set status=case when cancelled then 'cancelled' else 'completed' end,
 completed_at=case when not cancelled then now() end,completed_by=case when not cancelled then auth.uid() end,
 completion_activity_id=case when not cancelled then a end,
 cancelled_at=case when cancelled then now() end,cancelled_by=case when cancelled then auth.uid() end,
 cancellation_reason=case when cancelled then reason end,
 replaced_reason=case when cancelled then replaced end,
 outcome_code=case when not cancelled then outcome end,outcome_at=case when not cancelled and outcome is not null then now() end,
 version=version+1,updated_at=now() where id=t.id;
end $function$;

create or replace function crm_security.cancel_tasks(l uuid, reason text, source text, attempts_only boolean default false)
 returns void language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$ declare t public.crm_tasks%rowtype; begin
 for t in select * from public.crm_tasks where lead_id=l and status='open'
 and (not attempts_only or task_type in ('first_contact','contact_attempt')) order by id for update loop
  perform crm_security.finish_task(t,true,reason,source||':'||t.id);
 end loop;
end $function$;

-- ---------------------------------------------------------------------------
-- 6. The current next action (rule (a) order of §10, used before M-A2 when a
--    prospect still holds legacy duplicates): earliest future agreed
--    appointment; else an appointment linked to a still-planned test (earliest
--    test); else the most recently created.
-- ---------------------------------------------------------------------------
create or replace function crm_security.is_appointment(t public.crm_tasks)
 returns boolean language sql immutable set search_path to 'pg_catalog','pg_temp' as $function$
 select t.schedule_kind='appointment' or t.task_type='center_visit'
$function$;

-- PL/pgSQL so the plan is cached: readers call it once per prospect (10k-lead
-- fixture), and a SQL function would be re-planned on every call.
create or replace function crm_security.next_action_id(lead uuid)
 returns uuid language plpgsql stable set search_path to 'pg_catalog','pg_temp' as $function$
declare r uuid; begin
 select t.id into r from public.crm_tasks t
 left join public.placement_tests p on p.id=t.placement_test_id and p.status='Planifié'
 where t.lead_id=lead and t.status='open'
 order by ((t.schedule_kind='appointment' or t.task_type='center_visit') and t.due_at>now()) desc nulls last,
  case when (t.schedule_kind='appointment' or t.task_type='center_visit') and t.due_at>now() then t.due_at end nulls last,
  ((t.schedule_kind='appointment' or t.task_type='center_visit') and p.id is not null) desc nulls last,
  case when (t.schedule_kind='appointment' or t.task_type='center_visit') and p.id is not null then p.date_test+crm_security.calendar_time(p.heure) end nulls last,
  t.created_at desc,t.id desc
 limit 1;
 return r;
end $function$;

create or replace function crm_security.action_json(t public.crm_tasks)
 returns jsonb language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version,
  'assigned_to',t.assigned_to,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
  'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason,'instructions',t.instructions,'label',crm_security.action_label(t),
  'overdue',t.task_type<>'awaiting_prospect' and t.due_at<now(),
  'relance_due',t.task_type='awaiting_prospect' and t.due_at<=now(),
  'outcome_enabled',t.task_type='center_visit' and t.due_at<=now(),
  'placement_test_id',t.placement_test_id,
  'placement',(select crm_security.placement_summary(p) from public.placement_tests p where p.id=t.placement_test_id))
  ||coalesce(crm_security.scheduled_civil(t.due_at),'{}'::jsonb) end
$function$;

create or replace function crm_security.next_action(lead uuid)
 returns jsonb language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select crm_security.action_json(t) from public.crm_tasks t where t.id=crm_security.next_action_id(lead)
$function$;

-- Commands return the lead with its single next action (§4.3).
create or replace function crm_security.result(l uuid, source text)
 returns jsonb language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select jsonb_build_object('lead',jsonb_build_object('id',x.id,'status',x.status,'version',x.version,'contact_id',x.contact_id,'owner_id',x.owner_id,'outreach_cycle',x.outreach_cycle,'qualification_step',x.qualification_step),
 'activity_ids',coalesce((select jsonb_agg(a.id order by a.created_at,a.id) from public.crm_activities a where a.lead_id=x.id and starts_with(a.source_key,source||':')),'[]'::jsonb),
 'next_action',crm_security.next_action(x.id),
 'open_tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'assigned_to',t.assigned_to,'version',t.version) order by t.due_at nulls last,t.id) from public.crm_tasks t where t.lead_id=x.id and t.status='open'),'[]'::jsonb),
 'failed_attempts',crm_security.failed_count(x),'unreachable_eligible',x.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(x)>=5)
 from public.crm_leads x where x.id=l
$function$;

-- Cancels a planned test with its reason; the placement trigger keeps its lead
-- lock and version bump. Never touches a test that already has a result.
create or replace function crm_security.cancel_planned_test(test uuid, reason text)
 returns void language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$ begin
 update public.placement_tests set status='Annulé',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=reason
 where id=test and status='Planifié';
end $function$;

-- Invariant 3: no two appointments or tests of one person overlap (visit 60
-- minutes, test 45 minutes). Person = this prospect, or the student it is
-- linked to (siblings are other people).
create or replace function crm_security.assert_no_overlap(l public.crm_leads, starts timestamptz, minutes integer, except_test uuid, except_task uuid)
 returns void language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$ begin
 if l.student_id is not null then perform pg_advisory_xact_lock(hashtextextended('crm:student-schedule:'||l.student_id,0)); end if;
 if exists(select 1 from public.placement_tests x where x.status='Planifié' and x.id is distinct from except_test
   and (x.crm_lead_id=l.id or (l.student_id is not null and x.student_id=l.student_id))
   and tstzrange((x.date_test+crm_security.calendar_time(x.heure)) at time zone public.centre_utc_offset(),
     (x.date_test+crm_security.calendar_time(x.heure)) at time zone public.centre_utc_offset()+interval '45 minutes')
     && tstzrange(starts,starts+make_interval(mins=>minutes)))
 or exists(select 1 from public.crm_tasks t join public.crm_leads o on o.id=t.lead_id where t.status='open' and t.task_type='center_visit'
   and t.id is distinct from except_task and (t.lead_id=l.id or (l.student_id is not null and o.student_id=l.student_id))
   and tstzrange(t.due_at,t.due_at+interval '60 minutes') && tstzrange(starts,starts+make_interval(mins=>minutes))) then
  raise exception 'Another appointment or test of this person overlaps this time' using errcode='22023',hint='crm_next_action.overlap';
 end if;
end $function$;

-- A next action as sent by a user: only the documented keys; internal modes
-- (keys starting with « _ ») and D1 mode are never accepted from a browser.
create or replace function crm_security.user_spec(spec jsonb)
 returns jsonb language plpgsql immutable set search_path to 'pg_catalog','pg_temp' as $function$ begin
 if jsonb_typeof(spec) is distinct from 'object' or octet_length(spec::text)>8000
  or spec-array['task_type','due_at','due_preset','schedule_kind','followup_reason','assigned_to','instructions',
   'keep_existing','replace_action_id','cancel_enrollment_reason','with_test','test_examiner','test_notes']<>'{}'::jsonb then
  raise exception 'Valid next action required' using errcode='22023'; end if;
 if spec->>'task_type' is null or spec->>'task_type'<>all(array['callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup','awaiting_prospect']) then
  raise exception 'Valid next action required' using errcode='22023'; end if;
 if spec ? 'with_test' and (jsonb_typeof(spec->'with_test')<>'boolean' or spec->>'task_type'<>'center_visit') then
  raise exception 'The test option belongs to an appointment' using errcode='22023'; end if;
 return spec;
end $function$;

-- ---------------------------------------------------------------------------
-- 7. The single writer (§4.2). Not granted to any role. The only code that
--    opens or closes an open crm_tasks row (with the primitives above), except
--    the time-boxed d1_revert. Internal modes (keys starting with « _ ») are
--    refused from a user spec.
-- ---------------------------------------------------------------------------
create or replace function crm_security.set_next_action(l public.crm_leads, spec jsonb, cause text, source text)
 returns uuid language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$
declare
 cur public.crm_tasks%rowtype; o public.crm_tasks%rowtype; against public.crm_tasks%rowtype; x public.placement_tests%rowtype;
 typ text; new_id uuid; carried uuid; with_test boolean; task_spec jsonb; due timestamptz; skip boolean:=false;
 data_step text:=nullif(current_setting('eh.crm_data_step',true),''); replaced text; complete boolean; closed_ids uuid[]:='{}';
 start_local timestamp; reason text; keep_id uuid;
begin
 if cause is null or cause<>all(array['system','user','outcome','close','conversion','intake','enrollment','test_result','d1']) then
  raise exception 'Invalid next-action cause' using errcode='22023'; end if;
 if source is null or length(btrim(source))=0 then raise exception 'Next-action source required' using errcode='22023'; end if;
 -- 1. The caller already holds the lead lock; taking it again is a no-op.
 perform 1 from public.crm_leads where id=l.id for update;
 if spec='null'::jsonb then spec:=null; end if;
 if spec is not null and jsonb_typeof(spec)<>'object' then raise exception 'Invalid next action' using errcode='22023'; end if;
 -- D1 mode, only inside crm_security.d1_apply.
 if spec ? 'd1' or cause='d1' then
  if cause<>'d1' or data_step is distinct from 'd1' then raise exception 'D1 mode requires the D1 data step' using errcode='42501'; end if;
  if spec->>'d1'='keep' then spec:=jsonb_build_object('_keep_task_id',spec->'keep_task_id','_reason','Doublon de prochaine action (fusion D1)');
  elsif spec->>'d1'='create' then spec:=spec->'spec'; skip:=true;
  elsif spec is not null and not (spec ? 'none') then raise exception 'Unknown D1 mode' using errcode='22023'; end if;
 end if;
 perform 1 from public.crm_tasks where lead_id=l.id and status='open' order by id for update;
 select * into cur from public.crm_tasks where id=crm_security.next_action_id(l.id);
 if spec ? '_against' then
  select * into against from public.crm_tasks where id=(spec->>'_against')::uuid and lead_id=l.id and status='open';
  if against.id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
 end if;
 perform set_config('eh.crm_next_action_writer','1',true);

 -- A. No next action: closure, conversion, D1 rule (d).
 if spec is null or spec ? 'none' then
  if cause not in ('close','conversion','d1') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  if cause='conversion' then
   -- Verbatim effect of 120's evaluate_conversion loop (same keys, actor and body).
   for o in select * from public.crm_tasks where lead_id=l.id and status='open' order by id for update loop
    insert into public.crm_activities(lead_id,task_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
    values(l.id,o.id,(spec->>'_enrollment_id')::uuid,(spec->>'_happened')::timestamptz,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'task_cancelled',
     'conversion-task:'||l.id||':'||o.id,'Inscription confirmée : suivi commercial terminé.');
    update public.crm_tasks set status='cancelled',cancelled_at=(spec->>'_happened')::timestamptz,cancelled_by=auth.uid(),
     cancellation_reason='Inscription confirmée',version=version+1,updated_at=now() where id=o.id;
   end loop;
  else
   reason:=coalesce(nullif(btrim(spec->>'reason'),''),'Prospect fermé');
   for o in select * from public.crm_tasks where lead_id=l.id and status='open' order by id loop
    perform crm_security.finish_task(o,true,reason,source||':'||o.id);
   end loop;
   if cause in ('close','d1') then
    for x in select * from public.placement_tests where crm_lead_id=l.id and status='Planifié' order by id loop
     perform crm_security.cancel_planned_test(x.id,case when cause='d1' then 'Prospect clôturé (D1)' else 'Prospect fermé' end);
    end loop;
   end if;
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- B. Keep one open action, cancel every other one (enrolment start keeps an
 --    open « Finaliser l'inscription »; D1 rule (a)).
 if spec ? '_keep_task_id' then
  keep_id:=(spec->>'_keep_task_id')::uuid;
  if not exists(select 1 from public.crm_tasks where id=keep_id and lead_id=l.id and status='open') then
   raise exception 'Kept action is not an open action of this prospect' using errcode='22023'; end if;
  for o in select * from public.crm_tasks where lead_id=l.id and status='open' and id<>keep_id order by id loop
   perform crm_security.finish_task(o,true,coalesce(spec->>'_reason','Doublon de prochaine action'),source||':'||o.id);
   closed_ids:=closed_ids||o.id;
  end loop;
  for x in select p.* from public.placement_tests p where p.status='Planifié' and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
   and not exists(select 1 from public.crm_tasks t where t.placement_test_id=p.id and t.status='open') loop
   perform crm_security.cancel_planned_test(x.id,'Rendez-vous remplacé');
  end loop;
  perform set_config('eh.crm_next_action_writer','',true);
  return keep_id;
 end if;

 -- C. Legacy reschedule in place (old crm_schedule_task with a task id). An
 --    agreed time is refused outside hours; a reminder moves to the next window.
 --    A rescheduled appointment moves its test.
 if spec ? '_reschedule' then
  select * into o from public.crm_tasks where id=(spec->'_reschedule'->>'task_id')::uuid and lead_id=l.id and status='open';
  if o.id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
  due:=(spec->'_reschedule'->>'due_at')::timestamptz;
  if due is null or not isfinite(due) or due<now() then raise exception 'Future due time required' using errcode='22023'; end if;
  if crm_security.is_appointment(o) then
   perform crm_security.assert_in_hours(case when o.task_type='center_visit' then 'opening' else 'calling' end,due);
   if o.task_type='center_visit' then perform crm_security.assert_no_overlap(l,due,60,o.placement_test_id,o.id); end if;
  else due:=crm_security.next_window(crm_security.current_policy_id(),due); end if;
  if length(spec->'_reschedule'->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
  update public.crm_tasks set due_at=due,scheduled_end_at=null,
   instructions=case when spec->'_reschedule' ? 'instructions' then spec->'_reschedule'->>'instructions' else instructions end,
   updated_at=now(),version=version+1 where id=o.id;
  if o.placement_test_id is not null then
   start_local:=due at time zone public.centre_utc_offset();
   update public.placement_tests set date_test=start_local::date,heure=to_char(start_local,'HH24:MI')
   where id=o.placement_test_id and status='Planifié' and (date_test,heure) is distinct from (start_local::date,to_char(start_local,'HH24:MI'));
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return o.id;
 end if;

 -- D. Owner change: the open action follows the lead's owner and loses any
 --    separate delegation (§4.6).
 if spec ? '_reassign' then
  update public.crm_tasks set assigned_to=l.owner_id,version=version+1,updated_at=now()
  where lead_id=l.id and status='open' and assigned_to is distinct from l.owner_id;
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;

 -- E. Separate delegation of one open action (old crm_reassign with assigned_to).
 if spec ? '_delegate' then
  update public.crm_tasks set assigned_to=(spec->'_delegate'->>'assigned_to')::uuid,version=version+1,updated_at=now()
  where id=(spec->'_delegate'->>'task_id')::uuid and lead_id=l.id and status='open' returning id into new_id;
  if new_id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return new_id;
 end if;

 -- F. Legacy finish without replacement (old complete/cancel without a next
 --    task while another open action remains).
 if spec ? '_finish' then
  if against.id is null then raise exception 'Task required' using errcode='22023'; end if;
  perform crm_security.finish_task(against,coalesce((spec->'_finish'->>'cancelled')::boolean,false),spec->'_finish'->>'reason',source,
   case when coalesce((spec->'_finish'->>'cancelled')::boolean,false) then 'Annulée sans remplacement' end,
   case when not coalesce((spec->'_finish'->>'cancelled')::boolean,false) then spec->>'_outcome_code' end);
  if coalesce((spec->'_finish'->>'cancelled')::boolean,false) and against.placement_test_id is not null
   and not exists(select 1 from public.crm_tasks t where t.placement_test_id=against.placement_test_id and t.status='open') then
   perform crm_security.cancel_planned_test(against.placement_test_id,'Rendez-vous annulé');
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- G. Legacy « meaningful conversation ends outreach » without a next task.
 if spec ? '_cancel_slots' then
  perform crm_security.cancel_tasks(l.id,spec->>'_cancel_slots',source,true);
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- H. Replacement.
 typ:=spec->>'task_type';
 if typ is null then raise exception 'Valid future task required' using errcode='22023'; end if;
 -- System steps never replace a kept action (§4.2 step 3): the call is
 -- recorded, the action stays open with its time and test, no slot is added.
 if cause='system' and cur.id is not null and cur.task_type not in ('first_contact','contact_attempt','callback','awaiting_prospect') then
  if against.id is not null and against.id<>cur.id and against.task_type in ('first_contact','contact_attempt','callback') then
   perform crm_security.finish_task(against,false,null,source||':complete');
  end if;
  for o in select * from public.crm_tasks where lead_id=l.id and status='open' and id<>cur.id and task_type in ('first_contact','contact_attempt') order by id loop
   perform crm_security.finish_task(o,true,'Attempt recorded',source||':obsolete:'||o.id);
  end loop;
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;
 -- After five failures the prospect waits; an undated wait is kept as is.
 if cause='system' and typ='awaiting_prospect' and cur.task_type='awaiting_prospect' and cur.due_at is null then
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;
 -- Qualifying with an existing appointment reuses it.
 if coalesce((spec->>'keep_existing')::boolean,false) and typ='center_visit' and cur.task_type='center_visit' then
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;
 -- OD-18: an appointment is replaced by a user only with the « Remplace »
 -- confirmation (A); an enrolment action only by another enrolment action or
 -- with an explicit cancellation reason (B). An appointment outcome acts on
 -- the appointment itself.
 if cause in ('user','outcome') and cur.id is not null and (spec->>'_outcome_of') is distinct from cur.id::text then
  if cur.task_type='center_visit' and (spec->>'replace_action_id') is distinct from cur.id::text then
   raise exception 'Replacing an appointment needs the « Remplace » confirmation' using errcode='22023',hint='crm_next_action.replace_confirmation'; end if;
  if cur.task_type='enrollment_followup' and typ<>'enrollment_followup' and nullif(btrim(spec->>'cancel_enrollment_reason'),'') is null then
   raise exception 'Reschedule, cancel or complete the enrolment action first' using errcode='22023',hint='crm_next_action.enrollment_kept'; end if;
 end if;
 task_spec:=spec-array['keep_existing','replace_action_id','cancel_enrollment_reason','with_test','test_examiner','test_notes'];
 task_spec:=task_spec-array(select k from jsonb_object_keys(task_spec) k where left(k,1)='_');
 -- « En attente » without a choice: relance today + 5 days (OD-5).
 if typ='awaiting_prospect' and cause in ('user','outcome') and not (spec ? 'due_at') and not (spec ? 'due_preset') then
  task_spec:=task_spec||jsonb_build_object('due_preset','in_5_days');
 end if;
 if typ='center_visit' then
  due:=(task_spec->>'due_at')::timestamptz;
  if due is null then raise exception 'Appointment date and time required' using errcode='22023'; end if;
  -- The appointment's test moves with it unless the user unticks it.
  select t.placement_test_id into carried from public.crm_tasks t join public.placement_tests p on p.id=t.placement_test_id and p.status='Planifié'
  where t.id in (cur.id,against.id) and t.task_type='center_visit' order by (t.id=cur.id) desc limit 1;
  with_test:=coalesce((spec->>'with_test')::boolean,carried is not null);
  if not skip then perform crm_security.assert_no_overlap(l,due,60,carried,cur.id); end if;
  if with_test and carried is null and not skip
   and exists(select 1 from public.placement_tests where crm_lead_id=l.id and status='Planifié') then
   raise exception 'Placement already scheduled' using errcode='22023'; end if;
 end if;

 -- Close the current action, the action acted on and every legacy duplicate,
 -- before inserting (M-A2's unique index cannot be deferred).
 complete:=cause in ('outcome','system','test_result');
 replaced:=coalesce(nullif(btrim(spec->>'cancel_enrollment_reason'),''),nullif(btrim(spec->>'_replaced_reason'),''),'Remplacée par une nouvelle prochaine action');
 if cur.id is not null then
  if complete then perform crm_security.finish_task(cur,false,spec->>'_note',source||':complete',null,spec->>'_outcome_code');
  else perform crm_security.finish_task(cur,true,replaced,source||':replaced',replaced); end if;
  closed_ids:=closed_ids||cur.id;
 end if;
 if against.id is not null and against.id is distinct from cur.id then
  perform crm_security.finish_task(against,false,spec->>'_note',source||':complete:'||against.id);
  closed_ids:=closed_ids||against.id;
 end if;
 for o in select * from public.crm_tasks where lead_id=l.id and status='open' order by id loop
  perform crm_security.finish_task(o,true,'Doublon de prochaine action',source||':duplicate:'||o.id);
  closed_ids:=closed_ids||o.id;
 end loop;
 -- Step 4: a planned test no open action points to any more is cancelled,
 -- except the one carried by the new appointment and a test being resulted.
 if cause<>'test_result' then
  for x in select p.* from public.placement_tests p where p.status='Planifié'
   and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
   and p.id is distinct from case when with_test then carried end order by p.id loop
   perform crm_security.cancel_planned_test(x.id,'Rendez-vous remplacé');
  end loop;
 end if;
 if typ='center_visit' and with_test then
  start_local:=due at time zone public.centre_utc_offset();
  if carried is null then
   insert into public.placement_tests(crm_lead_id,student_id,student_name,date_test,heure,examinateur,notes,status,niveau_recommande)
   values(l.id,l.student_id,coalesce(nullif(btrim(l.learner_name),''),(select display_name from public.crm_contacts where id=l.contact_id)),
    start_local::date,to_char(start_local,'HH24:MI'),nullif(btrim(spec->>'test_examiner'),''),nullif(btrim(spec->>'test_notes'),''),'Planifié',null)
   returning id into carried;
  else
   update public.placement_tests set date_test=start_local::date,heure=to_char(start_local,'HH24:MI'),
    examinateur=case when spec ? 'test_examiner' then nullif(btrim(spec->>'test_examiner'),'') else examinateur end,
    notes=case when spec ? 'test_notes' then nullif(btrim(spec->>'test_notes'),'') else notes end
   where id=carried and (date_test,heure,examinateur,notes) is distinct from (start_local::date,to_char(start_local,'HH24:MI'),
    case when spec ? 'test_examiner' then nullif(btrim(spec->>'test_examiner'),'') else examinateur end,
    case when spec ? 'test_notes' then nullif(btrim(spec->>'test_notes'),'') else notes end);
  end if;
 end if;
 new_id:=crm_security.new_task(l,task_spec,coalesce(spec->>'_key',source||':next-action'),coalesce(spec->>'_kind','manual'),
  (spec->>'_ordinal')::smallint,spec->>'_event_source',cur.id,
  case when typ='center_visit' and with_test then carried else (spec->>'_placement_test_id')::uuid end,
  (spec->>'_source_activity_id')::uuid,skip,case when cause='intake' then spec->>'_intake_actor' end);
 if spec->>'_review_flag'='d1_review' then
  if cause<>'d1' then raise exception 'D1 review flag belongs to D1' using errcode='42501'; end if;
  update public.crm_tasks set review_flag='d1_review' where id=new_id;
 end if;
 if skip then
  insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by)
  select 'd1','crm_tasks',t.id,null,to_jsonb(t)||jsonb_build_object('journal_note','hors règles (D1)'),auth.uid() from public.crm_tasks t where t.id=new_id;
 end if;
 perform set_config('eh.crm_next_action_writer','',true);
 return new_id;
end $function$;
revoke all on function crm_security.set_next_action(public.crm_leads,jsonb,text,text) from public, anon, authenticated, service_role;

-- Old wrappers keep their payloads: only the seven historical keys, so an old
-- tab can never reach an internal mode of the single writer.
create or replace function crm_security.legacy_spec(spec jsonb)
 returns jsonb language plpgsql immutable set search_path to 'pg_catalog','pg_temp' as $function$ begin
 if jsonb_typeof(spec) is distinct from 'object' or spec-array['task_type','due_at','due_preset','schedule_kind','followup_reason','assigned_to','instructions']<>'{}'::jsonb then
  raise exception 'Next task required' using errcode='22023'; end if;
 return spec;
end $function$;

create or replace function crm_security.result_label(result text)
 returns text language sql immutable set search_path to 'pg_catalog','pg_temp' as $function$
 select case result when 'no_answer' then 'Pas de réponse' when 'busy' then 'Occupé' when 'declined' then 'Refusé'
  when 'unreachable' then 'Injoignable' when 'wrong_number' then 'Mauvais numéro' when 'spoke' then 'On a parlé'
  when 'whatsapp_sent' then 'WhatsApp envoyé' when 'note' then 'Note'
  when 'came_enrolled' then 'Venu · inscrit' when 'came_will_return' then 'Venu · reviendra' when 'came_not_interested' then 'Venu · pas intéressé'
  when 'no_show' then 'Pas venu' end
$function$;

-- ---------------------------------------------------------------------------
-- 8. The central command, rebuilt from its live body (125, lifecycle barrier
--    and pending-stop handoff as 103 re-created them, copied verbatim). Every
--    task write now goes through set_next_action.
-- ---------------------------------------------------------------------------
create or replace function crm_security.command(cmd text, request uuid, data jsonb)
 returns jsonb language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb;
 l public.crm_leads%rowtype; t public.crm_tasks%rowtype; p public.crm_followup_policies%rowtype; na public.crm_tasks%rowtype;
 contact uuid; submission uuid; aid uuid; tid uuid; source text; allowed text[]; offsets integer[];
 phone text; email text; candidates jsonb; count_failed integer; ordinal smallint;
 due timestamptz; happened timestamptz; outcome text; meaningful boolean:=false; needs_next boolean:=false;
 reason text; target text; initial_status text; next_spec jsonb; policy_version integer;
 nested boolean:=coalesce(current_setting('eh.crm_command_key',true),'')<>''; before_label text; after_label text;
 chan text; res text; next_mode text; next_obj jsonb; note text; close_target text; close_reason text; close_note text;
 cause text; qualify_step text; primary_channel text; outcome_code text; x public.placement_tests%rowtype;
begin
 if cmd in ('create_manual_lead','resolve_submission') then
  perform crm_security.lifecycle_barrier(true);
  if cmd='resolve_submission' then

   perform crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)
   from public.crm_submissions src join public.crm_form_mappings fm on fm.id=src.form_mapping_id where src.id=(data->>'submission_id')::uuid;
  end if;
 end if;

 perform crm_security.require_reader(cmd='create_followup_policy');
 if request is null or jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>32768 then
  raise exception 'Request key and bounded object payload required' using errcode='22023'; end if;
 allowed:=case cmd
 when 'create_followup_policy' then array['weekly_hours','opening_hours','date_exceptions','timezone','attempt_offsets','minimum_attempt_gap_minutes','first_contact_sla_minutes','post_test_sla_minutes','stale_contacting_minutes','effective_from']
 when 'create_manual_lead' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id','first_exchange']
 when 'resolve_submission' then array['lead_id','expected_version','submission_id']
 when 'add_note' then array['lead_id','expected_version','note']
 when 'record_call_outcome' then array['lead_id','expected_version','task_id','expected_task_version','outcome','occurred_at','note','next_task']
 when 'record_whatsapp' then array['lead_id','expected_version','kind','occurred_at','note','next_task']
 when 'record_conversation' then array['lead_id','expected_version','channel','occurred_at','note','next_task']
 when 'schedule_task' then array['lead_id','expected_version','task_id','expected_task_version','task','note']
 when 'complete_task' then array['lead_id','expected_version','task_id','expected_task_version','outcome','note','next_task']
 when 'cancel_task' then array['lead_id','expected_version','task_id','expected_task_version','reason','next_task']
 when 'qualify_lead' then array['lead_id','expected_version','qualification_step','note','conversation_channel','next_task']
 when 'close_lost' then array['lead_id','expected_version','reason','note']
 when 'close_not_qualified' then array['lead_id','expected_version','reason','note']
 when 'reopen_lead' then array['lead_id','expected_version','reason','next_task']
 when 'reassign' then array['lead_id','expected_version','owner_id','task_id','expected_task_version','assigned_to','note']
 when 'log_exchange' then array['lead_id','expected_version','task_id','channel','result','note','next','occurred_at','real_attempt_override']
 when 'change_next_action' then array['lead_id','expected_version','expected_action_id','next','note']
 when 'appointment_outcome' then array['lead_id','expected_version','action_id','outcome_code','next','note']
 when 'close_prospect' then array['lead_id','expected_version','status','reason','note']
 when 'reopen_prospect' then array['lead_id','expected_version','reason','next']
 else null end;
 if allowed is null or data-allowed<>'{}'::jsonb then raise exception 'Unsupported command fields' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':'||cmd||':'||request,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name=cmd and request_key=request;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 source:='command:'||actor||':'||cmd||':'||request;
 -- One history entry per user action (§4.7): rows written below share this key.
 if not nested and cmd not in ('create_followup_policy','resolve_submission') then perform set_config('eh.crm_command_key',source,true); end if;

 if cmd='create_followup_policy' then
  if coalesce(data->>'timezone','Africa/Casablanca')<>'Africa/Casablanca' then raise exception 'Timezone must be Africa/Casablanca' using errcode='22023'; end if;
  if data ? 'attempt_offsets' then select array_agg(value::integer order by ord) into offsets from jsonb_array_elements_text(data->'attempt_offsets') with ordinality a(value,ord);
  else offsets:=array[0,0,1,3,5]; end if;
  perform crm_security.validate_policy(data->'weekly_hours',offsets);
  perform crm_security.validate_hours_set(case when jsonb_typeof(data->'opening_hours')='null' then null else data->'opening_hours' end,coalesce(data->'date_exceptions','[]'::jsonb));
  if coalesce((data->>'minimum_attempt_gap_minutes')::integer,180) not between 180 and 10080
   or coalesce((data->>'first_contact_sla_minutes')::integer,15) not between 1 and 1440
   or coalesce((data->>'post_test_sla_minutes')::integer,120) not between 1 and 10080
   or coalesce((data->>'stale_contacting_minutes')::integer,2880) not between 60 and 43200 then
   raise exception 'Invalid policy timing' using errcode='22023'; end if;
  happened:=coalesce((data->>'effective_from')::timestamptz,now());
  if not isfinite(happened) or happened<now()-interval '1 minute' then raise exception 'Policy cannot be backdated' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm:policy:publish',0));
  select coalesce(max(version),0)+1 into policy_version from public.crm_followup_policies;
  insert into public.crm_followup_policies(version,weekly_hours,opening_hours,date_exceptions,attempt_offsets,minimum_attempt_gap_minutes,
   first_contact_sla_minutes,post_test_sla_minutes,stale_contacting_minutes,effective_from,created_by)
  values(policy_version,data->'weekly_hours',case when jsonb_typeof(data->'opening_hours')='object' then data->'opening_hours' end,coalesce(data->'date_exceptions','[]'::jsonb),offsets,coalesce((data->>'minimum_attempt_gap_minutes')::integer,180),
   coalesce((data->>'first_contact_sla_minutes')::integer,15),coalesce((data->>'post_test_sla_minutes')::integer,120),
   coalesce((data->>'stale_contacting_minutes')::integer,2880),happened,actor) returning * into p;
  result:=jsonb_build_object('policy_id',p.id,'version',p.version,'timezone',p.timezone,'weekly_hours',p.weekly_hours,'opening_hours',p.opening_hours,'date_exceptions',p.date_exceptions,'effective_from',p.effective_from);

 elsif cmd='create_manual_lead' then
  select * into p from public.crm_followup_policies where id=crm_security.current_policy_id();
  if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200
   or nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200
   or nullif(btrim(data->>'source_label'),'') is null or length(data->>'source_label')>200 then
   raise exception 'Contact, learner and source label required (maximum 200 characters)' using errcode='22023'; end if;
  if (data->>'learner_birth_date')::date>public.business_date() then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
  perform crm_security.assert_staff((data->>'owner_id')::uuid);
  -- §4.2/§4.8: a walk-in or an inbound call is created with its first exchange and
  -- that exchange's next action, in this transaction; « Premier contact » is never scheduled.
  next_obj:=data->'first_exchange';
  if next_obj is not null and (jsonb_typeof(next_obj)<>'object' or next_obj-array['channel','next','note']<>'{}'::jsonb
   or coalesce(next_obj->>'channel','') not in ('phone','whatsapp','in_person') or jsonb_typeof(next_obj->'next') is distinct from 'object'
   or next_obj->'next' ? 'close' or length(next_obj->>'note')>4000) then
   raise exception 'Valid first exchange required' using errcode='22023'; end if;
  phone:=crm_security.normalize_phone(data->>'phone'); email:=nullif(lower(btrim(data->>'email')),'');
  if email is not null and (length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
  -- No automatic reuse, including a unique phone/email match: shared family
  -- identifiers are not proof of contact identity. Return bounded suggestions.
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'version',c.version)),'[]'::jsonb) into candidates
  from (select id,display_name,version from public.crm_contacts where merged_into_contact_id is null
   and ((phone is not null and phone_e164=phone) or (email is not null and email_normalized=email)) order by id limit 10) c;
  insert into public.crm_contacts(display_name,contact_kind,phone_raw,phone_e164,whatsapp_raw,whatsapp_e164,email_raw,email_normalized,preferred_channel,created_by)
  values(btrim(data->>'display_name'),coalesce(data->>'contact_kind','unknown'),data->>'phone',phone,data->>'whatsapp',crm_security.normalize_phone(data->>'whatsapp'),
   data->>'email',email,data->>'preferred_channel',actor) returning id into contact;
  submission:=gen_random_uuid(); l.id:=gen_random_uuid();
  due:=crm_security.next_window(p.id,now()+make_interval(mins=>p.first_contact_sla_minutes));
  -- §4.6: a manual prospect belongs to its creator unless another owner is chosen.
  insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
    owner_id,first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(l.id,contact,btrim(data->>'learner_name'),lower(btrim(data->>'learner_name')),(data->>'learner_age')::integer,
   case when data->>'learner_age' is not null then now() end,(data->>'learner_birth_date')::date,data->>'session_type',data->>'program_interest_text',
   case when data ? 'owner_id' then (data->>'owner_id')::uuid else actor end,submission,submission,p.id,(due at time zone public.centre_utc_offset())::date) returning * into l;
  insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,resolved_by,resolved_at,payload_hash)
  values(submission,l.id,'manual',now(),now(),'server',data-'first_exchange','[]',btrim(data->>'source_label'),'resolved',actor,now(),digest);
  perform crm_security.event(l.id,'lead_created',source||':lead',null,null,null,null,null,null,null,null,'NEW');
  aid:=crm_security.event(l.id,'submission_received',source||':submission',submission=>submission);
  -- Activity ownership FK is satisfied; acquisition snapshots are never edited.
  if next_obj is null then
   tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','first_contact','due_at',due,'_key','attempt:'||l.id||':1:1','_kind','intake',
    '_ordinal',1,'_event_source',source||':initial-task'),'intake',source);
  else
   -- The exchange runs nested under this command's key (one history entry); its
   -- private key is fresh per execution, and the outer request owns the replay.
   perform crm_security.command('log_exchange',gen_random_uuid(),jsonb_build_object('lead_id',l.id,'expected_version',(select version from public.crm_leads where id=l.id),
    'channel',next_obj->>'channel','result','spoke','next',next_obj->'next')||case when nullif(btrim(next_obj->>'note'),'') is not null then jsonb_build_object('note',next_obj->>'note') else '{}'::jsonb end);
   tid:=crm_security.next_action_id(l.id);
  end if;
  if not nested then
   perform crm_security.primary_event(l.id,cmd,nullif(btrim(next_obj->>'note'),''),nullif(next_obj->>'channel','other'),case when next_obj is not null then 'spoke' end,null,
    crm_security.action_label((select t0 from public.crm_tasks t0 where t0.id=tid)),null,
    jsonb_build_object('result_label',case when next_obj is null then 'Prospect créé' else 'Prospect créé · On a parlé' end));
  end if;
  result:=crm_security.result(l.id,source)||jsonb_build_object('submission_id',submission,'contact_candidates',candidates,'contact_version',1);

 else
  select * into l from public.crm_leads where id=(data->>'lead_id')::uuid for update;
  if not found then raise exception 'Lead not found' using errcode='22023'; end if;
  if (data->>'expected_version')::bigint is distinct from l.version then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
  if l.merged_into_lead_id is not null or l.status='CONVERTED' then raise exception 'Lead is not operationally editable' using errcode='22023'; end if;
  if cmd not in ('add_note','reopen_lead','reassign','reopen_prospect') and l.status in ('LOST','NOT_QUALIFIED') then raise exception 'Reopen lead before this operation' using errcode='22023'; end if;
  initial_status:=l.status;
  select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
  before_label:=crm_security.action_label(na);
  if data->>'task_id' is not null then
   select * into t from public.crm_tasks where id=(data->>'task_id')::uuid and lead_id=l.id for update;
   if not found or t.status<>'open' then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
   if data ? 'expected_task_version' and (data->>'expected_task_version')::bigint is distinct from t.version then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
   if cmd<>'log_exchange' and not (data ? 'expected_task_version') then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
  end if;
  if cmd in ('complete_task','cancel_task') and t.id is null then raise exception 'Task required' using errcode='22023'; end if;
  happened:=coalesce((data->>'occurred_at')::timestamptz,now());
  if not isfinite(happened) or happened>now() or happened<l.created_at then raise exception 'Occurrence time must be between lead creation and now' using errcode='22023'; end if;
  if happened<(select max(occurred_at) from public.crm_activities where lead_id=l.id and event_type='lead_reopened') then
   raise exception 'Activity predates the latest reopening' using errcode='22023'; end if;
  note:=case when nullif(btrim(coalesce(data->>'note',data->>'outcome',data->>'reason')),'') is not null then coalesce(data->>'note',data->>'outcome',data->>'reason') end;

  -- Old exchange wrappers are translated into one exchange (§4.3).
  if cmd='record_call_outcome' then
   chan:='phone'; outcome:=data->>'outcome';
   if outcome is null or outcome<>all(array['no_answer','busy','declined','unreachable','spoke_with_contact','wrong_number']) then raise exception 'Invalid phone outcome' using errcode='22023'; end if;
   if t.id is not null and t.task_type not in ('first_contact','contact_attempt','callback') then raise exception 'Phone outcome requires a call task' using errcode='22023'; end if;
   res:=case when outcome='spoke_with_contact' then 'spoke' else outcome end;
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='record_whatsapp' then
   if (data->>'kind') is null or data->>'kind' not in ('whatsapp_sent','meaningful_whatsapp_conversation') then raise exception 'Invalid WhatsApp activity' using errcode='22023'; end if;
   chan:='whatsapp'; res:=case when data->>'kind'='meaningful_whatsapp_conversation' then 'spoke' else 'whatsapp_sent' end;
   if res='whatsapp_sent' and data ? 'next_task' then raise exception 'WhatsApp sent is activity-only' using errcode='22023'; end if;
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='record_conversation' then
   if coalesce(data->>'channel','') not in ('phone','whatsapp','in_person') then raise exception 'Conversation channel and evidence required' using errcode='22023'; end if;
   chan:=data->>'channel'; res:='spoke';
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='log_exchange' then
   chan:=data->>'channel'; res:=data->>'result'; note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end;
   if chan is null or chan not in ('phone','whatsapp','in_person','other')
    or res is null or res not in ('no_answer','busy','declined','unreachable','wrong_number','spoke','whatsapp_sent','note')
    or (res in ('no_answer','busy','declined','unreachable','wrong_number') and chan<>'phone')
    or (res='whatsapp_sent' and chan<>'whatsapp') or length(data->>'note')>4000 then
    raise exception 'Valid channel and result required' using errcode='22023'; end if;
   if res='note' and note is null then raise exception 'Note required' using errcode='22023'; end if;
   if data ? 'real_attempt_override' and jsonb_typeof(data->'real_attempt_override')<>'boolean' then raise exception 'Invalid attempt override' using errcode='22023'; end if;
   -- next = "keep" | next-action spec | {"close":{status,reason,note}} | {"enrol":{due_at|due_preset}}
   if data->'next' is null or data->'next'='"keep"'::jsonb then next_mode:='keep';
   elsif jsonb_typeof(data->'next')='object' and data->'next' ? 'close' then next_mode:='close'; next_obj:=data->'next'->'close';
   elsif jsonb_typeof(data->'next')='object' and data->'next' ? 'enrol' then next_mode:='enrol';
    next_obj:=jsonb_build_object('task_type','enrollment_followup','instructions','Finaliser l’inscription avec le contact.')
     ||case when jsonb_typeof(data->'next'->'enrol')='object' and data->'next'->'enrol' ? 'due_at' then jsonb_build_object('due_at',data->'next'->'enrol'->'due_at')
        else jsonb_build_object('due_preset',coalesce(data->'next'->'enrol'->>'due_preset','tomorrow')) end;
   elsif jsonb_typeof(data->'next')='object' then next_mode:='spec'; next_obj:=crm_security.user_spec(data->'next');
   else raise exception 'Valid next action required' using errcode='22023'; end if;
   if res='spoke' and next_mode='keep' and na.id is null then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
   if res in ('note','whatsapp_sent') and next_mode in ('close','enrol') then raise exception 'Valid next action required' using errcode='22023'; end if;
   if res in ('no_answer','busy','declined','unreachable') and next_mode in ('close','enrol') then raise exception 'Valid next action required' using errcode='22023'; end if;
  end if;
  if next_mode='close' then
   close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note';
   if close_target is null or close_target not in ('LOST','NOT_QUALIFIED') or jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then
    raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
  end if;

  if cmd='resolve_submission' then
   -- Private only: future trusted intake can attach an unresolved acquisition
   -- without rewriting accepted snapshots or the lead's original first touch.
   perform 1 from public.crm_submissions where id=(data->>'submission_id')::uuid and match_status='needs_review' and lead_id is null for update;
   if not found then raise exception 'Unresolved submission required' using errcode='22023'; end if;
   update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=actor,resolved_at=now()
    where id=(data->>'submission_id')::uuid;
   update public.crm_leads set latest_submission_id=(data->>'submission_id')::uuid where id=l.id
    and (select row(occurred_at,id) from public.crm_submissions where id=(data->>'submission_id')::uuid)>
        (select row(occurred_at,id) from public.crm_submissions where id=l.latest_submission_id);
   perform crm_security.lifecycle_pending_handoff((data->>'submission_id')::uuid);
   perform crm_security.event(l.id,'submission_received',source||':submission',submission=>(data->>'submission_id')::uuid);
  elsif cmd='add_note' then
   if nullif(btrim(data->>'note'),'') is null then raise exception 'Note required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'note_added',source||':note',data->>'note');
   note:=data->>'note'; res:='note';

  elsif cmd in ('record_call_outcome','record_whatsapp','record_conversation','log_exchange') then
   primary_channel:=nullif(chan,'other');
   if res in ('no_answer','busy','declined','unreachable') then
    if l.last_attempt_at is not null and happened<l.last_attempt_at then raise exception 'Call time predates last recorded attempt' using errcode='22023'; end if;
    if l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
     select * into strict p from public.crm_followup_policies where id=l.followup_policy_id;
     -- OD-14: a real attempt inside the gap is recorded only when the user says so.
     if l.last_attempt_at is not null and happened<l.last_attempt_at+make_interval(mins=>p.minimum_attempt_gap_minutes)
      and not coalesce((data->>'real_attempt_override')::boolean,false) then
      raise exception 'Failed calls must respect the policy minimum spacing' using errcode='22023',hint='crm_exchange.attempt_gap'; end if;
     if l.last_conversation_at is not null and happened<l.last_conversation_at then
      raise exception 'Failed call predates the latest meaningful conversation' using errcode='22023'; end if;
     count_failed:=crm_security.failed_count(l); ordinal:=(count_failed+1)::smallint;
     -- Each uninterrupted sequence anchors to its first actual failed call,
     -- independently of lifecycle and any earlier intake/conversation dates.
     if count_failed=0 then l.outreach_anchor_date:=(happened at time zone public.centre_utc_offset())::date; end if;
     -- The first five need not have a task supplied, but consume the current
     -- sequence slot exactly once. An explicit call after five is still possible.
     if t.id is null then
      select * into t from public.crm_tasks where lead_id=l.id and status='open' and outreach_cycle=l.outreach_cycle and attempt_ordinal=ordinal order by id limit 1 for update;
     elsif t.attempt_ordinal is not null and (t.outreach_cycle<>l.outreach_cycle or t.attempt_ordinal<>ordinal) then
      raise exception 'Task is not the current attempt' using errcode='PT409';
     end if;
     perform crm_security.event(l.id,'contact_attempted',source||':attempt',note,'phone',res,t.id,happened,l.outreach_cycle,ordinal);
     perform crm_security.event(l.id,'call_'||res,source||':outcome',null,'phone',res,t.id,happened);
     if l.status='NEW' then l.status:='CONTACTING'; end if;
     l.last_attempt_at:=happened;
     if next_mode='spec' then
      -- An explicit choice after a failed call is the user's, as in « Changer ».
      tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'user',source);
     elsif ordinal<5 then
      due:=crm_security.attempt_due(l.followup_policy_id,l.outreach_anchor_date,ordinal+1,happened,now());
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','contact_attempt','due_at',due,'_key','attempt:'||l.id||':'||l.outreach_cycle||':'||(ordinal+1),
       '_kind','attempt_sequence','_ordinal',ordinal+1,'_event_source',source||':next-attempt')
       ||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'system',source);
     else
      -- OD-17: after the fifth failure the prospect waits, with no relance date.
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','awaiting_prospect','_key',source||':awaiting')
       ||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'system',source);
     end if;
    else
     perform crm_security.event(l.id,'contact_attempted',source||':attempt',note,'phone',res,t.id,happened);
    end if;
   elsif res='wrong_number' then
    -- Wrong number never counts as an unreachable attempt.
    perform crm_security.event(l.id,'call_wrong_number',source||':outcome',note,'phone','wrong_number',t.id,happened);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null and cmd<>'log_exchange' then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'user',source);
    elsif next_mode='legacy' and t.id is not null then tid:=crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false)),'outcome',source||':complete'); end if;
    needs_next:=true;
   elsif res='spoke' then
    if next_mode='close' then
     -- Closing after a conversation records the evidence but, as the
     -- conversation decision always did, no engagement step.
     perform crm_security.event(l.id,'conversation_recorded',source||':conversation',note,chan,case when chan='phone' then 'spoke_with_contact' end,t.id,happened);
     l.last_conversation_at:=happened; l.outreach_cycle:=l.outreach_cycle+1; l.outreach_anchor_date:=null; l.last_attempt_at:=null;
    else
     perform crm_security.event(l.id,case when chan='whatsapp' then 'whatsapp_conversation' else 'conversation_recorded' end,
      source||case when chan='whatsapp' then ':whatsapp' else ':conversation' end,note,nullif(chan,'other'),
      case when chan='phone' and cmd in ('record_call_outcome','log_exchange') then 'spoke_with_contact' end,
      case when chan='phone' then t.id end,happened);
     meaningful:=true;
     -- Old call wrapper: the call task spoken on is completed, as before.
     if next_mode='legacy' and t.id is not null then
      perform crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false,'reason',note)),'outcome',source||':complete');
     end if;
    end if;
   elsif res='whatsapp_sent' then
    perform crm_security.event(l.id,'whatsapp_sent',source||':whatsapp',note,'whatsapp',null,null,happened);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj,'user',source); needs_next:=true; end if;
   else
    perform crm_security.event(l.id,'note_added',source||':note',note);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj,'user',source); needs_next:=true; end if;
   end if;
   if cmd='log_exchange' and res='spoke' and next_mode in ('spec','enrol') then
    -- Qualification is implied (OD-11).
    qualify_step:=case when next_mode='enrol' then 'enrollment'
     when next_obj->>'task_type'='center_visit' and coalesce((next_obj->>'with_test')::boolean,false) then 'placement_test'
     when next_obj->>'task_type'='center_visit' then 'center_visit' end;
   end if;

  elsif cmd='schedule_task' then
   if t.id is null then tid:=crm_security.set_next_action(l,crm_security.legacy_spec(data->'task'),'user',source);
   else
    next_spec:=data->'task';
    if jsonb_typeof(next_spec) is distinct from 'object' or next_spec-array['due_at','instructions']<>'{}'::jsonb then raise exception 'Reschedule accepts due_at and instructions only' using errcode='22023'; end if;
    tid:=crm_security.set_next_action(l,jsonb_build_object('_reschedule',next_spec||jsonb_build_object('task_id',t.id)),'user',source);
    perform crm_security.event(l.id,'task_rescheduled',source||':rescheduled',data->>'note',null,null,t.id);
   end if;

  elsif cmd in ('complete_task','cancel_task') then
   if cmd='complete_task' then
    if t.task_type in ('first_contact','contact_attempt','callback') then raise exception 'Complete call tasks through record_call_outcome' using errcode='22023'; end if;
    if nullif(btrim(data->>'outcome'),'') is null or length(data->>'outcome')>200 then raise exception 'Completion outcome required' using errcode='22023'; end if;
   elsif nullif(btrim(data->>'reason'),'') is null then raise exception 'Cancellation reason required' using errcode='22023';
   end if;
   if data ? 'next_task' and data->'next_task'<>'null'::jsonb then
    tid:=crm_security.set_next_action(l,crm_security.legacy_spec(data->'next_task')||jsonb_build_object('_against',t.id,'_note',case when cmd='complete_task' then data->>'outcome' end,
     '_replaced_reason',case when cmd='cancel_task' then data->>'reason' end,'replace_action_id',t.id),case when cmd='complete_task' then 'outcome' else 'user' end,source);
   else
    tid:=crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',cmd='cancel_task',
     'reason',case when cmd='complete_task' then data->>'outcome' else data->>'reason' end)),'user',source||case when cmd='complete_task' then ':complete' else ':cancel' end);
   end if;
   needs_next:=true;

  elsif cmd='qualify_lead' then
   if l.status not in ('NEW','CONTACTING','ENGAGED') then raise exception 'Lead must be unqualified and active' using errcode='22023'; end if;
   if data->>'conversation_channel' is not null then
    if data->>'conversation_channel' not in ('phone','whatsapp','in_person') then raise exception 'Conversation evidence required' using errcode='22023'; end if;
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'conversation_channel');
    meaningful:=true;
   elsif l.last_conversation_at is null or not exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then
    raise exception 'Qualification requires meaningful conversation evidence' using errcode='22023';
   end if;
   target:=data->>'qualification_step';
   if target is null or target not in ('placement_test','center_visit','enrollment','other') or (target='other' and nullif(btrim(data->>'note'),'') is null) then raise exception 'Valid qualification step and explanation required' using errcode='22023'; end if;
   if data->'next_task' is null or data->'next_task'='null'::jsonb then raise exception 'Qualification next task required' using errcode='22023'; end if;
   if (target='placement_test' and data->'next_task'->>'task_type' is distinct from 'confirm_placement_test')
    or (target='center_visit' and data->'next_task'->>'task_type' is distinct from 'center_visit')
    or (target='enrollment' and data->'next_task'->>'task_type' is distinct from 'enrollment_followup') then raise exception 'Task must match qualification step' using errcode='22023'; end if;
   l.qualification_step:=target;
   next_mode:='spec'; next_obj:=crm_security.legacy_spec(data->'next_task')||case when target='center_visit' then jsonb_build_object('keep_existing',true) else '{}'::jsonb end;

  elsif cmd in ('close_lost','close_not_qualified','close_prospect') then
   close_target:=case cmd when 'close_lost' then 'LOST' when 'close_not_qualified' then 'NOT_QUALIFIED' else data->>'status' end;
   close_reason:=data->>'reason'; close_note:=data->>'note'; next_mode:='close'; note:=null;

  elsif cmd='change_next_action' then
   -- The action the user saw must still be the current one (NF-1).
   if (data->>'expected_action_id') is distinct from na.id::text then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end;
   if jsonb_typeof(data->'next')='object' and data->'next' ? 'close' then next_mode:='close'; next_obj:=data->'next'->'close';
    close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note';
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   else
    tid:=crm_security.set_next_action(l,crm_security.user_spec(data->'next'),'user',source); needs_next:=true;
   end if;

  elsif cmd='appointment_outcome' then
   outcome_code:=data->>'outcome_code';
   if outcome_code is null or outcome_code not in ('came_enrolled','came_will_return','came_not_interested','no_show') then raise exception 'Valid appointment outcome required' using errcode='22023'; end if;
   if na.id is null or (data->>'action_id') is distinct from na.id::text or na.task_type<>'center_visit' then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   if na.due_at>now() then raise exception 'Outcome can be recorded only from the appointment time' using errcode='22023',hint='crm_appointment.before_start'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end; res:=outcome_code;
   -- The linked test: attended, or « Absent » for a no-show.
   if na.placement_test_id is not null then
    update public.placement_tests set status=case when outcome_code='no_show' then 'Absent' else 'Passé' end where id=na.placement_test_id and status='Planifié';
   end if;
   if outcome_code='came_not_interested' or (jsonb_typeof(data->'next')='object' and data->'next' ? 'close') then
    next_obj:=coalesce(data->'next'->'close',jsonb_build_object('status','LOST','reason','not_interested'));
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
    close_target:=coalesce(next_obj->>'status','LOST'); close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note'; next_mode:='close';
    perform crm_security.set_next_action(l,jsonb_build_object('_against',na.id,'_finish',jsonb_build_object('cancelled',false,'reason',note),'_outcome_code',outcome_code),'outcome',source||':complete');
   else
    next_obj:=case when jsonb_typeof(data->'next')='object' then crm_security.user_spec(data->'next')
     when outcome_code='came_enrolled' then jsonb_build_object('task_type','enrollment_followup','due_preset','tomorrow','instructions','Finaliser l’inscription avec le contact.')
     when outcome_code='came_will_return' then jsonb_build_object('task_type','awaiting_prospect')
     else jsonb_build_object('task_type','callback','schedule_kind','reminder','due_preset','tomorrow') end;
    if outcome_code='came_enrolled' then l.qualification_step:='enrollment'; end if;
    tid:=crm_security.set_next_action(l,next_obj||jsonb_build_object('_outcome_of',na.id,'_outcome_code',outcome_code,'_note',note),'outcome',source);
    needs_next:=true;
   end if;

  elsif cmd in ('reopen_lead','reopen_prospect') then
   if l.status not in ('LOST','NOT_QUALIFIED') or nullif(btrim(data->>'reason'),'') is null then raise exception 'Closed lead and reopen reason required' using errcode='22023'; end if;
   l.status:=case when exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then 'ENGAGED' else 'CONTACTING' end;
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   l.closure_reason:=null;l.closure_note:=null;l.closed_at:=null;l.qualification_step:=null;
   if cmd='reopen_lead' and (data->'next_task' is null or data->'next_task'='null'::jsonb) then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   if cmd='reopen_prospect' and (data->'next' is null or jsonb_typeof(data->'next')<>'object') then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'lead_reopened',source||':reopened',data->>'reason',null,null,null,null,null,null,initial_status,l.status);
   note:=data->>'reason';
   next_mode:='spec'; next_obj:=case when cmd='reopen_lead' then crm_security.legacy_spec(data->'next_task') else crm_security.user_spec(data->'next') end;
   needs_next:=true;

  elsif cmd='reassign' then
   if not(data ? 'owner_id') and not(data ? 'assigned_to') then raise exception 'Explicit reassignment required' using errcode='22023'; end if;
   if data ? 'owner_id' then
    perform crm_security.assert_staff((data->>'owner_id')::uuid);l.owner_id:=(data->>'owner_id')::uuid;
    perform crm_security.event(l.id,'lead_reassigned',source||':lead-owner',data->>'note');
    -- §4.6: the next action's assignee follows the owner.
    perform crm_security.set_next_action(l,jsonb_build_object('_reassign',true),'user',source);
   end if;
   if data ? 'assigned_to' then
    if t.id is null then raise exception 'Task required for task reassignment' using errcode='22023'; end if;
    perform crm_security.assert_staff((data->>'assigned_to')::uuid);
    perform crm_security.set_next_action(l,jsonb_build_object('_delegate',jsonb_build_object('task_id',t.id,'assigned_to',data->'assigned_to')),'user',source);
    perform crm_security.event(l.id,'task_reassigned',source||':task-owner',data->>'note',null,null,t.id);
   end if;
   note:=data->>'note';
  end if;

  -- Closure (old close commands, « Pas intéressé / Pas pour nous » in an
  -- exchange or a change, appointment « pas intéressé »).
  if next_mode='close' then
   reason:=close_reason; target:=close_target;
   if target is null or target not in ('LOST','NOT_QUALIFIED') or reason is null or (target='LOST' and reason<>all(array['unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other']))
    or (target='NOT_QUALIFIED' and reason<>all(array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other']))
    or (reason='other' and nullif(btrim(close_note),'') is null) then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   if reason='unreachable' and (l.status not in ('CONTACTING','ENGAGED','QUALIFIED') or crm_security.failed_count(l)<5) then raise exception 'Unreachable requires five current-cycle failed phone calls' using errcode='22023'; end if;
   perform crm_security.event(l.id,case when target='LOST' then 'lead_lost' else 'lead_not_qualified' end,source||':closed',close_note,null,reason,null,null,null,null,l.status,target);
   l.status:=target;l.closure_reason:=reason;l.closure_note:=close_note;l.closed_at:=now();
   perform crm_security.set_next_action(l,jsonb_build_object('none',true,'reason','Lead closed: '||reason),'close',source||':cancel');
   note:=concat_ws(' — ',note,nullif(btrim(close_note),''));
  end if;

  if meaningful then
   if happened<greatest(l.last_conversation_at,l.last_attempt_at) then
    raise exception 'Conversation predates the latest outreach evidence' using errcode='22023'; end if;
   l.last_conversation_at:=happened;
   -- A conversation interrupts outreach even for an already qualified lead.
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   if l.status in ('NEW','CONTACTING') then
    perform crm_security.event(l.id,'lead_engaged',source||':engaged',null,null,null,null,null,null,null,l.status,'ENGAGED');
    l.status:='ENGAGED';
   end if;
   if next_mode not in ('spec','enrol') then
    perform crm_security.set_next_action(l,jsonb_build_object('_cancel_slots','Meaningful conversation ended outreach'),'user',source||':cancel-attempt');
   end if;
   needs_next:=true;
  end if;
  if cmd='qualify_lead' or (qualify_step is not null and l.status in ('NEW','CONTACTING','ENGAGED')) then
   perform crm_security.event(l.id,'lead_qualified',source||':qualified',data->>'note',null,null,null,null,null,null,'ENGAGED','QUALIFIED');
   l.status:='QUALIFIED';needs_next:=true;
  end if;
  if qualify_step is not null then l.qualification_step:=qualify_step; end if;
  if next_mode in ('spec','enrol') and cmd in ('record_call_outcome','record_whatsapp','record_conversation','log_exchange','qualify_lead','reopen_lead','reopen_prospect')
   and coalesce(res,'') not in ('no_answer','busy','declined','unreachable','wrong_number','whatsapp_sent','note') then
   cause:=case when cmd in ('reopen_lead','reopen_prospect','qualify_lead') then 'user' else 'outcome' end;
   tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null and cause='outcome' and cmd<>'log_exchange' then jsonb_build_object('_against',t.id) else '{}'::jsonb end,
    cause,source);
   needs_next:=true;
  end if;
  if needs_next and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and not exists(select 1 from public.crm_tasks where lead_id=l.id and status='open') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  update public.crm_leads set status=l.status,owner_id=l.owner_id,qualification_step=l.qualification_step,
   closure_reason=l.closure_reason,closure_note=l.closure_note,closed_at=l.closed_at,outreach_cycle=l.outreach_cycle,
   outreach_anchor_date=l.outreach_anchor_date,last_attempt_at=l.last_attempt_at,last_conversation_at=l.last_conversation_at,
   version=version+1,updated_at=now() where id=l.id;
  if not nested and cmd<>'resolve_submission' then
   select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
   after_label:=crm_security.action_label(na);
   perform crm_security.primary_event(l.id,cmd,note,primary_channel,res,before_label,after_label,case when res is not null then happened end,
    jsonb_build_object('result_label',crm_security.result_label(res),'real_attempt_override',case when (data->>'real_attempt_override')::boolean then true end));
  end if;
  result:=crm_security.result(l.id,source);
 end if;
 if not nested and cmd not in ('create_followup_policy','resolve_submission') then perform set_config('eh.crm_command_key','',true); end if;
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,cmd,request,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM command input' using errcode='22023';
end $function$;

-- ---------------------------------------------------------------------------
-- 9. The other writers of the §4.2 inventory, rebuilt from their live bodies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_security.accept_external_submission(sid uuid, contact uuid DEFAULT NULL::uuid, lead uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.crm_submissions;l public.crm_leads;p public.crm_followup_policies;
 d jsonb;due timestamptz;tid uuid;actor_kind text:=case when auth.uid() is null then 'integration' else 'user' end;begin
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Outermost identity barrier required' using errcode='42501';end if;
 select * into strict s from public.crm_submissions where id=sid for update;
 if s.match_status<>'needs_review' then raise exception 'Unresolved intake required' using errcode='PT409';end if;
 d:=s.core_fields;
 if lead is null then
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by effective_from desc,version desc limit 1;
  if not found then raise exception 'missing_policy' using errcode='P0001';end if;
  if nullif(btrim(d->>'contact_name'),'') is null or nullif(btrim(d->>'program_interest_text'),'') is null
   or (nullif(btrim(d->>'learner_name'),'') is null and not crm_security.mapping_learner_optional(s.id))
   then raise exception 'Contact, program and permitted learner identity required' using errcode='22023';end if;
  if nullif(btrim(d->>'learner_name'),'') is null and crm_security.normalize_phone(d->>'phone') is null and nullif(lower(btrim(d->>'email')),'') is null
   then raise exception 'Contact method required' using errcode='22023';end if;
  if contact is null then
   insert into public.crm_contacts(display_name,contact_kind,phone_raw,phone_e164,whatsapp_raw,whatsapp_e164,email_raw,email_normalized,created_by)
   values(d->>'contact_name','unknown',d->>'phone',crm_security.normalize_phone(d->>'phone'),d->>'whatsapp',crm_security.normalize_phone(d->>'whatsapp'),d->>'email',nullif(lower(btrim(d->>'email')),''),auth.uid()) returning id into contact;
  else
   perform 1 from public.crm_contacts where id=contact and merged_into_contact_id is null for update;
   if not found then raise exception 'Contact unavailable' using errcode='PT409';end if;
  end if;
  due:=crm_security.next_window(p.id,greatest(now(),s.received_at+make_interval(mins=>p.first_contact_sla_minutes)));
  -- §4.6 / OD-6: intake belongs to the director-chosen default owner, or nobody.
  insert into public.crm_leads(contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,owner_id,
   first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(contact,case when nullif(btrim(d->>'learner_name'),'') is null then null else d->>'learner_name' end,
   lower(nullif(btrim(d->>'learner_name'),'')),(d->>'learner_age')::integer,case when d->>'learner_age' is not null then s.received_at end,
   (d->>'learner_birth_date')::date,d->>'session_type',d->>'program_interest_text',crm_security.reception_default_owner(),s.id,s.id,p.id,(due at time zone public.centre_utc_offset())::date) returning * into l;
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,to_status)
  values(l.id,now(),auth.uid(),actor_kind,'lead_created','external-intake:'||s.id||':lead','NEW');
  tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','first_contact','due_at',due,'_key','attempt:'||l.id||':1:1','_kind','intake',
   '_ordinal',1,'_event_source','external-intake:'||s.id||':task','_intake_actor',actor_kind),'intake','external-intake:'||s.id);
 else
  select * into l from public.crm_leads where id=lead for update;
  if not found or l.merged_into_lead_id is not null or l.status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then raise exception 'Active lead required' using errcode='PT409';end if;
  update public.crm_leads set latest_submission_id=case when row(s.occurred_at,s.received_at,s.id)>
   (select x.occurred_at,x.received_at,x.id from public.crm_submissions x where x.id=l.latest_submission_id) then s.id else latest_submission_id end,
   version=version+1,updated_at=now() where id=l.id;
 end if;
 update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=auth.uid(),resolved_at=now() where id=s.id;
 insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,submission_id)
 values(l.id,now(),auth.uid(),actor_kind,'submission_received','external-intake:'||s.id||':submission',s.id);
 perform crm_security.lifecycle_pending_handoff(s.id);
 return l.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_record_conversation_decision(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
 actor uuid:=auth.uid(); decision text:=p_data->>'decision'; channel text:=coalesce(p_data->>'channel','phone'); digest text; source text;
 note text:=case when nullif(btrim(p_data->>'note'),'') is not null then p_data->>'note' end; next_spec jsonb:=p_data->'next_task';
 prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; t public.crm_tasks%rowtype; obsolete public.crm_tasks%rowtype;
 result jsonb; data jsonb; inner_key uuid:=gen_random_uuid(); before_label text; na public.crm_tasks%rowtype;
begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32768
 or p_data-array['lead_id','expected_version','task_id','expected_task_version','decision','channel','note','next_task','qualification_step','reason']<>'{}'::jsonb
 or decision is null or decision not in ('callback','considering','qualify','lost','not_qualified')
 or channel not in ('phone','whatsapp','in_person') or length(p_data->>'note')>4000 then
  raise exception 'Conversation evidence and valid decision required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':conversation_decision:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='conversation_decision' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 if not found then raise exception 'Lead not found' using errcode='22023'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
 if l.status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED') or l.merged_into_lead_id is not null then
  raise exception 'Active operational lead required' using errcode='22023'; end if;
 -- Same lead-before-task lock ordering as Phase 3. Lock all affected tasks in UUID order.
 perform 1 from public.crm_tasks where lead_id=l.id and status='open' order by id for update;
 if p_data->>'task_id' is not null then
  if channel<>'phone' then raise exception 'Only a phone conversation completes a call task' using errcode='22023'; end if;
  select * into t from public.crm_tasks where id=(p_data->>'task_id')::uuid and lead_id=l.id and status='open';
  if not found or t.version is distinct from (p_data->>'expected_task_version')::bigint then
   raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
  if t.task_type not in ('first_contact','contact_attempt','callback') then raise exception 'Phone outcome requires a call task' using errcode='22023'; end if;
 elsif p_data ? 'expected_task_version' then raise exception 'Task required for task version' using errcode='22023'; end if;
 if now()<greatest(l.last_attempt_at,l.last_conversation_at) then raise exception 'Conversation predates outreach evidence' using errcode='22023'; end if;
 if decision in ('lost','not_qualified') and (p_data ? 'next_task' or p_data ? 'qualification_step') then
  raise exception 'Closure must not schedule an action' using errcode='22023'; end if;
 if decision='lost' and p_data->>'reason' is distinct from 'not_interested' then
  raise exception 'Conversation Lost decision requires not_interested' using errcode='22023'; end if;
 if decision in ('callback','considering','qualify') and p_data ? 'reason' then raise exception 'Unexpected closure reason' using errcode='22023'; end if;
 if decision='callback' and (p_data ? 'qualification_step' or next_spec->>'task_type' is distinct from 'callback') then
  raise exception 'Callback decision requires a callback' using errcode='22023'; end if;
 -- En réflexion is follow-up metadata on the next contact, never a stage: the
 -- conversation command still derives status, so QUALIFIED stays QUALIFIED.
 if decision='considering' and (p_data ? 'qualification_step' or coalesce(next_spec->>'task_type','') not in ('callback','whatsapp_followup')) then
  raise exception 'Considering decision requires a callback or WhatsApp follow-up' using errcode='22023'; end if;
 if decision<>'considering' and jsonb_typeof(next_spec)='object' and next_spec ? 'followup_reason' then
  raise exception 'Only the considering decision sets a follow-up reason' using errcode='22023'; end if;
 if decision='considering' then next_spec:=next_spec||jsonb_build_object('followup_reason','considering'); end if;
 source:='command:'||actor||':conversation_decision:'||p_request_key;
 -- One history entry for the whole decision (§4.7); inner commands are nested.
 perform set_config('eh.crm_command_key',source,true);
 select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
 before_label:=crm_security.action_label(na);
 -- Structured outcome facts are sufficient evidence; prose stays optional. Inner
 -- commands still require explanations for Other qualification/closure reasons.
 data:=jsonb_build_object('lead_id',l.id,'expected_version',l.version)||case when note is not null then jsonb_build_object('note',note) else '{}'::jsonb end;
 -- One active generic commercial follow-up: the latest conversation decision
 -- replaces any open callback or WhatsApp follow-up, whatever the channel.
 -- Visits, placement, enrollment and other operational tasks are untouched.
 -- With one next action, the decision's action replaces the current one
 -- through the single writer (an appointment or enrolment action is kept, OD-18).
 if decision in ('callback','considering') then
  -- Existing conversation commands validate/finish the selected call task,
  -- record channel evidence and derive the resulting status.
  if channel='phone' then
   result:=crm_security.command('record_call_outcome',inner_key,data||jsonb_build_object('outcome','spoke_with_contact','next_task',next_spec)||
    case when t.id is not null then jsonb_build_object('task_id',t.id,'expected_task_version',t.version) else '{}'::jsonb end);
  elsif channel='whatsapp' then
   result:=crm_security.command('record_whatsapp',inner_key,data||jsonb_build_object('kind','meaningful_whatsapp_conversation','next_task',next_spec));
  else
   result:=crm_security.command('record_conversation',inner_key,data||jsonb_build_object('channel','in_person','next_task',next_spec));
  end if;
 else
  if t.id is not null then
   perform crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false,'reason',note)),'outcome',source||':complete');
  end if;
  if decision='qualify' then
   -- Reuse qualification validation, lifecycle, outreach cancellation and task rules.
   result:=crm_security.command('qualify_lead',inner_key,data||jsonb_build_object('conversation_channel',channel,
    'qualification_step',p_data->>'qualification_step','next_task',next_spec));
  else
   -- Closing a conversation requires evidence but deliberately no temporary follow-up.
   perform crm_security.event(l.id,'conversation_recorded',source||':conversation',note,channel,case when channel='phone' then 'spoke_with_contact' end,t.id);
   update public.crm_leads set last_conversation_at=now(),outreach_cycle=outreach_cycle+1,
    outreach_anchor_date=null,last_attempt_at=null where id=l.id;
   result:=crm_security.command(case when decision='lost' then 'close_lost' else 'close_not_qualified' end,
    inner_key,data||jsonb_build_object('reason',p_data->>'reason'));
  end if;
 end if;
 result:=jsonb_set(result,'{activity_ids}',coalesce(result->'activity_ids','[]'::jsonb)||
   coalesce((select jsonb_agg(id order by created_at,id) from public.crm_activities where lead_id=l.id and starts_with(source_key,source||':')),'[]'::jsonb));
 -- Inner keys are private, fresh per execution; callers cannot prepopulate a nested
 -- command replay. The outer request owns replay of the complete business decision.
 select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
 perform crm_security.primary_event(l.id,'conversation_decision',note,channel,'spoke',before_label,crm_security.action_label(na),null,
  jsonb_build_object('result_label','On a parlé'));
 perform set_config('eh.crm_command_key','',true);
 result:=jsonb_set(result,'{next_action}',coalesce(crm_security.next_action(l.id),'null'::jsonb));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result)
 values(actor::text,'conversation_decision',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM decision input' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.crm_book_placement_test(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype;
 l public.crm_leads%rowtype; p public.placement_tests%rowtype; t public.crm_tasks%rowtype; result jsonb; na public.crm_tasks%rowtype;
 tid uuid; source text:='command:'||auth.uid()||':book_placement:'||p_request_key; before_label text; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['lead_id','expected_version','date_test','heure','examinateur','notes','task_id','expected_task_version']<>'{}'::jsonb then
  raise exception 'Valid bounded booking required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':book_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='book_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 if not found or l.status<>'QUALIFIED' or l.merged_into_lead_id is not null then raise exception 'Qualified active lead required' using errcode='22023'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
 if exists(select 1 from public.placement_tests where crm_lead_id=l.id and status='Planifié') then raise exception 'Placement already scheduled' using errcode='22023'; end if;
 select * into t from public.crm_tasks where lead_id=l.id and task_type='confirm_placement_test' and status='open' order by due_at,id limit 1 for update;
 if t.id is not null then
  if t.id is distinct from (p_data->>'task_id')::uuid or t.version is distinct from (p_data->>'expected_task_version')::bigint then raise exception 'Stale confirmation task; refresh and retry' using errcode='PT409'; end if;
 elsif p_data->>'task_id' is not null then raise exception 'Confirmation task is no longer open' using errcode='PT409'; end if;
 -- Test booking goes through the appointment (§4.3): one « Rendez-vous au
 -- centre » with its test, replacing the current action (booking is the
 -- user's explicit choice, so it carries the « Remplace » confirmation).
 if p_data->>'heure' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid placement booking' using errcode='22023'; end if;
 perform set_config('eh.crm_command_key',source,true);
 select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
 before_label:=crm_security.action_label(na);
 tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','center_visit','schedule_kind','appointment',
  'due_at',((p_data->>'date_test')::date+(p_data->>'heure')::time) at time zone public.centre_utc_offset(),'with_test',true,
  'test_examiner',p_data->>'examinateur','test_notes',p_data->>'notes','replace_action_id',na.id,
  '_note','Test de niveau réservé'),'outcome',source);
 select x.* into strict p from public.placement_tests x join public.crm_tasks k on k.placement_test_id=x.id where k.id=tid;
 select * into na from public.crm_tasks where id=tid;
 perform crm_security.primary_event(l.id,'book_placement',null,null,null,before_label,crm_security.action_label(na),null,jsonb_build_object('result_label','Test de niveau réservé'));
 perform set_config('eh.crm_command_key','',true);
 result:=crm_security.result(l.id,source)||jsonb_build_object('placement',crm_security.placement_summary(p));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'book_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='PT409';
 when unique_violation then raise exception 'Placement already scheduled; refresh' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement booking' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.crm_update_placement_test(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; p public.placement_tests%rowtype; result jsonb; l public.crm_leads%rowtype; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['placement_id','expected_updated_at','expected_version','date_test','heure','examinateur','notes','status','score','niveau_recommande']<>'{}'::jsonb then raise exception 'Valid placement edit required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':update_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='update_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into p from public.placement_tests where id=(p_data->>'placement_id')::uuid and crm_lead_id is not null;
 if not found then raise exception 'CRM placement not found' using errcode='22023'; end if;
 -- NF-2: the prospect version the user saw (lead lock before placement lock,
 -- the order every placement trigger already uses).
 -- The placement check runs first so a stale test keeps its existing message (119
 -- contract); the prospect check (NF-2) follows. Both rows are locked before either.
 select * into l from public.crm_leads where id=p.crm_lead_id for update;
 select * into p from public.placement_tests where id=p.id for update;
 if p.updated_at is distinct from (p_data->>'expected_updated_at')::timestamptz then raise exception 'Stale placement version; refresh and retry' using errcode='PT409'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
 update public.placement_tests set date_test=(p_data->>'date_test')::date,heure=p_data->>'heure',examinateur=p_data->>'examinateur',notes=p_data->>'notes',
 status=p_data->>'status',score=(p_data->>'score')::numeric,niveau_recommande=nullif(p_data->>'niveau_recommande','') where id=p.id returning * into p;
 result:=jsonb_build_object('placement',crm_security.placement_summary(p))||crm_security.result(p.crm_lead_id,'placement-edit:'||p.id);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'update_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='PT409';
 when unique_violation then raise exception 'Placement already scheduled' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement edit or missing result' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.crm_start_enrollment(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; c public.crm_contacts%rowtype;
 s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; a uuid; t public.crm_tasks%rowtype; keep_task uuid;
 learner text; birth date; session text; year text; level text; initial_status text; due timestamptz; result jsonb;
 followup_at timestamptz; followup_task uuid; followup jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
 or p_data-array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date','candidate_review','confirm_new','enrollment_id','expected_enrollment_updated_at','session_type','school_year','level','group_id','initial_status','followup_at','notes']<>'{}'::jsonb then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- EAP (D3): the enrollment is created Confirmed and placed after the payment.
 if p_data->>'group_id' is not null then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- E9: hint only the helper's own lock collision, at its original position.
 -- Every other error, including a malformed student_id cast, propagates as before.
 begin
  perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
 exception when sqlstate 'PT409' then
  if sqlerrm='Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' then
   raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409',hint='crm_enrollment.enrollment_in_progress'; end if;
  raise;
 end;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':start_enrollment:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='start_enrollment' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023',hint='crm_enrollment.request_conflict'; end if;return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 -- E1: one reason per condition of the former combined lead check.
 if not found or l.merged_into_lead_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_unavailable'; end if;
 if l.enrollment_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_already_enrolled'; end if;
 if l.status<>'QUALIFIED' then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_not_qualified'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409',hint='crm_enrollment.lead_changed'; end if;
 select * into strict c from public.crm_contacts where id=l.contact_id;
 learner:=btrim(p_data->>'learner_name');
 -- E3: same cast at the same position; only its cast errors gain a reason.
 begin
  birth:=nullif(p_data->>'birth_date','')::date;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.birth_date_invalid';
 end;
 session:=p_data->>'session_type';year:=p_data->>'school_year';level:=nullif(p_data->>'level','');initial_status:=coalesce(p_data->>'initial_status','Submitted');
 -- E2: the former combined program/year/notes check, split in its original order.
 if session is null or session<>all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One']) then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.program_invalid'; end if;
 if year is null or year!~'^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer<>left(year,4)::integer+1 then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.school_year_invalid'; end if;
 if length(p_data->>'notes')>2000 then raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.notes_too_long'; end if;
 if initial_status is distinct from 'Confirmed' then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501',hint='crm_enrollment.initial_status_not_permitted'; end if;
 if p_data->>'student_choice'='new' then
  -- E3: the same rejected set as 084, one reason per condition. A birth date is
  -- bounded by the Casablanca civil date (enrollment initiation only).
  if l.student_id is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_already_linked'; end if;
  if p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
  if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_name_invalid'; end if;
  if not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_invalid'; end if;
  if birth>public.business_date() then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_future'; end if;
  -- Serializes new-student decisions for equal names, including separate leads.
  perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner),0));
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='PT409',hint='crm_enrollment.candidates_changed'; end if;
  if exists(select 1 from crm_security.student_candidates(l.id,learner,birth)) and coalesce((p_data->>'confirm_new')::boolean,false) is not true then raise exception 'Explicit new learner decision required' using errcode='22023',hint='crm_enrollment.new_learner_confirmation_required'; end if;
  insert into public.students(full_name,date_naissance,telephone,email,parent_email,status,session_type,niveau_cefr,notes)
  values(learner,birth,coalesce(c.phone_e164,c.phone_raw),case when c.contact_kind='adult_learner' then c.email_normalized end,
   case when c.contact_kind<>'adult_learner' then c.email_normalized end,'Prospect',session,level,
   case when c.contact_kind<>'adult_learner' then 'Contact : '||coalesce(c.display_name,'Non renseigné') end) returning * into s;
 elsif p_data->>'student_choice'='existing' then
  select * into s from public.students where id=(p_data->>'student_id')::uuid and deleted_at is null for update;
  -- E4: the former combined check, split by linkage.
  if not found then
   if l.student_id is not null and l.student_id=(p_data->>'student_id')::uuid then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.linked_learner_unavailable'; end if;
   if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
   raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_unavailable';
  end if;
  if l.student_id is not null and l.student_id<>s.id then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
 else raise exception 'Explicit student choice required' using errcode='22023',hint='crm_enrollment.learner_choice_required'; end if;
 if p_data->>'enrollment_id' is not null then
  select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
  -- E5: the former combined check, split into incompatibility and linkage.
  if not found or e.student_id is distinct from s.id or e.status is null or e.status in ('Rejected','Ended')
  or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year then
   raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_incompatible'; end if;
  if exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_already_linked'; end if;
  if e.group_id is not null then
   select * into g from public.groups where id=e.group_id for share;
   if not found or g.session_type is distinct from session or (e.level is not null and g.niveau is distinct from e.level) then
    raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.enrollment_group_incompatible'; end if;
  end if;
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='PT409',hint='crm_enrollment.enrollment_changed'; end if;
 else
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment status requires review' using errcode='22023',hint='crm_enrollment.existing_enrollment_needs_review'; end if;
  -- E6: same condition and message; the hint says whether any match is still selectable.
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended') and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended')
    and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
    then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.group_incompatible'; end if;
   level:=g.niveau;
   -- Batch H (H5): the enrollment year must be the group's (22023: the handler
   -- below turns 23514 into a generic refusal).
   perform academic_security.check_group_year(g.annee, year, '22023');
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023',hint='crm_enrollment.level_invalid'; end if;
  -- EGC (I3): a concurrent duplicate on the one-live-enrollment index is a
  -- record conflict (PT409, egc.duplicate_enrollment), not a raw 23505.
  begin
   insert into public.enrollments(student_id,session_type,school_year,level,group_id,status,date_inscription,notes)
   values(s.id,session,year,level,g.id,initial_status,public.business_date(),p_data->>'notes') returning * into e;
  exception when unique_violation then
   perform academic_security.duplicate();
  end;
 end if;
 update public.crm_leads set student_id=s.id,enrollment_id=e.id,version=version+1,updated_at=now() where id=l.id;
 insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
 values(l.id,e.id,now(),actor,'user','enrollment_started','enrollment-started:'||l.id||':'||e.id,'Inscription rattachée à l’apprenant.') returning id into a;
 perform crm_security.evaluate_conversion(l.id,statement_timestamp());
 if (select status from public.crm_leads where id=l.id)<>'CONVERTED' then
  -- Keep the earliest appropriate follow-up, cancel only redundant enrollment tasks.
  select * into t from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' order by due_at,id limit 1 for update;
  if t.id is null then
   -- E7: pre-checks logically identical to next_window and new_task, in their
   -- order; new_task still validates. An empty string stays a parse error.
   begin
    followup_at:=(p_data->>'followup_at')::timestamptz;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.followup_invalid';
   end;
   if not isfinite(followup_at) then raise exception 'Finite due time required' using errcode='22023',hint='crm_enrollment.followup_invalid'; end if;
   begin
    due:=crm_security.next_window(crm_security.current_policy_id(),coalesce(followup_at,now()+interval '1 day'));
   exception when invalid_parameter_value then
    if sqlerrm='Policy has no available calling window' then
     raise exception 'Policy has no available calling window' using errcode='22023',hint='crm_enrollment.followup_policy_unavailable'; end if;
    raise;
   end;
   if due<now() then raise exception 'Valid future task required' using errcode='22023',hint='crm_enrollment.followup_in_past'; end if;
   if l.owner_id is not null and not exists(select 1 from public.profiles where id=l.owner_id and role in ('director','admin','receptionist')) then
    raise exception 'Assignee must be operational staff' using errcode='22023',hint='crm_enrollment.owner_not_operational'; end if;
   -- « Finaliser l'inscription » replaces the current action (§4.2).
   followup_task:=crm_security.set_next_action(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le contact.',
    '_key','enrollment-followup:'||l.id||':'||e.id,'_kind','enrollment','_replaced_reason','Remplacée par « Finaliser l’inscription »'),'enrollment','enrollment-followup:'||l.id||':'||e.id);
   followup:=jsonb_build_object('id',followup_task,'created',true);
  else
   keep_task:=t.id;
   -- An open « Finaliser l'inscription » is kept; every other open action goes.
   perform crm_security.set_next_action(l,jsonb_build_object('_keep_task_id',keep_task,'_reason','Suivi de cette inscription déjà prévu'),'enrollment','enrollment-duplicate:'||e.id);
   followup_task:=keep_task;followup:=jsonb_build_object('id',keep_task,'created',false);
  end if;
  -- E8: the created or retained task, read by id; never the loop variable.
  followup:=followup||crm_security.scheduled_civil((select due_at from public.crm_tasks where id=followup_task));
 end if;
 result:=crm_security.result(l.id,'enrollment-started:'||l.id||':'||e.id)||jsonb_build_object('enrollment',crm_security.enrollment_summary(e),'enrollment_followup',followup);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'start_enrollment',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='PT409',hint='crm_enrollment.concurrent_change';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.record_rejected';
end $function$;

-- Test results (083 trigger, fires on every insert or update of a CRM test,
-- whatever the screen). It keeps its lead lock, milestone events and version
-- bump. « Proposer l'inscription » replaces the appointment linked to this test
-- or a system reminder; « En attente », an agreed callback or appointment still
-- to come and an enrolment action are kept (§4.2). A rescheduled test moves the
-- appointment it belongs to.
create or replace function crm_security.placement_milestones()
 returns trigger language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare l public.crm_leads%rowtype; a uuid; cur public.crm_tasks%rowtype; linked uuid; begin
 if new.crm_lead_id is null then return new; end if;
 -- Serialize against closure/reopening and other results for the same lead.
 select * into strict l from public.crm_leads where id=new.crm_lead_id for update;
 if tg_op='INSERT' then
  perform crm_security.placement_event(new,'placement_test_booked','placement-booked:'||new.id,
   to_char(new.date_test,'DD/MM/YYYY')||' · '||new.heure);
 elsif new.date_test is distinct from old.date_test or new.heure is distinct from old.heure then
  perform crm_security.placement_event(new,'placement_test_rescheduled','placement-rescheduled:'||new.id||':'||gen_random_uuid(),
   to_char(old.date_test,'DD/MM/YYYY')||' · '||old.heure||' → '||to_char(new.date_test,'DD/MM/YYYY')||' · '||new.heure);
  if new.status='Planifié' and coalesce(current_setting('eh.crm_next_action_writer',true),'')<>'1' then
   select id into linked from public.crm_tasks where placement_test_id=new.id and status='open' and task_type='center_visit' order by id limit 1;
   if linked is not null then
    perform crm_security.set_next_action(l,jsonb_build_object('_reschedule',jsonb_build_object('task_id',linked,
     'due_at',(new.date_test+crm_security.calendar_time(new.heure)) at time zone public.centre_utc_offset())),'system','placement-rescheduled:'||new.id);
   end if;
  end if;
 end if;
 if new.status in ('Passé','Résultat saisi','Affecté') then
  perform crm_security.placement_event(new,'placement_test_attended','placement-attended:'||new.id,'Test de niveau passé.');
 end if;
 if new.status in ('Résultat saisi','Affecté') then
  a:=crm_security.placement_event(new,'placement_result_entered','placement-result:'||new.id,'Niveau recommandé : '||new.niveau_recommande);
  -- A closed lead records the result, never a sales task. The immutable milestone
  -- also prevents a later edit/reopen from manufacturing another result follow-up.
  if a is not null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null then
   select * into cur from public.crm_tasks where id=crm_security.next_action_id(l.id);
   if cur.id is null or not (cur.task_type in ('awaiting_prospect','enrollment_followup')
    or (crm_security.is_appointment(cur) and cur.due_at>now() and cur.placement_test_id is distinct from new.id)) then
    perform crm_security.set_next_action(l,jsonb_build_object('task_type','post_test_followup',
     'due_at',crm_security.placement_followup_due(l.followup_policy_id,now()),'instructions','Proposer l’inscription au contact après le résultat du test.',
     '_key','placement-post-followup:'||new.id,'_kind','placement_result','_placement_test_id',new.id,'_source_activity_id',a),
     'test_result','placement-post-followup:'||new.id);
   end if;
  end if;
 end if;
 update public.crm_leads set version=version+1,updated_at=now() where id=l.id;
 return new;
end $function$;

-- Conversion (ADR-015 decision 4) is unchanged; only its task-closing
-- statement now goes through the single writer, with the same effect.
create or replace function crm_security.evaluate_conversion(lead uuid, happened timestamptz, previous_status text default null, evidence text default 'linked_confirmed_enrollment')
 returns void language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$
declare l public.crm_leads%rowtype; e public.enrollments%rowtype; a uuid; begin
 select * into l from public.crm_leads where id=lead for update;
 if not found or l.enrollment_id is null then return; end if;
 select * into strict e from public.enrollments where id=l.enrollment_id for update;
 if e.student_id is distinct from l.student_id then raise exception 'CRM enrollment/student mismatch' using errcode='23514'; end if;
 if l.status='CONVERTED' then
  if (e.status is null or e.status not in ('Confirmed','Validated')) and not (e.status='Ended' and previous_status in ('Confirmed','Validated'))
   and (not l.conversion_review_required or previous_status is distinct from e.status and previous_status is not null) then
   insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,details)
   values(l.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'conversion_review_required',
    'conversion-review:'||e.id||':'||gen_random_uuid(),'Inscription modifiée après confirmation : vérification par la direction.',
    jsonb_build_object('previous_enrollment_status',previous_status,'enrollment_status',e.status));
   update public.crm_leads set conversion_review_required=true,version=version+1,updated_at=now() where id=l.id;
  end if;
  return;
 end if;
 if e.status is null or e.status not in ('Confirmed','Validated') then return; end if;
 insert into public.crm_activities(lead_id,enrollment_id,attribution_submission_id,occurred_at,actor_id,actor_kind,event_type,source_key,from_status,to_status,body,details)
 values(l.id,e.id,l.first_submission_id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'lead_converted',
  'conversion:'||l.id||':'||e.id,l.status,'CONVERTED','Inscription confirmée.',jsonb_build_object('enrollment_status',e.status,'evidence',evidence))
 on conflict(source_key) do nothing returning id into a;
 if a is null then select id into strict a from public.crm_activities where source_key='conversion:'||l.id||':'||e.id; end if;
 update public.crm_leads set status='CONVERTED',converted_at=happened,conversion_activity_id=a,
 conversion_review_required=conversion_review_required or l.status in ('LOST','NOT_QUALIFIED'),
 closure_reason=null,closure_note=null,closed_at=null,version=version+1,updated_at=now() where id=l.id;
 -- System confirmations must work without a browser auth identity as well.
 perform crm_security.set_next_action(l,jsonb_build_object('none',true,'_enrollment_id',e.id,'_happened',happened),'conversion','conversion:'||l.id||':'||e.id);
end $function$;

-- ---------------------------------------------------------------------------
-- 10. Readers (invariant 9): every reader shows crm_security.next_action.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_security.opportunity_card(lead uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select jsonb_build_object('id',l.id,'contact_id',l.contact_id,'contact_name',c.display_name,
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
 'status',l.status,'version',l.version,'created_at',l.created_at,'owner_id',l.owner_id,
 'owner_display_label',crm_security.staff_display_label(l.owner_id),
 'owner_name',case when l.owner_id is not null then coalesce(nullif(o.full_name,''),'Équipe accueil') end,
 'source_label',s.source_label,'channel',s.channel,'failed_attempts',crm_security.failed_count(l),
 'closure_reason',l.closure_reason,'closed_at',l.closed_at,'next_action',crm_security.next_action(l.id),
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,
 'version',t.version,'assigned_to',t.assigned_to,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
 'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason)||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',case when p.id is not null then jsonb_build_object('id',p.id,'scheduled_for',(p.date_test+crm_security.calendar_time(p.heure)) at time zone public.centre_utc_offset(),'status',p.status,'local_date',p.date_test,'local_time',crm_security.calendar_time(p.heure)) end,
 'last_activity_at',(select a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1))
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id left join public.profiles o on o.id=l.owner_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.attempt_ordinal,t.schedule_kind,t.followup_reason from public.crm_tasks t where t.id=crm_security.next_action_id(l.id))t on true
 left join lateral(select p.id,p.date_test,p.heure,p.status from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' limit 1)p on true
 where l.id=lead
$function$;

CREATE OR REPLACE FUNCTION crm_security.operational_card(lead uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select jsonb_build_object('id',l.id,'contact_id',c.id,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(l.session_type,l.program_interest_text),
 'failed_attempts',crm_security.failed_count(l),'status',l.status,'version',l.version,'owner_id',l.owner_id,'owner_display_label',crm_security.staff_display_label(l.owner_id),'source_label',s.source_label,'next_action',crm_security.next_action(l.id),
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),
 'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason)||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',(select crm_security.placement_summary(p) from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' order by p.date_test,p.heure,p.id limit 1),
 'post_test_result',(select crm_security.placement_summary(p) from public.placement_tests p where p.id=t.placement_test_id and p.crm_lead_id=l.id and p.status in ('Résultat saisi','Affecté')),
 'last_activity',case when a.id is not null then jsonb_build_object('event_type',a.event_type,'occurred_at',a.occurred_at) end)
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.placement_test_id,t.schedule_kind,t.followup_reason from public.crm_tasks t where t.id=crm_security.next_action_id(l.id))t on true
 left join lateral(select a.id,a.event_type,a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1)a on true
 where l.id=lead
$function$;

CREATE OR REPLACE FUNCTION public.crm_get_today(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_schedule_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb; start_at timestamptz:=((now() at time zone public.centre_utc_offset())::date)::timestamp at time zone public.centre_utc_offset(); end_at timestamptz;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);perform crm_security.check_page(p_limit,p_schedule_offset);
 end_at:=(((now() at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset();
 with active as (
 select l.id,l.status,l.created_at,coalesce(l.last_attempt_at,l.created_at) last_contact,
 coalesce((select max(greatest(f.completed_at,f.cancelled_at)) from public.crm_tasks f where f.lead_id=l.id and f.status<>'open'),l.created_at) unattended_since,
 p.stale_contacting_minutes,t.id task_id,t.due_at,
 exists(select 1 from public.placement_tests x where x.crm_lead_id=l.id and x.status='Planifié' and (x.date_test+x.heure::time) at time zone public.centre_utc_offset()>=now()) scheduled_test,
 exists(select 1 from public.crm_tasks f where f.id=crm_security.next_action_id(l.id) and f.task_type='first_contact') first_contact
 from public.crm_leads l join public.crm_followup_policies p on p.id=l.followup_policy_id
 left join lateral(select t.id,case when t.task_type='awaiting_prospect' then null else t.due_at end due_at from public.crm_tasks t where t.id=crm_security.next_action_id(l.id))t on true
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 ), ranked as (
 select id,case when due_at<now() then 1 when status='NEW' and first_contact then 2 when due_at>=start_at and due_at<end_at then 3
 when task_id is null and not scheduled_test then 4 when status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) then 5 end priority,
 case when due_at<now() then due_at
 when status='NEW' and first_contact then created_at
 when due_at>=start_at and due_at<end_at then due_at
 when task_id is null then unattended_since else last_contact end sort_at,
 status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) stale
 from active
 ), attention as(select id,priority,sort_at,stale from ranked where priority is not null order by priority,sort_at,id limit p_limit offset p_offset),
 appointments as (
 select t.id,t.lead_id,t.task_type,t.due_at,t.version,'task'::text kind,(select crm_security.placement_summary(x) from public.placement_tests x where x.id=t.placement_test_id) placement from public.crm_tasks t join active l on l.id=t.lead_id and t.id=l.task_id
 where t.status='open' and t.task_type<>'awaiting_prospect' and t.due_at>=start_at and t.due_at<end_at
 union all
 select p.id,p.crm_lead_id,'placement_test',(p.date_test+p.heure::time) at time zone public.centre_utc_offset(),null::bigint,'placement',crm_security.placement_summary(p)
 from public.placement_tests p join active a on a.id=p.crm_lead_id where p.status='Planifié' and p.date_test=(now() at time zone public.centre_utc_offset())::date
 and not exists(select 1 from public.crm_tasks k where k.placement_test_id=p.id and k.status='open')
 ), schedule as(select * from appointments order by due_at,kind,id limit p_limit offset p_schedule_offset)
 select jsonb_build_object('as_of',now(),'timezone','Africa/Casablanca',
 'counts',jsonb_build_object('new',(select count(*) from active where status='NEW' and first_contact),
 'overdue',(select count(*) from active a where a.task_id is not null and a.due_at<now()),
 'awaiting',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id and t.id=a.task_id where t.task_type='awaiting_prospect'),
 'callbacks',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id and t.id=a.task_id where t.task_type='callback' and t.due_at>=start_at and t.due_at<end_at),
 'due_today',(select count(*) from active a where a.task_id is not null and a.due_at>=start_at and a.due_at<end_at)),
 'attention_total',(select count(*) from ranked where priority is not null),
 'needs_attention',coalesce((select jsonb_agg(crm_security.operational_card(id)||jsonb_build_object('priority',priority,'stale',stale) order by priority,sort_at,id) from attention),'[]'::jsonb),
 'schedule_total',(select count(*) from appointments),
 'today_schedule',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'placement',s.placement,'task_type',s.task_type,'due_at',s.due_at,'version',s.version,'lead',crm_security.operational_card(s.lead_id)) order by s.due_at,s.kind,s.id) from schedule s),'[]'::jsonb)) into result;
 return result;
end $function$;

-- « Tâches »: one row per prospect (its next action), buckets « En retard »,
-- « Aujourd'hui », « Demain », « À venir », « En attente »; default view
-- « Moi + non attribué » (§4.6). Overdue = open, not awaiting, due_at < now.
create or replace function public.crm_get_work_queue(p_bucket text default 'today', p_assignee_mode text default 'me', p_assignee uuid default null,
 p_owner_mode text default 'all', p_owner uuid default null, p_cursor jsonb default null, p_limit integer default 25)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' set plan_cache_mode to 'force_custom_plan' as $function$
declare stamp timestamptz:=now(); bounds record; fingerprint text; after_due timestamptz; after_id uuid; result jsonb;
begin
 perform crm_security.require_reader(false);
 if p_bucket is null or p_bucket not in ('overdue','today','tomorrow','upcoming','awaiting')
 or p_assignee_mode is null or p_assignee_mode not in ('all','me','unassigned','staff','me_or_unassigned')
 or (p_assignee_mode='staff')<>(p_assignee is not null)
 or p_owner_mode is null or p_owner_mode not in ('all','me','unassigned','staff')
 or (p_owner_mode='staff')<>(p_owner is not null)
 or p_limit is null or p_limit not between 1 and 50 then
 raise exception 'Invalid work filters' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(auth.uid(),p_bucket,p_assignee_mode,p_assignee,p_owner_mode,p_owner)::text);
 perform crm_security.o3_cursor(p_cursor,'work',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','due','id']<>'{}'::jsonb
  or jsonb_typeof(p_cursor->'due') is distinct from 'string'
  or jsonb_typeof(p_cursor->'id') is distinct from 'string' then
  raise exception 'Invalid work cursor' using errcode='22023'; end if;
  after_due:=(p_cursor->>'due')::timestamptz; after_id:=(p_cursor->>'id')::uuid;
  if not isfinite(after_due) then raise exception 'Invalid work cursor' using errcode='22023'; end if;
 end if;
 select * into bounds from crm_security.work_boundaries(stamp);
 -- Counts and the selected page share a single statement snapshot; only page IDs
 -- are enriched. A task's assignee never falls back to its lead's owner.
 with matching as materialized (
  select t.id,t.lead_id,coalesce(t.due_at,'9999-12-31 00:00:00+00'::timestamptz) due_at,
  case when t.task_type='awaiting_prospect' then 'awaiting' when t.due_at<stamp then 'overdue' when t.due_at<bounds.d1 then 'today' when t.due_at<bounds.d2 then 'tomorrow' else 'upcoming' end bucket
  from public.crm_leads l join public.crm_tasks t on t.id=crm_security.next_action_id(l.id)
  where l.merged_into_lead_id is null
  and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and (p_assignee_mode='all' or p_assignee_mode='me' and t.assigned_to=auth.uid()
   or p_assignee_mode='unassigned' and t.assigned_to is null or p_assignee_mode='staff' and t.assigned_to=p_assignee
   or p_assignee_mode='me_or_unassigned' and (t.assigned_to=auth.uid() or t.assigned_to is null))
  and (p_owner_mode='all' or p_owner_mode='me' and l.owner_id=auth.uid()
   or p_owner_mode='unassigned' and l.owner_id is null or p_owner_mode='staff' and l.owner_id=p_owner)),
 page as materialized(select * from matching where bucket=p_bucket
  and (after_due is null or (due_at,id)>(after_due,after_id)) order by due_at,id limit p_limit+1),
 shown as(select * from page order by due_at,id limit p_limit)
 select jsonb_build_object('as_of',stamp,'timezone','Africa/Casablanca',
 'boundaries',jsonb_build_object('d0',bounds.d0,'d1',bounds.d1,'d2',bounds.d2),
 'counts',(select jsonb_object_agg(b,coalesce(n,0)) from unnest(array['overdue','today','tomorrow','upcoming','awaiting'])b
  left join(select bucket,count(*) n from matching group by bucket)x on x.bucket=b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'lead_id',t.lead_id,
  'task_type',t.task_type,'local_date',crm_security.scheduled_civil(t.due_at)->'local_date',
  'local_time',crm_security.scheduled_civil(t.due_at)->'local_time','due_at',t.due_at,'scheduled_end_at',t.scheduled_end_at,
  'version',t.version,'assigned_to',t.assigned_to,'assignee_name',a.full_name,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
  'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason,'review_flag',t.review_flag,
  'next_action',crm_security.action_json(t),
  'siblings',(select count(*) from public.crm_leads z where z.contact_id=l.contact_id and z.merged_into_lead_id is null and z.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')),
  'lead',jsonb_build_object('id',l.id,'version',l.version,'contact_name',c.display_name,
  'failed_attempts',crm_security.failed_count(l),
  'learner_name',l.learner_name,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
  'status',l.status,'owner_id',l.owner_id,'owner_name',o.full_name,'owner_display_label',crm_security.staff_display_label(l.owner_id))) order by s.due_at,s.id)
  from shown s join public.crm_tasks t on t.id=s.id join public.crm_leads l on l.id=s.lead_id
  join public.crm_contacts c on c.id=l.contact_id left join public.profiles a on a.id=t.assigned_to
  left join public.profiles o on o.id=l.owner_id),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),
 'next_cursor',case when (select count(*)>p_limit from page) then
  (select jsonb_build_object('v',1,'kind','work','filter',fingerprint,'due',due_at,'id',id)
   from shown order by due_at desc,id desc limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid work cursor' using errcode='22023';
end $function$;

-- Calendar: one event per appointment (with its test as a badge), plus tests
-- that belong to no appointment (existing students, Admissions). Closed
-- prospects are excluded; completed appointments when « Inclure terminés ».
create or replace function public.crm_get_admissions_calendar(p_start date, p_end date, p_kind text default 'all', p_include_completed boolean default false,
 p_cursor jsonb default null, p_limit integer default 100)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare fingerprint text; after_date date; after_time time; after_kind text; after_id uuid; result jsonb;
begin
 perform crm_security.require_reader(false);
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
 or p_end<=p_start or p_end-p_start>42
 or p_kind is null or p_kind not in ('all','placement','center_visit')
 or p_include_completed is null or p_limit is null or p_limit not between 1 and 100 then
 raise exception 'Invalid calendar range or filters' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(auth.uid(),p_start,p_end,p_kind,p_include_completed)::text);
 perform crm_security.o3_cursor(p_cursor,'calendar',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','date','time','event_kind','id']<>'{}'::jsonb
  or jsonb_typeof(p_cursor->'date') is distinct from 'string'
  or jsonb_typeof(p_cursor->'time') is distinct from 'string'
  or jsonb_typeof(p_cursor->'id') is distinct from 'string'
  or p_cursor->>'event_kind' is null or p_cursor->>'event_kind' not in ('placement','center_visit') then
  raise exception 'Invalid calendar cursor' using errcode='22023'; end if;
  after_date:=(p_cursor->>'date')::date; after_time:=(p_cursor->>'time')::time;
  after_kind:=p_cursor->>'event_kind'; after_id:=(p_cursor->>'id')::uuid;
  if not isfinite(after_date) or after_date<p_start or after_date>=p_end
  or (p_cursor->>'time')!~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?|24:00:00)$' then
  raise exception 'Invalid calendar cursor' using errcode='22023'; end if;
 end if;
 -- Cumulative RLS: admin/director have placement reads; 077 grants receptionist
 -- all placement reads, with 083 restricting linked reads to these same roles.
 -- This projection adds no role or row authority and does not join student data.
 with events as (
  select 'placement'::text kind,p.id,p.crm_lead_id lead_id,p.student_id,p.student_name display_name,
  l.status stage,p.status placement_status,null::text task_type,p.date_test local_date,
  crm_security.calendar_time(p.heure) local_time,
  (p.date_test+crm_security.calendar_time(p.heure)) at time zone public.centre_utc_offset() starts_at,
  null::timestamptz ends_at,p.examinateur examiner_label,null::uuid assigned_to,
  null::text assignee_name,p.updated_at,null::bigint task_version,null::uuid placement_test_id,null::text outcome_code,null::text task_status,l.version lead_version
  from public.placement_tests p left join public.crm_leads l on l.id=p.crm_lead_id
  where p_kind in ('all','placement') and p.date_test>=p_start and p.date_test<p_end
  and (p.status='Planifié' or p_include_completed and p.status in ('Passé','Résultat saisi','Affecté'))
  and (p.crm_lead_id is null or l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED') and l.merged_into_lead_id is null)
  and not exists(select 1 from public.crm_tasks k where k.placement_test_id=p.id and k.task_type='center_visit' and (k.status='open' or p_include_completed and k.status='completed'))
  union all
  select 'center_visit',t.id,t.lead_id,l.student_id,coalesce(l.learner_name,c.display_name),
  l.status,x.status,t.task_type,(t.due_at at time zone public.centre_utc_offset())::date,
  (t.due_at at time zone public.centre_utc_offset())::time,t.due_at,t.scheduled_end_at,x.examinateur,t.assigned_to,
  a.full_name,t.updated_at,t.version,t.placement_test_id,t.outcome_code,t.status,l.version
  from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
  join public.crm_contacts c on c.id=l.contact_id left join public.profiles a on a.id=t.assigned_to
  left join public.placement_tests x on x.id=t.placement_test_id
  where p_kind in ('all','center_visit','placement') and (p_kind<>'placement' or t.placement_test_id is not null)
  and t.task_type='center_visit' and (t.status='open' or p_include_completed and t.status='completed')
  and l.merged_into_lead_id is null and (t.status='completed' or l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED'))
  and l.status not in ('LOST','NOT_QUALIFIED')
  and t.due_at>=p_start::timestamp at time zone public.centre_utc_offset()
  and t.due_at<p_end::timestamp at time zone public.centre_utc_offset()),
 page as materialized(select * from events where after_date is null or
  (local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id)>(after_date,after_time,after_kind collate "C",after_id)
  order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id limit p_limit+1),
 shown as(select * from page order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id limit p_limit)
 select jsonb_build_object('as_of',now(),'timezone','Africa/Casablanca','start_date',p_start,'end_date',p_end,
 'rows',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'lead_id',lead_id,
 'student_id',student_id,'display_name',display_name,'stage',stage,'placement_status',placement_status,
 'task_type',task_type,'local_date',local_date,'local_time',local_time,'starts_at',starts_at,'ends_at',ends_at,
 'examiner_label',examiner_label,'assigned_to',assigned_to,'assignee_name',assignee_name,
 'updated_at',updated_at,'task_version',task_version,'placement_test_id',placement_test_id,'with_test',placement_test_id is not null,
 'outcome_code',outcome_code,'task_status',task_status,'lead_version',lead_version,'outcome_enabled',kind='center_visit' and task_status='open' and starts_at<=now(),
 'end_local_date',crm_security.scheduled_civil(ends_at)->'local_date',
 'end_local_time',crm_security.scheduled_civil(ends_at)->'local_time')
 order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id) from shown),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','calendar','filter',fingerprint,'date',local_date,
 'time',coalesce(local_time,'24:00:00'::time),'event_kind',kind,'id',id)
 from shown order by local_date desc,coalesce(local_time,'24:00:00'::time) desc,kind collate "C" desc,id desc limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid calendar cursor' using errcode='22023';
end $function$;

-- NF-2: a placement edit sends the prospect version the user saw; the
-- placement read carries it so screens opened from the placement list can.
create or replace function public.crm_get_placement(p_test uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.placement_summary(p)||jsonb_build_object('lead_version',l.version) into result
 from public.placement_tests p join public.crm_leads l on l.id=p.crm_lead_id where p.id=p_test;
 return result;
end $$;

-- §4.1: the data-step journal is readable by the director, through this read.
create or replace function public.crm_list_data_step_journal(p_step text default null, p_limit integer default 50, p_offset integer default 0)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare result jsonb; begin
 perform crm_security.require_reader(true);
 perform crm_security.check_page(p_limit,p_offset);
 if p_step is not null and p_step !~ '^[a-z][a-z0-9_]*$' then raise exception 'Invalid data step' using errcode='22023'; end if;
 select jsonb_build_object('total',(select count(*) from public.crm_data_step_journal j where p_step is null or j.step=p_step),
  'rows',coalesce((select jsonb_agg(to_jsonb(j) order by j.run_at desc,j.id) from (select * from public.crm_data_step_journal j
   where p_step is null or j.step=p_step order by j.run_at desc,j.id limit p_limit offset p_offset) j),'[]'::jsonb)) into result;
 return result;
end $function$;
revoke all on function public.crm_list_data_step_journal(text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.crm_list_data_step_journal(text,integer,integer) to authenticated;

-- History (§4.7): primary rows (and legacy rows without a command key);
-- secondary rows only with « Détails ». The actor is the profile's full name.
drop function public.crm_get_timeline(uuid,jsonb,integer);
create function public.crm_get_timeline(p_lead uuid, p_cursor jsonb default null, p_limit integer default 20, p_details boolean default false)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare result jsonb; fingerprint text:=md5(jsonb_build_array(p_lead,coalesce(p_details,false))::text); stamp timestamptz; cid uuid;
begin
 perform crm_security.require_reader(false);
 if p_lead is null or p_limit is null or p_limit not between 1 and 50 or p_details is null then raise exception 'Invalid timeline input' using errcode='22023'; end if;
 perform crm_security.o3_cursor(p_cursor,'timeline',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','at','id']<>'{}'::jsonb or jsonb_typeof(p_cursor->'at') is distinct from 'string' or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'Invalid cursor' using errcode='22023'; end if;
  stamp:=(p_cursor->>'at')::timestamptz; cid:=(p_cursor->>'id')::uuid;
  if not isfinite(stamp) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 end if;
 with page as materialized(select a.id,a.occurred_at,a.event_type,a.body,a.outcome,a.actor_id,a.actor_kind,a.channel,a.details,a.command_key,a.is_primary from public.crm_activities a
 where a.lead_id=p_lead and (p_details or a.is_primary or a.command_key is null)
 and (stamp is null or (a.occurred_at,a.id)<(stamp,cid)) order by a.occurred_at desc,a.id desc limit p_limit+1),
 shown as(select * from page order by occurred_at desc,id desc limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'occurred_at',a.occurred_at,'event_type',a.event_type,'body',a.body,'outcome',a.outcome,
 'channel',a.channel,'is_primary',a.is_primary,'command',a.details->>'command','summary',a.details->>'summary',
 'secondary_count',case when a.is_primary then (select count(*) from public.crm_activities s where s.lead_id=p_lead and s.command_key=a.command_key and not s.is_primary) end,
 'actor_name',coalesce(nullif(p.full_name,''),case when a.actor_kind='user' then 'Équipe accueil' else 'Système' end)) order by a.occurred_at desc,a.id desc) from shown a left join public.profiles p on p.id=a.actor_id),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','timeline','filter',fingerprint,'at',a.occurred_at,'id',a.id) from shown a order by a.occurred_at,a.id limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid cursor' using errcode='22023';
end $function$;
revoke all on function public.crm_get_timeline(uuid,jsonb,integer,boolean) from public, anon, authenticated, service_role;
grant execute on function public.crm_get_timeline(uuid,jsonb,integer,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Public commands (§4.3) and pre-check reads.
-- ---------------------------------------------------------------------------
create or replace function public.crm_log_exchange(p_request_key uuid, p_data jsonb)
 returns jsonb language sql security definer set search_path to 'pg_catalog','pg_temp' as $function$ select crm_security.command('log_exchange',p_request_key,p_data) $function$;
create or replace function public.crm_change_next_action(p_request_key uuid, p_data jsonb)
 returns jsonb language sql security definer set search_path to 'pg_catalog','pg_temp' as $function$ select crm_security.command('change_next_action',p_request_key,p_data) $function$;
create or replace function public.crm_record_appointment_outcome(p_request_key uuid, p_data jsonb)
 returns jsonb language sql security definer set search_path to 'pg_catalog','pg_temp' as $function$ select crm_security.command('appointment_outcome',p_request_key,p_data) $function$;
create or replace function public.crm_close_prospect(p_request_key uuid, p_data jsonb)
 returns jsonb language sql security definer set search_path to 'pg_catalog','pg_temp' as $function$ select crm_security.command('close_prospect',p_request_key,p_data) $function$;
create or replace function public.crm_reopen_prospect(p_request_key uuid, p_data jsonb)
 returns jsonb language sql security definer set search_path to 'pg_catalog','pg_temp' as $function$ select crm_security.command('reopen_prospect',p_request_key,p_data) $function$;
revoke all on function public.crm_log_exchange(uuid,jsonb),public.crm_change_next_action(uuid,jsonb),public.crm_record_appointment_outcome(uuid,jsonb),
 public.crm_close_prospect(uuid,jsonb),public.crm_reopen_prospect(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_log_exchange(uuid,jsonb),public.crm_change_next_action(uuid,jsonb),public.crm_record_appointment_outcome(uuid,jsonb),
 public.crm_close_prospect(uuid,jsonb),public.crm_reopen_prospect(uuid,jsonb) to authenticated;

-- Calling and opening hours, closed dates and the minimum gap of the current
-- version: the one source the forms, the time picker and every check use.
create or replace function public.crm_get_centre_hours()
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare p public.crm_followup_policies%rowtype; begin
 perform crm_security.require_reader(false);
 select * into strict p from public.crm_followup_policies where id=crm_security.current_policy_id();
 return jsonb_build_object('policy_id',p.id,'version',p.version,'timezone',p.timezone,'effective_from',p.effective_from,
  'calling_hours',p.weekly_hours,'opening_hours',coalesce(p.opening_hours,p.weekly_hours),'opening_same_as_calling',p.opening_hours is null,
  'closed_dates',coalesce(p.date_exceptions,'[]'::jsonb),'minimum_attempt_gap_minutes',p.minimum_attempt_gap_minutes,
  'attempt_offsets',to_jsonb(p.attempt_offsets),'first_contact_sla_minutes',p.first_contact_sla_minutes,'post_test_sla_minutes',p.post_test_sla_minutes,
  'stale_contacting_minutes',p.stale_contacting_minutes,
  'default_owner_id',crm_security.reception_default_owner(),'as_of',now());
end $function$;

-- Pre-checks before a form opens (invariant 15): the 3-hour gap, hours, the
-- current action and an existing appointment.
create or replace function public.crm_check_action(p_lead uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare l public.crm_leads%rowtype; p public.crm_followup_policies%rowtype; next_ok timestamptz; begin
 perform crm_security.require_reader(false);
 select * into l from public.crm_leads where id=p_lead;
 if not found then raise exception 'Lead not found' using errcode='22023'; end if;
 select * into strict p from public.crm_followup_policies where id=l.followup_policy_id;
 next_ok:=case when l.last_attempt_at is not null then l.last_attempt_at+make_interval(mins=>p.minimum_attempt_gap_minutes) end;
 return jsonb_build_object('lead_id',l.id,'version',l.version,'status',l.status,'editable',l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED'),
  'next_action',crm_security.next_action(l.id),'failed_attempts',crm_security.failed_count(l),
  'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
  'next_attempt_allowed_at',case when next_ok>now() then next_ok end,'attempt_gap_ok',next_ok is null or next_ok<=now(),
  'minimum_attempt_gap_minutes',p.minimum_attempt_gap_minutes,
  'planned_test',(select crm_security.placement_summary(x) from public.placement_tests x where x.crm_lead_id=l.id and x.status='Planifié' order by x.date_test,x.id limit 1),
  'has_appointment',exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='center_visit'),
  'as_of',now());
end $function$;
revoke all on function public.crm_get_centre_hours(),public.crm_check_action(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_get_centre_hours(),public.crm_check_action(uuid) to authenticated;

-- Editing the centre hours (a new policy version, now with opening hours) is
-- director only (RPW-r2 capability classification). The command already refuses
-- other roles; the wrapper states it first so the classification reads it.
create or replace function public.crm_create_followup_policy(p_request_key uuid, p_data jsonb)
 returns jsonb language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
begin
 perform crm_security.require_reader(true);
 return crm_security.command('create_followup_policy',p_request_key,p_data);
end $function$;
revoke all on function public.crm_create_followup_policy(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_create_followup_policy(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Data step D1 (§10). Defined here, NOT run: the operator runs d1_plan,
--     then d1_apply(expected_counts) after « approve D1 ». M-A2 drops all three.
--     They need a director identity (auth.uid()) because history rows name
--     their actor.
-- ---------------------------------------------------------------------------
create or replace function crm_security.d1_sets()
 returns table(rule text, lead_id uuid, test_id uuid, five boolean)
 language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 with active as (select l.* from public.crm_leads l where l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')),
 b as (select x.id test_id,x.crm_lead_id lead_id from public.placement_tests x join active l on l.id=x.crm_lead_id
  where x.status='Planifié' and not exists(select 1 from public.crm_tasks t where t.placement_test_id=x.id and t.status='open' and t.task_type='center_visit'))
 select 'a',l.id,null::uuid,null::boolean from active l where (select count(*) from public.crm_tasks t where t.lead_id=l.id and t.status='open')>1
 union all select 'b',b.lead_id,b.test_id,null from b
 union all select 'c',l.id,null,crm_security.failed_count(l)>=5 from active l
  where not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open') and not exists(select 1 from b where b.lead_id=l.id)
 union all select 'd',l.id,null,null from public.crm_leads l
  where (l.merged_into_lead_id is not null or l.status in ('LOST','NOT_QUALIFIED','CONVERTED'))
  and (exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')
   or ((l.merged_into_lead_id is not null or l.status in ('LOST','NOT_QUALIFIED')) and exists(select 1 from public.placement_tests x where x.crm_lead_id=l.id and x.status='Planifié')))
$function$;

-- Every planned test D1 would cancel, with its rule: rule (a) cancels a test
-- linked only to a cancelled duplicate (never one linked to the kept action);
-- rule (d) cancels the planned tests of closed, converted or merged prospects.
create or replace function crm_security.d1_cancelled_tests()
 returns table(rule text, test_id uuid, lead_id uuid)
 language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select distinct 'a',x.id,x.crm_lead_id from crm_security.d1_sets() s
 join public.crm_tasks t on t.lead_id=s.lead_id and t.status='open' and t.id<>crm_security.next_action_id(s.lead_id)
 join public.placement_tests x on x.id=t.placement_test_id and x.status='Planifié'
 where s.rule='a' and not exists(select 1 from public.crm_tasks k where k.id=crm_security.next_action_id(s.lead_id) and k.placement_test_id=x.id)
 union all
 select 'd',x.id,x.crm_lead_id from crm_security.d1_sets() s join public.placement_tests x on x.crm_lead_id=s.lead_id and x.status='Planifié' where s.rule='d'
$function$;

create or replace function crm_security.d1_plan()
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare result jsonb; begin
 if auth.uid() is not null then perform crm_security.require_reader(true); end if;
 select jsonb_build_object(
  'a',jsonb_build_object('count',(select count(*) from crm_security.d1_sets() where rule='a'),
   'sample',coalesce((select jsonb_agg(lead_id) from (select lead_id from crm_security.d1_sets() where rule='a' order by lead_id limit 5) z),'[]'::jsonb)),
  'b',jsonb_build_object('count',(select count(*) from crm_security.d1_sets() where rule='b'),
   'replaced',(select count(*) from crm_security.d1_sets() s join public.crm_tasks t on t.lead_id=s.lead_id and t.status='open' where s.rule='b'),
   'sample',coalesce((select jsonb_agg(jsonb_build_object('lead_id',lead_id,'test_id',test_id)) from (select lead_id,test_id from crm_security.d1_sets() where rule='b' order by lead_id limit 5) z),'[]'::jsonb)),
  'c',jsonb_build_object('count',(select count(*) from crm_security.d1_sets() where rule='c'),
   'after_five_failures',(select count(*) from crm_security.d1_sets() where rule='c' and five),
   'sample',coalesce((select jsonb_agg(lead_id) from (select lead_id from crm_security.d1_sets() where rule='c' order by lead_id limit 5) z),'[]'::jsonb)),
  'd',jsonb_build_object('count',(select count(*) from crm_security.d1_sets() where rule='d'),
   'sample',coalesce((select jsonb_agg(lead_id) from (select lead_id from crm_security.d1_sets() where rule='d' order by lead_id limit 5) z),'[]'::jsonb)),
  'tests_cancelled',jsonb_build_object('count',(select count(*) from crm_security.d1_cancelled_tests()),
   'sample',coalesce((select jsonb_agg(jsonb_build_object('test_id',test_id,'lead_id',lead_id,'rule',rule)) from (select * from crm_security.d1_cancelled_tests() order by test_id limit 5) z),'[]'::jsonb)))
 into result;
 return result;
end $function$;

create or replace function crm_security.d1_snapshot(lead uuid)
 returns jsonb language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select jsonb_build_object('tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.crm_tasks t where t.lead_id=lead and t.status='open'),'[]'::jsonb),
  'tests',coalesce((select jsonb_agg(to_jsonb(x)) from public.placement_tests x where x.crm_lead_id=lead and x.status='Planifié'),'[]'::jsonb))
$function$;

create or replace function crm_security.d1_journal(lead uuid, before jsonb)
 returns void language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$ declare r jsonb; begin
 for r in select value from jsonb_array_elements(before->'tasks') loop
  if exists(select 1 from public.crm_tasks where id=(r->>'id')::uuid and status<>'open') then
   insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by)
   select 'd1','crm_tasks_closed',t.id,r,to_jsonb(t),auth.uid() from public.crm_tasks t where t.id=(r->>'id')::uuid;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(before->'tests') loop
  if exists(select 1 from public.placement_tests where id=(r->>'id')::uuid and status='Annulé') then
   insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by)
   select 'd1','placement_tests_cancelled',x.id,r,to_jsonb(x),auth.uid() from public.placement_tests x where x.id=(r->>'id')::uuid;
  end if;
 end loop;
 -- The actions D1 opened (rules b and c): d1_revert cancels exactly these.
 insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by)
 select 'd1','crm_tasks',t.id,null,to_jsonb(t),auth.uid() from public.crm_tasks t
 where t.lead_id=lead and t.status='open' and not exists(select 1 from jsonb_array_elements(before->'tasks') b where (b->>'id')::uuid=t.id);
 insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by)
 select 'd1','crm_leads',l.id,null,jsonb_build_object('version',l.version),auth.uid() from public.crm_leads l where l.id=lead;
end $function$;

create or replace function crm_security.d1_apply(expected_counts jsonb)
 returns jsonb language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare plan jsonb; s record; l public.crm_leads%rowtype; snap jsonb; step_rule text; done jsonb:='{}'::jsonb; due timestamptz; begin
 perform crm_security.require_reader(true);
 plan:=crm_security.d1_plan();
 foreach step_rule in array array['a','b','c','d','tests_cancelled'] loop
  if (expected_counts->step_rule->>'count')::bigint is distinct from (plan->step_rule->>'count')::bigint then
   raise exception 'D1 dry-run count differs for rule %: expected %, found %',step_rule,expected_counts->step_rule->>'count',plan->step_rule->>'count' using errcode='P0001'; end if;
 end loop;
 perform set_config('eh.crm_data_step','d1',true);
 for s in select * from crm_security.d1_sets() order by case rule when 'd' then 1 when 'a' then 2 when 'b' then 3 else 4 end,lead_id,test_id loop
  select * into l from public.crm_leads where id=s.lead_id for update;
  snap:=crm_security.d1_snapshot(l.id);
  if s.rule='a' then
   perform crm_security.set_next_action(l,jsonb_build_object('d1','keep','keep_task_id',crm_security.next_action_id(l.id)),'d1','d1:a:'||l.id);
  elsif s.rule='b' then
   select (x.date_test+crm_security.calendar_time(x.heure)) at time zone public.centre_utc_offset() into due from public.placement_tests x where x.id=s.test_id;
   perform crm_security.set_next_action(l,jsonb_build_object('d1','create','spec',jsonb_build_object('task_type','center_visit','schedule_kind','appointment','due_at',due,
    '_placement_test_id',s.test_id,'_replaced_reason','Remplacée par le rendez-vous du test (D1)','_key','d1:b:'||s.test_id)),'d1','d1:b:'||s.test_id);
  elsif s.rule='c' then
   perform crm_security.set_next_action(l,jsonb_build_object('d1','create','spec',jsonb_strip_nulls(jsonb_build_object('task_type','awaiting_prospect',
    '_review_flag',case when not s.five then 'd1_review' end,'_key','d1:c:'||l.id))),'d1','d1:c:'||l.id);
  else
   perform crm_security.set_next_action(l,jsonb_build_object('none',true,'reason','Prospect clôturé (D1)'),'d1','d1:d:'||l.id);
  end if;
  update public.crm_leads set version=version+1,updated_at=now() where id=l.id;
  perform crm_security.d1_journal(l.id,snap);
  done:=jsonb_set(done,array[s.rule],to_jsonb(coalesce((done->>s.rule)::integer,0)+1));
 end loop;
 perform set_config('eh.crm_data_step','',true);
 return jsonb_build_object('applied',done,'plan',plan);
end $function$;

-- The one time-boxed writer exception (§4.2, dropped by M-A2 in PR A2):
-- restoring the exact rows D1 cancelled is not a « next action » operation.
create or replace function crm_security.d1_revert()
 returns jsonb language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare j record; lv record; kept jsonb:='[]'::jsonb; n_cancel integer:=0; n_open integer:=0; n_tests integer:=0; skipped integer:=0; begin
 perform crm_security.require_reader(true);
 for lv in select distinct on (entity_id) entity_id lead,(after->>'version')::bigint version from public.crm_data_step_journal
  where step='d1' and entity='crm_leads' order by entity_id,run_at desc,id desc loop
  perform 1 from public.crm_leads where id=lv.lead and version=lv.version for update;
  if not found then skipped:=skipped+1; continue; end if;
  for j in select * from public.crm_data_step_journal where step='d1' and entity='crm_tasks' and (after->>'lead_id')::uuid=lv.lead loop
   update public.crm_tasks set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='Annulé (retour D1)',version=version+1,updated_at=now()
   where id=j.entity_id and status='open';
   if found then
    insert into public.crm_activities(lead_id,task_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
    values(lv.lead,j.entity_id,now(),auth.uid(),'user','task_cancelled','d1-revert:'||j.entity_id||':'||gen_random_uuid(),'Annulé (retour D1)');
    n_cancel:=n_cancel+1;
   end if;
  end loop;
  for j in select * from public.crm_data_step_journal where step='d1' and entity='crm_tasks_closed' and (before->>'lead_id')::uuid=lv.lead loop
   update public.crm_tasks set status='open',cancelled_at=null,cancelled_by=null,cancellation_reason=null,replaced_reason=null,
    completed_at=null,completed_by=null,completion_activity_id=null,version=version+1,updated_at=now()
   where id=j.entity_id and status='cancelled';
   if found then
    insert into public.crm_activities(lead_id,task_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
    values(lv.lead,j.entity_id,now(),auth.uid(),'user','task_reopened','d1-revert-open:'||j.entity_id||':'||gen_random_uuid(),'Rouvert (retour D1)');
    n_open:=n_open+1;
   end if;
  end loop;
  for j in select * from public.crm_data_step_journal where step='d1' and entity='placement_tests_cancelled' and (before->>'crm_lead_id')::uuid=lv.lead loop
   if (select (date_test+crm_security.calendar_time(heure)) at time zone public.centre_utc_offset()>now() from public.placement_tests where id=j.entity_id) then
    update public.placement_tests set status='Planifié',cancelled_at=null,cancelled_by=null,cancel_reason=null where id=j.entity_id and status='Annulé';
    n_tests:=n_tests+1;
   else kept:=kept||jsonb_build_object('test_id',j.entity_id,'lead_id',lv.lead); end if;
  end loop;
  update public.crm_leads set version=version+1,updated_at=now() where id=lv.lead;
 end loop;
 return jsonb_build_object('cancelled',n_cancel,'reopened',n_open,'tests_replanned',n_tests,'tests_left_cancelled',kept,'leads_changed_since',skipped);
end $function$;
revoke all on function crm_security.d1_plan(),crm_security.d1_apply(jsonb),crm_security.d1_revert(),crm_security.d1_sets(),crm_security.d1_cancelled_tests(),
 crm_security.d1_snapshot(uuid),crm_security.d1_journal(uuid,jsonb) from public, anon, authenticated, service_role;

-- Internal helpers are never callable by a browser role.
revoke all on function crm_security.current_policy_id(),crm_security.closed_dates(uuid),crm_security.window_at(uuid,text,timestamptz),
 crm_security.assert_in_hours(text,timestamptz),crm_security.validate_hours_set(jsonb,jsonb),crm_security.action_label(public.crm_tasks),
 crm_security.primary_event(uuid,text,text,text,text,text,text,timestamptz,jsonb),crm_security.is_appointment(public.crm_tasks),
 crm_security.next_action_id(uuid),crm_security.action_json(public.crm_tasks),crm_security.next_action(uuid),crm_security.cancel_planned_test(uuid,text),
 crm_security.assert_no_overlap(public.crm_leads,timestamptz,integer,uuid,uuid),crm_security.user_spec(jsonb),crm_security.legacy_spec(jsonb),
 crm_security.result_label(text),
 crm_security.new_task(public.crm_leads,jsonb,text,text,smallint,text,uuid,uuid,uuid,boolean,text),
 crm_security.finish_task(public.crm_tasks,boolean,text,text,text,text) from public, anon, authenticated, service_role;
