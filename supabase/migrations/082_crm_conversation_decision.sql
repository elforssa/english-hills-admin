-- Phase 4: one receptionist decision, one transaction. No center mutations.
begin;
create function public.crm_record_conversation_decision(p_request_key uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
 actor uuid:=auth.uid(); decision text:=p_data->>'decision'; digest text; source text;
 prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; t public.crm_tasks%rowtype; obsolete public.crm_tasks%rowtype;
 result jsonb; data jsonb; inner_key uuid:=gen_random_uuid();
begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32768
 or p_data-array['lead_id','expected_version','task_id','expected_task_version','decision','note','next_task','qualification_step','reason']<>'{}'::jsonb
 or decision is null or decision not in ('callback','qualify','lost','not_qualified')
 or nullif(btrim(p_data->>'note'),'') is null or length(p_data->>'note')>4000 then
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
 if decision in ('callback','qualify') and p_data ? 'reason' then raise exception 'Unexpected closure reason' using errcode='22023'; end if;
 if decision='callback' and (p_data ? 'qualification_step' or p_data->'next_task'->>'task_type' is distinct from 'callback') then
  raise exception 'Callback decision requires a callback' using errcode='22023'; end if;
 source:='command:'||actor||':conversation_decision:'||p_request_key;
 data:=jsonb_build_object('lead_id',l.id,'expected_version',l.version,'note',p_data->>'note');
 -- A new conversation decision supersedes outstanding call follow-ups, including
 -- a previously scheduled callback when no task was explicitly selected.
 if decision in ('callback','qualify') then
  for obsolete in select * from public.crm_tasks where lead_id=l.id and status='open'
   and task_type='callback' and id is distinct from t.id order by id loop
   perform crm_security.finish_task(obsolete,true,'Conversation follow-up replaced',source||':superseded:'||obsolete.id);
  end loop;
 end if;
 if decision='callback' then
  -- Existing call command validates/finishes the selected task and records evidence.
  result:=crm_security.command('record_call_outcome',inner_key,data||jsonb_build_object('outcome','spoke_with_contact','next_task',p_data->'next_task')||
   case when t.id is not null then jsonb_build_object('task_id',t.id,'expected_task_version',t.version) else '{}'::jsonb end);
 else
  if t.id is not null then perform crm_security.finish_task(t,false,p_data->>'note',source||':complete'); end if;
  if decision='qualify' then
   -- Reuse qualification validation, lifecycle, outreach cancellation and task rules.
   result:=crm_security.command('qualify_lead',inner_key,data||jsonb_build_object('conversation_channel','phone',
    'qualification_step',p_data->>'qualification_step','next_task',p_data->'next_task'));
  else
   -- Closing a conversation requires evidence but deliberately no temporary follow-up.
   perform crm_security.event(l.id,'conversation_recorded',source||':conversation',p_data->>'note','phone','spoke_with_contact',t.id);
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
revoke all on function public.crm_record_conversation_decision(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_record_conversation_decision(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
