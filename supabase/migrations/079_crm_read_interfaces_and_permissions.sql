-- Fixed Phase 2 reads only. No intake, lifecycle or task mutation commands.
begin;
-- Defense against Supabase default grants, including inherited TRUNCATE paths.
revoke all on public.crm_contacts,public.crm_leads,public.crm_submissions,
  public.crm_submission_attribution,public.crm_activities,public.crm_tasks,
  public.crm_command_requests,public.crm_followup_policies
  from public,anon,authenticated,service_role;
-- No table SELECT policies/grants: the audited owner-run RPCs below are the
-- only browser read boundary. Integration access is intentionally deferred.
create function crm_security.require_reader(technical boolean default false) returns void
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare actor_role text;
begin
  select p.role into actor_role from public.profiles p where p.id=auth.uid();
  if auth.uid() is null or (actor_role in ('director','admin','receptionist')) is not true
    or (technical and actor_role is distinct from 'director') then
    raise exception 'CRM access denied' using errcode='42501';
  end if;
end $$;
revoke all on function crm_security.require_reader(boolean) from public,anon,authenticated,service_role;

create function crm_security.check_page(p_limit integer,p_offset integer) returns void
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$ begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'Invalid CRM pagination' using errcode='22023'; end if;
end $$;
revoke all on function crm_security.check_page(integer,integer) from public,anon,authenticated,service_role;

create function public.crm_list_leads(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  perform crm_security.check_page(p_limit,p_offset);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'created_at',r.created_at,'learner_name',r.learner_name,'status',r.status,
    'owner_id',r.owner_id,'contact_id',r.contact_id,'contact_name',r.display_name,
    'session_type',r.session_type,'last_attempt_at',r.last_attempt_at,'version',r.version
  ) order by r.created_at desc,r.id desc),'[]'::jsonb) into result
  from (select l.id,l.created_at,l.learner_name,l.status,l.owner_id,l.contact_id,
    c.display_name,l.session_type,l.last_attempt_at,l.version
    from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
    where l.merged_into_lead_id is null
    order by l.created_at desc,l.id desc limit p_limit offset p_offset) r;
  return result;
end $$;
revoke all on function public.crm_list_leads(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_list_leads(integer,integer) to authenticated;

create function public.crm_get_lead_detail(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  if p_lead is null then raise exception 'Lead required' using errcode='22023'; end if;
  select jsonb_build_object(
    'id',l.id,'created_at',l.created_at,'updated_at',l.updated_at,'learner_name',l.learner_name,
    'learner_birth_date',l.learner_birth_date,'learner_age',l.learner_age,'age_recorded_at',l.age_recorded_at,
    'session_type',l.session_type,'program_interest_text',l.program_interest_text,
    'status',l.status,'owner_id',l.owner_id,'qualification_step',l.qualification_step,
    'closure_reason',l.closure_reason,'closure_note',l.closure_note,'closed_at',l.closed_at,
    'student_id',l.student_id,'enrollment_id',l.enrollment_id,'converted_at',l.converted_at,
    'conversion_review_required',l.conversion_review_required,'last_attempt_at',l.last_attempt_at,
    'last_conversation_at',l.last_conversation_at,'version',l.version,
    'contact',jsonb_build_object('id',c.id,'display_name',c.display_name,'contact_kind',c.contact_kind,
      'phone',coalesce(c.phone_e164,c.phone_raw),'whatsapp',coalesce(c.whatsapp_e164,c.whatsapp_raw),
      'email',coalesce(c.email_normalized,c.email_raw),'preferred_channel',c.preferred_channel),
    'first_submission',jsonb_build_object('id',f.id,'channel',f.channel,'occurred_at',f.occurred_at,'source_label',f.source_label),
    'latest_submission',jsonb_build_object('id',t.id,'channel',t.channel,'occurred_at',t.occurred_at,'source_label',t.source_label)
  ) into result from public.crm_leads l
  join public.crm_contacts c on c.id=l.contact_id
  join public.crm_submissions f on f.id=l.first_submission_id
  join public.crm_submissions t on t.id=l.latest_submission_id
  where l.id=p_lead;
  return result;
end $$;
revoke all on function public.crm_get_lead_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_get_lead_detail(uuid) to authenticated;

create function public.crm_list_activities(p_lead uuid,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  perform crm_security.check_page(p_limit,p_offset);
  if p_lead is null then raise exception 'Lead required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'lead_id',r.lead_id,'occurred_at',r.occurred_at,'actor_id',r.actor_id,
    'actor_kind',r.actor_kind,'event_type',r.event_type,'channel',r.channel,'outcome',r.outcome,
    'from_status',r.from_status,'to_status',r.to_status,'body',r.body,
    'task_id',r.task_id,'placement_test_id',r.placement_test_id,'enrollment_id',r.enrollment_id,
    'supersedes_activity_id',r.supersedes_activity_id
  ) order by r.occurred_at,r.id),'[]'::jsonb) into result
  from (select a.id,a.lead_id,a.occurred_at,a.actor_id,a.actor_kind,a.event_type,a.channel,a.outcome,
    a.from_status,a.to_status,a.body,a.task_id,a.placement_test_id,a.enrollment_id,a.supersedes_activity_id
    from public.crm_activities a where a.lead_id=p_lead
    order by a.occurred_at,a.id limit p_limit offset p_offset) r;
  return result;
end $$;
revoke all on function public.crm_list_activities(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_list_activities(uuid,integer,integer) to authenticated;

create function public.crm_list_open_tasks(p_lead uuid default null,p_assigned_to uuid default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  perform crm_security.check_page(p_limit,p_offset);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'lead_id',r.lead_id,'task_type',r.task_type,'status',r.status,
    'assigned_to',r.assigned_to,'due_at',r.due_at,'scheduled_end_at',r.scheduled_end_at,
    'timezone',r.timezone,'priority',r.priority,'instructions',r.instructions,'version',r.version
  ) order by r.due_at,r.id),'[]'::jsonb) into result
  from (select t.id,t.lead_id,t.task_type,t.status,t.assigned_to,t.due_at,t.scheduled_end_at,
    t.timezone,t.priority,t.instructions,t.version from public.crm_tasks t
    where t.status='open' and (p_lead is null or t.lead_id=p_lead)
      and (p_assigned_to is null or t.assigned_to=p_assigned_to)
    order by t.due_at,t.id limit p_limit offset p_offset) r;
  return result;
end $$;
revoke all on function public.crm_list_open_tasks(uuid,uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_list_open_tasks(uuid,uuid,integer,integer) to authenticated;

create function public.crm_get_submission_attribution(p_submission uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(true);
  if p_submission is null then raise exception 'Submission required' using errcode='22023'; end if;
  -- Deliberately no raw_payload, consent_evidence or browser tracking tokens.
  select jsonb_build_object('submission_id',a.submission_id,'provider',a.provider,
    'external_submission_id',a.external_submission_id,'external_scope',a.external_scope,
    'account_id',a.account_id,'page_id',a.page_id,'form_id',a.form_id,'form_name_snapshot',a.form_name_snapshot,
    'campaign_id',a.campaign_id,'campaign_name_snapshot',a.campaign_name_snapshot,
    'adset_id',a.adset_id,'adset_name_snapshot',a.adset_name_snapshot,
    'ad_id',a.ad_id,'ad_name_snapshot',a.ad_name_snapshot,'platform',a.platform,
    'provider_created_at',a.provider_created_at,'attribution_status',a.attribution_status,'captured_at',a.captured_at
  ) into result from public.crm_submission_attribution a where a.submission_id=p_submission;
  return result;
end $$;
revoke all on function public.crm_get_submission_attribution(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_get_submission_attribution(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
