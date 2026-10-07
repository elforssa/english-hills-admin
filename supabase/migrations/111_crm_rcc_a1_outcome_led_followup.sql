-- RCC-A1: outcome-led receptionist follow-up (owner-approved Tier 3 scope in
-- docs/architecture/plans/rcc-r1-receptionist-crm-completion.md).
-- Additive task metadata, server-resolved reminder presets and optional prose for
-- structured conversations. No status vocabulary, conversion, finance, permission,
-- lifecycle/Meta or historical-row change; existing tasks are not backfilled.
begin;

-- Agreed appointments (time fixed with the prospect) and internal reminders are
-- separate facts. NULL means cadence/system work or a task created before RCC-A1.
alter table public.crm_tasks
 add column schedule_kind text check(schedule_kind in ('appointment','reminder')),
 add column followup_reason text check(followup_reason in ('considering')),
 add constraint crm_tasks_followup_reason_type check(followup_reason is null or task_type in ('callback','whatsapp_followup'));
comment on column public.crm_tasks.schedule_kind is 'appointment = time agreed with the prospect; reminder = internal staff reminder; NULL = cadence/system or pre-RCC-A1 task.';
comment on column public.crm_tasks.followup_reason is 'considering = En réflexion follow-up metadata; never a commercial status.';

-- Bounded reminder presets resolve on the server against the lead's existing
-- Casablanca follow-up policy windows; the browser never computes these times.
create function crm_security.reminder_due(policy uuid, preset text) returns timestamptz
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare p public.crm_followup_policies%rowtype; today date; target timestamptz;
begin
 select * into strict p from public.crm_followup_policies where id=policy;
 today:=(now() at time zone p.timezone)::date;
 target:=case preset
  when 'in_2_hours' then now()+interval '2 hours'
  when 'tomorrow' then (today+1)::timestamp at time zone p.timezone
  when 'in_2_days' then (today+2)::timestamp at time zone p.timezone
  when 'in_3_days' then (today+3)::timestamp at time zone p.timezone
  when 'next_week' then (today+7)::timestamp at time zone p.timezone
 end;
 if target is null then raise exception 'Unknown reminder preset' using errcode='22023'; end if;
 return crm_security.next_window(policy,target);
end $$;
revoke all on function crm_security.reminder_due(uuid,text) from public,anon,authenticated,service_role;

-- Migration 080's task primitive plus optional kind, reason and preset. Explicit
-- due_at payloads keep their existing meaning and calling-window adjustment.
create or replace function crm_security.new_task(l public.crm_leads, spec jsonb, source text,
 kind text default 'manual', ordinal smallint default null, event_source text default null) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare t uuid; due timestamptz; assignee uuid; typ text; schedule text; reason text;
begin
 if jsonb_typeof(spec) is distinct from 'object' or spec-array['task_type','due_at','due_preset','schedule_kind','followup_reason','assigned_to','instructions']<>'{}'::jsonb then raise exception 'Next task required' using errcode='22023'; end if;
 typ:=spec->>'task_type'; schedule:=spec->>'schedule_kind'; reason:=spec->>'followup_reason';
 if typ is null or typ<>all(array['first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup']) then
  raise exception 'Valid future task required' using errcode='22023'; end if;
 -- Cadence slots are neither; a center visit is always agreed with the prospect.
 if schedule is not null and (schedule not in ('appointment','reminder') or typ in ('first_contact','contact_attempt')
  or (typ='center_visit' and schedule<>'appointment')) then raise exception 'Invalid follow-up kind' using errcode='22023'; end if;
 if reason is not null and (reason<>'considering' or typ not in ('callback','whatsapp_followup')) then
  raise exception 'Invalid follow-up reason' using errcode='22023'; end if;
 if spec ? 'due_preset' then
  -- An agreed appointment needs its agreed time, so presets are reminders only.
  if spec ? 'due_at' or coalesce(schedule,'reminder')<>'reminder'
   or typ not in ('callback','whatsapp_followup','confirm_placement_test','post_test_followup','enrollment_followup') then
   raise exception 'Reminder preset requires an internal reminder without explicit time' using errcode='22023'; end if;
  schedule:='reminder'; due:=crm_security.reminder_due(l.followup_policy_id,spec->>'due_preset');
 else due:=(spec->>'due_at')::timestamptz; end if;
 if due is null or not isfinite(due) or due<now() then raise exception 'Valid future task required' using errcode='22023'; end if;
 if typ in ('first_contact','contact_attempt','callback') then
  -- An agreed callback keeps its agreed time: reject, never shift, outside hours.
  -- Reminders and legacy explicit times still resolve to the next calling window.
  if schedule='appointment' and crm_security.next_window(l.followup_policy_id,due)<>due then
   raise exception 'Agreed callback time is outside calling hours' using errcode='22023'; end if;
  due:=crm_security.next_window(l.followup_policy_id,due);
 end if;
 assignee:=case when spec ? 'assigned_to' then (spec->>'assigned_to')::uuid else l.owner_id end;
 perform crm_security.assert_staff(assignee);
 if length(spec->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
 insert into public.crm_tasks(lead_id,task_type,assigned_to,due_at,instructions,source_kind,source_key,policy_id,outreach_cycle,attempt_ordinal,schedule_kind,followup_reason)
 values(l.id,typ,assignee,due,spec->>'instructions',kind,source,l.followup_policy_id,
 case when ordinal is not null then l.outreach_cycle end,ordinal,schedule,reason) returning id into t;
 perform crm_security.event(l.id,'task_created',coalesce(event_source,source)||':created',null,null,null,t);
 return t;
end $$;

-- SAFEGUARD: migration 103's cumulative crm_security.command, copied verbatim
-- (lifecycle barrier, pre-identity keys and pending-stop handoff unchanged), with
-- only three edits: record_conversation and channel-evidenced qualify_lead no
-- longer require prose, and rescheduling an agreed callback outside calling hours
-- is rejected instead of shifted. Never reconstruct this function from migration 080.
CREATE OR REPLACE FUNCTION crm_security.command(cmd text, request uuid, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb;
 l public.crm_leads%rowtype; t public.crm_tasks%rowtype; p public.crm_followup_policies%rowtype;
 contact uuid; submission uuid; aid uuid; tid uuid; source text; allowed text[]; offsets integer[];
 phone text; email text; candidates jsonb; count_failed integer; ordinal smallint;
 due timestamptz; happened timestamptz; outcome text; meaningful boolean:=false; needs_next boolean:=false;
 reason text; target text; initial_status text; next_spec jsonb; policy_version integer;
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
 when 'create_followup_policy' then array['weekly_hours','timezone','attempt_offsets','minimum_attempt_gap_minutes','first_contact_sla_minutes','post_test_sla_minutes','stale_contacting_minutes','effective_from']
 when 'create_manual_lead' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id']
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

 if cmd='create_followup_policy' then
  if coalesce(data->>'timezone','Africa/Casablanca')<>'Africa/Casablanca' then raise exception 'Timezone must be Africa/Casablanca' using errcode='22023'; end if;
  if data ? 'attempt_offsets' then select array_agg(value::integer order by ord) into offsets from jsonb_array_elements_text(data->'attempt_offsets') with ordinality a(value,ord);
  else offsets:=array[0,0,1,3,5]; end if;
  perform crm_security.validate_policy(data->'weekly_hours',offsets);
  if coalesce((data->>'minimum_attempt_gap_minutes')::integer,180) not between 180 and 10080
   or coalesce((data->>'first_contact_sla_minutes')::integer,15) not between 1 and 1440
   or coalesce((data->>'post_test_sla_minutes')::integer,120) not between 1 and 10080
   or coalesce((data->>'stale_contacting_minutes')::integer,2880) not between 60 and 43200 then
   raise exception 'Invalid policy timing' using errcode='22023'; end if;
  happened:=coalesce((data->>'effective_from')::timestamptz,now());
  if not isfinite(happened) or happened<now()-interval '1 minute' then raise exception 'Policy cannot be backdated' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm:policy:publish',0));
  select coalesce(max(version),0)+1 into policy_version from public.crm_followup_policies;
  insert into public.crm_followup_policies(version,weekly_hours,date_exceptions,attempt_offsets,minimum_attempt_gap_minutes,
   first_contact_sla_minutes,post_test_sla_minutes,stale_contacting_minutes,effective_from,created_by)
  values(policy_version,data->'weekly_hours','[]',offsets,coalesce((data->>'minimum_attempt_gap_minutes')::integer,180),
   coalesce((data->>'first_contact_sla_minutes')::integer,15),coalesce((data->>'post_test_sla_minutes')::integer,120),
   coalesce((data->>'stale_contacting_minutes')::integer,2880),happened,actor) returning * into p;
  result:=jsonb_build_object('policy_id',p.id,'version',p.version,'timezone',p.timezone,'weekly_hours',p.weekly_hours,'effective_from',p.effective_from);

 elsif cmd='create_manual_lead' then
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by version desc limit 1;
  if not found then raise exception 'No effective follow-up policy; ask a director to publish one' using errcode='22023'; end if;
  if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200
   or nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200
   or nullif(btrim(data->>'source_label'),'') is null or length(data->>'source_label')>200 then
   raise exception 'Contact, learner and source label required (maximum 200 characters)' using errcode='22023'; end if;
  if (data->>'learner_birth_date')::date>current_date then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
  perform crm_security.assert_staff((data->>'owner_id')::uuid);
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
  insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
    owner_id,first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(l.id,contact,btrim(data->>'learner_name'),lower(btrim(data->>'learner_name')),(data->>'learner_age')::integer,
   case when data->>'learner_age' is not null then now() end,(data->>'learner_birth_date')::date,data->>'session_type',data->>'program_interest_text',
   (data->>'owner_id')::uuid,submission,submission,p.id,(due at time zone p.timezone)::date) returning * into l;
  insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,resolved_by,resolved_at,payload_hash)
  values(submission,l.id,'manual',now(),now(),'server',data,'[]',btrim(data->>'source_label'),'resolved',actor,now(),digest);
  perform crm_security.event(l.id,'lead_created',source||':lead',null,null,null,null,null,null,null,null,'NEW');
  aid:=crm_security.event(l.id,'submission_received',source||':submission',submission=>submission);
  -- Activity ownership FK is satisfied; acquisition snapshots are never edited.
  tid:=crm_security.new_task(l,jsonb_build_object('task_type','first_contact','due_at',due),'attempt:'||l.id||':1:1','intake',1::smallint,source||':initial-task');
  result:=crm_security.result(l.id,source)||jsonb_build_object('submission_id',submission,'contact_candidates',candidates,'contact_version',1);

 else
  select * into l from public.crm_leads where id=(data->>'lead_id')::uuid for update;
  if not found then raise exception 'Lead not found' using errcode='22023'; end if;
  if (data->>'expected_version')::bigint is distinct from l.version then raise exception 'Stale lead version; refresh and retry' using errcode='40001'; end if;
  if l.merged_into_lead_id is not null or l.status='CONVERTED' then raise exception 'Lead is not operationally editable' using errcode='22023'; end if;
  if cmd not in ('add_note','reopen_lead','reassign') and l.status in ('LOST','NOT_QUALIFIED') then raise exception 'Reopen lead before this operation' using errcode='22023'; end if;
  initial_status:=l.status;
  if data->>'task_id' is not null then
   select * into t from public.crm_tasks where id=(data->>'task_id')::uuid and lead_id=l.id for update;
   if not found or t.status<>'open' then raise exception 'Open task not found on this lead' using errcode='40001'; end if;
   if (data->>'expected_task_version')::bigint is distinct from t.version then raise exception 'Stale task version; refresh and retry' using errcode='40001'; end if;
  end if;
  if cmd in ('complete_task','cancel_task') and t.id is null then raise exception 'Task required' using errcode='22023'; end if;
  happened:=coalesce((data->>'occurred_at')::timestamptz,now());
  if not isfinite(happened) or happened>now() or happened<l.created_at then raise exception 'Occurrence time must be between lead creation and now' using errcode='22023'; end if;
  if happened<(select max(occurred_at) from public.crm_activities where lead_id=l.id and event_type='lead_reopened') then
   raise exception 'Activity predates the latest reopening' using errcode='22023'; end if;

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

  elsif cmd='record_call_outcome' then
   outcome:=data->>'outcome';
   if outcome is null or outcome<>all(array['no_answer','busy','declined','unreachable','spoke_with_contact','wrong_number']) then raise exception 'Invalid phone outcome' using errcode='22023'; end if;
   if t.id is not null and t.task_type not in ('first_contact','contact_attempt','callback') then raise exception 'Phone outcome requires a call task' using errcode='22023'; end if;
   if l.last_attempt_at is not null and happened<l.last_attempt_at then raise exception 'Call time predates last recorded attempt' using errcode='22023'; end if;
   if outcome='spoke_with_contact' then
    meaningful:=true;
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note','phone',outcome,t.id,happened);
   elsif outcome in ('no_answer','busy','declined','unreachable') and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
    select * into strict p from public.crm_followup_policies where id=l.followup_policy_id;
    if l.last_attempt_at is not null and happened<l.last_attempt_at+make_interval(mins=>p.minimum_attempt_gap_minutes) then
     raise exception 'Failed calls must respect the policy minimum spacing' using errcode='22023'; end if;
    if l.last_conversation_at is not null and happened<l.last_conversation_at then
     raise exception 'Failed call predates the latest meaningful conversation' using errcode='22023'; end if;
    count_failed:=crm_security.failed_count(l); ordinal:=(count_failed+1)::smallint;
    -- Each uninterrupted sequence anchors to its first actual failed call,
    -- independently of lifecycle and any earlier intake/conversation dates.
    if count_failed=0 then l.outreach_anchor_date:=(happened at time zone 'Africa/Casablanca')::date; end if;
    -- The first five need not have a task supplied, but consume the current
    -- sequence slot exactly once. An explicit call after five is still possible.
    if t.id is null then
     select * into t from public.crm_tasks where lead_id=l.id and status='open' and outreach_cycle=l.outreach_cycle and attempt_ordinal=ordinal order by id limit 1 for update;
    elsif t.attempt_ordinal is not null and (t.outreach_cycle<>l.outreach_cycle or t.attempt_ordinal<>ordinal) then
     raise exception 'Task is not the current attempt' using errcode='40001';
    end if;
    perform crm_security.event(l.id,'contact_attempted',source||':attempt',data->>'note','phone',outcome,t.id,happened,l.outreach_cycle,ordinal);
    perform crm_security.event(l.id,'call_'||outcome,source||':outcome',null,'phone',outcome,t.id,happened);
    if l.status='NEW' then l.status:='CONTACTING'; end if;
    l.last_attempt_at:=happened;
    if t.id is not null then perform crm_security.finish_task(t,false,data->>'note',source||':complete'); end if;
    -- Cancel any obsolete call slot if the operator used a different callback.
    perform crm_security.cancel_tasks(l.id,'Attempt recorded',source||':obsolete',true);
    t.id:=null;
    if ordinal<5 then
     due:=crm_security.attempt_due(l.followup_policy_id,l.outreach_anchor_date,ordinal+1,happened,now());
     tid:=crm_security.new_task(l,jsonb_build_object('task_type','contact_attempt','due_at',due),'attempt:'||l.id||':'||l.outreach_cycle||':'||(ordinal+1),'attempt_sequence',(ordinal+1)::smallint,source||':next-attempt');
    end if;
   else
    -- Wrong number never counts as an unreachable attempt.
    perform crm_security.event(l.id,'call_'||outcome,source||':outcome',data->>'note','phone',outcome,t.id,happened);
    needs_next:=true;
   end if;
   if t.id is not null then perform crm_security.finish_task(t,false,data->>'note',source||':complete'); end if;

  elsif cmd='record_whatsapp' then
   if (data->>'kind') is null or data->>'kind' not in ('whatsapp_sent','meaningful_whatsapp_conversation') then raise exception 'Invalid WhatsApp activity' using errcode='22023'; end if;
   meaningful:=data->>'kind'='meaningful_whatsapp_conversation';
   perform crm_security.event(l.id,case when meaningful then 'whatsapp_conversation' else 'whatsapp_sent' end,source||':whatsapp',data->>'note','whatsapp',null,null,happened);
   if not meaningful and data ? 'next_task' then raise exception 'WhatsApp sent is activity-only' using errcode='22023'; end if;

  elsif cmd='record_conversation' then
   if coalesce(data->>'channel','') not in ('phone','whatsapp','in_person') then raise exception 'Conversation channel and evidence required' using errcode='22023'; end if;
   meaningful:=true;
   perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'channel',null,null,happened);

  elsif cmd='schedule_task' then
   next_spec:=data->'task';
   if t.id is null then tid:=crm_security.new_task(l,next_spec,source||':task');
   else
    if jsonb_typeof(next_spec) is distinct from 'object' or next_spec-array['due_at','instructions']<>'{}'::jsonb then raise exception 'Reschedule accepts due_at and instructions only' using errcode='22023'; end if;
    due:=(next_spec->>'due_at')::timestamptz;
    if due is null or not isfinite(due) or due<now() then raise exception 'Future due time required' using errcode='22023'; end if;
    if t.task_type in ('first_contact','contact_attempt','callback') then
     -- An agreed callback keeps its agreed time; never shift it silently.
     if t.schedule_kind='appointment' and crm_security.next_window(l.followup_policy_id,due)<>due then
      raise exception 'Agreed callback time is outside calling hours' using errcode='22023'; end if;
     due:=crm_security.next_window(l.followup_policy_id,due);
    end if;
    if length(next_spec->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
    update public.crm_tasks set due_at=due,scheduled_end_at=null,instructions=case when next_spec ? 'instructions' then next_spec->>'instructions' else instructions end,
     updated_at=now(),version=version+1 where id=t.id;
    perform crm_security.event(l.id,'task_rescheduled',source||':rescheduled',data->>'note',null,null,t.id);
   end if;

  elsif cmd in ('complete_task','cancel_task') then
   if cmd='complete_task' then
    if t.task_type in ('first_contact','contact_attempt','callback') then raise exception 'Complete call tasks through record_call_outcome' using errcode='22023'; end if;
    if nullif(btrim(data->>'outcome'),'') is null or length(data->>'outcome')>200 then raise exception 'Completion outcome required' using errcode='22023'; end if;
    perform crm_security.finish_task(t,false,data->>'outcome',source||':complete');
   else perform crm_security.finish_task(t,true,data->>'reason',source||':cancel'); end if;
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

  elsif cmd in ('close_lost','close_not_qualified') then
   reason:=data->>'reason'; target:=case when cmd='close_lost' then 'LOST' else 'NOT_QUALIFIED' end;
   if reason is null or (target='LOST' and reason<>all(array['unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other']))
    or (target='NOT_QUALIFIED' and reason<>all(array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other']))
    or (reason='other' and nullif(btrim(data->>'note'),'') is null) then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   if reason='unreachable' and (l.status not in ('CONTACTING','ENGAGED','QUALIFIED') or crm_security.failed_count(l)<5) then raise exception 'Unreachable requires five current-cycle failed phone calls' using errcode='22023'; end if;
   perform crm_security.event(l.id,case when target='LOST' then 'lead_lost' else 'lead_not_qualified' end,source||':closed',data->>'note',null,reason,null,null,null,null,l.status,target);
   l.status:=target;l.closure_reason:=reason;l.closure_note:=data->>'note';l.closed_at:=now();
   perform crm_security.cancel_tasks(l.id,'Lead closed: '||reason,source||':cancel');

  elsif cmd='reopen_lead' then
   if l.status not in ('LOST','NOT_QUALIFIED') or nullif(btrim(data->>'reason'),'') is null then raise exception 'Closed lead and reopen reason required' using errcode='22023'; end if;
   l.status:=case when exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then 'ENGAGED' else 'CONTACTING' end;
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   l.closure_reason:=null;l.closure_note:=null;l.closed_at:=null;l.qualification_step:=null;
   if data->'next_task' is null or data->'next_task'='null'::jsonb then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'lead_reopened',source||':reopened',data->>'reason',null,null,null,null,null,null,initial_status,l.status);
   needs_next:=true;

  elsif cmd='reassign' then
   if not(data ? 'owner_id') and not(data ? 'assigned_to') then raise exception 'Explicit reassignment required' using errcode='22023'; end if;
   if data ? 'owner_id' then
    perform crm_security.assert_staff((data->>'owner_id')::uuid);l.owner_id:=(data->>'owner_id')::uuid;
    perform crm_security.event(l.id,'lead_reassigned',source||':lead-owner',data->>'note');
   end if;
   if data ? 'assigned_to' then
    if t.id is null then raise exception 'Task required for task reassignment' using errcode='22023'; end if;
    perform crm_security.assert_staff((data->>'assigned_to')::uuid);
    update public.crm_tasks set assigned_to=(data->>'assigned_to')::uuid,version=version+1,updated_at=now() where id=t.id;
    perform crm_security.event(l.id,'task_reassigned',source||':task-owner',data->>'note',null,null,t.id);
   end if;
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
   perform crm_security.cancel_tasks(l.id,'Meaningful conversation ended outreach',source||':cancel-attempt',true);
   needs_next:=true;
  end if;
  if cmd='qualify_lead' then
   perform crm_security.event(l.id,'lead_qualified',source||':qualified',data->>'note',null,null,null,null,null,null,'ENGAGED','QUALIFIED');
   l.status:='QUALIFIED';needs_next:=true;
  end if;
  if data ? 'next_task' and data->'next_task'<>'null'::jsonb then tid:=crm_security.new_task(l,data->'next_task',source||':next-task'); end if;
  if needs_next and not exists(select 1 from public.crm_tasks where lead_id=l.id and status='open') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  update public.crm_leads set status=l.status,owner_id=l.owner_id,qualification_step=l.qualification_step,
   closure_reason=l.closure_reason,closure_note=l.closure_note,closed_at=l.closed_at,outreach_cycle=l.outreach_cycle,
   outreach_anchor_date=l.outreach_anchor_date,last_attempt_at=l.last_attempt_at,last_conversation_at=l.last_conversation_at,
   version=version+1,updated_at=now() where id=l.id;
  result:=crm_security.result(l.id,source);
 end if;
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,cmd,request,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='40001';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM command input' using errcode='22023';
end $function$;


-- Migration 082 decision wrapper: adds En réflexion, non-phone channels and
-- optional routine prose. Replay, locking and supersession are unchanged.
create or replace function public.crm_record_conversation_decision(p_request_key uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
 actor uuid:=auth.uid(); decision text:=p_data->>'decision'; channel text:=coalesce(p_data->>'channel','phone'); digest text; source text;
 note text:=case when nullif(btrim(p_data->>'note'),'') is not null then p_data->>'note' end; next_spec jsonb:=p_data->'next_task';
 prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; t public.crm_tasks%rowtype; obsolete public.crm_tasks%rowtype;
 result jsonb; data jsonb; inner_key uuid:=gen_random_uuid();
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
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='40001'; end if;
 if l.status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED') or l.merged_into_lead_id is not null then
  raise exception 'Active operational lead required' using errcode='22023'; end if;
 -- Same lead-before-task lock ordering as Phase 3. Lock all affected tasks in UUID order.
 perform 1 from public.crm_tasks where lead_id=l.id and status='open' order by id for update;
 if p_data->>'task_id' is not null then
  if channel<>'phone' then raise exception 'Only a phone conversation completes a call task' using errcode='22023'; end if;
  select * into t from public.crm_tasks where id=(p_data->>'task_id')::uuid and lead_id=l.id and status='open';
  if not found or t.version is distinct from (p_data->>'expected_task_version')::bigint then
   raise exception 'Stale task version; refresh and retry' using errcode='40001'; end if;
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
 -- Structured outcome facts are sufficient evidence; prose stays optional. Inner
 -- commands still require explanations for Other qualification/closure reasons.
 data:=jsonb_build_object('lead_id',l.id,'expected_version',l.version)||case when note is not null then jsonb_build_object('note',note) else '{}'::jsonb end;
 -- One active generic commercial follow-up: the latest conversation decision
 -- replaces any open callback or WhatsApp follow-up, whatever the channel.
 -- Visits, placement, enrollment and other operational tasks are untouched.
 if decision in ('callback','considering','qualify') then
  for obsolete in select * from public.crm_tasks where lead_id=l.id and status='open'
   and task_type in ('callback','whatsapp_followup') and id is distinct from t.id order by id loop
   perform crm_security.finish_task(obsolete,true,'Conversation follow-up replaced',source||':superseded:'||obsolete.id);
  end loop;
 end if;
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
  if t.id is not null then perform crm_security.finish_task(t,false,note,source||':complete'); end if;
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
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result)
 values(actor::text,'conversation_decision',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='40001';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM decision input' using errcode='22023';
end $$;

-- Migration 110 read projections plus the two additive task fields.
create or replace function public.crm_list_open_tasks(p_lead uuid default null,p_assigned_to uuid default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  perform crm_security.check_page(p_limit,p_offset);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'lead_id',r.lead_id,'task_type',r.task_type,'status',r.status,
    'assigned_to',r.assigned_to,'assignee_display_label',crm_security.staff_display_label(r.assigned_to),'due_at',r.due_at,'scheduled_end_at',r.scheduled_end_at,
    'local_date',crm_security.scheduled_civil(r.due_at)->'local_date',
    'local_time',crm_security.scheduled_civil(r.due_at)->'local_time','timezone',r.timezone,'priority',r.priority,'instructions',r.instructions,'version',r.version,
    'schedule_kind',r.schedule_kind,'followup_reason',r.followup_reason
  ) order by r.due_at,r.id),'[]'::jsonb) into result
  from (select t.id,t.lead_id,t.task_type,t.status,t.assigned_to,t.due_at,t.scheduled_end_at,
    t.timezone,t.priority,t.instructions,t.version,t.schedule_kind,t.followup_reason from public.crm_tasks t
    where t.status='open' and (p_lead is null or t.lead_id=p_lead)
      and (p_assigned_to is null or t.assigned_to=p_assigned_to)
    order by t.due_at,t.id limit p_limit offset p_offset) r;
  return result;
end $$;

create or replace function crm_security.operational_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',c.id,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(l.session_type,l.program_interest_text),
 'failed_attempts',crm_security.failed_count(l),'status',l.status,'version',l.version,'owner_id',l.owner_id,'owner_display_label',crm_security.staff_display_label(l.owner_id),'source_label',s.source_label,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),
 'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason)||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',(select crm_security.placement_summary(p) from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' order by p.date_test,p.heure,p.id limit 1),
 'post_test_result',(select crm_security.placement_summary(p) from public.placement_tests p where p.id=t.placement_test_id and p.crm_lead_id=l.id and p.status in ('Résultat saisi','Affecté')),
 'last_activity',case when a.id is not null then jsonb_build_object('event_type',a.event_type,'occurred_at',a.occurred_at) end)
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.placement_test_id,t.schedule_kind,t.followup_reason from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select a.id,a.event_type,a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1)a on true
 where l.id=lead
$$;

create or replace function crm_security.opportunity_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',l.contact_id,'contact_name',c.display_name,
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
 'status',l.status,'version',l.version,'created_at',l.created_at,'owner_id',l.owner_id,
 'owner_display_label',crm_security.staff_display_label(l.owner_id),
 'owner_name',case when l.owner_id is not null then coalesce(nullif(o.full_name,''),'Équipe accueil') end,
 'source_label',s.source_label,'channel',s.channel,'failed_attempts',crm_security.failed_count(l),
 'closure_reason',l.closure_reason,'closed_at',l.closed_at,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,
 'version',t.version,'assigned_to',t.assigned_to,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
 'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason)||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',case when p.id is not null then jsonb_build_object('id',p.id,'scheduled_for',(p.date_test+crm_security.calendar_time(p.heure)) at time zone 'Africa/Casablanca','status',p.status,'local_date',p.date_test,'local_time',crm_security.calendar_time(p.heure)) end,
 'last_activity_at',(select a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1))
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id left join public.profiles o on o.id=l.owner_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.attempt_ordinal,t.schedule_kind,t.followup_reason from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select p.id,p.date_test,p.heure,p.status from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' limit 1)p on true
 where l.id=lead
$$;

create or replace function public.crm_get_work_queue(p_bucket text default 'today',
 p_assignee_mode text default 'me',p_assignee uuid default null,
 p_owner_mode text default 'all',p_owner uuid default null,
 p_cursor jsonb default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp set plan_cache_mode=force_custom_plan as $$
declare stamp timestamptz:=now(); bounds record; fingerprint text; after_due timestamptz; after_id uuid; result jsonb;
begin
 perform crm_security.require_reader(false);
 if p_bucket is null or p_bucket not in ('overdue','today','tomorrow','upcoming')
 or p_assignee_mode is null or p_assignee_mode not in ('all','me','unassigned','staff')
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
  select t.id,t.lead_id,t.due_at,case when t.due_at<stamp then 'overdue' when t.due_at<bounds.d1 then 'today' when t.due_at<bounds.d2 then 'tomorrow' else 'upcoming' end bucket
  from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
  where t.status='open' and l.merged_into_lead_id is null
  and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and (p_assignee_mode='all' or p_assignee_mode='me' and t.assigned_to=auth.uid()
   or p_assignee_mode='unassigned' and t.assigned_to is null or p_assignee_mode='staff' and t.assigned_to=p_assignee)
  and (p_owner_mode='all' or p_owner_mode='me' and l.owner_id=auth.uid()
   or p_owner_mode='unassigned' and l.owner_id is null or p_owner_mode='staff' and l.owner_id=p_owner)),
 page as materialized(select * from matching where bucket=p_bucket
  and (after_due is null or (due_at,id)>(after_due,after_id)) order by due_at,id limit p_limit+1),
 shown as(select * from page order by due_at,id limit p_limit)
 select jsonb_build_object('as_of',stamp,'timezone','Africa/Casablanca',
 'boundaries',jsonb_build_object('d0',bounds.d0,'d1',bounds.d1,'d2',bounds.d2),
 'counts',(select jsonb_object_agg(b,coalesce(n,0)) from unnest(array['overdue','today','tomorrow','upcoming'])b
  left join(select bucket,count(*) n from matching group by bucket)x on x.bucket=b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'lead_id',t.lead_id,
  'task_type',t.task_type,'local_date',crm_security.scheduled_civil(t.due_at)->'local_date',
  'local_time',crm_security.scheduled_civil(t.due_at)->'local_time','due_at',t.due_at,'scheduled_end_at',t.scheduled_end_at,
  'version',t.version,'assigned_to',t.assigned_to,'assignee_name',a.full_name,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
  'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason,
  'lead',jsonb_build_object('id',l.id,'version',l.version,'contact_name',c.display_name,
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
end $$;

notify pgrst,'reload schema';
commit;
