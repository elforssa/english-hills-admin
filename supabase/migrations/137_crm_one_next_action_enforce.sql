-- RWR-r5 PR A2 — enforce one next action per prospect (M-A2).
-- Plan: docs/architecture/plans/receptionist-workflow.md §4.1, §4.2, §8 (PR A2),
-- §10 (M-A2), as amended in its implementation record. ADR-019.
--
-- PROVISIONAL NUMBER: renumber if main moves before merge.
--
-- Runs only after data step D1 (applied to Production 2026-11-23). It refuses to
-- apply, changing nothing, unless Q04, Q05 (active prospects with no open action),
-- Q07 and Q29 are all 0 in its own transaction. Q07 is checked as the triggers
-- below enforce it: no open action on a closed, converted or merged prospect, and
-- no planned test on a closed or merged one. A converted prospect keeps its
-- planned test (§4.8, as set_next_action and D1 rule d did); it is counted in a
-- NOTICE, not refused.
--
-- What it does:
--  * unique index crm_tasks_one_open_per_lead: at most one open action;
--  * deferred constraint triggers checking each touched prospect at commit:
--    exactly one open action while active (OD-1 = A), none once closed, converted
--    or merged (crm_next_action_presence on crm_leads and crm_tasks); no planned
--    test on a closed or merged prospect, and an active prospect's planned test
--    belongs to its open appointment or its open enrolment action, and only those
--    (crm_planned_test_placement on placement_tests; the same check runs from the
--    two presence triggers, so closing a prospect or an action is covered too);
--  * set_next_action and placement_no_replan re-created without the D1 data-step
--    bypass (eh.crm_data_step): bodies otherwise verbatim from 136;
--  * the D1 functions dropped (d1_plan, d1_apply, d1_revert and their four
--    helpers): D1 can no longer be reverted. The journal table stays;
--  * the twelve old command wrappers that §4.3 replaces revoked from
--    authenticated (they keep their bodies; no role may call them);
--  * placement_tests: every anon privilege and authenticated's TRUNCATE revoked.
--
-- Unchanged: every other function, grant, policy and row. No data is written.

-- ---------------------------------------------------------------------------
-- 0. Preconditions, in this transaction. Writers wait until commit, so the
--    state checked is the state the index and triggers start from. (The lock is
--    taken inside the block: the CLI applies a migration as one implicit
--    transaction, where a top-level LOCK TABLE is refused.)
-- ---------------------------------------------------------------------------
do $$
declare q04 bigint; q05 bigint; q07_actions bigint; q07_tests bigint; q29 bigint; converted_tests bigint; begin
 lock table public.crm_leads, public.crm_tasks, public.placement_tests in share row exclusive mode;
 select count(*) into q04 from (select lead_id from public.crm_tasks where status='open' group by lead_id having count(*)>1) m;
 select count(*) into q05 from public.crm_leads l
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
  and not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open');
 select count(*) into q07_actions from public.crm_leads l
 where (l.status in ('LOST','NOT_QUALIFIED','CONVERTED') or l.merged_into_lead_id is not null)
  and exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open');
 select count(*) into q07_tests from public.crm_leads l
 where (l.status in ('LOST','NOT_QUALIFIED') or l.merged_into_lead_id is not null)
  and exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié');
 select count(*) into q29 from public.placement_tests p join public.crm_leads l on l.id=p.crm_lead_id
 where p.status='Planifié' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
  and not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open'
   and t.task_type in ('center_visit','enrollment_followup') and t.placement_test_id=p.id);
 select count(*) into converted_tests from public.crm_leads l
 where l.status='CONVERTED' and l.merged_into_lead_id is null
  and exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié');
 if q04<>0 or q05<>0 or q07_actions<>0 or q07_tests<>0 or q29<>0 then
  raise exception 'M-A2 refused: D1 post-checks are not all 0 (Q04 %, Q05 active with no action %, Q07 open actions %, Q07 planned tests %, Q29 %)',
   q04,q05,q07_actions,q07_tests,q29 using errcode='55000',hint='crm_next_action.d1_postchecks';
 end if;
 raise notice 'M-A2 preconditions: Q04 0, Q05 0, Q07 0, Q29 0; converted prospects keeping a planned test: %',converted_tests;
end $$;

-- ---------------------------------------------------------------------------
-- 1. At most one open action per prospect. A unique index cannot be deferred:
--    set_next_action closes the current action before inserting the next one.
-- ---------------------------------------------------------------------------
create unique index crm_tasks_one_open_per_lead on public.crm_tasks(lead_id) where status='open';

-- ---------------------------------------------------------------------------
-- 2. The prospect's state at commit (§4.1 table, invariants 1 and 2).
-- ---------------------------------------------------------------------------
create function crm_security.assert_next_action_state(lead uuid)
 returns void language plpgsql stable security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare l public.crm_leads%rowtype; n integer; test uuid; begin
 select * into l from public.crm_leads where id=lead;
 if not found then return; end if;
 select count(*) into n from public.crm_tasks where lead_id=lead and status='open';
 if l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
  if n<>1 then
   raise exception 'An active prospect has exactly one open next action (prospect %, found %)',lead,n
    using errcode='23514',hint='crm_next_action.exactly_one';
  end if;
  select p.id into test from public.placement_tests p where p.crm_lead_id=lead and p.status='Planifié'
   and not exists(select 1 from public.crm_tasks t where t.lead_id=lead and t.status='open'
    and t.task_type in ('center_visit','enrollment_followup') and t.placement_test_id=p.id)
  order by p.id limit 1;
  if test is not null then
   raise exception 'A planned test of an active prospect belongs to its open appointment or enrolment action (prospect %, test %)',lead,test
    using errcode='23514',hint='crm_placement.test_without_action';
  end if;
 else
  if n<>0 then
   raise exception 'A closed, converted or merged prospect has no open next action (prospect %, %, found %)',lead,
    case when l.merged_into_lead_id is not null then 'merged' else l.status end,n
    using errcode='23514',hint='crm_next_action.closed_has_action';
  end if;
  -- A converted prospect keeps its planned test: it becomes the student's (§4.8).
  if (l.merged_into_lead_id is not null or l.status in ('LOST','NOT_QUALIFIED'))
   and exists(select 1 from public.placement_tests p where p.crm_lead_id=lead and p.status='Planifié') then
   raise exception 'A closed or merged prospect has no planned test (prospect %)',lead
    using errcode='23514',hint='crm_placement.closed_has_test';
  end if;
 end if;
end $function$;
revoke all on function crm_security.assert_next_action_state(uuid) from public, anon, authenticated, service_role;

-- One trigger function for the three tables: each event checks the prospect(s)
-- it touched, once the transaction's writers have finished.
create function crm_security.next_action_presence()
 returns trigger language plpgsql security definer set search_path to 'pg_catalog','pg_temp' as $function$
declare before_lead uuid; after_lead uuid; begin
 if tg_table_name='crm_leads' then
  perform crm_security.assert_next_action_state(new.id);
  return null;
 elsif tg_table_name='crm_tasks' then
  if tg_op<>'INSERT' then before_lead:=old.lead_id; end if;
  if tg_op<>'DELETE' then after_lead:=new.lead_id; end if;
 else
  if tg_op<>'INSERT' then before_lead:=old.crm_lead_id; end if;
  if tg_op<>'DELETE' then after_lead:=new.crm_lead_id; end if;
 end if;
 if before_lead is not null then perform crm_security.assert_next_action_state(before_lead); end if;
 if after_lead is not null and after_lead is distinct from before_lead then perform crm_security.assert_next_action_state(after_lead); end if;
 return null;
end $function$;
revoke all on function crm_security.next_action_presence() from public, anon, authenticated, service_role;

create constraint trigger crm_next_action_presence after insert or update on public.crm_leads
 deferrable initially deferred for each row execute function crm_security.next_action_presence();
create constraint trigger crm_next_action_presence after insert or update or delete on public.crm_tasks
 deferrable initially deferred for each row execute function crm_security.next_action_presence();
create constraint trigger crm_planned_test_placement after insert or update or delete on public.placement_tests
 deferrable initially deferred for each row execute function crm_security.next_action_presence();

-- ---------------------------------------------------------------------------
-- 3. The D1 data-step bypass removed. Bodies otherwise verbatim from 136.
-- ---------------------------------------------------------------------------
create or replace function crm_security.placement_no_replan()
 returns trigger language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$ begin
 if coalesce(old.crm_lead_id,new.crm_lead_id) is not null and old.status<>'Planifié' and new.status='Planifié' then
  raise exception 'A prospect''s test that has left « Planifié » cannot be planned again; book a new appointment' using errcode='22023',hint='crm_placement.not_replannable';
 end if;
 return new;
end $function$;
revoke all on function crm_security.placement_no_replan() from public, anon, authenticated, service_role;

-- The single writer (§4.2) without D1 mode: the d1 cause, the « keep », « create »
-- and « link » specs, the skipped date and hours checks and the D1 review flag
-- are gone. Every other branch is unchanged.
create or replace function crm_security.set_next_action(l public.crm_leads, spec jsonb, cause text, source text)
 returns uuid language plpgsql set search_path to 'pg_catalog','pg_temp' as $function$
declare
 cur public.crm_tasks%rowtype; o public.crm_tasks%rowtype; against public.crm_tasks%rowtype; x public.placement_tests%rowtype;
 typ text; new_id uuid; carried uuid; with_test boolean; task_spec jsonb; due timestamptz;
 replaced text; complete boolean; closed_ids uuid[]:='{}';
 start_local timestamp; reason text; keep_id uuid;
begin
 if cause is null or cause<>all(array['system','user','outcome','close','conversion','intake','enrollment','test_result']) then
  raise exception 'Invalid next-action cause' using errcode='22023'; end if;
 if source is null or length(btrim(source))=0 then raise exception 'Next-action source required' using errcode='22023'; end if;
 -- 1. The caller already holds the lead lock; taking it again is a no-op.
 perform 1 from public.crm_leads where id=l.id for update;
 if spec='null'::jsonb then spec:=null; end if;
 if spec is not null and jsonb_typeof(spec)<>'object' then raise exception 'Invalid next action' using errcode='22023'; end if;
 perform 1 from public.crm_tasks where lead_id=l.id and status='open' order by id for update;
 select * into cur from public.crm_tasks where id=crm_security.next_action_id(l.id);
 if spec ? '_against' then
  select * into against from public.crm_tasks where id=(spec->>'_against')::uuid and lead_id=l.id and status='open';
  if against.id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
 end if;
 perform set_config('eh.crm_next_action_writer','1',true);

 -- A. No next action: closure, conversion.
 if spec is null or spec ? 'none' then
  if cause not in ('close','conversion') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
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
   -- A converted prospect keeps its planned test (it becomes the student's, §4.8).
   if cause='close' then
    for x in select * from public.placement_tests where crm_lead_id=l.id and status='Planifié' order by id loop
     perform crm_security.cancel_planned_test(x.id,'Prospect fermé');
    end loop;
   end if;
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- B. Keep one open action, cancel every other one (enrolment start keeps an
 --    open « Finaliser l'inscription »).
 if spec ? '_keep_task_id' then
  keep_id:=(spec->>'_keep_task_id')::uuid;
  if not exists(select 1 from public.crm_tasks where id=keep_id and lead_id=l.id and status='open') then
   raise exception 'Kept action is not an open action of this prospect' using errcode='22023'; end if;
  for o in select * from public.crm_tasks where lead_id=l.id and status='open' and id<>keep_id order by id loop
   perform crm_security.finish_task(o,true,coalesce(spec->>'_reason','Doublon de prochaine action'),source||':'||o.id);
   closed_ids:=closed_ids||o.id;
  end loop;
  -- Enrolment start keeps the test of the action it replaces (§4.8): the kept
  -- « Finaliser l'inscription » carries it (a real link, owner decision
  -- 2026-11-22) unless it already carries a planned test. Every other planned
  -- test left without an open action is cancelled.
  if cause='enrollment' then
   select p.id into carried from public.placement_tests p where p.status='Planifié' and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
    and not exists(select 1 from public.crm_tasks t where t.placement_test_id=p.id and t.status='open')
    and not exists(select 1 from public.crm_tasks k join public.placement_tests q on q.id=k.placement_test_id and q.status='Planifié' where k.id=keep_id)
   order by p.date_test,p.heure,p.id limit 1;
   if carried is not null then
    update public.crm_tasks set placement_test_id=carried,version=version+1,updated_at=now() where id=keep_id;
   end if;
  end if;
  for x in select p.* from public.placement_tests p where p.status='Planifié' and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
   and not exists(select 1 from public.crm_tasks t where t.placement_test_id=p.id and t.status='open') loop
   perform crm_security.cancel_planned_test(x.id,'Rendez-vous remplacé');
  end loop;
  perform set_config('eh.crm_next_action_writer','',true);
  return keep_id;
 end if;

 -- C. Legacy reschedule in place (old crm_schedule_task with a task id). An
 --    agreed time is refused outside hours; a reminder moves to the next window.
 --    A rescheduled appointment moves its test; an enrolment action does not (B5).
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
  -- Only an appointment moves its test. « Finaliser l'inscription » that carries
  -- a kept test is rescheduled without touching the test (review of #208, B5).
  if o.task_type='center_visit' and o.placement_test_id is not null then
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
  perform crm_security.assert_no_overlap(l,due,60,carried,cur.id);
  if with_test and carried is null
   and exists(select 1 from public.placement_tests where crm_lead_id=l.id and status='Planifié') then
   raise exception 'Placement already scheduled' using errcode='22023'; end if;
 elsif typ='enrollment_followup' then
  -- « Finaliser l'inscription » carries a planned test (owner decision
  -- 2026-11-22, §4.8): the test of the appointment an enrolment start replaces,
  -- or the test of the enrolment action it replaces (moved, not abandoned).
  select t.placement_test_id into carried from public.crm_tasks t join public.placement_tests p on p.id=t.placement_test_id and p.status='Planifié'
  where t.id in (cur.id,against.id) and (t.task_type='enrollment_followup' or (cause='enrollment' and t.task_type='center_visit'))
  order by (t.id=cur.id) desc,p.date_test,p.heure,p.id limit 1;
  with_test:=carried is not null;
 end if;

 -- Close the current action, the action acted on and every legacy duplicate,
 -- before inserting (M-A2's unique index cannot be deferred).
 complete:=cause in ('outcome','system','test_result');
 -- An appointment still to come that an exchange replaces did not take place:
 -- it is cancelled « Remplacée », never completed (§4.8). Its own outcome
 -- (_outcome_of) and an explicit completion of it (old « Terminer ») still
 -- complete it.
 if complete and cause='outcome' and cur.task_type='center_visit' and cur.due_at>now() and (spec->>'_outcome_of') is distinct from cur.id::text
  and against.id is distinct from cur.id then
  complete:=false;
 end if;
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
 -- except the one carried by the new appointment or enrolment action and a
 -- test being resulted. Replacing or cancelling an enrolment action that
 -- carries a test cancels it, unless the new action carries it.
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
  case when typ in ('center_visit','enrollment_followup') and with_test then carried else (spec->>'_placement_test_id')::uuid end,
  (spec->>'_source_activity_id')::uuid,false,case when cause='intake' then spec->>'_intake_actor' end);
 perform set_config('eh.crm_next_action_writer','',true);
 return new_id;
end $function$;
revoke all on function crm_security.set_next_action(public.crm_leads,jsonb,text,text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. D1 dropped (§10): it can no longer be reverted. crm_data_step_journal and
--    the rows D1 wrote stay; the director reads them as before. `if exists` lets 137
--    be re-applied after its restore file, which keeps them dropped.
-- ---------------------------------------------------------------------------
drop function if exists crm_security.d1_apply(jsonb);
drop function if exists crm_security.d1_revert();
drop function if exists crm_security.d1_plan();
drop function if exists crm_security.d1_journal(uuid,jsonb);
drop function if exists crm_security.d1_snapshot(uuid);
drop function if exists crm_security.d1_cancelled_tests();
drop function if exists crm_security.d1_sets();

-- ---------------------------------------------------------------------------
-- 5. The old command wrappers that §4.3 replaces: no browser role calls them.
--    crm_reassign, crm_book_placement_test and crm_update_placement_test are not
--    replaced and stay granted.
-- ---------------------------------------------------------------------------
revoke execute on function
 public.crm_add_note(uuid,jsonb),
 public.crm_record_call_outcome(uuid,jsonb),
 public.crm_record_whatsapp(uuid,jsonb),
 public.crm_record_conversation(uuid,jsonb),
 public.crm_record_conversation_decision(uuid,jsonb),
 public.crm_qualify_lead(uuid,jsonb),
 public.crm_schedule_task(uuid,jsonb),
 public.crm_complete_task(uuid,jsonb),
 public.crm_cancel_task(uuid,jsonb),
 public.crm_close_lost(uuid,jsonb),
 public.crm_close_not_qualified(uuid,jsonb),
 public.crm_reopen_lead(uuid,jsonb)
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5b. placement_tests table grants (invariant 14; owner decision 2026-11-23).
--     anon loses every privilege (table and column); authenticated loses
--     TRUNCATE, which bypasses row security. authenticated keeps DELETE: the
--     Admissions « Tests de niveau » page deletes a student's own test directly
--     (entities.PlacementTest.delete), limited by RLS to admin and director.
-- ---------------------------------------------------------------------------
revoke all on table public.placement_tests from anon;
revoke truncate on table public.placement_tests from authenticated;

-- ---------------------------------------------------------------------------
-- 6. Postconditions.
-- ---------------------------------------------------------------------------
do $$ begin
 if not exists(select 1 from pg_index i where i.indexrelid='public.crm_tasks_one_open_per_lead'::regclass and i.indisunique and i.indisvalid and i.indisready) then
  raise exception 'M-A2: crm_tasks_one_open_per_lead is not a valid unique index' using errcode='55000'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname like 'd1\_%') then
  raise exception 'M-A2: a D1 function is left' using errcode='55000'; end if;
 if exists(select 1 from pg_proc where prosrc like '%eh.crm_data_step%') then
  raise exception 'M-A2: a function still reads the D1 data-step flag' using errcode='55000'; end if;
 if has_table_privilege('anon','public.placement_tests','select,insert,update,delete,truncate,references,trigger')
  or has_any_column_privilege('anon','public.placement_tests','select,insert,update,references')
  or has_table_privilege('authenticated','public.placement_tests','truncate') then
  raise exception 'M-A2: placement_tests grants not reduced' using errcode='55000'; end if;
end $$;
