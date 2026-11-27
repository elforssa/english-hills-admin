-- Restore for migration 139 (RWR-r5 PR B1, M-B1: people identity).
-- Plan §10, M-B1 row: « prior bodies; additive columns and tables ».
--
-- Rollback order: this file runs BEFORE the C1 restore (138_desk_payments_restore.sql),
-- which refuses while 139 is applied. Run only with its own owner approval, after the
-- application is back on a pre-B1 build (the B1 screens call crm_create_prospect,
-- crm_update_prospect, find_people and the merge commands, which this file drops).
--
-- What it does:
--  * restores the 138 bodies of the fifteen functions 139 re-created: C1's
--    set_next_action, create_charge_payment, crm_enroll_and_collect and
--    crm_reserve_without_payment, and the bodies unchanged since 137 of command,
--    opportunity_ids, crm_search_leads, search_students_page, crm_get_workspace_detail,
--    crm_get_timeline, save_receptionist_student, crm_start_enrollment,
--    crm_get_work_queue, student_candidates and crm_security.normalize_phone (the 080
--    body, never re-created since); then checks each prosrc md5 against the 138 one;
--  * drops the phone trigger on students and authorized adults, the two phone_key
--    indexes and every function 139 added (search, commands, merges, D3, D5);
--  * refuses, changing nothing, if 139 is not applied, if migration 140 is applied
--    (its own restore runs first), if any student is merged (unmerge_student first,
--    so no merged file is left for the pre-139 lists, which do not read the merge
--    column), or if a D3 or D5 run is journalled and not reverted (restore after
--    d3_revert / unmerge_student only).
-- What it keeps on purpose: the additive tables person_match_decisions and
-- student_merge_journal, the columns students.merged_into_student_id and
-- merged_at (with their checks and index), and every row. 139 creates those additive
-- objects only if absent, so it can be applied again after this restore. The ledger
-- row 139 is removed by the operator wrapper, not here.
begin;

do $$ begin
  if to_regprocedure('public.find_people(text,text,text,date,integer)') is null
     or to_regprocedure('public.phone_e164(text)') is null then
    raise exception 'Restore 139: migration 139 is not applied' using errcode = '55000';
  end if;
  -- Rollback order (RWR-r5 B2, 2026-11-26): migration 140 rebuilt four of the bodies
  -- this file restores (on 139's); its own restore runs first and returns them to 139.
  if to_regprocedure('public.get_catalogue()') is not null then
    raise exception 'Restore 139: migration 140 is applied; run scripts/rollback/140_catalogues_restore.sql first'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.crm_data_step_journal where step = 'd3')
     and not exists (select 1 from public.crm_data_step_journal where step = 'd3_revert') then
    raise exception 'Restore 139: D3 ran; run crm_security.d3_revert() first' using errcode = '55000';
  end if;
  if exists (select 1 from public.students where merged_into_student_id is not null) then
    raise exception 'Restore 139: merged students exist; unmerge them first' using errcode = '55000';
  end if;
end $$;

drop trigger people_phone_guard on public.students;
drop trigger people_phone_guard on public.authorized_adults;
drop index public.students_phone_key_idx;
drop index public.authorized_adults_phone_key_idx;

-- Prior bodies (live 138 definitions, verbatim).
CREATE OR REPLACE FUNCTION crm_security.set_next_action(l crm_leads, spec jsonb, cause text, source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
 -- C1 (138, owner decision 2026-11-25): an « Encaisser l'acompte » action moved
 -- to another enrolment action (« Changer » to a new date, an exchange that keeps
 -- the enrolment step) while its reservation is still open — a live charge without
 -- an enrollment — keeps the marker its label reads (source kind « enrollment »,
 -- source key « reservation:… »). A different kind of action, a close or the
 -- payment (conversion) ends it.
 if typ='enrollment_followup' and not (spec ? '_key') and cur.id is not null and cur.task_type='enrollment_followup'
  and cur.source_kind='enrollment' and cur.source_key like 'reservation:%'
  and exists(select 1 from public.crm_charge_reservations r join public.charges c on c.id=r.charge_id
   where r.lead_id=l.id and c.voided_at is null and c.enrollment_id is null) then
  spec:=spec||jsonb_build_object('_key','reservation:'||l.id||':moved:'||source||':next-action','_kind','enrollment');
 end if;
 new_id:=crm_security.new_task(l,task_spec,coalesce(spec->>'_key',source||':next-action'),coalesce(spec->>'_kind','manual'),
  (spec->>'_ordinal')::smallint,spec->>'_event_source',cur.id,
  case when typ in ('center_visit','enrollment_followup') and with_test then carried else (spec->>'_placement_test_id')::uuid end,
  (spec->>'_source_activity_id')::uuid,false,case when cause='intake' then spec->>'_intake_actor' end);
 perform set_config('eh.crm_next_action_writer','',true);
 return new_id;
end $function$

;

CREATE OR REPLACE FUNCTION crm_security.command(cmd text, request uuid, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  -- A walk-in has always spoken with us: its exchange is recorded at creation and
  -- no « Premier contact » is scheduled (§4.8, audit observation 5).
  if btrim(data->>'source_label')='Manuel · Visite au centre' and (next_obj is null or next_obj->>'channel'<>'in_person') then
   raise exception 'A walk-in is created with its exchange' using errcode='22023',hint='crm_create.walk_in_exchange_required'; end if;
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
    -- OD-11: booking an appointment qualifies, and qualification needs the
    -- conversation, so a new appointment for a prospect not yet qualified is
    -- booked through « Noter un échange » (« On a parlé »), never here. Moving
    -- an existing appointment stays possible.
    if data->'next'->>'task_type'='center_visit' and l.status<>'QUALIFIED' and na.task_type is distinct from 'center_visit' then
     raise exception 'Book an appointment through the exchange that qualifies the prospect' using errcode='22023',hint='crm_next_action.appointment_needs_exchange'; end if;
    tid:=crm_security.set_next_action(l,crm_security.user_spec(data->'next'),'user',source); needs_next:=true;
   end if;

  elsif cmd='appointment_outcome' then
   outcome_code:=data->>'outcome_code';
   if outcome_code is null or outcome_code not in ('came_enrolled','came_will_return','came_not_interested','no_show') then raise exception 'Valid appointment outcome required' using errcode='22023'; end if;
   if na.id is null or (data->>'action_id') is distinct from na.id::text or na.task_type<>'center_visit' then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   if na.due_at>now() then raise exception 'Outcome can be recorded only from the appointment time' using errcode='22023',hint='crm_appointment.before_start'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end; res:=outcome_code;
   -- « Venu · pas intéressé » closes the prospect: the reason is asked, never
   -- assumed (§4.8, « reason required »).
   if outcome_code='came_not_interested' and jsonb_typeof(data->'next'->'close') is distinct from 'object' then
    raise exception 'Closure reason required' using errcode='22023',hint='crm_appointment.reason_required'; end if;
   -- An appointment that already exists on a prospect not yet qualified (reopened
   -- with an appointment, an old tab, D1 rule b): the visit is the in-person
   -- conversation, and coming to enrol or to come back qualifies (OD-11), so
   -- every outcome row of §4.8 starts from QUALIFIED.
   if outcome_code in ('came_enrolled','came_will_return') and l.status in ('NEW','CONTACTING','ENGAGED') then
    happened:=now();
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',null,'in_person',null,na.id,happened);
    meaningful:=true;
    qualify_step:=case when outcome_code='came_enrolled' then 'enrollment' else 'center_visit' end;
   end if;
   -- The linked test: attended, or « Absent » for a no-show.
   if na.placement_test_id is not null then
    update public.placement_tests set status=case when outcome_code='no_show' then 'Absent' else 'Passé' end where id=na.placement_test_id and status='Planifié';
   end if;
   if outcome_code='came_not_interested' or (jsonb_typeof(data->'next')='object' and data->'next' ? 'close') then
    next_obj:=data->'next'->'close';
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
    close_target:=coalesce(next_obj->>'status','LOST'); close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note'; next_mode:='close';
    perform crm_security.set_next_action(l,jsonb_build_object('_against',na.id,'_finish',jsonb_build_object('cancelled',false,'reason',note),'_outcome_code',outcome_code),'outcome',source||':complete');
   else
    next_obj:=case when jsonb_typeof(data->'next')='object' then crm_security.user_spec(data->'next')
     when outcome_code='came_enrolled' then jsonb_build_object('task_type','enrollment_followup','due_preset','tomorrow','instructions','Finaliser l’inscription avec le contact.')
     when outcome_code='came_will_return' then jsonb_build_object('task_type','awaiting_prospect')
     else jsonb_build_object('task_type','callback','schedule_kind','reminder','due_preset','tomorrow') end;
    if outcome_code='came_enrolled' then qualify_step:='enrollment'; end if;
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
   -- A reopened prospect is CONTACTING or ENGAGED: like « Changer », its first
   -- appointment is booked through the exchange that qualifies (OD-11; owner
   -- decision 2026-11-22).
   if next_obj->>'task_type'='center_visit' then
    raise exception 'Book an appointment through the exchange that qualifies the prospect' using errcode='22023',hint='crm_next_action.appointment_needs_exchange'; end if;
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
end $function$

;

CREATE OR REPLACE FUNCTION crm_security.opportunity_ids(v text, q text, contact uuid, owner_mode text, owner uuid, channel text, source text, program_kind text, program text, as_of timestamp with time zone)
 RETURNS TABLE(id uuid, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
begin return query
 select l.id,l.status,l.created_at from public.crm_leads l
 join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 where l.merged_into_lead_id is null
 and ($3 is null or l.contact_id=$3)
 and ($4='all' or $4='me' and l.owner_id=auth.uid()
   or $4='unassigned' and l.owner_id is null or $4='staff' and l.owner_id=$5)
 and ($6 is null or s.channel=$6) and ($7 is null or s.source_label=$7)
 and ($8='all' or $8='session' and nullif(l.session_type,'')=$9
   or $8='interest' and nullif(l.session_type,'') is null and nullif(l.program_interest_text,'')=$9
   or $8='unspecified' and nullif(l.session_type,'') is null and nullif(l.program_interest_text,'') is null)
 and ($2='' or strpos(lower(c.display_name),lower($2))>0 or strpos(lower(coalesce(l.learner_name,'')),lower($2))>0
   or (crm_security.normalize_phone($2) is not null and (c.phone_e164=crm_security.normalize_phone($2) or c.whatsapp_e164=crm_security.normalize_phone($2)))
   or (length(regexp_replace($2,'[^0-9]','','g'))>=3 and strpos(coalesce(c.phone_e164,c.phone_raw,''),regexp_replace($2,'[^0-9]','','g'))>0))
 and case $1
 when 'all' then true
 when 'mine' then l.owner_id=auth.uid()
 when 'new_today' then l.created_at>=(($10 at time zone public.centre_utc_offset())::date)::timestamp at time zone public.centre_utc_offset()
   and l.created_at<((($10 at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset()
 when 'qualified' then l.status='QUALIFIED'
 when 'closed' then l.status in ('LOST','NOT_QUALIFIED')
 when 'no_response' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>0
 when 'follow_up_today' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and exists(
   select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open'
   and t.due_at>=(($10 at time zone public.centre_utc_offset())::date)::timestamp at time zone public.centre_utc_offset()
   and t.due_at<((($10 at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset())
 when 'placement' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and
   (exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')
    or exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type in ('confirm_placement_test','post_test_followup')))
 when 'attention' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and (
   exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.due_at<$10)
   or l.status='NEW' and exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='first_contact')
   or (select t.due_at from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)
      <((($10 at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset()
   or not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')
      and not exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' and (p.date_test+crm_security.calendar_time(p.heure)) at time zone public.centre_utc_offset()>=$10)
   or l.status='CONTACTING' and coalesce(l.last_attempt_at,l.created_at)<$10-make_interval(mins=>(select p.stale_contacting_minutes from public.crm_followup_policies p where p.id=l.followup_policy_id)))
 else false end;
end
$function$

;

CREATE OR REPLACE FUNCTION public.crm_search_leads(p_query text DEFAULT ''::text, p_status text DEFAULT NULL::text, p_contact uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb; q text:=btrim(coalesce(p_query,'')); canonical text;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 if length(q)>120 or (p_status is not null and p_status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED','LOST','NOT_QUALIFIED','CONVERTED')) then raise exception 'Invalid search' using errcode='22023'; end if;
 canonical:=crm_security.normalize_phone(q);
 with matching as (
 select l.id,l.created_at from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 where l.merged_into_lead_id is null and (p_status is null or l.status=p_status) and (p_contact is null or c.id=p_contact)
 and (q='' or strpos(lower(coalesce(c.display_name,'')),lower(q))>0 or strpos(lower(coalesce(l.learner_name,'')),lower(q))>0
 or (canonical is not null and (c.phone_e164=canonical or c.whatsapp_e164=canonical))
 or (length(regexp_replace(q,'[^0-9]','','g'))>=3 and (strpos(coalesce(c.phone_e164,c.phone_raw,''),regexp_replace(q,'[^0-9]','','g'))>0)))
 ), page as(select id,created_at from matching order by created_at desc,id desc limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(crm_security.operational_card(id) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
 return result;
end $function$

;

CREATE OR REPLACE FUNCTION public.search_students_page(p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_age_category text DEFAULT ''::text, p_session text DEFAULT ''::text, p_level text DEFAULT ''::text, p_incomplete boolean DEFAULT false, p_source text DEFAULT ''::text, p_plan text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_group text DEFAULT ''::text, p_payment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120
    or coalesce(p_payment, '') not in ('', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none') then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and public.get_my_role()='receptionist' then
    raise exception 'Student export forbidden' using errcode='42501';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;

  -- Batch G: the learner filters run first; the finance aggregate covers only the
  -- learners it can affect (the page when no payment filter is set, else the candidates).
  with candidates as materialized (
    select s.*
    from public.students s
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (
        exists (select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null)
        or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
          where e.student_id = s.id and e.group_id is not null and e.status in ('Validated','Trial'))
          and not exists (select 1 from public.enrollments e where e.student_id = s.id
            and e.status in ('Submitted','Under Review','Confirmed'))))))
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    and (coalesce(p_source,'') = '' or s.referral_source = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0)
  ), scope as materialized (
    select c.id from candidates c where coalesce(p_payment, '') <> ''
    union all
    select p.id from (select c.id from candidates c where coalesce(p_payment, '') = ''
      order by c.created_at desc, c.id asc
      limit nullif(p_page_size,0)
      offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end) p
  ), finance as materialized (
    select sc.id as student_id, f.charge_count, f.payment_balance, f.has_overdue, f.has_partial
    from scope sc
    cross join lateral (
      select count(*) as charge_count,
        sum(c.balance)::numeric(12,2) as payment_balance,
        bool_or(c.balance > 0 and c.settlement_status = 'En retard') as has_overdue,
        bool_or(c.balance > 0 and c.paid_amount > 0) as has_partial
      from public.charge_balances c
      where c.voided_at is null and c.student_id = sc.id
      having count(*) > 0) f
  ), priced as materialized (
    select s.*,
      coalesce(f.payment_balance, 0)::numeric(12,2) as payment_balance,
      case
        when f.charge_count is null then 'Aucun engagement'
        when f.payment_balance <= 0 then 'Soldé'
        when f.has_overdue then 'En retard'
        when f.has_partial then 'Acompte versé'
        else 'En attente'
      end as payment_status
    from candidates s
    left join finance f on f.student_id = s.id
  ), filtered as materialized (
    select * from priced
    where coalesce(p_payment, '') = ''
      or (p_payment = 'due' and payment_balance > 0)
      or (p_payment = 'unpaid' and payment_status = 'En attente')
      or (p_payment = 'partial' and payment_status = 'Acompte versé')
      or (p_payment = 'overdue' and payment_status = 'En retard')
      or (p_payment = 'paid' and payment_status = 'Soldé')
      or (p_payment = 'none' and payment_status = 'Aucun engagement')
  ), rows as (
    select s.*,
      (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
      (select count(*) from public.enrollments e where e.student_id = s.id and e.group_id is not null
        and e.status in ('Validated','Trial') and e.group_id is distinct from s.groupe_id) as extra_group_count,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments
    from (select * from filtered order by created_at desc, id asc
      limit nullif(p_page_size,0)
      offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end) s
  )
  select pg_catalog.jsonb_build_object(
    'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
    'count',(select count(*) from filtered),
    'total',(select count(*) from public.students),
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial'))
  ) into v_result;
  return v_result;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.crm_get_workspace_detail(p_lead uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.operational_card(l.id)||jsonb_build_object('contact',jsonb_build_object('display_name',c.display_name,'phone',coalesce(c.phone_e164,c.phone_raw),
 'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),'email',c.email_normalized),
 'enrollment',(select crm_security.enrollment_summary(e) from public.enrollments e where e.id=l.enrollment_id),
 'conversion_review_required',case when public.get_my_role()='director' then l.conversion_review_required else false end,
 'qualification_step',l.qualification_step,'closure_reason',l.closure_reason,'closure_note',l.closure_note,'last_conversation_at',l.last_conversation_at,
 'outreach_cycle',l.outreach_cycle,'failed_attempts',crm_security.failed_count(l),
 'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
 'open_tasks',public.crm_list_open_tasks(l.id,null,100,0),
 'confirm_placement_task',(select jsonb_build_object('id',t.id,'version',t.version) from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='confirm_placement_test' order by t.due_at,t.id limit 1),
 'placement_count',(select count(*) from public.placement_tests where crm_lead_id=l.id),
 'open_task_count',(select count(*) from public.crm_tasks where lead_id=l.id and status='open')) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $function$

;

CREATE OR REPLACE FUNCTION public.crm_get_timeline(p_lead uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 20, p_details boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
end $function$

;

CREATE OR REPLACE FUNCTION public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.students%rowtype; begin
  perform operational_security.require_receptionist();
  if p_student is null then raise exception 'Stable student id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone','email',
      'parent_email','age_category','notes','session_type','niveau_cefr','referral_source','photo_url']);
    if nullif(btrim(p_changes->>'full_name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau_cefr') is not true then
      raise exception 'Invalid session/level' using errcode='22023'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    insert into public.students(id,full_name,date_naissance,telephone,email,parent_email,age_category,
      notes,session_type,niveau_cefr,referral_source,photo_url,status,plan_type)
    values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
      p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
      p_changes->>'photo_url','Prospect','Standard') on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
        s.full_name is distinct from p_changes->>'full_name' or
        s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
        s.telephone is distinct from p_changes->>'telephone' or
        s.email is distinct from p_changes->>'email' or s.parent_email is distinct from p_changes->>'parent_email' or
        s.age_category is distinct from p_changes->>'age_category' or s.notes is distinct from p_changes->>'notes' or
        s.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        s.niveau_cefr is distinct from p_changes->>'niveau_cefr' or
        s.referral_source is distinct from p_changes->>'referral_source' or
        s.photo_url is distinct from p_changes->>'photo_url' then
        raise exception 'Student create identity conflict' using errcode='23505'; end if;
      id:=s.id; updated_at:=s.updated_at;
    end if;
  else
    -- RPW-r2 items 2 and 3: programme, level and source (the admin rule: guard_student_membership
    -- refuses a programme or level change while the learner is in a group) and the two e-mails
    -- (refused while an active or pending family link uses the old address; every change logged).
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url','session_type','niveau_cefr','referral_source','email','parent_email']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
    if (p_changes ? 'session_type' or p_changes ? 'niveau_cefr') and operational_security.valid_session_level(
        case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
        case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end) is not true then
      raise exception 'Programme ou niveau invalide.' using errcode='22023', hint='rpw.level_invalid'; end if;
    if p_changes ? 'email' and nullif(btrim(p_changes->>'email'),'') is distinct from s.email
       and operational_security.family_link_holds(s.id, 'self', s.email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'parent_email' and nullif(btrim(p_changes->>'parent_email'),'') is distinct from s.parent_email
       and operational_security.family_link_holds(s.id, 'parent', s.parent_email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end,
      session_type=case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
      niveau_cefr=case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end,
      referral_source=case when p_changes ? 'referral_source' then nullif(p_changes->>'referral_source','') else s.referral_source end,
      email=case when p_changes ? 'email' then nullif(btrim(p_changes->>'email'),'') else s.email end,
      parent_email=case when p_changes ? 'parent_email' then nullif(btrim(p_changes->>'parent_email'),'') else s.parent_email end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $function$

;

CREATE OR REPLACE FUNCTION crm_security.normalize_phone(raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare n text;
begin
  if raw is null or btrim(raw)='' or raw ~ '[^0-9+(). /-]' then return null; end if;
  n:=regexp_replace(raw,'[(). /-]','','g');
  if n like '00%' then n:='+'||substr(n,3); end if;
  if n ~ '^0[5-7][0-9]{8}$' then n:='+212'||substr(n,2);
  elsif n ~ '^[5-7][0-9]{8}$' then n:='+212'||n; end if;
  if n !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  if n like '+212%' and n !~ '^\+212[5-7][0-9]{8}$' then return null; end if;
  return n;
end $function$

;

CREATE OR REPLACE FUNCTION public.crm_get_work_queue(p_bucket text DEFAULT 'today'::text, p_assignee_mode text DEFAULT 'me'::text, p_assignee uuid DEFAULT NULL::uuid, p_owner_mode text DEFAULT 'all'::text, p_owner uuid DEFAULT NULL::uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
  from public.crm_leads l join crm_security.next_actions() n on n.lead_id=l.id join public.crm_tasks t on t.id=n.task_id
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

CREATE OR REPLACE FUNCTION crm_security.student_candidates(lead uuid, learner text, birth date)
 RETURNS SETOF students
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select s.* from public.students s join public.crm_leads l on l.id=lead join public.crm_contacts c on c.id=l.contact_id
 where s.deleted_at is null and (
  (length(btrim(learner))>=2 and position(lower(btrim(learner)) in lower(s.full_name))>0)
  or (birth is not null and s.date_naissance=birth and split_part(lower(btrim(s.full_name)),' ',1)=split_part(lower(btrim(learner)),' ',1))
  or (c.phone_e164 is not null and crm_security.normalize_phone(s.telephone)=c.phone_e164)
  or (c.email_normalized is not null and c.email_normalized in (lower(s.email),lower(s.parent_email)))
 )
$function$;

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
end $function$

;

-- The C1 (138_desk_payments) bodies of the three payment functions 139 re-created (verbatim).
CREATE OR REPLACE FUNCTION public.create_charge_payment(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_charge public.charges%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_requested_id uuid := nullif(p_payload->>'enrollment_id','')::uuid;
  v_enrollment_id uuid;
  v_prior_request public.financial_requests%rowtype;
  v_crm_matches integer;
  v_matches uuid[];
  v_year text;
  v_constraint text;
  v_free boolean := false;
  v_lead public.crm_leads%rowtype;
  v_last_clear timestamptz;
begin
  -- Same staff boundary as the inner financial command; never trust caller roles.
  perform operational_security.require_capability('manage_finance_operations');
  -- Payments share this lock with other payments, preserving the existing
  -- financial idempotency/charge serialization. CRM linkage takes it exclusively.
  if nullif(p_payload->>'student_id','') is not null and not pg_try_advisory_xact_lock_shared(
    hashtextextended('crm:enrollment-intent:'||(p_payload->>'student_id')::uuid,0)) then
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
  end if;
  -- Lock before inner charge/receipt foreign-key reads to avoid lock upgrades
  -- between simultaneous payments for the same student. Existing locks remain.
  perform 1 from public.students where id=nullif(p_payload->>'student_id','')::uuid for update;
  -- C1 (RWR-r5 NF-4, owner review of PR #216): « Encaisser » never creates a second
  -- tuition charge next to a live unlinked commitment of the learner for the same
  -- programme and year; the payment goes on that commitment. A charge paid onto an
  -- enrollment the staff chose (enrollment_id, as « Inscrire et encaisser » always
  -- sends) is a deliberate link and passes; « Autre » and a replay are outside the rule.
  if nullif(p_payload->>'charge_id','') is null and v_requested_id is null
     and nullif(p_payload->>'student_id','') is not null
     and coalesce(nullif(btrim(p_payload->>'session_type'),''), 'Other') <> 'Other'
     and not exists (select 1 from public.financial_requests
       where idempotency_key = nullif(p_payload->>'idempotency_key','')::uuid)
     and exists (select 1 from public.charges x where x.student_id = (p_payload->>'student_id')::uuid
       and x.enrollment_id is null and x.voided_at is null and not x.legacy
       and x.session_type = btrim(p_payload->>'session_type')
       and x.school_year = nullif(btrim(p_payload->>'school_year'),'')) then
    raise exception 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement.'
      using errcode = '22023', hint = 'eap.unlinked_commitment_exists';
  end if;
  -- The inner function enforces staff authorization, payment validation and
  -- idempotency before the wrapper makes any academic changes.
  v_result := public.create_charge_payment_financial(p_payload);
  if coalesce((v_result->>'replayed')::boolean, false) then
    select * into v_prior_request from public.financial_requests
    where idempotency_key = (p_payload->>'idempotency_key')::uuid;
    if v_prior_request.requested_enrollment_id is distinct from v_requested_id then
      raise exception 'Idempotency key conflict: selected enrollment changed.';
    end if;
    return v_result;
  end if;
  update public.financial_requests set requested_enrollment_id = v_requested_id
  where idempotency_key = (p_payload->>'idempotency_key')::uuid;
  if (v_result->>'receipt_id') is null then
    -- EAP (D2, Q1 = A): a zero payment stays a commitment without an enrollment,
    -- except when this request created a new tuition charge discounted at 100 %
    -- with its reason: that agreement confirms the enrollment without a receipt
    -- (the director sees it in the discounts section of Contrôles).
    if nullif(p_payload->>'charge_id','') is not null then
      return v_result;
    end if;
    select * into v_charge from public.charges
    where id = (v_result->>'charge_id')::uuid for update;
    if v_charge.session_type = 'Other' or v_charge.legacy or v_charge.gross_amount <= 0
       or v_charge.discount_amount is distinct from v_charge.gross_amount
       or not exists (select 1 from public.charge_discount_reasons dr where dr.charge_id = v_charge.id) then
      return v_result;
    end if;
    v_free := true;
  else
    select * into v_charge from public.charges
    where id = (v_result->>'charge_id')::uuid for update;
  end if;
  if nullif(p_payload->>'student_id','') is null then
    update public.students set session_type = v_charge.session_type,
      niveau_cefr = coalesce(v_charge.level, niveau_cefr)
    where id = v_charge.student_id;
  end if;
  -- EGC (D3-A, FIN-10): a receipt no longer sets the learner's status; an Other
  -- or legacy receipt changes none, a tuition receipt confirms an enrollment.
  if v_charge.session_type = 'Other' or v_charge.legacy then
    if v_requested_id is not null then
      raise exception 'This service cannot be linked to a tuition enrollment.';
    end if;
    return v_result || jsonb_build_object('student_enrolled', false);
  end if;

  -- Lock the student across different charges in the same request period.
  perform 1 from public.students where id = v_charge.student_id for update;
  if v_charge.enrollment_id is not null and v_requested_id is not null
    and v_charge.enrollment_id <> v_requested_id then
    raise exception 'Charge is already linked to another enrollment.';
  end if;
  v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

  if v_enrollment_id is null then
    -- Guard only the implicit tuition-enrollment creation branch. Explicit charge
    -- or request links retain 074 validation. Exceptions roll back the entire
    -- inner financial transaction, including receipt/event/student side effects.
    select count(*) into v_crm_matches
    from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id
    join public.students s on s.id=e.student_id
    where e.student_id=v_charge.student_id and s.deleted_at is null
      and e.status is distinct from 'Rejected' and e.status is distinct from 'Ended' and l.merged_into_lead_id is null
      and coalesce(e.session_type,s.session_type)=v_charge.session_type
      -- Unknown year on an old charge cannot establish a distinct intent.
      and (v_charge.school_year is null or crm_security.enrollment_year(e)=v_charge.school_year);
    if v_crm_matches>0 then
      raise exception '%',case when v_crm_matches=1
        then 'Une inscription CRM existe pour ce programme et cette année. Sélectionnez-la avant d’enregistrer le paiement.'
        else 'Plusieurs inscriptions CRM correspondent. Sélectionnez explicitement l’inscription à payer.' end
        using errcode='22023';
    end if;
    -- EGC (D-5, I3): reuse the learner's single active enrollment of this
    -- programme and year that is not CRM-linked. An undated (pre-057) charge
    -- matches an undated enrollment or one of the current school year, which
    -- the new or confirmed enrollment receives (I9).
    v_year := coalesce(v_charge.school_year, academic_security.school_year_on(academic_security.today()));
    select array_agg(e.id order by e.id) into v_matches from public.enrollments e
    where e.student_id = v_charge.student_id and e.session_type = v_charge.session_type
      and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      and (e.school_year = v_charge.school_year
        or (v_charge.school_year is null and (e.school_year is null or e.school_year = v_year)))
      and not exists (select 1 from public.crm_leads l where l.enrollment_id = e.id);
    if cardinality(v_matches) > 1 then
      raise exception 'Plusieurs inscriptions correspondent. Sélectionnez l’inscription à payer.' using errcode='22023';
    end if;
    v_enrollment_id := v_matches[1];
  end if;

  begin
  if v_enrollment_id is not null then
    select * into v_enrollment from public.enrollments
    where id = v_enrollment_id for update;
    if not found or v_enrollment.student_id is distinct from v_charge.student_id
      or v_enrollment.status = 'Rejected'
      -- An ended enrollment only takes payments on its own charge (an old balance).
      or (v_enrollment.status = 'Ended' and v_charge.enrollment_id is distinct from v_enrollment.id)
      or (v_enrollment.session_type is not null
          and v_enrollment.session_type <> v_charge.session_type)
      or (v_enrollment.school_year is not null and v_charge.school_year is not null
          and v_enrollment.school_year <> v_charge.school_year) then
      raise exception 'Selected enrollment does not match this student, session and school year.';
    end if;
    if v_enrollment.status is distinct from 'Ended' then
      update public.enrollments set
        session_type = v_charge.session_type,
        school_year = coalesce(v_charge.school_year, v_enrollment.school_year, crm_security.enrollment_year(v_enrollment)),
        level = coalesce(v_enrollment.level, v_charge.level),
        status = case
          when status in ('Submitted','Under Review') then
            case when group_id is null then 'Confirmed' else 'Validated' end
          when status = 'Trial' then 'Validated'
          else status end
      where id = v_enrollment_id;
    end if;
  else
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, 'Confirmed',
            public.business_date(), v_charge.session_type, v_year, v_charge.level)
    returning id into v_enrollment_id;
  end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;

  update public.charges set enrollment_id = v_enrollment_id
  where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
  update public.receipts set enrollment_id = v_enrollment_id
  where id = (v_result->>'receipt_id')::uuid;
  select * into v_enrollment from public.enrollments where id = v_enrollment_id;

  -- E-2 (P1.4, Q1 = B): this payment is live and linked; clear a review flag only
  -- when a payment-cancellation review follows the last clear, no review of the
  -- lead was ever raised for another reason (all time: an enrollment downgrade's
  -- activity is timestamped at its command start and may predate a later clear),
  -- and the conversion was not from LOST/NOT_QUALIFIED. Leads are locked last.
  if not v_free and v_enrollment.status in ('Confirmed','Validated') then
    for v_lead in select * from public.crm_leads
      where enrollment_id = v_enrollment_id and merged_into_lead_id is null and conversion_review_required
      order by id for update
    loop
      select max(occurred_at) into v_last_clear from public.crm_activities
      where lead_id = v_lead.id and event_type = 'conversion_review_cleared';
      if exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id
          and a.event_type = 'conversion_review_required' and (v_last_clear is null or a.occurred_at > v_last_clear))
        and not exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id
          and a.event_type = 'conversion_review_required' and a.details->>'reason' is distinct from 'payment_voided')
        and not exists (select 1 from public.crm_activities c where c.id = v_lead.conversion_activity_id
          and c.from_status in ('LOST','NOT_QUALIFIED')) then
        insert into public.crm_activities(lead_id, enrollment_id, receipt_id, occurred_at, actor_id, actor_kind,
          event_type, source_key, body, details)
        values (v_lead.id, v_enrollment_id, (v_result->>'receipt_id')::uuid, clock_timestamp(), auth.uid(),
          case when auth.uid() is null then 'system' else 'user' end, 'conversion_review_cleared',
          'payment-review-cleared:'||(v_result->>'receipt_id'),
          'Paiement de remplacement enregistré : vérification levée.',
          jsonb_build_object('receipt_id', v_result->>'receipt_id'));
        update public.crm_leads set conversion_review_required = false, version = version + 1, updated_at = now()
        where id = v_lead.id;
      end if;
    end loop;
  end if;

  return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
                                       'enrollment_confirmed', v_enrollment.status in ('Confirmed','Validated'),
                                       'free_enrollment', v_free,
                                       'group_pending', v_enrollment.status = 'Confirmed' and v_enrollment.group_id is null,
                                       'student_enrolled', v_enrollment.status in ('Confirmed','Validated'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_enroll_and_collect(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_enrollment jsonb;
  v_payment jsonb;
  v_replayed boolean;
  v_start jsonb;
  v_row public.enrollments%rowtype;
  v_pay jsonb := '{}'::jsonb;
  v_bytes bytea;
  v_key uuid;
  v_gross numeric(12,2);
  v_discount numeric(12,2);
  v_amount numeric(12,2);
  v_free boolean;
  -- C1
  v_commitment public.charges%rowtype;
  v_commitment_id uuid;
begin
  perform crm_security.require_reader(false);
  perform operational_security.require_capability('manage_finance_operations');
  if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 16000
     or p_data - array['enrollment','payment'] <> '{}'::jsonb
     or jsonb_typeof(p_data->'enrollment') is distinct from 'object'
     or (p_data ? 'payment' and jsonb_typeof(p_data->'payment') is distinct from 'object')
     or p_data->'enrollment' ?| array['initial_status','group_id']
     or coalesce(p_data->'payment', '{}'::jsonb) - array['gross_amount','discount_amount','discount_reason_code',
          'discount_reason','due_date','payment_amount','payment_date','payment_method','transaction_reference',
          'note','request_email','email_recipient','idempotency_key','student_id','enrollment_id','session_type',
          'school_year','level','charge_id','new_session'] <> '{}'::jsonb
     -- C1: « nouvelle session » is an explicit boolean.
     or (p_data->'payment' ? 'new_session' and jsonb_typeof(p_data->'payment'->'new_session') is distinct from 'boolean') then
    raise exception 'Valid bounded enrollment request required' using errcode = '22023', hint = 'crm_enrollment.request_invalid';
  end if;
  v_enrollment := p_data->'enrollment';
  v_payment := p_data->'payment';
  v_commitment_id := nullif(v_payment->>'charge_id', '')::uuid;
  -- An « Autre » receipt never confirms an enrollment (122): not an enrollment programme here.
  if v_enrollment->>'session_type' = 'Other' then
    raise exception 'Choisissez le programme de l’inscription : « Autre » s’encaisse sans inscription.'
      using errcode = '22023', hint = 'eap.program_not_enrollable';
  end if;
  -- (0) The CRM command's own request lock, then the replay test (S4, R1).
  perform pg_advisory_xact_lock(hashtextextended('crm:request:'||v_actor||':start_enrollment:'||p_request_key, 0));
  v_replayed := exists (select 1 from public.crm_command_requests where actor_scope = v_actor::text
    and command_name = 'start_enrollment' and request_key = p_request_key);
  v_bytes := substring(sha256(convert_to('eap:payment:'||v_actor::text||':'||p_request_key::text, 'UTF8')) from 1 for 16);
  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 80);
  v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);
  v_key := encode(v_bytes, 'hex')::uuid;
  -- A replay carries a payment exactly when the first run did: a Q12 link replayed
  -- with a payment, or a paid request replayed without one, is a payload conflict.
  if v_replayed and (v_payment is not null) is distinct from
      exists (select 1 from public.financial_requests where idempotency_key = v_key) then
    raise exception 'Request key payload conflict' using errcode = '22023', hint = 'crm_enrollment.request_conflict';
  end if;
  if not v_replayed and v_payment is not null then
    v_gross := round(coalesce(nullif(v_payment->>'gross_amount','')::numeric, 0), 2);
    v_discount := round(coalesce(nullif(v_payment->>'discount_amount','')::numeric, 0), 2);
    v_amount := round(coalesce(nullif(v_payment->>'payment_amount','')::numeric, 0), 2);
    -- C1: a payment on an existing commitment always has an amount (its price is stored).
    if v_amount <= 0 and (v_commitment_id is not null or not (v_gross > 0 and v_discount = v_gross)) then
      raise exception 'L’inscription se confirme à l’encaissement : saisissez un paiement.'
        using errcode = '22023', hint = 'eap.payment_required';
    end if;
  end if;
  -- (i) Lead, learner, Confirmed enrollment (or the Q12 link), conversion.
  v_start := public.crm_start_enrollment(p_request_key, v_enrollment || jsonb_build_object('initial_status', 'Confirmed'));
  -- An existing enrollment that already has a live charge or receipt is never charged
  -- again here (first run; the CRM step holds the learner's enrollment lock).
  if not v_replayed and v_payment is not null and nullif(v_enrollment->>'enrollment_id', '') is not null and (
      exists (select 1 from public.charges c where c.enrollment_id = (v_start->'enrollment'->>'id')::uuid and c.voided_at is null)
      or exists (select 1 from public.receipts r where r.enrollment_id = (v_start->'enrollment'->>'id')::uuid
        and r.voided_at is null and r.deleted_at is null)) then
    raise exception 'Cette inscription a déjà un montant enregistré : encaissez sur ce montant depuis le reçu, ou rattachez-la si elle est payée.'
      using errcode = '22023', hint = 'eap.enrollment_already_charged';
  end if;
  -- C1 (§6.1, NF-4), first run only; the CRM step holds the learner's enrollment
  -- lock, which crm_reserve_without_payment takes too.
  if not v_replayed and v_payment is not null then
    if v_commitment_id is not null then
      -- « Encaisser sur cet engagement »: an unlinked live commitment of this
      -- learner, programme and year, paid and linked to the new enrollment.
      select * into v_commitment from public.charges where id = v_commitment_id for update;
      if not found or v_commitment.student_id is distinct from (v_start->'enrollment'->>'student_id')::uuid
         or v_commitment.voided_at is not null or v_commitment.legacy or v_commitment.enrollment_id is not null
         or v_commitment.session_type is distinct from v_start->'enrollment'->>'session_type'
         or v_commitment.school_year is distinct from v_start->'enrollment'->>'school_year' then
        raise exception 'Cet engagement ne correspond plus à cet apprenant, ce programme et cette année. Les soldes sont actualisés.'
          using errcode = '22023', hint = 'eap.commitment_unavailable';
      end if;
    elsif coalesce((v_payment->>'new_session')::boolean, false) is not true and exists (
        select 1 from public.charges c
        where c.student_id = (v_start->'enrollment'->>'student_id')::uuid and c.enrollment_id is null
          and c.voided_at is null and not c.legacy
          and c.session_type = v_start->'enrollment'->>'session_type'
          and c.school_year = v_start->'enrollment'->>'school_year') then
      -- No second charge: the commitment is collected, or « nouvelle session » is explicit.
      raise exception 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement, ou choisissez « Nouvelle session ».'
        using errcode = '22023', hint = 'eap.unlinked_commitment_exists';
    end if;
  end if;
  -- (ii) The payment on that enrollment, from the stored enrollment summary so a
  -- replay sends the same request.
  if v_payment is not null then
    v_pay := public.create_charge_payment((v_payment - 'new_session') || jsonb_build_object(
      'student_id', v_start->'enrollment'->'student_id', 'enrollment_id', v_start->'enrollment'->'id',
      'session_type', v_start->'enrollment'->'session_type', 'school_year', v_start->'enrollment'->'school_year',
      'level', v_start->'enrollment'->'level', 'idempotency_key', v_key));
  end if;
  select * into v_row from public.enrollments where id = (v_start->'enrollment'->>'id')::uuid;
  v_free := (v_pay->>'receipt_id') is null and (v_pay->>'charge_id') is not null and exists (
    select 1 from public.charges c where c.id = (v_pay->>'charge_id')::uuid and c.voided_at is null
      and c.gross_amount > 0 and c.discount_amount = c.gross_amount);
  -- (iii) B1 / Q12, first run only.
  if not v_replayed then
    if v_payment is not null then
      if (v_pay->>'receipt_id') is null and not v_free then
        raise exception 'L’inscription se confirme à l’encaissement : saisissez un paiement.'
          using errcode = '22023', hint = 'eap.payment_required';
      end if;
    elsif not (v_row.status in ('Confirmed','Validated') and (
        exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null and r.montant_paye > 0
          and (r.enrollment_id = v_row.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = v_row.id)))
        or exists (select 1 from public.charges c where c.enrollment_id = v_row.id and c.voided_at is null
          and c.gross_amount > 0 and c.discount_amount = c.gross_amount))) then
      raise exception 'L’inscription se confirme à l’encaissement : saisissez un paiement.'
        using errcode = '22023', hint = 'eap.payment_required';
    end if;
  end if;
  -- (iv) The lead and its tasks as they are now: the payment may have converted a
  -- lead linked to a legacy row after the CRM step wrote its result.
  v_start := v_start || crm_security.result((v_start->'lead'->>'id')::uuid,
    'enrollment-started:'||(v_start->'lead'->>'id')||':'||v_row.id);
  if v_start->'enrollment_followup' ? 'id' and not exists (select 1 from public.crm_tasks
      where id = (v_start->'enrollment_followup'->>'id')::uuid and status = 'open') then
    v_start := v_start || jsonb_build_object('enrollment_followup', null);
  end if;
  return v_start || jsonb_build_object(
    'enrollment', crm_security.enrollment_summary(v_row),
    'charge_id', v_pay->'charge_id',
    'receipt_id', v_pay->'receipt_id',
    'receipt_number', (select r.receipt_number from public.receipts r where r.id = (v_pay->>'receipt_id')::uuid),
    'balance', (select to_jsonb(b.balance) from public.charge_balances b where b.id = (v_pay->>'charge_id')::uuid),
    'free_enrollment', v_free,
    'replayed_enrollment', v_replayed,
    'replayed_payment', coalesce((v_pay->>'replayed')::boolean, false));
end $function$
;

CREATE OR REPLACE FUNCTION public.crm_reserve_without_payment(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid(); digest text; prior public.crm_command_requests%rowtype;
  l public.crm_leads%rowtype; c public.crm_contacts%rowtype; s public.students%rowtype; ch public.charge_balances%rowtype;
  learner text; birth date; session text; year text; level text;
  gross numeric(12,2); discount numeric(12,2); due_date date; due timestamptz;
  bytes bytea; pay_key uuid; pay jsonb; task uuid; ckey text; result jsonb;
begin
  perform crm_security.require_reader(false);
  perform operational_security.require_capability('manage_finance_operations');
  if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 16000
     or p_data - array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date',
       'candidate_review','confirm_new','session_type','school_year','level','gross_amount','discount_amount',
       'discount_reason_code','discount_reason','due_date'] <> '{}'::jsonb then
    raise exception 'Valid bounded reservation request required' using errcode = '22023', hint = 'crm_enrollment.request_invalid';
  end if;
  -- The same learner lock as enrolment start and « Inscrire et encaisser »: a
  -- reservation and an enrolment of one learner never interleave (no second charge).
  begin
    perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
  exception when sqlstate 'PT409' then
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode = 'PT409', hint = 'crm_enrollment.enrollment_in_progress';
  end;
  digest := encode(sha256(convert_to(p_data::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':reserve_without_payment:'||p_request_key, 0));
  select * into prior from public.crm_command_requests where actor_scope = actor::text
    and command_name = 'reserve_without_payment' and request_key = p_request_key;
  if found then
    if prior.payload_hash <> digest then
      raise exception 'Request key payload conflict' using errcode = '22023', hint = 'crm_enrollment.request_conflict';
    end if;
    return prior.result || jsonb_build_object('replayed', true);
  end if;
  select * into l from public.crm_leads where id = (p_data->>'lead_id')::uuid for update;
  if not found or l.merged_into_lead_id is not null then
    raise exception 'Qualified unlinked lead required' using errcode = '22023', hint = 'crm_enrollment.lead_unavailable'; end if;
  if l.enrollment_id is not null then
    raise exception 'Qualified unlinked lead required' using errcode = '22023', hint = 'crm_enrollment.lead_already_enrolled'; end if;
  if l.status <> 'QUALIFIED' then
    raise exception 'Qualified unlinked lead required' using errcode = '22023', hint = 'crm_enrollment.lead_not_qualified'; end if;
  if l.version is distinct from (p_data->>'expected_version')::bigint then
    raise exception 'Stale lead version; refresh and retry' using errcode = 'PT409', hint = 'crm_enrollment.lead_changed'; end if;
  select * into strict c from public.crm_contacts where id = l.contact_id;
  session := p_data->>'session_type'; year := p_data->>'school_year'; level := nullif(p_data->>'level','');
  if session is null or session <> all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Online','Online One-to-One']) then
    raise exception 'Choisissez le programme de la réservation.' using errcode = '22023', hint = 'crm_enrollment.program_invalid'; end if;
  if year is null or year !~ '^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer <> left(year,4)::integer + 1 then
    raise exception 'Invalid enrollment program or school year' using errcode = '22023', hint = 'crm_enrollment.school_year_invalid'; end if;
  if not crm_security.valid_enrollment_level(session, level) then
    raise exception 'Invalid level for selected program' using errcode = '22023', hint = 'crm_enrollment.level_invalid'; end if;
  begin
    gross := round(nullif(p_data->>'gross_amount','')::numeric, 2);
    discount := round(coalesce(nullif(p_data->>'discount_amount','')::numeric, 0), 2);
    due_date := nullif(p_data->>'due_date','')::date;
    birth := nullif(p_data->>'birth_date','')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid reservation fields' using errcode = '22023', hint = 'crm_enrollment.record_rejected';
  end;
  -- Something is left to collect: a price above the discount. A 100 % discount
  -- confirms the enrollment instead (« Inscrire et encaisser »).
  if gross is null or gross <= 0 or discount < 0 or discount > gross then
    raise exception 'Indiquez le prix convenu (supérieur à la remise) pour réserver sans paiement.' using errcode = '22023', hint = 'eap.reservation_price_required'; end if;
  if discount = gross then
    raise exception 'Une remise de 100 %% confirme l’inscription : utilisez « Inscrire et encaisser ».' using errcode = '22023', hint = 'eap.reservation_free'; end if;
  if due_date is null or not isfinite(due_date) then
    raise exception 'Indiquez la date d’échéance de l’acompte.' using errcode = '22023', hint = 'eap.reservation_due_required'; end if;
  if due_date < public.business_date() or due_date > public.business_date() + 366 then
    raise exception 'L’échéance doit être entre aujourd’hui et dans un an.' using errcode = '22023', hint = 'eap.reservation_due_invalid'; end if;
  -- The learner, exactly as enrolment start resolves it (crm_start_enrollment, 136).
  learner := btrim(p_data->>'learner_name');
  if p_data->>'student_choice' = 'new' then
    if l.student_id is not null then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.learner_already_linked'; end if;
    if p_data->>'student_id' is not null then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.request_invalid'; end if;
    if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.learner_name_invalid'; end if;
    if not isfinite(birth) then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.birth_date_invalid'; end if;
    if birth > public.business_date() then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.birth_date_future'; end if;
    perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner), 0));
    if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id, learner, birth) then
      raise exception 'Student candidates changed; review again' using errcode = 'PT409', hint = 'crm_enrollment.candidates_changed'; end if;
    if exists (select 1 from crm_security.student_candidates(l.id, learner, birth)) and coalesce((p_data->>'confirm_new')::boolean, false) is not true then
      raise exception 'Explicit new learner decision required' using errcode = '22023', hint = 'crm_enrollment.new_learner_confirmation_required'; end if;
    insert into public.students(full_name, date_naissance, telephone, email, parent_email, status, session_type, niveau_cefr, notes)
    values (learner, birth, coalesce(c.phone_e164, c.phone_raw), case when c.contact_kind = 'adult_learner' then c.email_normalized end,
      case when c.contact_kind <> 'adult_learner' then c.email_normalized end, 'Prospect', session, level,
      case when c.contact_kind <> 'adult_learner' then 'Contact : '||coalesce(c.display_name, 'Non renseigné') end) returning * into s;
  elsif p_data->>'student_choice' = 'existing' then
    select * into s from public.students where id = (p_data->>'student_id')::uuid and deleted_at is null for update;
    if not found then
      if l.student_id is not null and l.student_id = (p_data->>'student_id')::uuid then
        raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.linked_learner_unavailable'; end if;
      if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.learner_link_mismatch'; end if;
      raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.learner_unavailable';
    end if;
    if l.student_id is not null and l.student_id <> s.id then
      raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.learner_link_mismatch'; end if;
  else
    raise exception 'Explicit student choice required' using errcode = '22023', hint = 'crm_enrollment.learner_choice_required';
  end if;
  -- One commitment per learner, programme and year; never next to a live enrollment.
  if exists (select 1 from public.charges x where x.student_id = s.id and x.enrollment_id is null and x.voided_at is null
      and not x.legacy and x.session_type = session and x.school_year = year) then
    raise exception 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement.'
      using errcode = '22023', hint = 'eap.unlinked_commitment_exists'; end if;
  if exists (select 1 from public.enrollments x where x.student_id = s.id and x.status not in ('Rejected','Ended')
      and coalesce(x.session_type, s.session_type) = session and crm_security.enrollment_year(x) = year) then
    raise exception 'Cet apprenant a déjà une inscription pour ce programme et cette année : encaissez sur son inscription.'
      using errcode = '22023', hint = 'eap.reservation_already_enrolled'; end if;
  -- The charge, through the financial command (capability, discount reasons,
  -- financial_requests idempotency and the charge_created event), with no
  -- payment: no receipt, no enrollment, no conversion.
  bytes := substring(sha256(convert_to('eap:reservation:'||actor::text||':'||p_request_key::text, 'UTF8')) from 1 for 16);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 80);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  pay_key := encode(bytes, 'hex')::uuid;
  pay := public.create_charge_payment_financial(jsonb_build_object('student_id', s.id, 'session_type', session,
    'school_year', year, 'level', level, 'gross_amount', gross, 'discount_amount', discount,
    'discount_reason_code', p_data->>'discount_reason_code', 'discount_reason', p_data->>'discount_reason',
    'due_date', due_date, 'payment_amount', 0, 'idempotency_key', pay_key));
  if (pay->>'receipt_id') is not null or (pay->>'charge_id') is null then
    raise exception 'Reservation must create a charge without payment' using errcode = 'XX000'; end if;
  insert into public.crm_charge_reservations(lead_id, charge_id, student_id, created_by, request_key)
  values (l.id, (pay->>'charge_id')::uuid, s.id, actor, p_request_key);
  -- The prospect is linked to its learner, as enrolment start does; nothing else
  -- changes on the prospect (no enrollment, no conversion, status unchanged).
  update public.crm_leads set student_id = s.id, version = version + 1, updated_at = now() where id = l.id returning * into l;
  -- One history entry for the user action (§4.7); the task events carry its key.
  ckey := 'reservation:'||l.id||':'||p_request_key;
  perform set_config('eh.crm_command_key', ckey, true);
  insert into public.crm_activities(lead_id, occurred_at, actor_id, actor_kind, event_type, source_key, body, command_key, is_primary, details)
  values (l.id, now(), actor, 'user', 'charge_reserved', ckey, 'Réservé sans paiement : '||
      to_char(gross - discount, 'FM999G999G990D00')||' MAD à encaisser avant le '||to_char(due_date, 'DD/MM/YYYY')||'.',
    ckey, true, jsonb_build_object('command', 'reserve_without_payment',
      'summary', 'Réservé sans paiement → Encaisser l’acompte '||to_char(due_date, 'DD/MM')));
  -- « Encaisser l'acompte », our step, due on the due date (a reminder: the first
  -- calling window from that date, never earlier than now). The only writer of
  -- next actions does the replacement (an enrolment action, so a kept test moves
  -- with it, §4.8); migration 137's index and deferred triggers check the result.
  due := greatest(now(), due_date::timestamp at time zone public.centre_utc_offset());
  task := crm_security.set_next_action(l, jsonb_build_object('task_type', 'enrollment_followup', 'schedule_kind', 'reminder',
    'due_at', due, 'instructions', 'Encaisser l’acompte',
    '_key', ckey||':next-action', '_kind', 'enrollment', '_replaced_reason', 'Remplacée par « Encaisser l’acompte »'),
    'enrollment', ckey);
  perform set_config('eh.crm_command_key', '', true);
  select * into ch from public.charge_balances where id = (pay->>'charge_id')::uuid;
  result := crm_security.result(l.id, ckey) || jsonb_build_object(
    'charge', jsonb_build_object('id', ch.id, 'student_id', ch.student_id, 'session_type', ch.session_type,
      'school_year', ch.school_year, 'level', ch.level, 'net_amount', ch.net_amount, 'balance', ch.balance,
      'due_date', ch.due_date, 'enrollment_id', ch.enrollment_id),
    'student', jsonb_build_object('id', s.id, 'name', s.full_name),
    'next_action_id', task, 'replayed', false);
  insert into public.crm_command_requests(actor_scope, command_name, request_key, payload_hash, result)
  values (actor::text, 'reserve_without_payment', p_request_key, digest, result);
  return result;
exception
  when deadlock_detected or unique_violation then
    raise exception 'Concurrent enrollment change; refresh and retry' using errcode = 'PT409', hint = 'crm_enrollment.concurrent_change';
  when check_violation or not_null_violation then
    raise exception 'Invalid reservation fields' using errcode = '22023', hint = 'crm_enrollment.record_rejected';
end $function$
;

drop function public.crm_create_prospect(uuid,jsonb);
drop function public.crm_update_prospect(uuid,jsonb);
drop function public.crm_merge_prospects(uuid,uuid,uuid,bigint,bigint);
drop function public.crm_merge_contacts(uuid,uuid,uuid,bigint,bigint);
drop function public.find_people(text,text,text,date,integer);
drop function public.search_desk_students(text,integer);
drop function public.record_person_match_decisions(text,uuid,jsonb);
drop function public.student_merge_preview(uuid,uuid);
drop function public.merge_students(uuid,uuid);
drop function public.unmerge_student(uuid);
drop function public.student_merge_set(uuid);
drop function crm_security.d5_apply(jsonb,jsonb);
drop function crm_security.d5_plan(jsonb);
drop function crm_security.d3_revert();
drop function crm_security.d3_apply(jsonb);
drop function crm_security.d3_plan();
drop function crm_security.d3_rows();
drop function academic_security.unmerge_student_core(uuid);
drop function academic_security.merge_students_core(uuid,uuid);
drop function academic_security.student_merge_check(uuid,uuid);
drop function crm_security.require_merger();
drop function crm_security.lead_merge_set(uuid);
drop function crm_security.undecided_matches(text,uuid,jsonb);
drop function crm_security.record_match_decisions(text,uuid,jsonb,jsonb);
drop function crm_security.assert_matches_acknowledged(jsonb,jsonb);
drop function crm_security.match_pair(text,uuid,text,uuid);
drop function crm_security.person_matches(text[],text,date,uuid,uuid,uuid);
drop function public.people_phone_guard();
drop function public.person_name_key(text);
drop function public.require_phone(text);
drop function public.phone_mask(text);
drop function public.phone_search_key(text);
drop function public.phone_key(text);
drop function public.phone_is_placeholder(text);
drop function public.phone_e164(text);

-- The restored bodies are exactly the ones 138 left live (139's section 0 map).
do $$
declare f record;
begin
  for f in select * from jsonb_each_text(jsonb_build_object(
      'crm_security.set_next_action(public.crm_leads,jsonb,text,text)', '1ae03220d7994df923c94e049c820c46',
      'public.create_charge_payment(jsonb)', 'c99f48d7ddebd1d902786f822383d465',
      'public.crm_enroll_and_collect(uuid,jsonb)', 'bb0f6ceaec1188d34543fe04a76e417c',
      'public.crm_reserve_without_payment(uuid,jsonb)', '4d2968350d9d5164b74168867f2d524e',
      'crm_security.command(text,uuid,jsonb)', '6de2fe6bf7d33b2da53566368edda52e',
      'crm_security.opportunity_ids(text,text,uuid,text,uuid,text,text,text,text,timestamp with time zone)', '462267206c15cec6ad947772e5c29d92',
      'crm_security.normalize_phone(text)', 'c6518a6a742a315a8ea2a8b755513a71',
      'crm_security.student_candidates(uuid,text,date)', 'b735813b437f690a102d516c992185c7',
      'public.crm_get_timeline(uuid,jsonb,integer,boolean)', '20a3e43f610ee1cb24b2c6109ea363c4',
      'public.crm_get_work_queue(text,text,uuid,text,uuid,jsonb,integer)', '38adaf382ab48067f83411d8e35a178d',
      'public.crm_get_workspace_detail(uuid)', '6b42f4cb2797eb8bd2d0f2fb4e8746f6',
      'public.crm_search_leads(text,text,uuid,integer,integer)', '977cf9e47018609d11caaa26d3ea022d',
      'public.crm_start_enrollment(uuid,jsonb)', 'f57387d6eced14cb23a53680373f16b6',
      'public.save_receptionist_student(uuid,timestamp with time zone,jsonb)', 'b5aa2ebeb0d43ac76a0836ca4b08d1b2',
      'public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text,text)', '94ddf4240a7e922dd86c5fb226cf81eb')) loop
    if (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.key)) is distinct from f.value then
      raise exception 'Restore 139: % is not the 138 body after the restore', f.key using errcode = 'XX000';
    end if;
  end loop;
end $$;

commit;
