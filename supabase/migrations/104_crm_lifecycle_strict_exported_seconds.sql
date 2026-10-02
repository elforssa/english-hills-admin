-- H3-02 revision-5 compatibility only. Forward change after immutable 001–103.
-- No seed, credentials, activation or data rewrite. Existing ACLs/search paths and
-- sharing-stop locks are preserved by replacing only the current function bodies.
-- Equal/earlier exported seconds remain blocked, never terminalized to advance
-- successors; the existing deadline/epoch/retention rules still apply.
begin;

CREATE OR REPLACE FUNCTION crm_security.lifecycle_hold(d crm_external_deliveries)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;epoch public.crm_lifecycle_activation_epochs;
 s public.crm_submissions;o public.crm_lifecycle_producer_ownership;b public.crm_lifecycle_producer_boundaries;p public.crm_lifecycle_eligibility_policies;r jsonb;ordering text;
begin
 if d.lifecycle_model='r4_stage_entry' and d.last_error_code='contradictory_chronology' then return 'contradictory_chronology';end if;
 if d.delivery_mode='live' and d.last_error_code='provider_time_not_after_source' then return 'provider_time_not_after_source';end if;
 if d.payload_erased_at is not null then return 'payload_erased';end if;
 if d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state in ('unknown','confirmed') then return 'replay_forbidden';end if;
 select * into c from public.crm_integration_connections where id=d.connection_id;
 if not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then return 'outbound_disabled';end if;
 if d.event_kind='converted' and exists(select 1 from public.crm_leads where id=d.lead_id and conversion_review_required) then return 'conversion_review_required';end if;
 if d.delivery_mode='live' then
  if d.lifecycle_model<>'r4_stage_entry' or c.lifecycle_settings->>'mode' is distinct from 'live'
   or c.lifecycle_settings->>'lifecycle_model' is distinct from 'r4_stage_entry' or c.lifecycle_settings->>'uncertainty_policy' is distinct from 'no_uncertain_replay'
   or (c.lifecycle_settings->>'activation_epoch_id')::uuid is distinct from d.activation_epoch_id
   or (c.lifecycle_settings->>'contract_id')::uuid is distinct from d.provider_contract_id then return 'activation_ended';end if;
  select * into epoch from public.crm_lifecycle_activation_epochs where id=d.activation_epoch_id;
  if epoch.id is null or epoch.ended_at is not null or d.event_time<epoch.started_at then return 'activation_ended';end if;
  if d.send_deadline is null or d.send_deadline<=clock_timestamp()+interval '8 seconds' then return 'provider_age_expired';end if;
  select * into o from public.crm_lifecycle_producer_ownership where id=d.producer_ownership_id and lead_id=d.lead_id and connection_id=d.connection_id;
  if o.id is null then return 'producer_ownership_unknown';elsif o.producer<>'eh_native' then return 'legacy_owned';end if;
  select * into b from public.crm_lifecycle_producer_boundaries where id=o.boundary_id and connection_id=d.connection_id;
  if b.id is null or b.revoked_at is not null or not b.legacy_exclusion_verified or clock_timestamp()<b.valid_from
   or clock_timestamp()>=least(b.valid_until,b.legacy_exclusion_valid_until) then return 'producer_boundary_invalid';end if;
  select * into e from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id and event_type='grant';
  select * into p from public.crm_lifecycle_eligibility_policies where id=b.eligibility_policy_id and lifecycle_model='r4_stage_entry';
  if p.id is null or not (p.allowed_event_kinds ? d.event_kind) then return 'policy_missing';end if;
  if p.d2_requirement='required' and (e.id is null or e.redacted_at is not null or e.effective_at>d.event_time
    or exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=e.id and rv.event_type='revoke')) then return 'sharing_revoked';end if;
  if crm_security.lifecycle_stop_hold(d.lead_id,d.connection_id) is not null then return crm_security.lifecycle_stop_hold(d.lead_id,d.connection_id);end if;
  if p.d2_requirement not in ('required','advisory') then return 'policy_missing';end if;
  if d.eligibility_evidence_id is not null and (e.id is null or e.policy_id is distinct from p.id or e.connection_id is distinct from d.connection_id) then return 'producer_boundary_invalid';end if;
  if b.page_id is distinct from c.page_id or b.dataset_id is distinct from c.lifecycle_settings->>'dataset_id'
   or b.provider_contract_id is distinct from d.provider_contract_id or b.provider_contract_id is distinct from epoch.provider_contract_id
   or b.eligibility_policy_id is distinct from p.id or b.policy_version is distinct from p.version
   or b.notice_version is distinct from p.notice_version or b.notice_text_digest is distinct from p.notice_text_digest then return 'producer_boundary_invalid';end if;
  select * into a from public.crm_submission_attribution where submission_id=(select first_submission_id from public.crm_leads where id=d.lead_id);
  if a.submission_id is null or a.redacted_at is not null then return 'identity_redacted';end if;
  select * into s from public.crm_submissions where id=a.submission_id;
  -- Compare the exact integer seconds exported by get/prepare; subsecond order is insufficient.
  if s.occurred_at is null or not isfinite(s.occurred_at) or s.time_source is distinct from 'provider'
   or not isfinite(d.event_time) or floor(extract(epoch from s.occurred_at))<=0
   or floor(extract(epoch from d.event_time))<=floor(extract(epoch from s.occurred_at)) then
   return 'provider_time_not_after_source';end if;
  if crm_security.lifecycle_safety_hold(a.submission_id,p.id) is not null then return crm_security.lifecycle_safety_hold(a.submission_id,p.id);end if;
  if d.attribution_submission_id is distinct from a.submission_id or d.matching_submission_id is distinct from a.submission_id then return 'no_matching_identity';end if;
  if d.mapping_snapshot->>'mode' is distinct from 'live' or d.mapping_snapshot->>'action_source' is distinct from 'system_generated'
   or coalesce((d.mapping_snapshot->>'maximum_event_age_seconds')::integer,0) not between 1 and 604800
   or d.mapping_snapshot->'required_constants' is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
   or d.mapping_snapshot->'events' is distinct from '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb then return 'configuration_missing';end if;
  r:=crm_security.lifecycle_route(d.lead_id);
  if (r->>'reason') is not null or (r->>'ownership_id')::uuid is distinct from d.producer_ownership_id
   or (r->>'boundary_id')::uuid is distinct from o.boundary_id or (r->>'epoch_id')::uuid is distinct from d.activation_epoch_id
   or (r->>'contract_id')::uuid is distinct from d.provider_contract_id then return coalesce(r->>'reason','producer_ownership_mismatch');end if;
  ordering:=crm_security.lifecycle_predecessor_hold(d);if ordering is not null then return ordering;end if;
 else
  if c.lifecycle_settings->>'mode' is distinct from 'mock' then return 'live_not_available';end if;
  if not coalesce((d.mapping_snapshot->>'enabled')::boolean,false) then return 'outbound_disabled';end if;
  select * into a from public.crm_submission_attribution where submission_id=d.matching_submission_id;
  if a.submission_id is null or a.redacted_at is not null then return 'identity_redacted';end if;
  if a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then return 'sharing_evidence_missing';end if;
  if d.mapping_snapshot->>'mode' is distinct from 'mock' then return 'configuration_missing';end if;
 end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_reconcile_external_deliveries(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare candidate record;admit record;r jsonb;cfg jsonb;reason text;state text;n integer:=0;l public.crm_leads;deadline timestamptz;kind text;
 new_delivery public.crm_external_deliveries;ordering text;scopes jsonb;admission_set jsonb;candidate_set jsonb;safety_fact text;
begin
 if auth.role() is distinct from 'service_role' then perform crm_security.require_reader(true);end if;
 if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform crm_security.lifecycle_barrier(false);
 perform pg_advisory_xact_lock(460049,0);

 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into admission_set from (
select lead_source.id lead_id,b.connection_id,b.id boundary_id,e.id epoch_id
   from public.crm_leads lead_source join public.crm_submissions s on s.id=lead_source.first_submission_id
   join public.crm_submission_attribution a on a.submission_id=s.id and a.provider='meta' and a.redacted_at is null
   join public.crm_form_mappings m on m.id=s.form_mapping_id
   join public.crm_lifecycle_producer_boundaries b on b.form_mapping_id=m.id and b.connection_id=m.connection_id and b.form_key=m.form_key
   join public.crm_integration_connections c on c.id=b.connection_id and c.provider='meta' and c.page_id=b.page_id
    and c.lifecycle_settings->>'mode'='live' and coalesce((c.lifecycle_settings->>'enabled')::boolean,false)
    and c.lifecycle_settings->>'dataset_id'=b.dataset_id and (c.lifecycle_settings->>'contract_id')::uuid=b.provider_contract_id
   join public.crm_lifecycle_activation_epochs e on e.connection_id=b.connection_id and e.provider_contract_id=b.provider_contract_id and e.ended_at is null
   join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id and p.connection_id=b.connection_id and p.form_mapping_id=m.id
    and p.lifecycle_model='r4_stage_entry' and p.version=b.policy_version and p.notice_version is not distinct from b.notice_version and p.notice_text_digest is not distinct from b.notice_text_digest
    and s.occurred_at>=p.effective_from and s.occurred_at<p.effective_until and (p.retired_at is null or s.occurred_at<p.retired_at)
   left join public.crm_lifecycle_eligibility_evidence g on g.submission_id=s.id and g.connection_id=b.connection_id and g.policy_id=p.id
    and g.event_type='grant' and g.redacted_at is null
   where s.channel='meta_instant_form' and s.match_status='resolved' and s.occurred_at>=greatest(b.valid_from,e.started_at,m.effective_from)
    and s.occurred_at<b.valid_until and b.revoked_at is null and b.legacy_exclusion_valid_until>clock_timestamp()
    and a.page_id=(select page_id from public.crm_integration_connections where id=b.connection_id) and a.form_id=b.form_key
    and (p.d2_requirement='advisory' or (g.id is not null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=g.id and rv.event_type='revoke')))
    and not exists(select 1 from public.crm_lifecycle_producer_ownership o where o.lead_id=lead_source.id and o.connection_id=b.connection_id)
   order by s.occurred_at,s.id limit p_limit
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('lead',x.lead_id,'connection',x.connection_id)),'[]') into scopes from (
  select (a->>'lead_id')::uuid lead_id,(a->>'connection_id')::uuid connection_id from jsonb_array_elements(admission_set) a
  union select pending_scope.lead_id,pending_scope.connection_id from (
   select ac.lead_id,coalesce(oo.connection_id,(legacy.projection->>'connection_id')::uuid) connection_id,min(ac.occurred_at) first_event
   from public.crm_activities ac join public.crm_leads sl on sl.id=ac.lead_id
   left join public.crm_submissions ss on ss.id=sl.first_submission_id
   left join public.crm_form_mappings fm on fm.id=ss.form_mapping_id
   left join public.crm_integration_connections cc on cc.id=fm.connection_id
   left join public.crm_lifecycle_producer_ownership oo on oo.lead_id=sl.id and oo.producer='eh_native'
   left join lateral(select crm_security.lifecycle_route(sl.id) projection) legacy on oo.id is null
   where ac.event_type in ('lead_created','lead_not_qualified','lead_lost','lead_qualified','lead_converted')
    and (oo.id is not null or legacy.projection->'mapping'->>'mode' is distinct from 'live')
    and not exists(select 1 from public.crm_external_deliveries dd where dd.activity_id=ac.id)
   group by ac.lead_id,coalesce(oo.connection_id,(legacy.projection->>'connection_id')::uuid)
   order by first_event,ac.lead_id,connection_id limit p_limit
  ) pending_scope
 ) x;
 -- Complete set before any row lock; candidate processing remains chronological.
 perform crm_security.lifecycle_scope_keys(scopes);
 perform crm_security.lifecycle_scope_rows(scopes,false);
 -- Admit only a separately compliant prospective first-submission cohort. No
 -- row is created for historical/current-Yearly, website or later-Meta leads.
 if auth.role()='service_role' then
  for admit in select * from jsonb_to_recordset(admission_set) x(lead_id uuid,connection_id uuid,boundary_id uuid,epoch_id uuid) loop
   begin perform crm_security.lifecycle_producer_eligible(admit.lead_id,admit.connection_id,admit.boundary_id,admit.epoch_id);n:=n+1;
   exception when sqlstate '22023' then null;end;
  end loop;
 end if;
 perform crm_security.lifecycle_scope_rows(scopes,true);
 for admit in select (x->>'lead_id')::uuid lead_id,(x->>'connection_id')::uuid connection_id,(x->>'boundary_id')::uuid boundary_id
  from jsonb_array_elements(admission_set) x loop
  select crm_security.lifecycle_safety_hold(safety_lead.first_submission_id,b.eligibility_policy_id) into safety_fact
   from public.crm_leads safety_lead join public.crm_lifecycle_producer_boundaries b on b.id=admit.boundary_id where safety_lead.id=admit.lead_id;
  if safety_fact in ('inquiry_refusal','source_restriction') then
   perform crm_security.lifecycle_insert_stop('opportunity',admit.lead_id,admit.connection_id,safety_fact,gen_random_uuid(),'form_choice',
    (select first_submission_id from public.crm_leads where id=admit.lead_id),
    (select p.safety_decision_reference from public.crm_lifecycle_producer_boundaries b join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id where b.id=admit.boundary_id));
  end if;
 end loop;
 if n>=p_limit then return n;end if;

 for candidate in select c.* from crm_security.lifecycle_event_candidates() c
  where exists(select 1 from jsonb_array_elements(scopes) sc where (sc->>'lead')::uuid=c.lead_id)
   and not exists(select 1 from public.crm_external_deliveries d where d.activity_id=c.activity_id and d.lifecycle_model='r4_stage_entry')
  order by c.event_time,c.activity_created_at,c.activity_id limit (p_limit-n) loop
  select * into l from public.crm_leads where id=candidate.lead_id;
  r:=crm_security.lifecycle_route(candidate.lead_id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';kind:=candidate.event_kind;
  if kind='converted' and (candidate.activity_id is distinct from l.conversion_activity_id
    or (select enrollment_id from public.crm_activities where id=candidate.activity_id) is distinct from l.enrollment_id
    or not exists(select 1 from public.enrollments e where e.id=l.enrollment_id and e.student_id=l.student_id and e.status in ('Confirmed','Validated'))) then
   reason:='invalid_conversion_evidence';
  end if;
  if kind='converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
  if (r->>'source_generated_at') is null or not isfinite((r->>'source_generated_at')::timestamptz)
   or (select time_source from public.crm_submissions where id=l.first_submission_id) is distinct from 'provider'
   or not isfinite(candidate.event_time) or floor(extract(epoch from (r->>'source_generated_at')::timestamptz))<=0
   or floor(extract(epoch from candidate.event_time))<=floor(extract(epoch from (r->>'source_generated_at')::timestamptz)) then
   reason:='provider_time_not_after_source';end if;
  deadline:=candidate.event_time+make_interval(secs=>(cfg->>'maximum_event_age_seconds')::integer);
  if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence','scope_excluded','historical_event','legacy_owned','producer_ownership_mismatch','contradictory_chronology') then state:='suppressed';
  elsif reason is not null then state:='blocked';
  elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
  elsif deadline<=clock_timestamp()+interval '8 seconds' then state:='suppressed';reason:='provider_age_expired';
  elsif exists(select 1 from public.crm_external_deliveries later join public.crm_activities la on la.id=later.activity_id
    where later.lead_id=candidate.lead_id and later.lifecycle_model='r4_stage_entry' and later.attempt_boundary_state<>'not_started'
      and row(later.event_time,la.created_at,later.activity_id)>row(candidate.event_time,candidate.activity_created_at,candidate.activity_id)) then
   state:='suppressed';reason:='contradictory_chronology';end if;
  new_delivery:=null;
  insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,
   attribution_submission_id,matching_submission_id,status,next_attempt_at,last_error_code,max_attempts,delivery_mode,provider_contract_id,activation_epoch_id,
   eligibility_evidence_id,send_deadline,terminal_at,lifecycle_model,producer_ownership_id)
  values(candidate.activity_id,candidate.lead_id,(r->>'connection_id')::uuid,kind,candidate.event_time,
   'eh:r4:'||candidate.activity_id||':'||(r->>'connection_id'),coalesce((cfg->>'version')::int,0),cfg,l.first_submission_id,(r->>'submission_id')::uuid,
   state,case when state in ('pending','blocked') then now() end,reason,coalesce((cfg->>'max_attempts')::int,5),'live',(r->>'contract_id')::uuid,
   (r->>'epoch_id')::uuid,(r->>'evidence_id')::uuid,deadline,case when state='suppressed' then clock_timestamp() end,'r4_stage_entry',(r->>'ownership_id')::uuid)
  on conflict do nothing returning * into new_delivery;
  if new_delivery.id is not null then
   n:=n+1;ordering:=crm_security.lifecycle_predecessor_hold(new_delivery);
   if ordering='contradictory_chronology' and new_delivery.status not in ('sent','dead','suppressed') then
    update public.crm_external_deliveries set status='suppressed',next_attempt_at=null,last_error_code=ordering,terminal_at=clock_timestamp(),updated_at=now()
    where id=new_delivery.id;
   end if;
  end if;
 end loop;

 -- Preserve the historical mock/fixture first-attainment path unchanged.
 if n<p_limit then
  for candidate in select distinct on (x.lead_id,x.event_type) x.id activity_id,x.lead_id,
    case x.event_type when 'lead_qualified' then 'qualified' else 'converted' end event_kind,x.occurred_at event_time,x.created_at activity_created_at
   from public.crm_activities x where exists(select 1 from jsonb_array_elements(scopes) sc where (sc->>'lead')::uuid=x.lead_id) and x.event_type in ('lead_qualified','lead_converted')
    and not exists(select 1 from public.crm_lifecycle_producer_ownership o where o.lead_id=x.lead_id and o.producer='eh_native')
    and not exists(select 1 from public.crm_external_deliveries d where d.lead_id=x.lead_id and d.event_kind=case x.event_type when 'lead_qualified' then 'qualified' else 'converted' end and d.lifecycle_model='legacy_first_attainment')
   order by x.lead_id,x.event_type,x.occurred_at,x.created_at,x.id limit (p_limit-n) loop
   select * into l from public.crm_leads where id=candidate.lead_id;r:=crm_security.lifecycle_route(l.id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';
   if cfg->>'mode' is distinct from 'mock' and reason is distinct from 'no_destination' then continue;end if;
   if candidate.event_kind='converted' and candidate.activity_id is distinct from l.conversion_activity_id then reason:='invalid_conversion_evidence';
   elsif candidate.event_kind='converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
   if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence','scope_excluded') then state:='suppressed';
   elsif reason is not null then state:='blocked';
   elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
   elsif candidate.event_time<(cfg->>'not_before')::timestamptz then state:='suppressed';reason:='historical_event';end if;
   insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,attribution_submission_id,matching_submission_id,
    status,next_attempt_at,last_error_code,max_attempts,delivery_mode,lifecycle_model,terminal_at)
   values(candidate.activity_id,l.id,(r->>'connection_id')::uuid,candidate.event_kind,candidate.event_time,'eh:'||candidate.activity_id||':'||coalesce(r->>'connection_id','none'),
    coalesce((cfg->>'version')::int,0),cfg,l.first_submission_id,(r->>'submission_id')::uuid,state,now(),reason,coalesce((cfg->>'max_attempts')::int,5),'mock','legacy_first_attainment',
    case when state='suppressed' then clock_timestamp() end) on conflict do nothing;if found then n:=n+1;end if;
  end loop;
 end if;
 return n;
end $function$;

commit;
