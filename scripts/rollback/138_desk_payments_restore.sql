-- Restore for migration 138 (RWR-r5 PR C1, desk payments).
--
-- Run only with its own owner approval, after the application is back on a build
-- without PR C1 (a C1 build calls get_open_balances, find_duplicate_receipts and
-- crm_reserve_without_payment, which this restore drops).
--
-- What it does: re-creates public.crm_enroll_and_collect in its exact 127 body
-- (no « Encaisser sur cet engagement », no no-second-charge guard) with its grants,
-- re-creates crm_security.action_label in its exact 136 body (« Encaisser l'acompte »
-- is labelled « Finaliser l'inscription » again), re-creates
-- crm_security.set_next_action in its exact 137 body (a moved « Encaisser
-- l'acompte » no longer keeps its marker),
-- and drops get_open_balances, find_duplicate_receipts, crm_reserve_without_payment,
-- the crm_charge_reservations table and its append-only trigger function, and the
-- receipt guard on reserved commitments with its trigger function; re-creates
-- public.create_charge_payment in its exact 127 body (no « second charge at
-- Encaisser » check) with its grants.
--
-- What it keeps on purpose: every charge a reservation created stays (an ordinary
-- open commitment of the learner, still collected from « Encaisser »), and every
-- « Encaisser l'acompte » next action stays open (an ordinary enrolment action).
-- Only the prospect ↔ charge link rows are lost, so the restore refuses, changing
-- nothing, while reservation rows exist, unless the operator has exported them
-- first and sets eh.restore_138_drop_reservations to 'exported' in the session:
--   \copy (select * from public.crm_charge_reservations) to 'reservations-138.csv' csv header
--   set eh.restore_138_drop_reservations = 'exported';
-- It also refuses unless migration 138 is applied, and while migration 139 (PR B1)
-- is applied: 139's restore runs first. The ledger row 138 is removed by the operator
-- wrapper, not here.
begin;

do $$ begin
  if to_regclass('public.crm_charge_reservations') is null
     or to_regprocedure('public.crm_reserve_without_payment(uuid,jsonb)') is null then
    raise exception 'Restore 138: migration 138 is not applied' using errcode = '55000';
  end if;
  -- Rollback order (RWR-r5 B1, 2026-11-26): migration 139 rebuilt four of these bodies
  -- on 138; its own restore runs first and returns them to 138.
  if to_regprocedure('public.find_people(text,text,text,date,integer)') is not null then
    raise exception 'Restore 138: migration 139 is applied; run scripts/rollback/139_people_identity_restore.sql first'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.crm_charge_reservations)
     and coalesce(current_setting('eh.restore_138_drop_reservations', true), '') <> 'exported' then
    raise exception 'Restore 138: reservation rows exist; export them, then set eh.restore_138_drop_reservations = ''exported'''
      using errcode = '55000';
  end if;
end $$;

-- The section 7 receipt guard first: it reads crm_charge_reservations.
drop trigger receipts_reserved_commitment_guard on public.receipts;
drop function crm_security.reserved_commitment_receipt_guard();
drop function public.crm_reserve_without_payment(uuid, jsonb);
drop function public.find_duplicate_receipts(uuid, uuid, numeric, date);
drop function public.get_open_balances(uuid);
drop trigger crm_charge_reservations_append_only on public.crm_charge_reservations;
drop table public.crm_charge_reservations;
drop function crm_security.charge_reservations_append_only();

-- crm_security.set_next_action: the 137 body, verbatim (prosrc md5 0b48aedd9f86a4aca802c78c3fcaff37).
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

-- crm_security.action_label: the 136 body, verbatim (prosrc md5 fae61b36be35b068532fbd9e29dc10f2).
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

-- crm_enroll_and_collect: the 127 body, verbatim (prosrc md5 84babfb6f1305fb2cab565bfdf9e5e07).
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
          'school_year','level'] <> '{}'::jsonb then
    raise exception 'Valid bounded enrollment request required' using errcode = '22023', hint = 'crm_enrollment.request_invalid';
  end if;
  v_enrollment := p_data->'enrollment';
  v_payment := p_data->'payment';
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
    if v_amount <= 0 and not (v_gross > 0 and v_discount = v_gross) then
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
  -- (ii) The payment on that enrollment, from the stored enrollment summary so a
  -- replay sends the same request.
  if v_payment is not null then
    v_pay := public.create_charge_payment(v_payment || jsonb_build_object(
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
revoke all on function public.crm_enroll_and_collect(uuid, jsonb) from public, anon;
grant execute on function public.crm_enroll_and_collect(uuid, jsonb) to authenticated;

-- create_charge_payment: the 127 body, verbatim (prosrc md5 2263c8d7c1ba4b41f0c863c81b82edd8).
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
$function$;
revoke all on function public.create_charge_payment(jsonb) from public, anon;
grant execute on function public.create_charge_payment(jsonb) to authenticated;

do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_enroll_and_collect(uuid,jsonb)'::regprocedure)
     is distinct from '84babfb6f1305fb2cab565bfdf9e5e07' then
    raise exception 'Restore 138: crm_enroll_and_collect is not the 127 body after the restore' using errcode = 'XX000';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'crm_security.action_label(public.crm_tasks)'::regprocedure)
     is distinct from 'fae61b36be35b068532fbd9e29dc10f2' then
    raise exception 'Restore 138: crm_security.action_label is not the 136 body after the restore' using errcode = 'XX000';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.create_charge_payment(jsonb)'::regprocedure)
     is distinct from '2263c8d7c1ba4b41f0c863c81b82edd8' then
    raise exception 'Restore 138: create_charge_payment is not the 127 body after the restore' using errcode = 'XX000';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'crm_security.set_next_action(public.crm_leads,jsonb,text,text)'::regprocedure)
     is distinct from '0b48aedd9f86a4aca802c78c3fcaff37' then
    raise exception 'Restore 138: crm_security.set_next_action is not the 137 body after the restore' using errcode = 'XX000';
  end if;
end $$;

commit;
