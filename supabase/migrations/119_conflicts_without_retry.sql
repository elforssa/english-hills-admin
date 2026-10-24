-- Batch C (plan NRC-r2, ADR-009): deliberate conflicts raise PT409, never the
-- retryable serialization code, so PostgREST answers HTTP 409 at once instead of
-- re-running the request without limit.
--
-- Mechanical rebuild of the 43 inventoried functions from their latest
-- definitions (pg_get_functiondef on a database at migration 118, md5(prosrc)
-- prefixes equal to the Production inventory). Only three substitutions:
-- 70 errcode clauses, the 2 online_security.fail('stale', ...) arguments and the
-- one crm_start_enrollment handler. Messages, hints, checks, locks, signatures,
-- SECURITY DEFINER, search_path, owner and ACL are unchanged (create or replace
-- keeps owner and ACL). One transaction: the lock helper and its handler change
-- together.
begin;

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
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by version desc limit 1;
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
  insert into public.crm_leads(contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
   first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(contact,case when nullif(btrim(d->>'learner_name'),'') is null then null else d->>'learner_name' end,
   lower(nullif(btrim(d->>'learner_name'),'')),(d->>'learner_age')::integer,case when d->>'learner_age' is not null then s.received_at end,
   (d->>'learner_birth_date')::date,d->>'session_type',d->>'program_interest_text',s.id,s.id,p.id,(due at time zone p.timezone)::date) returning * into l;
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,to_status)
  values(l.id,now(),auth.uid(),actor_kind,'lead_created','external-intake:'||s.id||':lead','NEW');
  insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,policy_id,outreach_cycle,attempt_ordinal)
  values(l.id,'first_contact',due,'intake','attempt:'||l.id||':1:1',p.id,1,1) returning id into tid;
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,task_id)
  values(l.id,now(),auth.uid(),actor_kind,'task_created','external-intake:'||s.id||':task',tid);
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
  if (data->>'expected_version')::bigint is distinct from l.version then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
  if l.merged_into_lead_id is not null or l.status='CONVERTED' then raise exception 'Lead is not operationally editable' using errcode='22023'; end if;
  if cmd not in ('add_note','reopen_lead','reassign') and l.status in ('LOST','NOT_QUALIFIED') then raise exception 'Reopen lead before this operation' using errcode='22023'; end if;
  initial_status:=l.status;
  if data->>'task_id' is not null then
   select * into t from public.crm_tasks where id=(data->>'task_id')::uuid and lead_id=l.id for update;
   if not found or t.status<>'open' then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
   if (data->>'expected_task_version')::bigint is distinct from t.version then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
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
     raise exception 'Task is not the current attempt' using errcode='PT409';
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
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM command input' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION crm_security.finish_task(t crm_tasks, cancelled boolean, reason text, source text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare a uuid; begin
 if t.status<>'open' then raise exception 'Task is not open' using errcode='PT409'; end if;
 if cancelled and nullif(btrim(reason),'') is null then raise exception 'Cancellation reason required' using errcode='22023'; end if;
 a:=crm_security.event(t.lead_id,case when cancelled then 'task_cancelled' else 'task_completed' end,source,reason,null,null,t.id);
 update public.crm_tasks set status=case when cancelled then 'cancelled' else 'completed' end,
 completed_at=case when not cancelled then now() end,completed_by=case when not cancelled then auth.uid() end,
 completion_activity_id=case when not cancelled then a end,
 cancelled_at=case when cancelled then now() end,cancelled_by=case when cancelled then auth.uid() end,
 cancellation_reason=case when cancelled then reason end,version=version+1,updated_at=now() where id=t.id;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.lifecycle_barrier(p_exclusive boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Lifecycle requires READ COMMITTED transaction restart' using errcode='PT409';
 end if;
 if p_exclusive and crm_security.lifecycle_has_barrier() and not crm_security.lifecycle_has_barrier(true) then
  raise exception 'Identity barrier upgrade requires transaction restart' using errcode='PT409';end if;
 if p_exclusive then perform pg_advisory_xact_lock(460046,0);
 else perform pg_advisory_xact_lock_shared(460046,0);end if;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.lifecycle_lock_delivery(p_delivery uuid, p_finish boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare scopes jsonb;
begin
 perform crm_security.lifecycle_barrier(false);
 select jsonb_build_array(jsonb_build_object('lead',lead_id,'connection',connection_id)) into scopes
 from public.crm_external_deliveries where id=p_delivery;
 if scopes is null then raise exception 'Delivery missing' using errcode='PT409';end if;
 perform crm_security.lifecycle_scope_keys(scopes);
 if not p_finish then perform crm_security.lifecycle_scope_rows(scopes);end if;
 -- Finish needs only ranks 3/4 and must record an actual response after stop.
 perform 1 from public.crm_external_deliveries where id=p_delivery for update;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.lock_enrollment_intent(student uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
 if student is not null and not pg_try_advisory_xact_lock(hashtextextended('crm:enrollment-intent:'||student,0)) then
  raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
 end if;
end $function$;

CREATE OR REPLACE FUNCTION online_security.course_for_update(p_group uuid, p_expected_version bigint)
 RETURNS online_courses
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.online_courses%rowtype;
begin
  select * into c from public.online_courses where group_id = p_group for update;
  if not found then perform online_security.fail('not_found', '22023', 'Cours en ligne introuvable.'); end if;
  if p_expected_version is null or c.version <> p_expected_version then
    perform online_security.fail('stale', 'PT409', 'Ce cours a changé ; actualisez puis réessayez.');
  end if;
  return c;
end $function$;

CREATE OR REPLACE FUNCTION online_security.lesson_for_update(p_lesson uuid, p_expected_version bigint)
 RETURNS online_lessons
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare l public.online_lessons%rowtype;
begin
  select * into l from public.online_lessons where id = p_lesson;
  if not found then perform online_security.fail('not_found', '22023', 'Cours introuvable.'); end if;
  -- Course first, then lesson: the same lock order as every course command.
  perform 1 from public.online_courses where group_id = l.group_id for update;
  select * into l from public.online_lessons where id = p_lesson for update;
  if p_expected_version is null or l.version <> p_expected_version then
    perform online_security.fail('stale', 'PT409', 'Ce cours a changé ; actualisez puis réessayez.');
  end if;
  return l;
end $function$;

CREATE OR REPLACE FUNCTION public.append_receptionist_enrollment_document(p_enrollment uuid, p_expected_updated_at timestamp with time zone, p_asset text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare e public.enrollments%rowtype; begin
  perform operational_security.require_receptionist();
  select * into e from public.enrollments where id=p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at or
    not exists(select 1 from public.students s where s.id=e.student_id and s.deleted_at is null) then
    raise exception 'Enrollment unavailable or stale' using errcode='PT409'; end if;
  if storage_security.is_asset_reference(p_asset) is not true or
    p_asset=any(coalesce(e.documents_urls,array[]::text[])) then
    raise exception 'Invalid document asset' using errcode='42501'; end if;
  if not exists(select 1 from public.storage_assets a where a.id=substring(p_asset from 7)::uuid
    and a.purpose='enrollment_document' and a.student_id=e.student_id and a.enrollment_id=e.id
    and a.uploader_id=auth.uid() and a.state='uploaded' and a.expires_at>now()) then
    raise exception 'Invalid document asset' using errcode='42501'; end if;
  update public.enrollments set documents_urls=array_append(coalesce(e.documents_urls,array[]::text[]),p_asset)
    where id=e.id;
  return e.id;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_receptionist_student_group(p_student uuid, p_enrollment uuid, p_group uuid, p_student_updated_at timestamp with time zone, p_enrollment_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; v_count integer;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found or p_student_updated_at is null or s.updated_at is distinct from p_student_updated_at then
    raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found then raise exception 'Group unavailable' using errcode='23514'; end if;
  end if;
  if p_enrollment is null then
    if exists(select 1 from public.enrollments where student_id=p_student and status<>'Rejected'
      and (group_id=s.groupe_id or (group_id is null and p_group is not null))) then
      raise exception 'Select an enrollment explicitly' using errcode='23514'; end if;
    if p_group is not null and (g.session_type is distinct from s.session_type or
      g.niveau is distinct from s.niveau_cefr) then
      raise exception 'Group must match dossier session/level' using errcode='23514'; end if;
    update public.students set groupe_id=p_group where id=p_student;
    return null;
  end if;
  select * into e from public.enrollments where id=p_enrollment and student_id=p_student for update;
  if not found or p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at then
    raise exception 'Enrollment unavailable or stale' using errcode='PT409'; end if;
  if p_group is null then
    if e.group_id is null then return e.id; end if;
    select count(*) into v_count from public.enrollments
      where student_id=p_student and group_id=e.group_id and status in ('Validated','Trial');
    if v_count>1 then raise exception 'Multiple memberships require separate selection' using errcode='23514'; end if;
    if e.status in ('Validated','Trial') then
      perform public.remove_student_group(p_student,e.group_id);
    elsif e.status in ('Submitted','Under Review') then
      perform public.save_receptionist_enrollment(p_student,e.id,null,e.status,e.level,
        e.date_inscription,e.notes,e.session_type,e.school_year);
    else raise exception 'Removal unavailable' using errcode='42501'; end if;
    return e.id;
  end if;
  if g.session_type is distinct from coalesce(e.session_type,s.session_type) or
    g.niveau is distinct from coalesce(e.level,s.niveau_cefr) then
    raise exception 'Enrollment group must match session/level' using errcode='23514'; end if;
  perform public.save_receptionist_enrollment(p_student,e.id,p_group,e.status,e.level,
    e.date_inscription,e.notes,e.session_type,e.school_year);
  return e.id;
end $function$;

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
    return v_result;
  end if;

  select * into v_charge from public.charges
  where id = (v_result->>'charge_id')::uuid for update;
  if nullif(p_payload->>'student_id','') is null then
    update public.students set session_type = v_charge.session_type,
      niveau_cefr = coalesce(v_charge.level, niveau_cefr)
    where id = v_charge.student_id;
  end if;
  -- Every newly issued receipt enrolls its student. Historical receipts and
  -- idempotent retries are not rewritten or used to reactivate archived records.
  update public.students set status = 'Enrolled' where id = v_charge.student_id;
  v_result := v_result || jsonb_build_object('student_enrolled', true);
  if v_charge.session_type = 'Other' or v_charge.legacy then
    if v_requested_id is not null then
      raise exception 'This service cannot be linked to a tuition enrollment.';
    end if;
    return v_result;
  end if;

  -- Lock the student across different charges in the same request period.
  perform 1 from public.students where id = v_charge.student_id for update;
  if v_charge.enrollment_id is not null and v_requested_id is not null
    and v_charge.enrollment_id <> v_requested_id then
    raise exception 'Charge is already linked to another enrollment.';
  end if;
  v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

  if v_enrollment_id is not null then
    select * into v_enrollment from public.enrollments
    where id = v_enrollment_id for update;
    if not found or v_enrollment.student_id is distinct from v_charge.student_id
      or v_enrollment.status = 'Rejected'
      or (v_enrollment.session_type is not null
          and v_enrollment.session_type <> v_charge.session_type)
      or (v_enrollment.school_year is not null and v_charge.school_year is not null
          and v_enrollment.school_year <> v_charge.school_year) then
      raise exception 'Selected enrollment does not match this student, session and school year.';
    end if;
    update public.enrollments set
      session_type = v_charge.session_type,
      school_year = coalesce(v_charge.school_year, v_enrollment.school_year),
      level = coalesce(v_enrollment.level, v_charge.level),
      status = case
        when status in ('Submitted','Under Review') then
          case when group_id is null then 'Confirmed' else 'Validated' end
        when status = 'Trial' then 'Validated'
        else status end
    where id = v_enrollment_id;
  else
    -- Guard only the implicit tuition-enrollment creation branch. Explicit charge
    -- or request links retain 074 validation. Exceptions roll back the entire
    -- inner financial transaction, including receipt/event/student side effects.
    select count(*) into v_crm_matches
    from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id
    join public.students s on s.id=e.student_id
    where e.student_id=v_charge.student_id and s.deleted_at is null
      and e.status is distinct from 'Rejected' and l.merged_into_lead_id is null
      and coalesce(e.session_type,s.session_type)=v_charge.session_type
      -- Unknown year on an old charge cannot establish a distinct intent.
      and (v_charge.school_year is null or crm_security.enrollment_year(e)=v_charge.school_year);
    if v_crm_matches>0 then
      raise exception '%',case when v_crm_matches=1
        then 'Une inscription CRM existe pour ce programme et cette année. Sélectionnez-la avant d’enregistrer le paiement.'
        else 'Plusieurs inscriptions CRM correspondent. Sélectionnez explicitement l’inscription à payer.' end
        using errcode='22023';
    end if;
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, 'Confirmed', current_date,
            v_charge.session_type, v_charge.school_year, v_charge.level)
    returning id into v_enrollment_id;
  end if;

  update public.charges set enrollment_id = v_enrollment_id
  where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
  update public.receipts set enrollment_id = v_enrollment_id
  where id = (v_result->>'receipt_id')::uuid;
  select * into v_enrollment from public.enrollments where id = v_enrollment_id;
  return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
                                       'enrollment_confirmed', true,
                                       'group_pending', v_enrollment.group_id is null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_begin_external_attempt(p_delivery uuid, p_lease uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;n integer;ordering text;boundary_at timestamptz:=clock_timestamp();
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery;
 if not found then raise exception 'Stale/unprepared delivery' using errcode='PT409';end if;

 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload is null or d.payload_erased_at is not null
  or (d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state<>'not_started') then raise exception 'Stale/unprepared delivery' using errcode='PT409';end if;
 if d.delivery_mode='live' then
  perform 1 from public.crm_lifecycle_producer_ownership where id=d.producer_ownership_id;
  perform 1 from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id;
 end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 ordering:=crm_security.lifecycle_predecessor_hold(d);if ordering is not null then raise exception 'Chronological attempt held' using errcode='42501';end if;
 if exists(select 1 from public.crm_external_delivery_attempts where delivery_id=d.id and lease_token=p_lease) then raise exception 'Attempt already begun' using errcode='PT409';end if;
 n:=d.attempt_count+1;if n>d.max_attempts then raise exception 'Attempts exhausted' using errcode='PT409';end if;
 insert into public.crm_external_delivery_attempts(delivery_id,attempt_number,lease_token) values(d.id,n,p_lease);
 update public.crm_external_deliveries set attempt_count=n,
  attempt_boundary_state=case when lifecycle_model='r4_stage_entry' then 'started' else attempt_boundary_state end,
  attempt_boundary_at=case when lifecycle_model='r4_stage_entry' then boundary_at else attempt_boundary_at end,updated_at=now() where id=d.id;
 return n;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_block_external_delivery(p_delivery uuid, p_lease uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();
 if p_code is null or p_code not in ('missing_secret','configuration_missing','delivery_held','live_not_available','invalid_identity') then raise exception 'Invalid hold' using errcode='22023';end if;
 update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=p_code,updated_at=now()
 where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now()
 and not exists(select 1 from public.crm_external_delivery_attempts where delivery_id=p_delivery and lease_token=p_lease);
 if not found then raise exception 'Stale/started lease' using errcode='PT409';end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_book_placement_test(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype;
 l public.crm_leads%rowtype; p public.placement_tests%rowtype; t public.crm_tasks%rowtype; result jsonb; begin
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
 insert into public.placement_tests(crm_lead_id,student_id,student_name,date_test,heure,examinateur,notes,status,niveau_recommande)
 values(l.id,l.student_id,l.learner_name,(p_data->>'date_test')::date,p_data->>'heure',nullif(btrim(p_data->>'examinateur'),''),nullif(btrim(p_data->>'notes'),''),'Planifié',null) returning * into p;
 for t in select * from public.crm_tasks where lead_id=l.id and task_type='confirm_placement_test' and status='open' order by id for update loop
  perform crm_security.finish_task(t,false,'Test de niveau réservé','placement-confirmed:'||p.id||':'||t.id);
 end loop;
 result:=crm_security.result(l.id,'placement-booked:'||p.id)||jsonb_build_object('placement',crm_security.placement_summary(p));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'book_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='PT409';
 when unique_violation then raise exception 'Placement already scheduled; refresh' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement booking' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.crm_configure_insights(p_connection uuid, p_version bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='PT409';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['mode','enabled','account_id','currency','timezone','api_version','secret_ref','refresh_days','refresh_interval_hours']<>'{}'
 or coalesce(p_data->>'mode','') not in ('mock','live') or coalesce(p_data->>'account_id','') !~ '^[0-9]{1,32}$' or coalesce(p_data->>'currency','') !~ '^[A-Z]{3}$'
 or not exists(select 1 from pg_timezone_names where name=p_data->>'timezone') or coalesce(p_data->>'api_version','') !~ '^v[0-9]{1,3}\.0$'
 or coalesce(p_data->>'secret_ref','') !~ '^CRM_META_INSIGHTS_TOKEN_[A-Z0-9_]{1,64}$' or coalesce((p_data->>'refresh_days')::int,7) not between 1 and 31
 or coalesce((p_data->>'refresh_interval_hours')::int,6) not between 1 and 24
 then raise exception 'Invalid Insights configuration' using errcode='22023';end if;
 -- D2: identity and mode change only while nothing was ever published and nothing is
 -- queued (a queued run publishes under its frozen snapshot). The row lock above
 -- serialises this check with director requests and enqueue ticks.
 if c.insights_settings ? 'account_id' and row(c.insights_settings->>'account_id',c.insights_settings->>'currency',c.insights_settings->>'timezone',c.insights_settings->>'mode')
  is distinct from row(p_data->>'account_id',p_data->>'currency',p_data->>'timezone',p_data->>'mode') then
  if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status='completed') then raise exception 'Account/currency/timezone/mode immutable; use reviewed reconciliation' using errcode='22023';end if;
  if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status in ('pending','running')) then raise exception 'Identity change waits for queued synchronization' using errcode='PT409';end if;
 end if;
 update public.crm_integration_connections set insights_settings=p_data||jsonb_build_object('enabled',coalesce((p_data->>'enabled')::boolean,false),
  'refresh_days',coalesce((p_data->>'refresh_days')::int,case when p_data->>'mode'='live' then 28 else 7 end),'refresh_interval_hours',coalesce((p_data->>'refresh_interval_hours')::int,6)),
  version=version+1,updated_at=now(),updated_by=auth.uid() where id=c.id returning * into c;
 return jsonb_build_object('id',c.id,'version',c.version,'insights',c.insights_settings-'secret_ref','live_available',true);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_configure_lifecycle(p_connection uuid, p_version bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;k text;cfg jsonb;contract public.crm_lifecycle_provider_contracts;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='PT409';end if;
 if c.provider='website' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['destination_id']<>'{}' then raise exception 'Invalid destination' using errcode='22023';end if;
  if not exists(select 1 from public.crm_integration_connections where id=(p_data->>'destination_id')::uuid and provider='meta') then raise exception 'Meta destination required' using errcode='22023';end if;
  update public.crm_integration_connections set lifecycle_destination_id=(p_data->>'destination_id')::uuid,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 elsif p_data->>'mode'='mock' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','api_version','secret_ref','events','action_source','allow_later_meta','max_attempts']<>'{}'
   or coalesce(p_data->>'dataset_id','')!~'^[0-9]{1,32}$' or coalesce(p_data->>'api_version','')!~'^v[0-9]{1,3}\.0$'
   or coalesce(p_data->>'secret_ref','')!~'^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$'
   or jsonb_typeof(p_data->'events') is distinct from 'object' or (p_data->'events')-array['qualified','converted']<>'{}'
   or coalesce(p_data->>'action_source','') not in ('system_generated','phone_call','physical_store','other')
   or coalesce((p_data->>'max_attempts')::integer,5) not between 1 and 8 then raise exception 'Invalid fixture mapping' using errcode='22023';end if;
  foreach k in array array['qualified','converted'] loop
   if coalesce(p_data->'events'->>k,'')!~'^[A-Za-z][A-Za-z0-9_ ]{0,63}$' or lower(p_data->'events'->>k) in ('purchase','revenue','payment') then raise exception 'Explicit lifecycle mapping required' using errcode='22023';end if;
  end loop;
  cfg:=p_data||jsonb_build_object('version',coalesce((c.lifecycle_settings->>'version')::int,0)+1,'enabled',coalesce((p_data->>'enabled')::boolean,false),
   'not_before',case when coalesce((p_data->>'enabled')::boolean,false) and not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then clock_timestamp() else coalesce((c.lifecycle_settings->>'not_before')::timestamptz,clock_timestamp()) end,
   'lifecycle_model','legacy_first_attainment');
  update public.crm_integration_connections set lifecycle_settings=cfg,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 elsif p_data->>'mode'='live' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','secret_ref','contract_id','max_attempts']<>'{}'
   or coalesce((p_data->>'enabled')::boolean,false) or coalesce(p_data->>'dataset_id','')!~'^[0-9]{1,32}$'
   or coalesce(p_data->>'secret_ref','')!~'^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$'
   or coalesce((p_data->>'max_attempts')::integer,5) not between 1 and 8 then raise exception 'Disabled verified live mapping required' using errcode='22023';end if;
  select * into contract from public.crm_lifecycle_provider_contracts where id=(p_data->>'contract_id')::uuid and active for share;
  if not found or not contract.lead_id_only or contract.lifecycle_model<>'r4_stage_entry' or contract.uncertainty_policy<>'no_uncertain_replay'
   or contract.deduplication_window_seconds is not null
   or contract.action_source<>'system_generated' or contract.maximum_event_age_seconds not between 1 and 604800
   or contract.required_constants is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
   or contract.event_map is distinct from '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb then
   raise exception 'Verified revision-4 provider contract required' using errcode='22023';end if;
  cfg:=jsonb_build_object('mode','live','enabled',false,'dataset_id',p_data->>'dataset_id','secret_ref',p_data->>'secret_ref','contract_id',contract.id,
   'contract_key',contract.contract_key,'contract_revision',contract.revision,'api_version',contract.api_version,'events',contract.event_map,
   'action_source',contract.action_source,'maximum_event_age_seconds',contract.maximum_event_age_seconds,
   'accepted_response_field',contract.accepted_response_field,'accepted_response_count',contract.accepted_response_count,
   'required_constants',contract.required_constants,'lifecycle_model',contract.lifecycle_model,'uncertainty_policy',contract.uncertainty_policy,
   'max_attempts',coalesce((p_data->>'max_attempts')::integer,5),'version',coalesce((c.lifecycle_settings->>'version')::int,0)+1);
  update public.crm_integration_connections set lifecycle_settings=cfg,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 else raise exception 'Invalid lifecycle mode' using errcode='22023';end if;
 return jsonb_build_object('id',c.id,'version',c.version,'lifecycle',c.lifecycle_settings-'secret_ref','destination_id',c.lifecycle_destination_id,
  'live_available',exists(select 1 from public.crm_lifecycle_provider_contracts where active and lifecycle_model='r4_stage_entry'));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_disable_lifecycle(p_connection uuid, p_version bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='PT409';end if;
 update public.crm_lifecycle_activation_epochs set ended_at=clock_timestamp(),ended_by=auth.uid(),end_reason='director_disabled'
  where connection_id=c.id and ended_at is null;
 update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object('enabled',false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_fail_insights_sync(p_run uuid, p_lease uuid, p_code text, p_rows integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
 perform crm_security.require_meta_worker();
 if p_code is null or p_code not in ('rate_limit','provider_unavailable','provider_auth','invalid_data','network','timeout','limit_exceeded','missing_secret','storage_unavailable','async_pending','live_not_available') or p_rows is null or p_rows not between 0 and 5000 then raise exception 'Invalid failure' using errcode='22023';end if;
 -- D5: a transient live failure returns to the queue after 30 minutes, then 2 hours;
 -- the third attempt and every other code are terminal. Mock runs keep the 089 contract.
 update public.crm_meta_sync_runs set
  status=case when config_snapshot->>'mode'='live' and p_code in ('rate_limit','provider_unavailable','network','timeout') and attempt_count<3 then 'pending' when p_rows>0 then 'partial' else 'failed' end,
  next_attempt_at=case when config_snapshot->>'mode'='live' and p_code in ('rate_limit','provider_unavailable','network','timeout') and attempt_count<3 then now()+case when attempt_count<=1 then interval '30 minutes' else interval '2 hours' end else next_attempt_at end,
  error_code=p_code,rows_processed=p_rows,lease_token=null,lease_until=null
 where id=p_run and status='running' and lease_token=p_lease and lease_until>now();if not found then raise exception 'Stale lease' using errcode='PT409';end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_fail_meta_job(p_job uuid, p_lease uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare state text;begin
 perform crm_security.require_meta_worker();
 state:=case when p_code in ('timeout','rate_limit','provider_unavailable','network','storage_unavailable') then 'retry'
 when p_code in ('missing_secret','provider_auth','missing_mapping','missing_policy','connection_disabled') then 'blocked'
 when p_code in ('invalid_provider_data','invalid_mapping','attempts_exhausted') then 'dead' end;
 if state is null then raise exception 'Unsupported error code' using errcode='22023';end if;
 update public.crm_ingestion_jobs set status=case when attempt_count>=8 and state='retry' then 'dead' else state end,
  last_error_code=p_code,last_error_summary=replace(p_code,'_',' '),lease_token=null,lease_until=null,
  next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7))::integer)),updated_at=now()
 where id=p_job and status='processing' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='PT409';end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finalize_meta_job(p_job uuid, p_lease uuid, p_mapping uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare source_id uuid;source_connection uuid;j public.crm_ingestion_jobs;c public.crm_integration_connections;m public.crm_form_mappings;s public.crm_submissions;
 d jsonb;a jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;occurred timestamptz;ambiguous boolean:=false;attribution public.crm_submission_attribution;begin
 perform crm_security.lifecycle_barrier(true);

 select coalesce(submission_id,gen_random_uuid()),connection_id into source_id,source_connection from public.crm_ingestion_jobs where id=p_job;
 if source_id is not null then perform crm_security.lifecycle_preidentity_keys(source_id,source_connection);end if;
 perform crm_security.require_meta_worker();
 -- Connection before job: configuration changes cannot race finalization.
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job for share of c0;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if not found or j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='PT409';end if;
 if not crm_security.meta_job_allowed(c,j) then perform public.crm_fail_meta_job(p_job,p_lease,'connection_disabled');return jsonb_build_object('status','blocked');end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>131072 or p_data-array['core_fields','form_answers','attribution','occurred_at','source_label']<>'{}' then raise exception 'Invalid normalized payload' using errcode='22023';end if;
 d:=p_data->'core_fields';a:=p_data->'attribution';occurred:=(p_data->>'occurred_at')::timestamptz;
 if d-array['contact_name','phone','whatsapp','email','learner_name','learner_age','learner_birth_date','session_type','program_interest_text']<>'{}'
 or jsonb_typeof(d) is distinct from 'object' or not crm_security.valid_answers(p_data->'form_answers') or not isfinite(occurred) or occurred>now()+interval '5 minutes'
 or a->>'external_submission_id' is distinct from j.payload->>'leadgen_id' or a->>'page_id' is distinct from c.page_id or a->>'form_id' is distinct from j.payload->>'form_id' then raise exception 'Invalid normalized identity' using errcode='22023';end if;
 -- D1 allowlist: the intake worker may only claim the provider source; the error code is
 -- one of the fixed adapter codes. Anything else is an invalid normalized payload.
 if (a ? 'hierarchy_source' and jsonb_typeof(a->'hierarchy_source')<>'null' and a->>'hierarchy_source' is distinct from 'provider')
 or (a ? 'hierarchy_error_code' and jsonb_typeof(a->'hierarchy_error_code')<>'null' and a->>'hierarchy_error_code' not in ('provider_auth','rate_limit','provider_unavailable','network','timeout','invalid_provider_data'))
 then raise exception 'Invalid normalized attribution' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=c.id and form_key=j.payload->>'form_id'
 and (j.submission_id is not null or (effective_from<=occurred and (retired_at is null or retired_at>occurred)));
 if not found then raise exception 'Invalid mapping version' using errcode='22023';end if;
 -- Serialize all provider intake contact resolution, including shared phones and
 -- disjoint phone/email combinations. Bounded transaction, no network under lock.

 if j.submission_id is null then
  insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values(source_id,'meta_instant_form',j.created_at,occurred,'provider',d,p_data->'form_answers',left(coalesce(nullif(p_data->>'source_label',''),'Meta'),200),'needs_review',encode(sha256(convert_to(p_data::text,'UTF8')),'hex'),m.id) returning * into s;
  insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,form_name_snapshot,
   campaign_id,campaign_name_snapshot,adset_id,adset_name_snapshot,ad_id,ad_name_snapshot,platform,provider_created_at,raw_payload,consent_evidence,attribution_status,hierarchy_source,hierarchy_error_code)
  values(s.id,'meta',j.payload->>'leadgen_id','page:'||c.page_id,c.page_id,j.payload->>'form_id',a->>'form_name_snapshot',
   a->>'campaign_id',a->>'campaign_name_snapshot',a->>'adset_id',a->>'adset_name_snapshot',a->>'ad_id',a->>'ad_name_snapshot',a->>'platform',occurred,a->'raw_payload',a->'consent_evidence',a->>'attribution_status',a->>'hierarchy_source',a->>'hierarchy_error_code') returning * into attribution;
  update public.crm_ingestion_jobs set submission_id=s.id where id=j.id;
  -- D4 moment 1: resolve from the synced objects when the new row is eligible (D3).
  if crm_security.attribution_enrichment_eligible(attribution,s.channel,m.connection_id) then perform crm_security.enrich_attribution_from_objects(s.id,m.connection_id);end if;
 else
  select * into strict s from public.crm_submissions where id=j.submission_id for update;
  d:=s.core_fields; -- A retry never reinterprets the accepted acquisition snapshot.
 end if;
 if s.match_status<>'needs_review' then
  update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,updated_at=now(),last_error_code=null,last_error_summary=null where id=j.id;
  return jsonb_build_object('status','done','submission_id',s.id,'lead_id',s.lead_id);
 end if;
 if not exists(select 1 from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now())) then
  perform public.crm_fail_meta_job(p_job,p_lease,'missing_policy');return jsonb_build_object('status','blocked','submission_id',s.id);
 end if;
 lead:=crm_security.resolve_external_submission(s.id);
 update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,updated_at=now(),last_error_code=null,last_error_summary=null where id=j.id;
 return jsonb_build_object('status','done','submission_id',s.id,'lead_id',lead,'needs_review',lead is null);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finalize_website_job(p_job uuid, p_lease uuid, p_mapping uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare source_id uuid;source_connection uuid;j public.crm_ingestion_jobs;c public.crm_integration_connections;s public.crm_submissions;m public.crm_form_mappings;d jsonb;a jsonb;lead uuid;begin
 perform crm_security.lifecycle_barrier(true);

 select coalesce(submission_id,gen_random_uuid()),connection_id into source_id,source_connection from public.crm_ingestion_jobs where id=p_job;
 if source_id is not null then perform crm_security.lifecycle_preidentity_keys(source_id,source_connection);end if;
 perform crm_security.require_meta_worker();
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job and c0.provider='website' for share of c0;
 if not found then raise exception 'Website job required' using errcode='22023';end if;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='PT409';end if;
 if not c.enabled then perform public.crm_fail_meta_job(p_job,p_lease,'connection_disabled');return jsonb_build_object('status','blocked');end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['core_fields','form_answers','source_label']<>'{}' or octet_length(p_data::text)>65536 or not crm_security.valid_answers(p_data->'form_answers') then raise exception 'Invalid normalized inquiry' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=c.id and channel='website' and form_key=j.payload->>'form_key';
 if not found or p_mapping is distinct from (public.crm_get_website_job_mapping(p_job,p_lease)->>'id')::uuid then raise exception 'Invalid mapping' using errcode='22023';end if;

 if j.submission_id is null then
  d:=p_data->'core_fields';a:=j.payload->'attribution';
  insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values(source_id,'website',j.created_at,j.created_at,'server',d,p_data->'form_answers',left(coalesce(nullif(p_data->>'source_label',''),'Site web'),200),'needs_review',j.payload_hash,m.id) returning * into s;
  -- Website values are observations, never verified Meta campaign identities.
  insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,form_name_snapshot,
   landing_page,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,fbc,fbp,captured_at,consent_evidence,attribution_status)
  values(s.id,'website',split_part(j.external_key,':',2),'site:'||c.connection_key||':form:'||(j.payload->>'form_key'),m.form_name,
   a->>'landing_page',a->>'referrer',a->>'utm_source',a->>'utm_medium',a->>'utm_campaign',a->>'utm_content',a->>'utm_term',a->>'fbclid',a->>'fbc',a->>'fbp',j.created_at,
   jsonb_build_object('accepted',true,'recorded_at',j.created_at,'source','website'),case when a='{}'::jsonb then 'unavailable' else 'partial' end);
  update public.crm_ingestion_jobs set submission_id=s.id where id=j.id;
 else select * into strict s from public.crm_submissions where id=j.submission_id for update;
 end if;
 if s.match_status='needs_review' then
  if not exists(select 1 from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now())) then
   perform public.crm_fail_meta_job(p_job,p_lease,'missing_policy');return jsonb_build_object('status','blocked','submission_id',s.id);
  end if;
  lead:=crm_security.resolve_external_submission(s.id);
 else lead:=s.lead_id;end if;
 update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,last_error_code=null,last_error_summary=null,updated_at=now() where id=j.id;
 return jsonb_build_object('status','done','submission_id',s.id,'lead_id',lead,'needs_review',lead is null);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finish_external_attempt(p_delivery uuid, p_lease uuid, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;state text;code text;delay integer;retry_at timestamptz;boundary_state text;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,true);
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now()
  or (d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state<>'started') then raise exception 'Stale lease' using errcode='PT409';end if;
 state:=p_result->>'outcome';code:=p_result->>'error_code';
 if jsonb_typeof(p_result) is distinct from 'object' or p_result-array['outcome','error_code','http_status','request_id','retry_after']<>'{}'
  or state is null or state not in ('sent','retry','blocked','dead','unknown')
  or (code is not null and code not in ('rate_limit','provider_unavailable','provider_auth','validation','timeout','network','malformed_response'))
  or (state='sent' and (coalesce((p_result->>'http_status')::int,0) not between 200 and 299 or code is not null))
  or (p_result->>'request_id' is not null and p_result->>'request_id'!~'^[A-Za-z0-9_-]{1,100}$') then raise exception 'Invalid attempt result' using errcode='22023';end if;
 if d.lifecycle_model='r4_stage_entry' then
  -- A provider response that may have been accepted can never be reduced to a
  -- replayable or confirmed failure. Normalize contradictory/uncertain result
  -- envelopes at the durable boundary even if a caller bypasses the adapter.
  if state='sent' then boundary_state:='confirmed';
  elsif state='blocked' and code='provider_auth' and (p_result->>'http_status')::int in (400,401,403) then boundary_state:='confirmed';
  elsif state='dead' and code='validation' and (p_result->>'http_status')::int=400 then boundary_state:='confirmed';
  else
   code:=case
    when coalesce((p_result->>'http_status')::int,0) between 200 and 299 then 'malformed_response'
    when (p_result->>'http_status')::int=429 then 'rate_limit'
    when (p_result->>'http_status')::int>=500 then 'provider_unavailable'
    when code in ('rate_limit','provider_unavailable','timeout','network','malformed_response') then code
    else 'malformed_response' end;
   state:='unknown';boundary_state:='unknown';
  end if;
  retry_at:=null;
 else
  boundary_state:=d.attempt_boundary_state;
  delay:=least(86400,greatest(30,coalesce((p_result->>'retry_after')::int,0),least(21600,30*power(2,d.attempt_count)::int)+(random()*30)::int));
  retry_at:=case when state in ('retry','unknown') then now()+make_interval(secs=>delay) end;
  if state in ('retry','unknown') and d.attempt_count>=d.max_attempts then state:='dead';code:='attempts_exhausted';retry_at:=null;end if;
 end if;
 update public.crm_external_delivery_attempts set outcome=state,finished_at=clock_timestamp(),http_status=(p_result->>'http_status')::int,
  provider_request_id=p_result->>'request_id',response_summary=case when state='sent' then '{"accepted":true}'::jsonb else null end,error_code=code
  where delivery_id=d.id and lease_token=p_lease and finished_at is null;
 if not found then raise exception 'Attempt missing' using errcode='PT409';end if;
 update public.crm_external_deliveries set status=state,attempt_boundary_state=boundary_state,lease_token=null,lease_until=null,updated_at=now(),last_error_code=code,
  next_attempt_at=retry_at,sent_at=case when state='sent' then now() else sent_at end,
  terminal_at=case when state in ('sent','dead') then coalesce(terminal_at,clock_timestamp()) else terminal_at end where id=d.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finish_insights_sync(p_run uuid, p_lease uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare r public.crm_meta_sync_runs;c public.crm_integration_connections;x jsonb;oid uuid;begin
 perform crm_security.require_meta_worker();
 select c0.* into c from public.crm_integration_connections c0 join public.crm_meta_sync_runs r0 on r0.connection_id=c0.id where r0.id=p_run for share of c0;
 select * into r from public.crm_meta_sync_runs where id=p_run for update;
 if not found or r.status<>'running' or r.lease_token is distinct from p_lease or r.lease_until<=now() then raise exception 'Stale lease' using errcode='PT409';end if;
 if not coalesce((c.insights_settings->>'enabled')::boolean,false) then raise exception 'Synchronization disabled' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['account_id','currency','timezone','rows','objects']<>'{}' or octet_length(p_data::text)>4194304
 or p_data->>'account_id' is distinct from r.config_snapshot->>'account_id' or p_data->>'currency' is distinct from r.config_snapshot->>'currency' or p_data->>'timezone' is distinct from r.config_snapshot->>'timezone'
 or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>5000 or jsonb_typeof(p_data->'objects') is distinct from 'array' or jsonb_array_length(p_data->'objects')>10000 then raise exception 'Invalid complete snapshot' using errcode='22023';end if;
 -- All validation/writes share one transaction. A failed page never reaches this RPC.
 for x in select value from jsonb_array_elements(p_data->'objects') loop
  if x-array['type','id','parent_id','name','objective','status']<>'{}' then raise exception 'Invalid object fields' using errcode='22023';end if;
  insert into public.crm_meta_objects(connection_id,account_id,object_type,external_id,parent_external_id,current_name,objective,effective_status)
  values(r.connection_id,p_data->>'account_id',x->>'type',x->>'id',x->>'parent_id',x->>'name',x->>'objective',x->>'status')
  on conflict(connection_id,object_type,external_id) do update set parent_external_id=excluded.parent_external_id,current_name=excluded.current_name,objective=excluded.objective,effective_status=excluded.effective_status,last_synced_at=clock_timestamp();
 end loop;
 -- Replace the entire completed range, including rows that disappeared/now have zero spend.
 delete from public.crm_meta_daily_insights where connection_id=r.connection_id and query_version=r.query_version and insight_date between r.date_from and r.date_to;
 for x in select value from jsonb_array_elements(p_data->'rows') loop
  if x-array['date','campaign_id','adset_id','ad_id','spend','impressions','reach','clicks','link_clicks','actions','name']<>'{}' or (x->>'date')::date not between r.date_from and r.date_to or x->>'date' is null then raise exception 'Invalid ad/day grain' using errcode='22023';end if;
  select id into oid from public.crm_meta_objects where connection_id=r.connection_id and object_type='ad' and external_id=x->>'ad_id';
  insert into public.crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,object_id,query_version,spend,impressions,reach,clicks,link_clicks,actions,name_snapshot)
  values(r.connection_id,r.id,(x->>'date')::date,p_data->>'account_id',p_data->>'timezone',p_data->>'currency',x->>'campaign_id',x->>'adset_id',x->>'ad_id',oid,r.query_version,(x->>'spend')::numeric,(x->>'impressions')::bigint,(x->>'reach')::bigint,(x->>'clicks')::bigint,(x->>'link_clicks')::bigint,coalesce(x->'actions','[]'),x->>'name');
 end loop;
 update public.crm_meta_sync_runs set status='completed',completed_at=clock_timestamp(),rows_processed=jsonb_array_length(p_data->'rows'),lease_token=null,lease_until=null,cursor=null,error_code=null where id=r.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_get_external_delivery(p_delivery uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;s public.crm_submissions;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;reason text;lead_id text;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='PT409';end if;reason:=crm_security.lifecycle_hold(d);if reason is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if d.delivery_mode='live' then select * into a from public.crm_submission_attribution where submission_id=(select first_submission_id from public.crm_leads where id=d.lead_id);lead_id:=a.external_submission_id;
 else select * into s from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=s.id;end if;
 select * into s from public.crm_submissions where id=d.attribution_submission_id;
 return jsonb_build_object('id',d.id,'event_kind',d.event_kind,'event_time',floor(extract(epoch from d.event_time))::bigint,
  'source_generated_time',floor(extract(epoch from s.occurred_at))::bigint,'event_id',d.provider_event_id,'mode',d.delivery_mode,
  'mapping',d.mapping_snapshot,'payload',d.payload,'matching',case when d.payload is not null then null when d.delivery_mode='live' then jsonb_build_object('lead_id',lead_id)
  else jsonb_strip_nulls(jsonb_build_object('lead_id',case when a.provider='meta' then a.external_submission_id end,'fbc',case when a.provider='website' then a.fbc end,
   'fbp',case when a.provider='website' then a.fbp end,'email',s.core_fields->>'email','phone',crm_security.normalize_phone(s.core_fields->>'phone'),'adult_contact',true)) end);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_get_meta_job_mapping(p_job uuid, p_lease uuid, p_form text, p_occurred timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare j public.crm_ingestion_jobs;m public.crm_form_mappings;begin
 perform crm_security.require_meta_worker();
 select * into j from public.crm_ingestion_jobs where id=p_job and status='processing' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='PT409';end if;
 if p_form is distinct from j.payload->>'form_id' or p_occurred is null or not isfinite(p_occurred) or p_occurred>now()+interval '5 minutes' then raise exception 'Invalid provider identity' using errcode='22023';end if;
 if j.submission_id is not null then
  select m0.* into m from public.crm_form_mappings m0 join public.crm_submissions s0 on s0.form_mapping_id=m0.id where s0.id=j.submission_id;return to_jsonb(m);
 end if;
 select * into m from public.crm_form_mappings where connection_id=j.connection_id and form_key=p_form and effective_from<=p_occurred
 order by effective_from desc,version desc limit 1;
 if m.id is null or (m.retired_at is not null and m.retired_at<=p_occurred) then return null;end if;
 return to_jsonb(m);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_get_website_job_mapping(p_job uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare j public.crm_ingestion_jobs;m public.crm_form_mappings;begin
 perform crm_security.require_meta_worker();
 select * into j from public.crm_ingestion_jobs where id=p_job and event_kind='website_inquiry' and status='processing' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='PT409';end if;
 if j.submission_id is not null then select m0.* into m from public.crm_form_mappings m0 join public.crm_submissions s on s.form_mapping_id=m0.id where s.id=j.submission_id;return to_jsonb(m);end if;
 select * into m from public.crm_form_mappings where connection_id=j.connection_id and channel='website' and form_key=j.payload->>'form_key' and effective_from<=j.created_at order by effective_from desc,version desc limit 1;
 if m.id is null or (m.retired_at is not null and m.retired_at<=j.created_at) then return null;end if;return to_jsonb(m);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_prepare_external_delivery(p_delivery uuid, p_lease uuid, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;e jsonb;u jsonb;item record;hash text;a public.crm_submission_attribution;source public.crm_submissions;phone text;email text;evidence public.crm_lifecycle_eligibility_evidence;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload_erased_at is not null then raise exception 'Stale lease' using errcode='PT409';end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['data']<>'{}' or jsonb_typeof(p_payload->'data') is distinct from 'array' or jsonb_array_length(p_payload->'data')<>1 or octet_length(p_payload::text)>8192 then raise exception 'Invalid payload' using errcode='22023';end if;
 e:=p_payload->'data'->0;u:=e->'user_data';
 if e->>'event_id' is distinct from d.provider_event_id or e->>'event_name' is distinct from d.mapping_snapshot->'events'->>d.event_kind
  or (e->>'event_time')::bigint is distinct from floor(extract(epoch from d.event_time))::bigint or e->>'action_source' is distinct from d.mapping_snapshot->>'action_source'
  or jsonb_typeof(u) is distinct from 'object' or u='{}' then raise exception 'Invalid event identity' using errcode='22023';end if;
 if d.delivery_mode='live' then
  if e-array['event_name','event_time','event_id','action_source','user_data','custom_data']<>'{}'
   or e->'custom_data' is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb then raise exception 'Closed CRM payload required' using errcode='22023';end if;
  select * into a from public.crm_submission_attribution where submission_id=(select first_submission_id from public.crm_leads where id=d.lead_id);
  if u-array['lead_id']<>'{}' or jsonb_typeof(u->'lead_id')<>'string' or u->>'lead_id' is distinct from a.external_submission_id
   or u->>'lead_id'!~'^[0-9]{1,32}$' then raise exception 'Lossless lead ID only contract required' using errcode='22023';end if;
 else
  if e-array['event_name','event_time','event_id','action_source','user_data']<>'{}' or u-array['lead_id','em','ph','fbc','fbp']<>'{}' then raise exception 'Invalid fixture payload' using errcode='22023';end if;
  for item in select * from jsonb_each(u) loop
   if item.key in ('em','ph') then if jsonb_typeof(item.value) is distinct from 'array' or jsonb_array_length(item.value)<>1 or coalesce(item.value->>0,'')!~'^[a-f0-9]{64}$' then raise exception 'Hash required' using errcode='22023';end if;
   elsif jsonb_typeof(item.value) is distinct from 'string' or length(item.value#>>'{}') not between 1 and 256 then raise exception 'Invalid match field' using errcode='22023';end if;
  end loop;
  select * into source from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=source.id;
  phone:=crm_security.normalize_phone(source.core_fields->>'phone');email:=nullif(lower(btrim(source.core_fields->>'email')),'');
  if (u?'lead_id' and (a.provider<>'meta' or u->>'lead_id' is distinct from a.external_submission_id)) or (u?'fbc' and (a.provider<>'website' or u->>'fbc' is distinct from a.fbc))
   or (u?'fbp' and (a.provider<>'website' or u->>'fbp' is distinct from a.fbp)) or not (u ?| array['lead_id','fbc','fbp'])
   or (u?'em' and u->'em'->>0 is distinct from encode(sha256(convert_to(email,'UTF8')),'hex'))
   or (u?'ph' and u->'ph'->>0 is distinct from encode(sha256(convert_to(substr(phone,2),'UTF8')),'hex')) then raise exception 'Matching identity differs from protected evidence' using errcode='22023';end if;
 end if;
 hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 if d.payload is not null then if d.payload_hash<>hash then raise exception 'Frozen payload conflict' using errcode='PT409';end if;return hash;end if;
 update public.crm_external_deliveries set payload=p_payload,payload_hash=hash,provider_event_name=e->>'event_name',updated_at=now() where id=d.id;return hash;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_publish_lifecycle_policy(p_connection uuid, p_connection_version bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;m public.crm_form_mappings;p public.crm_lifecycle_eligibility_policies;next_version integer;effective timestamptz;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_connection_version then raise exception 'Refresh connection' using errcode='PT409';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['form_mapping_id','notice_version','notice_text_digest','adult_field_key','adult_accepted_values','sharing_field_key','sharing_accepted_values','notice_field_key','notice_accepted_values','effective_from','effective_until','d2_requirement','sharing_refused_values','prohibited_field_key','prohibited_values','safety_decision_reference']<>'{}'::jsonb then
  raise exception 'Invalid policy fields' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=(p_data->>'form_mapping_id')::uuid and connection_id=c.id and channel='meta_instant_form';
 if not found or m.form_key='1086266294126723' then raise exception 'Separately compliant Meta form mapping required' using errcode='22023';end if;
 effective:=(p_data->>'effective_from')::timestamptz;
 if effective<clock_timestamp() or (p_data->>'effective_until')::timestamptz<=effective then raise exception 'Prospective policy interval required' using errcode='22023';end if;
 if p_data ? 'd2_requirement' and (jsonb_typeof(p_data->'d2_requirement') is distinct from 'string' or p_data->>'d2_requirement' not in ('required','advisory')) then
  raise exception 'Future publisher is advisory only' using errcode='22023';end if;
 if ((p_data->>'notice_version') is null)<>((p_data->>'notice_text_digest') is null)
  or ((p_data->>'adult_field_key') is null)<>((p_data->'adult_accepted_values') is null)
  or ((p_data->>'sharing_field_key') is null)<>((p_data->'sharing_accepted_values') is null)
  or ((p_data->>'notice_field_key') is null)<>((p_data->'notice_accepted_values') is null)
  or (p_data->>'d2_requirement'='advisory' and p_data->>'sharing_field_key' is not null and p_data->'sharing_refused_values' is null) then
  raise exception 'Complete optional proof and reviewed safety groups required' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'sharing_accepted_values') yes_value,
  jsonb_array_elements(p_data->'sharing_refused_values') no_value where yes_value=no_value) then
  raise exception 'Accept/refuse maps must be disjoint' using errcode='22023';end if;
 select coalesce(max(version),0)+1 into next_version from public.crm_lifecycle_eligibility_policies where connection_id=c.id and form_mapping_id=m.id;
 insert into public.crm_lifecycle_eligibility_policies(connection_id,form_mapping_id,version,notice_version,notice_text_digest,adult_field_key,adult_accepted_values,
  sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by,lifecycle_model,allowed_event_kinds,d2_requirement,sharing_refused_values,prohibited_field_key,prohibited_values,safety_decision_reference)
 values(c.id,m.id,next_version,p_data->>'notice_version',p_data->>'notice_text_digest',p_data->>'adult_field_key',p_data->'adult_accepted_values',p_data->>'sharing_field_key',
  p_data->'sharing_accepted_values',p_data->>'notice_field_key',p_data->'notice_accepted_values',effective,(p_data->>'effective_until')::timestamptz,auth.uid(),
  'r4_stage_entry','["intake","not_qualified","lost","qualified","converted"]'::jsonb,coalesce(p_data->>'d2_requirement','required'),p_data->'sharing_refused_values',p_data->>'prohibited_field_key',p_data->'prohibited_values',p_data->>'safety_decision_reference') returning * into p;
 update public.crm_integration_connections set version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
 return to_jsonb(p)-array['adult_accepted_values','sharing_accepted_values','notice_accepted_values','sharing_refused_values','prohibited_values'];
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
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM decision input' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.crm_request_insights_sync(p_connection uuid, p_request uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare c public.crm_integration_connections;r public.crm_meta_sync_runs;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or coalesce(c.insights_settings->>'mode','') not in ('mock','live') or not coalesce((c.insights_settings->>'enabled')::boolean,false) or p_request is null then raise exception 'Synchronization unavailable' using errcode='22023';end if;
 if p_from is null and p_to is null then p_to:=(now() at time zone (c.insights_settings->>'timezone'))::date;p_from:=p_to-(c.insights_settings->>'refresh_days')::int+1;end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>30 or p_to>(now() at time zone (c.insights_settings->>'timezone'))::date then raise exception 'Range must be 1–31 non-future account dates' using errcode='22023';end if;
 select * into r from public.crm_meta_sync_runs where connection_id=c.id and request_key=p_request;
 if found then if row(r.date_from,r.date_to) is distinct from row(p_from,p_to) then raise exception 'Request conflict' using errcode='22023';end if;return r.id;end if;
 if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Overlapping synchronization already queued' using errcode='PT409';end if;
 insert into public.crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot) values(c.id,p_request,p_from,p_to,c.insights_settings) returning id into r.id;return r.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_resolve_meta_intake(p_request uuid, p_submission uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.crm_submissions;l public.crm_leads;prior public.crm_command_requests;
 digest text;result jsonb;lead uuid;begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader();
 if p_request is null or p_action is null or p_action not in ('attach','new','reject') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>8192
 or p_data-array['lead_id','expected_version','contact_id','contact_version','contact_name','learner_name','program_interest_text']<>'{}' then raise exception 'Invalid resolution' using errcode='22023';end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_submission,p_action,p_data)::text,'UTF8')),'hex');

 perform crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)
 from public.crm_submissions src join public.crm_form_mappings fm on fm.id=src.form_mapping_id where src.id=p_submission;
 select * into prior from public.crm_command_requests where actor_scope=auth.uid()::text and command_name='resolve_meta_intake' and request_key=p_request;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request payload conflict' using errcode='22023';end if;return prior.result;
 end if;
 select * into s from public.crm_submissions where id=p_submission and channel in ('meta_instant_form','website') for update;
 if not found or s.match_status<>'needs_review' or not exists(select 1 from public.crm_ingestion_jobs where submission_id=s.id and status='done') then raise exception 'Intake already resolved or configuration blocked' using errcode='PT409';end if;
 if p_action='reject' then update public.crm_submissions set match_status='rejected' where id=s.id;
 elsif p_action='attach' then
  select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
  if not found or l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Refresh lead version' using errcode='PT409';end if;
  lead:=crm_security.accept_external_submission(s.id,null,l.id);
 else
  if p_data->>'contact_id' is not null then
   perform 1 from public.crm_contacts where id=(p_data->>'contact_id')::uuid and version=(p_data->>'contact_version')::bigint and merged_into_contact_id is null for update;
   if not found then raise exception 'Refresh contact version' using errcode='PT409';end if;
  end if;
  if exists(select 1 from jsonb_each_text(p_data) where key in ('contact_name','learner_name','program_interest_text') and length(value) not between 1 and 200) then raise exception 'Invalid resolution fields' using errcode='22023';end if;
  update public.crm_submissions set core_fields=core_fields||(p_data-array['lead_id','expected_version','contact_id','contact_version']) where id=s.id;
  lead:=crm_security.accept_external_submission(s.id,(p_data->>'contact_id')::uuid);
 end if;
 result:=jsonb_build_object('submission_id',s.id,'lead_id',lead,'status',case when p_action='reject' then 'rejected' else 'resolved' end);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(auth.uid()::text,'resolve_meta_intake',p_request,digest,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_retire_lifecycle_policy(p_policy uuid, p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare policy public.crm_lifecycle_eligibility_policies;
begin
 perform crm_security.lifecycle_barrier(true);
  perform crm_security.require_reader(true);
  select * into policy from public.crm_lifecycle_eligibility_policies where id=p_policy for update;
  if not found or policy.retired_at is not null then raise exception 'Active policy required' using errcode = '22023'; end if;
  if policy.version is distinct from p_version then raise exception 'Refresh policy version' using errcode = 'PT409'; end if;
  update public.crm_lifecycle_eligibility_policies
     set retired_at=greatest(clock_timestamp(),effective_from+interval '1 microsecond'),retired_by=auth.uid()
   where id=policy.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_retry_insights_sync(p_run uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare r public.crm_meta_sync_runs;c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 select c0.* into c from public.crm_integration_connections c0 join public.crm_meta_sync_runs r0 on r0.connection_id=c0.id where r0.id=p_run for update of c0;
 select * into r from public.crm_meta_sync_runs where id=p_run for update;
 -- D2: a retry must not requeue an identity or mode the connection no longer has.
 if not found or r.status not in ('failed','partial') or r.attempt_count>=3 or not coalesce((c.insights_settings->>'enabled')::boolean,false)
 or row(r.config_snapshot->>'account_id',r.config_snapshot->>'currency',r.config_snapshot->>'timezone',r.config_snapshot->>'mode')
  is distinct from row(c.insights_settings->>'account_id',c.insights_settings->>'currency',c.insights_settings->>'timezone',c.insights_settings->>'mode') then raise exception 'Run cannot retry' using errcode='22023';end if;
 if exists(select 1 from public.crm_meta_sync_runs where connection_id=r.connection_id and id<>r.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(r.date_from,r.date_to,'[]')) then raise exception 'Overlapping run' using errcode='PT409';end if;
 update public.crm_meta_sync_runs set status='pending',error_code=null,cursor=null,provider_report_id=null,next_attempt_at=now() where id=r.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_save_meta_connection(p_data jsonb, p_id uuid DEFAULT NULL::uuid, p_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare c public.crm_integration_connections; r jsonb; e jsonb; old_enabled boolean; new_enabled boolean; lookback integer; old_attr boolean; new_attr boolean; patch jsonb:='{}'::jsonb; begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','page_id','account_id','api_version','access_token_secret_ref','enabled','meta_reconciliation','attribution_enrichment']<>'{}' then raise exception 'Invalid connection fields' using errcode='22023'; end if;
 if p_data ? 'meta_reconciliation' then
  r:=p_data->'meta_reconciliation';
  if jsonb_typeof(r) is distinct from 'object' or r-array['enabled','lookback_minutes']<>'{}'::jsonb
   or jsonb_typeof(r->'enabled') is distinct from 'boolean'
   or (r ? 'lookback_minutes' and (jsonb_typeof(r->'lookback_minutes') is distinct from 'number' or (r->>'lookback_minutes') !~ '^[0-9]{1,4}$'))
   then raise exception 'Invalid reconciliation configuration' using errcode='22023'; end if;
  lookback:=coalesce((r->>'lookback_minutes')::integer,60);
  if lookback not between 10 and 1440 then raise exception 'Invalid reconciliation lookback' using errcode='22023'; end if;
 end if;
 if p_data ? 'attribution_enrichment' then
  e:=p_data->'attribution_enrichment';
  if jsonb_typeof(e) is distinct from 'object' or e-array['enabled']<>'{}'::jsonb or jsonb_typeof(e->'enabled') is distinct from 'boolean'
   then raise exception 'Invalid attribution enrichment configuration' using errcode='22023'; end if;
 end if;
 if p_data ? 'enabled' and jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Invalid realtime setting' using errcode='22023'; end if;
 if p_id is null and r->>'enabled'='true' and nullif(p_data->>'access_token_secret_ref','') is null then raise exception 'Meta token reference required' using errcode='22023'; end if;
 if p_id is null then
  if r is not null then patch:=patch||jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',r->'enabled','started_at',case when r->>'enabled'='true' then to_jsonb(clock_timestamp()) else 'null'::jsonb end,'lookback_minutes',lookback)); end if;
  if e is not null then patch:=patch||jsonb_build_object('attribution_enrichment',jsonb_build_object('enabled',e->'enabled','started_at',case when e->>'enabled'='true' then to_jsonb(clock_timestamp()) else 'null'::jsonb end)); end if;
  insert into public.crm_integration_connections(connection_key,page_id,account_id,api_version,access_token_secret_ref,settings,created_by,updated_by)
  values(p_data->>'connection_key',p_data->>'page_id',p_data->>'account_id',p_data->>'api_version',p_data->>'access_token_secret_ref',patch,auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='PT409'; end if;
  if p_data->>'page_id' is distinct from c.page_id or p_data->>'connection_key' is distinct from c.connection_key then raise exception 'Connection identity immutable' using errcode='22023'; end if;
  old_enabled:=coalesce(c.settings #>> '{meta_reconciliation,enabled}'='true',false);
  new_enabled:=coalesce((r->>'enabled')::boolean,old_enabled);
  if new_enabled and nullif(coalesce(p_data->>'access_token_secret_ref',c.access_token_secret_ref),'') is null then raise exception 'Meta token reference required' using errcode='22023'; end if;
  if r is not null then patch:=patch||jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',new_enabled,'started_at',case when not new_enabled then 'null'::jsonb when not old_enabled then to_jsonb(clock_timestamp()) else c.settings #> '{meta_reconciliation,started_at}' end,'lookback_minutes',lookback)); end if;
  if e is not null then
   old_attr:=coalesce(c.settings #>> '{attribution_enrichment,enabled}'='true',false);
   new_attr:=(e->>'enabled')::boolean;
   patch:=patch||jsonb_build_object('attribution_enrichment',jsonb_build_object('enabled',new_attr,'started_at',case when not new_attr then 'null'::jsonb when not old_attr then to_jsonb(clock_timestamp()) else c.settings #> '{attribution_enrichment,started_at}' end));
  end if;
  update public.crm_integration_connections set account_id=p_data->>'account_id',api_version=p_data->>'api_version',access_token_secret_ref=p_data->>'access_token_secret_ref',
   enabled=coalesce((p_data->>'enabled')::boolean,c.enabled),settings=c.settings||patch,updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into c;
 end if;
 return to_jsonb(c);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_save_website_connection(p_data jsonb, p_id uuid DEFAULT NULL::uuid, p_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare c public.crm_integration_connections;begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','origin','enabled']<>'{}' then raise exception 'Invalid website settings' using errcode='22023';end if;
 if p_id is null then
  insert into public.crm_integration_connections(provider,connection_key,settings,created_by,updated_by)
  values('website',p_data->>'connection_key',jsonb_build_object('origin',p_data->>'origin'),auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id and provider='website' for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='PT409';end if;
  if p_data->>'connection_key' is distinct from c.connection_key or p_data->>'origin' is distinct from c.settings->>'origin' then raise exception 'Site identity immutable; create a separate connection' using errcode='22023';end if;
  update public.crm_integration_connections set enabled=coalesce((p_data->>'enabled')::boolean,false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into c;
 end if;return to_jsonb(c)-array['lifecycle_settings','lifecycle_destination_id','insights_settings'];
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
 if initial_status not in ('Submitted','Trial') then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501',hint='crm_enrollment.initial_status_not_permitted'; end if;
 if p_data->>'student_choice'='new' then
  -- E3: the same rejected set as 084, one reason per condition. A birth date is
  -- bounded by the Casablanca civil date (enrollment initiation only).
  if l.student_id is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_already_linked'; end if;
  if p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
  if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_name_invalid'; end if;
  if not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_invalid'; end if;
  if birth>(now() at time zone 'Africa/Casablanca')::date then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_future'; end if;
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
  if not found or e.student_id is distinct from s.id or e.status is null or e.status='Rejected'
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
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected' and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected'
    and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
    then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.group_incompatible'; end if;
   level:=g.niveau;
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023',hint='crm_enrollment.level_invalid'; end if;
  -- E6: the 072 trigger's only remaining outcome for this row (23514), raised
  -- with the handler's mapped message after every earlier check has run.
  if initial_status='Trial' and g.id is null then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.trial_requires_group'; end if;
  insert into public.enrollments(student_id,session_type,school_year,level,group_id,status,date_inscription,notes)
  values(s.id,session,year,level,g.id,initial_status,current_date,p_data->>'notes') returning * into e;
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
    due:=crm_security.next_window(l.followup_policy_id,coalesce(followup_at,now()+interval '1 day'));
   exception when invalid_parameter_value then
    if sqlerrm='Policy has no available calling window' then
     raise exception 'Policy has no available calling window' using errcode='22023',hint='crm_enrollment.followup_policy_unavailable'; end if;
    raise;
   end;
   if due<now() then raise exception 'Valid future task required' using errcode='22023',hint='crm_enrollment.followup_in_past'; end if;
   if l.owner_id is not null and not exists(select 1 from public.profiles where id=l.owner_id and role in ('director','admin','receptionist')) then
    raise exception 'Assignee must be operational staff' using errcode='22023',hint='crm_enrollment.owner_not_operational'; end if;
   followup_task:=crm_security.new_task(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le parent.'),'enrollment-followup:'||l.id||':'||e.id,'enrollment');
   followup:=jsonb_build_object('id',followup_task,'created',true);
  else
   keep_task:=t.id;
   for t in select * from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' and id<>keep_task order by id for update loop
    perform crm_security.finish_task(t,true,'Suivi de cette inscription déjà prévu','enrollment-duplicate:'||e.id||':'||t.id);
   end loop;
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

CREATE OR REPLACE FUNCTION public.crm_update_placement_test(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; p public.placement_tests%rowtype; result jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['placement_id','expected_updated_at','date_test','heure','examinateur','notes','status','score','niveau_recommande']<>'{}'::jsonb then raise exception 'Valid placement edit required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':update_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='update_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into p from public.placement_tests where id=(p_data->>'placement_id')::uuid and crm_lead_id is not null for update;
 if not found then raise exception 'CRM placement not found' using errcode='22023'; end if;
 if p.updated_at is distinct from (p_data->>'expected_updated_at')::timestamptz then raise exception 'Stale placement version; refresh and retry' using errcode='PT409'; end if;
 update public.placement_tests set date_test=(p_data->>'date_test')::date,heure=p_data->>'heure',examinateur=p_data->>'examinateur',notes=p_data->>'notes',
 status=p_data->>'status',score=(p_data->>'score')::numeric,niveau_recommande=nullif(p_data->>'niveau_recommande','') where id=p.id returning * into p;
 result:=jsonb_build_object('placement',crm_security.placement_summary(p));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'update_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='PT409';
 when unique_violation then raise exception 'Placement already scheduled' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement edit or missing result' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_group(p_group uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare g public.groups%rowtype;
  v_teacher uuid; v_session text; v_level text; begin
  perform operational_security.require_receptionist();
  if p_group is null then raise exception 'Stable group id required' using errcode='22023'; end if;
  perform operational_security.assert_keys(p_changes,array['name','langue','session_type','niveau','teacher_id',
    'salle','jours','horaire','capacite_max','terme','annee','categorie']);
  v_teacher:=nullif(p_changes->>'teacher_id','')::uuid;
  if p_changes ? 'teacher_id' and v_teacher is not null and not exists(
    select 1 from public.teachers t where t.id=v_teacher and t.deleted_at is null) then
    raise exception 'Teacher unavailable' using errcode='23514'; end if;
  if p_expected_updated_at is null then
    if nullif(btrim(p_changes->>'name'),'') is null or p_changes->>'niveau' is null then
      raise exception 'Group name and level required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau') is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    insert into public.groups(id,name,langue,session_type,niveau,teacher_id,salle,jours,horaire,
      capacite_max,terme,annee,categorie)
    values(p_group,p_changes->>'name',coalesce(p_changes->>'langue','Anglais'),
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau',v_teacher,
      p_changes->>'salle',p_changes->>'jours',p_changes->>'horaire',
      coalesce((p_changes->>'capacite_max')::integer,12),p_changes->>'terme',
      p_changes->>'annee',p_changes->>'categorie') on conflict on constraint groups_pkey do nothing
    returning groups.id,groups.updated_at into id,updated_at;
    if id is null then
      select * into g from public.groups where groups.id=p_group for update;
      if g.name is distinct from p_changes->>'name' or
        g.langue is distinct from coalesce(p_changes->>'langue','Anglais') or
        g.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        g.niveau is distinct from p_changes->>'niveau' or g.teacher_id is distinct from v_teacher or
        g.salle is distinct from p_changes->>'salle' or g.jours is distinct from p_changes->>'jours' or
        g.horaire is distinct from p_changes->>'horaire' or
        g.capacite_max is distinct from coalesce((p_changes->>'capacite_max')::integer,12) or
        g.terme is distinct from p_changes->>'terme' or g.annee is distinct from p_changes->>'annee' or
        g.categorie is distinct from p_changes->>'categorie' then
        raise exception 'Group create identity conflict' using errcode='23505'; end if;
      id:=g.id; updated_at:=g.updated_at;
    end if;
  else
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into g from public.groups where groups.id=p_group for update;
    if not found or g.updated_at is distinct from p_expected_updated_at then
      raise exception 'Group unavailable or stale' using errcode='PT409'; end if;
    v_session:=case when p_changes ? 'session_type' then p_changes->>'session_type' else g.session_type end;
    v_level:=case when p_changes ? 'niveau' then p_changes->>'niveau' else g.niveau end;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and
      operational_security.valid_session_level(v_session,v_level) is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and (
      exists(select 1 from public.enrollments e where e.group_id=p_group)
      or exists(select 1 from public.students s where s.groupe_id=p_group and s.deleted_at is null)) then
      raise exception 'Reassign learners before changing group session or level' using errcode='23514'; end if;
    update public.groups set
      name=case when p_changes ? 'name' then p_changes->>'name' else g.name end,
      langue=case when p_changes ? 'langue' then p_changes->>'langue' else g.langue end,
      session_type=v_session,niveau=v_level,
      teacher_id=case when p_changes ? 'teacher_id' then v_teacher else g.teacher_id end,
      salle=case when p_changes ? 'salle' then p_changes->>'salle' else g.salle end,
      jours=case when p_changes ? 'jours' then p_changes->>'jours' else g.jours end,
      horaire=case when p_changes ? 'horaire' then p_changes->>'horaire' else g.horaire end,
      capacite_max=case when p_changes ? 'capacite_max' then (p_changes->>'capacite_max')::integer else g.capacite_max end,
      terme=case when p_changes ? 'terme' then p_changes->>'terme' else g.terme end,
      annee=case when p_changes ? 'annee' then p_changes->>'annee' else g.annee end,
      categorie=case when p_changes ? 'categorie' then p_changes->>'categorie' else g.categorie end
    where groups.id=p_group returning groups.id,groups.updated_at into id,updated_at;
  end if;
  return next;
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_premium_attendance(p_session uuid, p_student uuid, p_status text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare a public.premium_attendance%rowtype; begin
  perform operational_security.require_receptionist();
  perform pg_advisory_xact_lock(hashtextextended('premium-attendance:'||p_session::text||':'||p_student::text,0));
  select * into a from public.premium_attendance where premium_session_id=p_session and student_id=p_student for update;
  if found then
    if p_expected_updated_at is null or a.updated_at is distinct from p_expected_updated_at then
      raise exception 'Premium attendance stale' using errcode='PT409'; end if;
    update public.premium_attendance set status=p_status,recorded_by=auth.uid() where id=a.id;
    return a.id;
  end if;
  if p_expected_updated_at is not null then raise exception 'Premium attendance unavailable' using errcode='PT409'; end if;
  insert into public.premium_attendance(premium_session_id,student_id,status,recorded_by)
    values(p_session,p_student,p_status,auth.uid()) returning id into a.id;
  return a.id;
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_premium_membership(p_membership uuid, p_expected_updated_at timestamp with time zone, p_group uuid DEFAULT NULL::uuid, p_student uuid DEFAULT NULL::uuid, p_start_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare m public.premium_group_memberships%rowtype; begin
  perform operational_security.require_receptionist();
  if p_membership is null then raise exception 'Stable membership id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    if p_group is null or p_student is null or p_start_date is null or p_start_date<current_date or
      not exists(select 1 from public.premium_groups
      where id=p_group and active) then raise exception 'Invalid Premium membership' using errcode='23514'; end if;
    insert into public.premium_group_memberships(id,premium_group_id,student_id,start_date,end_date,active)
      values(p_membership,p_group,p_student,p_start_date,
        (select premium_end_date from public.students where id=p_student),true)
      on conflict(id) do nothing;
    select * into m from public.premium_group_memberships where id=p_membership for update;
    if m.premium_group_id is distinct from p_group or m.student_id is distinct from p_student or
      m.start_date is distinct from p_start_date or not m.active then
      raise exception 'Premium membership identity conflict' using errcode='23505'; end if;
  else
    if p_group is not null or p_student is not null then
      raise exception 'Membership identity is immutable' using errcode='42501'; end if;
    select * into m from public.premium_group_memberships where id=p_membership for update;
    if not found or m.updated_at is distinct from p_expected_updated_at or not m.active or
      m.start_date>current_date then raise exception 'Membership unavailable or stale' using errcode='PT409'; end if;
    update public.premium_group_memberships set active=false,end_date=current_date where id=p_membership;
  end if;
  return p_membership;
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_premium_session(p_session uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare ps public.premium_sessions%rowtype; pg public.premium_groups%rowtype; begin
  perform operational_security.require_receptionist();
  if p_session is null then raise exception 'Stable Premium session id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['premium_group_id','scheduled_date']);
    select * into pg from public.premium_groups
      where id=(p_changes->>'premium_group_id')::uuid and active for share;
    if not found then raise exception 'Premium group unavailable' using errcode='23514'; end if;
    insert into public.premium_sessions(id,premium_group_id,student_id,teacher_id,scheduled_date,
      start_time,duration_minutes,status)
    values(p_session,pg.id,null,pg.teacher_id,(p_changes->>'scheduled_date')::date,
      pg.start_time,60,'Scheduled') on conflict(id) do nothing;
    select * into ps from public.premium_sessions where id=p_session for update;
    if ps.premium_group_id is distinct from pg.id or ps.scheduled_date is distinct from
      (p_changes->>'scheduled_date')::date or ps.teacher_id is distinct from pg.teacher_id or
      ps.status is distinct from 'Scheduled' then
      raise exception 'Premium session identity conflict' using errcode='23505'; end if;
  else
    perform operational_security.assert_keys(p_changes,array['scheduled_date','start_time','status']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into ps from public.premium_sessions where id=p_session for update;
    if not found or ps.updated_at is distinct from p_expected_updated_at then
      raise exception 'Premium session unavailable or stale' using errcode='PT409'; end if;
    if ps.premium_group_id is null or ps.status in ('Completed','Cancelled') or
      (p_changes ? 'status' and (p_changes ? 'scheduled_date' or p_changes ? 'start_time')) or
      (p_changes ? 'status' and p_changes->>'status' not in ('Confirmed','Completed','Cancelled')) then
      raise exception 'Unsupported Premium session action' using errcode='42501'; end if;
    update public.premium_sessions set
      scheduled_date=case when p_changes ? 'scheduled_date' then (p_changes->>'scheduled_date')::date else ps.scheduled_date end,
      start_time=case when p_changes ? 'start_time' then (p_changes->>'start_time')::time else ps.start_time end,
      status=case when p_changes ? 'status' then p_changes->>'status' else ps.status end,
      completed_at=case when p_changes ? 'status' then
        case when p_changes->>'status'='Completed' then coalesce(ps.completed_at,now()) else null end
        else ps.completed_at end
    where id=p_session;
  end if;
  return p_session;
end $function$;

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
      p_changes->>'photo_url','Enrolled','Standard') on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Enrolled' or s.plan_type is distinct from 'Standard' or
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
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $function$;

CREATE OR REPLACE FUNCTION public.save_receptionist_teacher_operations(p_teacher uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare t public.teachers%rowtype; begin
  perform operational_security.require_receptionist();
  perform operational_security.assert_keys(p_changes,array['full_name','telephone','certifications','niveaux_autorises']);
  if p_changes='{}'::jsonb or p_expected_updated_at is null then raise exception 'Missing changes/version' using errcode='22023'; end if;
  select * into t from public.teachers where teachers.id=p_teacher and deleted_at is null for update;
  if not found or t.updated_at is distinct from p_expected_updated_at then
    raise exception 'Teacher unavailable or stale' using errcode='PT409';
  end if;
  update public.teachers set
    full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else t.full_name end,
    telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else t.telephone end,
    certifications=case when p_changes ? 'certifications' then
      array(select jsonb_array_elements_text(p_changes->'certifications')) else t.certifications end,
    niveaux_autorises=case when p_changes ? 'niveaux_autorises' then
      array(select jsonb_array_elements_text(p_changes->'niveaux_autorises')) else t.niveaux_autorises end
  where teachers.id=p_teacher returning teachers.id,teachers.updated_at into id,updated_at;
  return next;
end $function$;

commit;
