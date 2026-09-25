-- Phase 3 only: transactional commands. No UI, ingestion or center mutations.
-- Public RPC contract: (p_request_key uuid, p_data jsonb). Existing-lead
-- mutations require lead_id + expected_version; task edits also require
-- task_id + expected_task_version. Retry with the original payload/key.
begin;

create function crm_security.normalize_phone(raw text) returns text
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
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
end $$;

create function crm_security.validate_policy(hours jsonb, offsets integer[]) returns void
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare d integer; w jsonb; previous_end text; starts text; ends text; any_window boolean:=false;
begin
  if jsonb_typeof(hours) is distinct from 'object' or hours-array['1','2','3','4','5','6','7']<>'{}'::jsonb then
    raise exception 'Invalid weekly hours' using errcode='22023'; end if;
  for d in 1..7 loop
    if jsonb_typeof(hours->d::text) is distinct from 'array' then raise exception 'Supply all seven weekdays' using errcode='22023'; end if;
    previous_end:=null;
    for w in select value from jsonb_array_elements(hours->d::text) loop
      if jsonb_typeof(w) is distinct from 'array' then raise exception 'Invalid window' using errcode='22023'; end if;
      if jsonb_array_length(w)<>2 or jsonb_typeof(w->0)<>'string' or jsonb_typeof(w->1)<>'string' then raise exception 'Invalid window' using errcode='22023'; end if;
      starts:=w->>0; ends:=w->>1;
      if starts !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or ends !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or starts>=ends or (previous_end is not null and starts<previous_end) then
        raise exception 'Windows must be ordered, non-overlapping and start before end' using errcode='22023'; end if;
      previous_end:=ends; any_window:=true;
    end loop;
  end loop;
  if not any_window or cardinality(offsets) is distinct from 5 or array_ndims(offsets) is distinct from 1
    or array_position(offsets,null) is not null or offsets[1]<>0 or offsets[2]<>0
    or offsets[3]<1 or offsets[4]<offsets[3] or offsets[5]<offsets[4] or offsets[5]>365 then
    raise exception 'Invalid five-attempt policy' using errcode='22023'; end if;
end $$;

create function crm_security.next_window(policy uuid, target timestamptz) returns timestamptz
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare p public.crm_followup_policies%rowtype; d date; w jsonb; opens timestamptz; closes timestamptz; i integer;
begin
  select * into strict p from public.crm_followup_policies where id=policy;
  if target is null or not isfinite(target) then raise exception 'Finite due time required' using errcode='22023'; end if;
  d:=(target at time zone p.timezone)::date;
  for i in 0..370 loop
    for w in select value from jsonb_array_elements(p.weekly_hours->extract(isodow from d)::integer::text) loop
      opens:=(d+(w->>0)::time) at time zone p.timezone;
      closes:=(d+(w->>1)::time) at time zone p.timezone;
      if greatest(target,opens)<closes then return greatest(target,opens); end if;
    end loop;
    d:=d+1;
  end loop;
  raise exception 'Policy has no available calling window' using errcode='22023';
end $$;

create function crm_security.attempt_due(policy uuid, anchor date, ordinal integer, last_call timestamptz, as_of timestamptz)
returns timestamptz language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare p public.crm_followup_policies%rowtype; target timestamptz;
begin
 select * into strict p from public.crm_followup_policies where id=policy;
 if ordinal not between 1 and 5 or anchor is null or as_of is null then raise exception 'Invalid attempt scheduling input' using errcode='22023'; end if;
 target:=(anchor+p.attempt_offsets[ordinal])::timestamp at time zone p.timezone;
 target:=greatest(target,as_of,coalesce(last_call,as_of)+make_interval(mins=>p.minimum_attempt_gap_minutes));
 return crm_security.next_window(policy,target);
end $$;

create function crm_security.assert_staff(staff uuid) returns void
language plpgsql stable set search_path=pg_catalog,pg_temp as $$ begin
 if staff is not null and not exists(select 1 from public.profiles where id=staff and role in ('director','admin','receptionist')) then
  raise exception 'Assignee must be operational staff' using errcode='22023'; end if;
end $$;

-- Command-generated vocabulary only; historical structural fixtures are untouched.
create function crm_security.event(lead uuid, kind text, source text, note text default null,
 channel text default null, outcome text default null, task uuid default null, happened timestamptz default null,
 cycle integer default null, ordinal smallint default null, from_state text default null, to_state text default null, submission uuid default null)
returns uuid language plpgsql set search_path=pg_catalog,pg_temp as $$ declare result uuid; begin
 if kind<>all(array['lead_created','submission_received','note_added','contact_attempted','call_no_answer','call_busy','call_declined','call_unreachable','call_wrong_number',
 'conversation_recorded','whatsapp_sent','whatsapp_conversation','task_created','task_completed','task_rescheduled','task_cancelled',
 'lead_engaged','lead_qualified','lead_lost','lead_not_qualified','lead_reopened','lead_reassigned','task_reassigned']) then
  raise exception 'Unknown CRM event' using errcode='22023'; end if;
 if length(note)>4000 then raise exception 'Note too long' using errcode='22023'; end if;
 insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,channel,outcome,task_id,outreach_cycle,attempt_ordinal,from_status,to_status,submission_id)
 values(lead,coalesce(happened,now()),auth.uid(),'user',kind,source,note,channel,outcome,task,cycle,ordinal,from_state,to_state,submission) returning id into result;
 return result;
end $$;

create function crm_security.failed_count(l public.crm_leads) returns integer
language sql stable set search_path=pg_catalog,pg_temp as $$
 select count(*)::integer from public.crm_activities a where a.lead_id=l.id and a.outreach_cycle=l.outreach_cycle
 and a.event_type='contact_attempted' and a.channel='phone' and a.outcome in ('no_answer','busy','declined','unreachable')
 and a.attempt_ordinal is not null
$$;

create function crm_security.new_task(l public.crm_leads, spec jsonb, source text,
 kind text default 'manual', ordinal smallint default null, event_source text default null) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare t uuid; due timestamptz; assignee uuid; typ text;
begin
 if jsonb_typeof(spec) is distinct from 'object' or spec-array['task_type','due_at','assigned_to','instructions']<>'{}'::jsonb then raise exception 'Next task required' using errcode='22023'; end if;
 typ:=spec->>'task_type'; due:=(spec->>'due_at')::timestamptz;
 if typ is null or typ<>all(array['first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup'])
 or due is null or not isfinite(due) or due<now() then raise exception 'Valid future task required' using errcode='22023'; end if;
 if typ in ('first_contact','contact_attempt','callback') then due:=crm_security.next_window(l.followup_policy_id,due); end if;
 assignee:=case when spec ? 'assigned_to' then (spec->>'assigned_to')::uuid else l.owner_id end;
 perform crm_security.assert_staff(assignee);
 if length(spec->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
 insert into public.crm_tasks(lead_id,task_type,assigned_to,due_at,instructions,source_kind,source_key,policy_id,outreach_cycle,attempt_ordinal)
 values(l.id,typ,assignee,due,spec->>'instructions',kind,source,l.followup_policy_id,
 case when ordinal is not null then l.outreach_cycle end,ordinal) returning id into t;
 perform crm_security.event(l.id,'task_created',coalesce(event_source,source)||':created',null,null,null,t);
 return t;
end $$;

create function crm_security.finish_task(t public.crm_tasks, cancelled boolean, reason text, source text) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare a uuid; begin
 if t.status<>'open' then raise exception 'Task is not open' using errcode='40001'; end if;
 if cancelled and nullif(btrim(reason),'') is null then raise exception 'Cancellation reason required' using errcode='22023'; end if;
 a:=crm_security.event(t.lead_id,case when cancelled then 'task_cancelled' else 'task_completed' end,source,reason,null,null,t.id);
 update public.crm_tasks set status=case when cancelled then 'cancelled' else 'completed' end,
 completed_at=case when not cancelled then now() end,completed_by=case when not cancelled then auth.uid() end,
 completion_activity_id=case when not cancelled then a end,
 cancelled_at=case when cancelled then now() end,cancelled_by=case when cancelled then auth.uid() end,
 cancellation_reason=case when cancelled then reason end,version=version+1,updated_at=now() where id=t.id;
end $$;

create function crm_security.cancel_tasks(l uuid, reason text, source text, attempts_only boolean default false) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare t public.crm_tasks%rowtype; begin
 for t in select * from public.crm_tasks where lead_id=l and status='open'
 and (not attempts_only or task_type in ('first_contact','contact_attempt')) order by id for update loop
  perform crm_security.finish_task(t,true,reason,source||':'||t.id);
 end loop;
end $$;

create function crm_security.result(l uuid, source text) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('lead',jsonb_build_object('id',x.id,'status',x.status,'version',x.version,'contact_id',x.contact_id,'owner_id',x.owner_id,'outreach_cycle',x.outreach_cycle,'qualification_step',x.qualification_step),
 'activity_ids',coalesce((select jsonb_agg(a.id order by a.created_at,a.id) from public.crm_activities a where a.lead_id=x.id and starts_with(a.source_key,source||':')),'[]'::jsonb),
 'open_tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'assigned_to',t.assigned_to,'version',t.version) order by t.due_at,t.id) from public.crm_tasks t where t.lead_id=x.id and t.status='open'),'[]'::jsonb),
 'failed_attempts',crm_security.failed_count(x),'unreachable_eligible',x.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(x)>=5)
 from public.crm_leads x where x.id=l
$$;

-- All public wrappers pass a literal command name. This private dispatcher is
-- never executable by browser/service roles. Lock order: request -> policy OR
-- lead -> tasks by UUID. Commands never acquire a second lead lock.
create function crm_security.command(cmd text, request uuid, data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb;
 l public.crm_leads%rowtype; t public.crm_tasks%rowtype; p public.crm_followup_policies%rowtype;
 contact uuid; submission uuid; aid uuid; tid uuid; source text; allowed text[]; offsets integer[];
 phone text; email text; candidates jsonb; count_failed integer; ordinal smallint;
 due timestamptz; happened timestamptz; outcome text; meaningful boolean:=false; needs_next boolean:=false;
 reason text; target text; initial_status text; next_spec jsonb; policy_version integer;
begin
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
   if coalesce(data->>'channel','') not in ('phone','whatsapp','in_person') or nullif(btrim(data->>'note'),'') is null then raise exception 'Conversation channel and evidence required' using errcode='22023'; end if;
   meaningful:=true;
   perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'channel',null,null,happened);

  elsif cmd='schedule_task' then
   next_spec:=data->'task';
   if t.id is null then tid:=crm_security.new_task(l,next_spec,source||':task');
   else
    if jsonb_typeof(next_spec) is distinct from 'object' or next_spec-array['due_at','instructions']<>'{}'::jsonb then raise exception 'Reschedule accepts due_at and instructions only' using errcode='22023'; end if;
    due:=(next_spec->>'due_at')::timestamptz;
    if due is null or not isfinite(due) or due<now() then raise exception 'Future due time required' using errcode='22023'; end if;
    if t.task_type in ('first_contact','contact_attempt','callback') then due:=crm_security.next_window(l.followup_policy_id,due); end if;
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
    if data->>'conversation_channel' not in ('phone','whatsapp','in_person') or nullif(btrim(data->>'note'),'') is null then raise exception 'Conversation evidence required' using errcode='22023'; end if;
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
end $$;

create function public.crm_create_followup_policy(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('create_followup_policy',p_request_key,p_data)
$$;
revoke all on function public.crm_create_followup_policy(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_create_followup_policy(uuid,jsonb) to authenticated;

create function public.crm_create_manual_lead(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('create_manual_lead',p_request_key,p_data)
$$;
revoke all on function public.crm_create_manual_lead(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_create_manual_lead(uuid,jsonb) to authenticated;

create function public.crm_add_note(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('add_note',p_request_key,p_data)
$$;
revoke all on function public.crm_add_note(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_add_note(uuid,jsonb) to authenticated;

create function public.crm_record_call_outcome(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('record_call_outcome',p_request_key,p_data)
$$;
revoke all on function public.crm_record_call_outcome(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_record_call_outcome(uuid,jsonb) to authenticated;

create function public.crm_record_whatsapp(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('record_whatsapp',p_request_key,p_data)
$$;
revoke all on function public.crm_record_whatsapp(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_record_whatsapp(uuid,jsonb) to authenticated;

create function public.crm_record_conversation(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('record_conversation',p_request_key,p_data)
$$;
revoke all on function public.crm_record_conversation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_record_conversation(uuid,jsonb) to authenticated;

create function public.crm_schedule_task(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('schedule_task',p_request_key,p_data)
$$;
revoke all on function public.crm_schedule_task(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_schedule_task(uuid,jsonb) to authenticated;

create function public.crm_complete_task(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('complete_task',p_request_key,p_data)
$$;
revoke all on function public.crm_complete_task(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_complete_task(uuid,jsonb) to authenticated;

create function public.crm_cancel_task(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('cancel_task',p_request_key,p_data)
$$;
revoke all on function public.crm_cancel_task(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_cancel_task(uuid,jsonb) to authenticated;

create function public.crm_qualify_lead(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('qualify_lead',p_request_key,p_data)
$$;
revoke all on function public.crm_qualify_lead(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_qualify_lead(uuid,jsonb) to authenticated;

create function public.crm_close_lost(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('close_lost',p_request_key,p_data)
$$;
revoke all on function public.crm_close_lost(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_close_lost(uuid,jsonb) to authenticated;

create function public.crm_close_not_qualified(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('close_not_qualified',p_request_key,p_data)
$$;
revoke all on function public.crm_close_not_qualified(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_close_not_qualified(uuid,jsonb) to authenticated;

create function public.crm_reopen_lead(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('reopen_lead',p_request_key,p_data)
$$;
revoke all on function public.crm_reopen_lead(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_reopen_lead(uuid,jsonb) to authenticated;

create function public.crm_reassign(p_request_key uuid,p_data jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('reassign',p_request_key,p_data)
$$;
revoke all on function public.crm_reassign(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_reassign(uuid,jsonb) to authenticated;

-- Internal attachment primitive, intentionally no PUBLIC RPC/grant. A future
-- provider intake command can reuse it; it does not ingest or create records.
create function crm_security.resolve_submission(lead uuid, submission uuid, expected_version bigint, request uuid)
returns jsonb language sql set search_path=pg_catalog,pg_temp as $$
 select crm_security.command('resolve_submission',request,jsonb_build_object('lead_id',lead,'submission_id',submission,'expected_version',expected_version))
$$;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
