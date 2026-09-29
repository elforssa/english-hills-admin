-- CRM Batch 2: fail-closed live runtime, prospective epochs, diagnostics and retention.
begin;

create or replace function public.crm_configure_lifecycle(p_connection uuid,p_version bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;k text;cfg jsonb;contract public.crm_lifecycle_provider_contracts;
begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
 if c.provider='website' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['destination_id']<>'{}' then raise exception 'Invalid destination' using errcode='22023';end if;
  if not exists(select 1 from public.crm_integration_connections where id=(p_data->>'destination_id')::uuid and provider='meta') then raise exception 'Meta destination required' using errcode='22023';end if;
  update public.crm_integration_connections set lifecycle_destination_id=(p_data->>'destination_id')::uuid,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 elsif p_data->>'mode'='mock' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','api_version','secret_ref','events','action_source','allow_later_meta','max_attempts']<>'{}'
  or coalesce(p_data->>'dataset_id','') !~ '^[0-9]{1,32}$' or coalesce(p_data->>'api_version','') !~ '^v[0-9]{1,3}\.0$'
  or coalesce(p_data->>'secret_ref','') !~ '^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$'
  or jsonb_typeof(p_data->'events') is distinct from 'object' or (p_data->'events')-array['qualified','converted']<>'{}'
  or coalesce(p_data->>'action_source','') not in ('system_generated','phone_call','physical_store','other')
  or coalesce((p_data->>'max_attempts')::integer,5) not between 1 and 8 then raise exception 'Invalid fixture mapping' using errcode='22023';end if;
  foreach k in array array['qualified','converted'] loop
   if coalesce(p_data->'events'->>k,'') !~ '^[A-Za-z][A-Za-z0-9_ ]{0,63}$' or lower(p_data->'events'->>k) in ('purchase','revenue','payment') then raise exception 'Explicit lifecycle mapping required' using errcode='22023';end if;
  end loop;
  cfg:=p_data||jsonb_build_object('version',coalesce((c.lifecycle_settings->>'version')::int,0)+1,'enabled',coalesce((p_data->>'enabled')::boolean,false),
   'not_before',case when coalesce((p_data->>'enabled')::boolean,false) and not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then clock_timestamp() else coalesce((c.lifecycle_settings->>'not_before')::timestamptz,clock_timestamp()) end);
  update public.crm_integration_connections set lifecycle_settings=cfg,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 elsif p_data->>'mode'='live' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','secret_ref','contract_id','max_attempts']<>'{}'
   or coalesce((p_data->>'enabled')::boolean,false) or coalesce(p_data->>'dataset_id','') !~ '^[0-9]{1,32}$'
   or coalesce(p_data->>'secret_ref','') !~ '^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$'
   or coalesce((p_data->>'max_attempts')::integer,5) not between 1 and 8 then raise exception 'Disabled verified live mapping required' using errcode='22023';end if;
  select * into contract from public.crm_lifecycle_provider_contracts where id=(p_data->>'contract_id')::uuid and active for share;
  if not found or not contract.lead_id_only or contract.required_constants<>'{}'::jsonb then raise exception 'Verified provider contract required' using errcode='22023';end if;
  cfg:=jsonb_build_object('mode','live','enabled',false,'dataset_id',p_data->>'dataset_id','secret_ref',p_data->>'secret_ref',
   'contract_id',contract.id,'contract_key',contract.contract_key,'contract_revision',contract.revision,'api_version',contract.api_version,
   'events',jsonb_build_object('qualified',contract.qualified_event_name,'converted',contract.converted_event_name),'action_source',contract.action_source,
   'maximum_event_age_seconds',contract.maximum_event_age_seconds,'deduplication_window_seconds',contract.deduplication_window_seconds,
   'accepted_response_field',contract.accepted_response_field,'accepted_response_count',contract.accepted_response_count,
   'max_attempts',coalesce((p_data->>'max_attempts')::integer,5),'version',coalesce((c.lifecycle_settings->>'version')::int,0)+1);
  update public.crm_integration_connections set lifecycle_settings=cfg,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 else raise exception 'Invalid lifecycle mode' using errcode='22023';end if;
 return jsonb_build_object('id',c.id,'version',c.version,'lifecycle',c.lifecycle_settings-'secret_ref','destination_id',c.lifecycle_destination_id,
  'live_available',exists(select 1 from public.crm_lifecycle_provider_contracts where active));
end $$;

create function public.crm_activate_lifecycle_destination(p_connection uuid,p_version bigint,p_contract uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;contract public.crm_lifecycle_provider_contracts;epoch uuid;started timestamptz:=clock_timestamp();
begin
 perform crm_security.require_meta_worker();
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 select * into contract from public.crm_lifecycle_provider_contracts where id=p_contract and active for share;
 if c.id is null or c.version is distinct from p_version or contract.id is null or c.lifecycle_settings->>'mode' is distinct from 'live'
  or (c.lifecycle_settings->>'contract_id')::uuid is distinct from contract.id or coalesce((c.lifecycle_settings->>'enabled')::boolean,false)
  or exists(select 1 from public.crm_lifecycle_activation_epochs where connection_id=c.id and ended_at is null)
  or not exists(select 1 from public.crm_lifecycle_eligibility_policies p join public.crm_form_mappings m on m.id=p.form_mapping_id
    where p.connection_id=c.id and m.connection_id=c.id and m.channel='meta_instant_form'
      and m.effective_from<=started and (m.retired_at is null or m.retired_at>started)
      and p.effective_from<=started and p.effective_until>started and p.retired_at is null) then
  raise exception 'Destination is not ready for prospective activation' using errcode='22023';end if;
 insert into public.crm_lifecycle_activation_epochs(connection_id,provider_contract_id,started_at,activated_by)
 values(c.id,contract.id,started,'release_operator') returning id into epoch;
 update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object('enabled',true,'live_started_at',started,'activation_epoch_id',epoch),
  version=version+1,updated_at=now() where id=c.id;
 return epoch;
end $$;

create function public.crm_disable_lifecycle(p_connection uuid,p_version bigint) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;
begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
 update public.crm_lifecycle_activation_epochs set ended_at=clock_timestamp(),ended_by=auth.uid(),end_reason='director_disabled'
  where connection_id=c.id and ended_at is null;
 update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object('enabled',false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
end $$;

create or replace function crm_security.lifecycle_route(p_lead uuid) returns jsonb
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare l public.crm_leads;s public.crm_submissions;a public.crm_submission_attribution;c public.crm_integration_connections;source public.crm_integration_connections;
 cfg jsonb;grant_row public.crm_lifecycle_eligibility_evidence;epoch public.crm_lifecycle_activation_epochs;contract public.crm_lifecycle_provider_contracts;
begin
 select * into strict l from public.crm_leads where id=p_lead;
 select * into s from public.crm_submissions where id=l.first_submission_id;
 select c0.* into source from public.crm_integration_connections c0 join public.crm_form_mappings m on m.connection_id=c0.id where m.id=s.form_mapping_id;
 if s.channel='meta_instant_form' and source.provider='meta' then c:=source;
 elsif s.channel='website' and source.provider='website' then select * into c from public.crm_integration_connections where id=source.lifecycle_destination_id and provider='meta';
 else return jsonb_build_object('reason','no_destination');end if;
 if c.id is null then return jsonb_build_object('reason','no_destination');end if;
 cfg:=c.lifecycle_settings;
 if cfg->>'mode'='live' then
  if s.channel<>'meta_instant_form' or source.id is distinct from c.id then return jsonb_build_object('reason','scope_excluded');end if;
  select * into a from public.crm_submission_attribution where submission_id=s.id;
  select * into epoch from public.crm_lifecycle_activation_epochs where id=(cfg->>'activation_epoch_id')::uuid and connection_id=c.id and ended_at is null;
  select * into contract from public.crm_lifecycle_provider_contracts where id=(cfg->>'contract_id')::uuid and active;
  select e.* into grant_row from public.crm_lifecycle_eligibility_evidence e
   where e.submission_id=s.id and e.connection_id=c.id and e.event_type='grant' and e.redacted_at is null
    and not exists(select 1 from public.crm_lifecycle_eligibility_evidence r where r.supersedes_evidence_id=e.id and r.event_type='revoke')
   order by e.effective_at,e.id limit 1;
  return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'mapping',cfg,'epoch_id',epoch.id,'epoch_started_at',epoch.started_at,
   'contract_id',contract.id,'evidence_id',grant_row.id,'evidence_effective_at',grant_row.effective_at,
   'reason',case when a.redacted_at is not null then 'identity_redacted'
    when a.provider<>'meta' or a.external_submission_id is null or a.page_id is distinct from c.page_id then 'no_matching_identity'
    when epoch.id is null then 'outbound_disabled' when contract.id is null then 'provider_contract_unverified'
    when grant_row.id is null then 'sharing_evidence_missing' else null end);
 end if;
 if s.channel='website' and coalesce((cfg->>'allow_later_meta')::boolean,false) then
  select s0.* into s from public.crm_submissions s0 join public.crm_form_mappings m on m.id=s0.form_mapping_id
   where s0.lead_id=l.id and s0.match_status='resolved' and s0.channel='meta_instant_form' and m.connection_id=c.id order by s0.occurred_at,s0.received_at,s0.id limit 1;
  if not found then select * into s from public.crm_submissions where id=l.first_submission_id;end if;
 end if;
 select * into a from public.crm_submission_attribution where submission_id=s.id;
 return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'mapping',cfg,'reason',case when a.redacted_at is not null then 'identity_redacted'
  when a.provider='meta' and (a.external_submission_id is null or a.page_id is distinct from c.page_id) then 'no_matching_identity'
  when a.provider='website' and nullif(a.fbc,'') is null and nullif(a.fbp,'') is null then 'no_matching_identity'
  when a.provider not in ('meta','website') or a.provider is null then 'no_matching_identity'
  when a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then 'sharing_evidence_missing' else null end);
end $$;

create or replace function public.crm_reconcile_external_deliveries(p_limit integer default 100) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare activity record;r jsonb;cfg jsonb;reason text;state text;n integer:=0;l public.crm_leads;mode text;deadline timestamptz;
begin
 if auth.role() is distinct from 'service_role' then perform crm_security.require_reader(true);end if;
 if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:lifecycle:reconcile',0));
 for activity in select distinct on (x.lead_id,x.event_type) x.* from public.crm_activities x
  where x.event_type in ('lead_qualified','lead_converted') and not exists(select 1 from public.crm_external_deliveries d where d.lead_id=x.lead_id and d.event_kind=case x.event_type when 'lead_qualified' then 'qualified' else 'converted' end)
  order by x.lead_id,x.event_type,x.occurred_at,x.id limit p_limit loop
  select * into strict l from public.crm_leads where id=activity.lead_id;
  r:=crm_security.lifecycle_route(l.id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';mode:=coalesce(cfg->>'mode','mock');
  if activity.event_type='lead_converted' and (activity.id is distinct from l.conversion_activity_id or activity.enrollment_id is distinct from l.enrollment_id) then reason:='invalid_conversion_evidence';end if;
  if activity.event_type='lead_converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
  if mode='live' then deadline:=activity.occurred_at+make_interval(secs=>(cfg->>'maximum_event_age_seconds')::integer);end if;
  if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence','scope_excluded') then state:='suppressed';
  elsif reason is not null then state:='blocked';
  elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
  elsif mode='live' and (activity.occurred_at<(r->>'epoch_started_at')::timestamptz or (r->>'evidence_effective_at')::timestamptz>activity.occurred_at) then state:='suppressed';reason:='historical_event';
  elsif mode='live' and deadline<=now() then state:='suppressed';reason:='provider_age_expired';
  elsif mode<>'live' and activity.occurred_at<(cfg->>'not_before')::timestamptz then state:='suppressed';reason:='historical_event';
  elsif mode not in ('mock','live') then state:='blocked';reason:='configuration_missing';end if;
  insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,
   attribution_submission_id,matching_submission_id,status,next_attempt_at,last_error_code,max_attempts,delivery_mode,provider_contract_id,activation_epoch_id,eligibility_evidence_id,send_deadline,terminal_at)
  values(activity.id,l.id,(r->>'connection_id')::uuid,case activity.event_type when 'lead_qualified' then 'qualified' else 'converted' end,activity.occurred_at,
   'eh:'||activity.id||':'||coalesce(r->>'connection_id','none'),coalesce((cfg->>'version')::int,0),cfg,l.first_submission_id,(r->>'submission_id')::uuid,state,now(),reason,
   coalesce((cfg->>'max_attempts')::int,5),case when mode='live' then 'live' else 'mock' end,(r->>'contract_id')::uuid,(r->>'epoch_id')::uuid,(r->>'evidence_id')::uuid,deadline,
   case when state='suppressed' then now() end);n:=n+1;
 end loop;return n;
end $$;

create or replace function crm_security.lifecycle_hold(d public.crm_external_deliveries) returns text
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;epoch public.crm_lifecycle_activation_epochs;
begin
 if d.payload_erased_at is not null then return 'payload_erased';end if;
 select * into c from public.crm_integration_connections where id=d.connection_id;
 if not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then return 'outbound_disabled';end if;
 if d.event_kind='converted' and exists(select 1 from public.crm_leads where id=d.lead_id and conversion_review_required) then return 'conversion_review_required';end if;
 if d.delivery_mode='live' then
  if c.lifecycle_settings->>'mode' is distinct from 'live' or (c.lifecycle_settings->>'activation_epoch_id')::uuid is distinct from d.activation_epoch_id
   or (c.lifecycle_settings->>'contract_id')::uuid is distinct from d.provider_contract_id then return 'activation_ended';end if;
  select * into epoch from public.crm_lifecycle_activation_epochs where id=d.activation_epoch_id;
  if epoch.id is null or epoch.ended_at is not null or d.event_time<epoch.started_at then return 'activation_ended';end if;
  if d.send_deadline is null or d.send_deadline<=clock_timestamp() then return 'provider_age_expired';end if;
  select * into e from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id and event_type='grant' for share;
  if e.id is null or e.redacted_at is not null or e.effective_at>d.event_time
   or exists(select 1 from public.crm_lifecycle_eligibility_evidence r where r.supersedes_evidence_id=e.id and r.event_type='revoke') then return 'sharing_revoked';end if;
  select * into a from public.crm_submission_attribution where submission_id=e.submission_id;
  if a.redacted_at is not null then return 'identity_redacted';end if;
  if d.mapping_snapshot->>'mode' is distinct from 'live' then return 'configuration_missing';end if;
 else
  if c.lifecycle_settings->>'mode' is distinct from 'mock' then return 'live_not_available';end if;
  select * into a from public.crm_submission_attribution where submission_id=d.matching_submission_id;
  if a.submission_id is null or a.redacted_at is not null then return 'identity_redacted';end if;
  if a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then return 'sharing_evidence_missing';end if;
  if d.mapping_snapshot->>'mode' is distinct from 'mock' then return 'configuration_missing';end if;
 end if;
 return null;
end $$;

create function crm_security.claim_lifecycle_deliveries(p_limit integer,p_live boolean) returns jsonb
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;reason text;ids uuid[]:=array[]::uuid[];terminal_reason boolean;dedup_deadline timestamptz;retry_at timestamptz;
begin
 for d in select * from public.crm_external_deliveries where (delivery_mode='live')=p_live and payload_erased_at is null and
  (((status in ('pending','retry','unknown')) and next_attempt_at<=now()) or (status='sending' and lease_until<=now()))
  order by next_attempt_at,id limit p_limit for update skip locked loop
  if d.status='sending' then
   update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired' where delivery_id=d.id and finished_at is null;
   if d.delivery_mode='live' then
    select min(started_at)+make_interval(secs=>(d.mapping_snapshot->>'deduplication_window_seconds')::integer) into dedup_deadline
      from public.crm_external_delivery_attempts where delivery_id=d.id;
    retry_at:=clock_timestamp()+interval '30 seconds';
    if d.attempt_count>=d.max_attempts then
     update public.crm_external_deliveries set status='dead',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,last_error_code='attempts_exhausted',updated_at=now() where id=d.id;
    elsif d.send_deadline is null or retry_at>=d.send_deadline then
     update public.crm_external_deliveries set status='suppressed',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,last_error_code='provider_age_expired',updated_at=now() where id=d.id;
    elsif dedup_deadline is null or retry_at>=dedup_deadline then
     update public.crm_external_deliveries set status='unknown',lease_token=null,lease_until=null,next_attempt_at=null,last_error_code='deduplication_window_elapsed',updated_at=now() where id=d.id;
    else
     update public.crm_external_deliveries set status='unknown',lease_token=null,lease_until=null,next_attempt_at=retry_at,last_error_code='lease_expired',updated_at=now() where id=d.id;
    end if;
    continue;
   end if;
  end if;
  reason:=crm_security.lifecycle_hold(d);terminal_reason:=reason in ('activation_ended','provider_age_expired','identity_redacted','scope_excluded','historical_event','payload_erased','sharing_revoked');
  if d.attempt_count>=d.max_attempts then update public.crm_external_deliveries set status='dead',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,last_error_code='attempts_exhausted',updated_at=now() where id=d.id;
  elsif terminal_reason then update public.crm_external_deliveries set status='suppressed',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,last_error_code=reason,updated_at=now() where id=d.id;
  elsif reason is not null then update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=reason,updated_at=now() where id=d.id;
  else update public.crm_external_deliveries set status='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=d.id;ids:=array_append(ids,d.id);end if;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'lease_token',lease_token)) from public.crm_external_deliveries where id=any(ids)),'[]');
end $$;

create or replace function public.crm_claim_external_deliveries(p_limit integer default 3) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();if p_limit is null or p_limit not between 1 and 5 then raise exception 'Invalid limit' using errcode='22023';end if;
 return crm_security.claim_lifecycle_deliveries(p_limit,false);end $$;
create function public.crm_claim_external_deliveries(p_limit integer,p_allow_live boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();if p_limit is null or p_limit not between 1 and 3 or not p_allow_live then raise exception 'Live gate required' using errcode='42501';end if;
 return crm_security.claim_lifecycle_deliveries(p_limit,true);end $$;

create or replace function public.crm_get_external_delivery(p_delivery uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;s public.crm_submissions;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;reason text;lead_id text;
begin
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;reason:=crm_security.lifecycle_hold(d);if reason is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if d.delivery_mode='live' then select * into e from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id;lead_id:=e.source_external_id;
 else select * into s from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=s.id;end if;
 return jsonb_build_object('id',d.id,'event_kind',d.event_kind,'event_time',floor(extract(epoch from d.event_time))::bigint,'event_id',d.provider_event_id,'mode',d.delivery_mode,
  'mapping',d.mapping_snapshot,'payload',d.payload,'matching',case when d.payload is not null then null when d.delivery_mode='live' then jsonb_build_object('lead_id',lead_id,'adult_contact',true)
  else jsonb_strip_nulls(jsonb_build_object('lead_id',case when a.provider='meta' then a.external_submission_id end,'fbc',case when a.provider='website' then a.fbc end,
   'fbp',case when a.provider='website' then a.fbp end,'email',s.core_fields->>'email','phone',crm_security.normalize_phone(s.core_fields->>'phone'),'adult_contact',true)) end);
end $$;

create or replace function public.crm_prepare_external_delivery(p_delivery uuid,p_lease uuid,p_payload jsonb) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;e jsonb;u jsonb;item record;hash text;a public.crm_submission_attribution;source public.crm_submissions;phone text;email text;evidence public.crm_lifecycle_eligibility_evidence;
begin
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload_erased_at is not null then raise exception 'Stale lease' using errcode='40001';end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['data']<>'{}' or jsonb_typeof(p_payload->'data') is distinct from 'array' or jsonb_array_length(p_payload->'data')<>1 or octet_length(p_payload::text)>8192 then raise exception 'Invalid payload' using errcode='22023';end if;
 e:=p_payload->'data'->0;u:=e->'user_data';
 if e-array['event_name','event_time','event_id','action_source','user_data']<>'{}' or e->>'event_id' is distinct from d.provider_event_id
  or e->>'event_name' is distinct from d.mapping_snapshot->'events'->>d.event_kind or (e->>'event_time')::bigint is distinct from floor(extract(epoch from d.event_time))::bigint
  or e->>'action_source' is distinct from d.mapping_snapshot->>'action_source' or jsonb_typeof(u) is distinct from 'object' or u='{}' then raise exception 'Invalid event identity' using errcode='22023';end if;
 if d.delivery_mode='live' then
  select * into evidence from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id;
  if u-array['lead_id']<>'{}' or jsonb_typeof(u->'lead_id')<>'string' or u->>'lead_id' is distinct from evidence.source_external_id then raise exception 'Lead ID only contract required' using errcode='22023';end if;
 else
  if u-array['lead_id','em','ph','fbc','fbp']<>'{}' then raise exception 'Invalid match field' using errcode='22023';end if;
  for item in select * from jsonb_each(u) loop
   if item.key in ('em','ph') then if jsonb_typeof(item.value) is distinct from 'array' or jsonb_array_length(item.value)<>1 or coalesce(item.value->>0,'') !~ '^[a-f0-9]{64}$' then raise exception 'Hash required' using errcode='22023';end if;
   elsif jsonb_typeof(item.value) is distinct from 'string' or length(item.value#>>'{}') not between 1 and 256 then raise exception 'Invalid match field' using errcode='22023';end if;
  end loop;
  select * into source from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=source.id;
  phone:=crm_security.normalize_phone(source.core_fields->>'phone');email:=nullif(lower(btrim(source.core_fields->>'email')),'');
  if (u ? 'lead_id' and (a.provider<>'meta' or u->>'lead_id' is distinct from a.external_submission_id)) or (u ? 'fbc' and (a.provider<>'website' or u->>'fbc' is distinct from a.fbc))
   or (u ? 'fbp' and (a.provider<>'website' or u->>'fbp' is distinct from a.fbp)) or not (u ?| array['lead_id','fbc','fbp'])
   or (u ? 'em' and (u->'em'->>0 is distinct from encode(sha256(convert_to(email,'UTF8')),'hex'))) or (u ? 'ph' and (u->'ph'->>0 is distinct from encode(sha256(convert_to(substr(phone,2),'UTF8')),'hex')))
   then raise exception 'Matching identity differs from protected evidence' using errcode='22023';end if;
 end if;
 hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');if d.payload is not null then if d.payload_hash<>hash then raise exception 'Frozen payload conflict' using errcode='40001';end if;return hash;end if;
 update public.crm_external_deliveries set payload=p_payload,payload_hash=hash,provider_event_name=e->>'event_name',updated_at=now() where id=d.id;return hash;
end $$;

create or replace function public.crm_begin_external_attempt(p_delivery uuid,p_lease uuid) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;n integer;
begin
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload is null or d.payload_erased_at is not null then raise exception 'Stale/unprepared delivery' using errcode='40001';end if;
 if d.delivery_mode='live' then perform 1 from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id for update;end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if exists(select 1 from public.crm_external_delivery_attempts where delivery_id=d.id and lease_token=p_lease) then raise exception 'Attempt already begun' using errcode='40001';end if;
 n:=d.attempt_count+1;if n>d.max_attempts then raise exception 'Attempts exhausted' using errcode='40001';end if;
 insert into public.crm_external_delivery_attempts(delivery_id,attempt_number,lease_token) values(d.id,n,p_lease);update public.crm_external_deliveries set attempt_count=n where id=d.id;return n;
end $$;

create or replace function public.crm_finish_external_attempt(p_delivery uuid,p_lease uuid,p_result jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;state text;code text;delay integer;retry_at timestamptz;dedup_deadline timestamptz;
begin
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 state:=p_result->>'outcome';code:=p_result->>'error_code';
 if jsonb_typeof(p_result) is distinct from 'object' or p_result-array['outcome','error_code','http_status','request_id','retry_after']<>'{}'
  or state is null or state not in ('sent','retry','blocked','dead','unknown') or (code is not null and code not in ('rate_limit','provider_unavailable','provider_auth','validation','timeout','network','malformed_response'))
  or (state='sent' and (coalesce((p_result->>'http_status')::int,0) not between 200 and 299 or code is not null))
  or (p_result->>'request_id' is not null and p_result->>'request_id' !~ '^[A-Za-z0-9_-]{1,100}$') then raise exception 'Invalid attempt result' using errcode='22023';end if;
 update public.crm_external_delivery_attempts set outcome=state,finished_at=clock_timestamp(),http_status=(p_result->>'http_status')::int,provider_request_id=p_result->>'request_id',
  response_summary=case when state='sent' then '{"accepted":true}'::jsonb else null end,error_code=code where delivery_id=d.id and lease_token=p_lease and finished_at is null;
 if not found then raise exception 'Attempt missing' using errcode='40001';end if;
 delay:=least(86400,greatest(30,coalesce((p_result->>'retry_after')::int,0),least(21600,30*power(2,d.attempt_count)::int)+(random()*30)::int));retry_at:=now()+make_interval(secs=>delay);
 if state='unknown' and d.delivery_mode='live' then
  select min(started_at)+make_interval(secs=>(d.mapping_snapshot->>'deduplication_window_seconds')::integer) into dedup_deadline
    from public.crm_external_delivery_attempts where delivery_id=d.id;
  if dedup_deadline is null or retry_at>=dedup_deadline then retry_at:=null;code:='deduplication_window_elapsed';end if;
 end if;
 if state in ('retry','unknown') and (d.attempt_count>=d.max_attempts or (d.send_deadline is not null and coalesce(retry_at,now())>=d.send_deadline)) then state:='dead';code:='attempts_exhausted';retry_at:=null;end if;
 update public.crm_external_deliveries set status=state,lease_token=null,lease_until=null,updated_at=now(),last_error_code=code,
  next_attempt_at=case when state in ('retry','unknown') then retry_at end,sent_at=case when state='sent' then now() else sent_at end,
  terminal_at=case when state in ('sent','dead') then coalesce(terminal_at,clock_timestamp()) else terminal_at end where id=d.id;
end $$;

create or replace function public.crm_retry_external_delivery(p_delivery uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;cfg jsonb;hold text;dedup_deadline timestamptz;
begin
 perform crm_security.require_reader(true);select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status not in ('blocked','retry','unknown') or d.attempt_count>=d.max_attempts or d.payload_erased_at is not null
  or (d.next_attempt_at is not null and d.next_attempt_at>now()) then raise exception 'Delivery not eligible for retry' using errcode='22023';end if;
 if d.delivery_mode='live' and d.status='unknown' then
  select min(started_at)+make_interval(secs=>(d.mapping_snapshot->>'deduplication_window_seconds')::integer) into dedup_deadline
    from public.crm_external_delivery_attempts where delivery_id=d.id;
  if d.last_error_code='deduplication_window_elapsed' or dedup_deadline is null or now()+interval '8 seconds'>=dedup_deadline then raise exception 'Verified deduplication window required' using errcode='22023';end if;
 end if;
 if d.payload is null then select lifecycle_settings into cfg from public.crm_integration_connections where id=d.connection_id;
  if d.delivery_mode='live' and ((cfg->>'activation_epoch_id')::uuid is distinct from d.activation_epoch_id or (cfg->>'contract_id')::uuid is distinct from d.provider_contract_id) then
   raise exception 'Frozen live contract required' using errcode='22023';end if;
  d.mapping_snapshot:=cfg;d.mapping_version:=coalesce((cfg->>'version')::int,0);d.max_attempts:=coalesce((cfg->>'max_attempts')::int,5);
 end if;
 hold:=crm_security.lifecycle_hold(d);if hold is not null then raise exception 'Delivery still held' using errcode='22023';end if;
 insert into public.crm_lifecycle_retry_audit(delivery_id,requested_by,reason_code,prior_status) values(d.id,auth.uid(),'configuration_repaired',d.status);
 update public.crm_external_deliveries set status='pending',next_attempt_at=now(),last_error_code=null,updated_at=now(),mapping_snapshot=d.mapping_snapshot,mapping_version=d.mapping_version,max_attempts=d.max_attempts where id=d.id;
end $$;

create or replace function public.crm_list_external_deliveries(p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 perform crm_security.require_reader(true);if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'Invalid page' using errcode='22023';end if;
 select jsonb_build_object('total',(select count(*) from public.crm_external_deliveries),'live_available',exists(select 1 from public.crm_lifecycle_provider_contracts where active),
  'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.crm_external_deliveries group by status)c),
  'oldest_pending_at',(select min(event_time) from public.crm_external_deliveries where status in ('pending','retry','unknown','blocked')),
  'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into result from
 (select d.id,d.event_kind,d.delivery_mode,d.status,d.attempt_count,d.max_attempts,d.created_at,d.event_time,d.next_attempt_at,d.sent_at,d.last_error_code,d.mapping_version,d.eligibility_evidence_id,
  d.payload_erased_at,c.connection_key as destination_label,pc.contract_key,pc.revision as contract_revision,ep.started_at as activation_started_at,
  (select jsonb_agg(jsonb_build_object('number',a.attempt_number,'started_at',a.started_at,'finished_at',a.finished_at,'outcome',a.outcome,'http_status',a.http_status,'error_code',a.error_code,'erased_at',a.diagnostics_erased_at) order by a.attempt_number)
   from public.crm_external_delivery_attempts a where a.delivery_id=d.id) attempts
  from public.crm_external_deliveries d left join public.crm_integration_connections c on c.id=d.connection_id
  left join public.crm_lifecycle_provider_contracts pc on pc.id=d.provider_contract_id left join public.crm_lifecycle_activation_epochs ep on ep.id=d.activation_epoch_id
  order by d.created_at desc,d.id limit p_limit offset p_offset)x;
 return result;
end $$;

create function public.crm_lifecycle_diagnostics() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 perform crm_security.require_reader(true);
 select jsonb_build_object(
  'provider_contract_ready',exists(select 1 from public.crm_lifecycle_provider_contracts where active),
  'destinations',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'label',c.connection_key,
    'configured_mode',c.lifecycle_settings->>'mode','enabled',coalesce((c.lifecycle_settings->>'enabled')::boolean,false),'contract_key',c.lifecycle_settings->>'contract_key',
    'activation_started_at',c.lifecycle_settings->>'live_started_at') order by c.connection_key) from public.crm_integration_connections c where c.provider='meta'),'[]'),
  'forms',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'connection_id',m.connection_id,'form_key',m.form_key,'form_name',m.form_name,'version',m.version) order by m.created_at desc)
    from public.crm_form_mappings m where m.channel='meta_instant_form' and m.retired_at is null),'[]'),
  'policies',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'connection_id',p.connection_id,'form_mapping_id',p.form_mapping_id,'version',p.version,
    'notice_version',p.notice_version,'notice_text_digest',p.notice_text_digest,'effective_from',p.effective_from,'effective_until',p.effective_until,'retired_at',p.retired_at,
    'grants',(select count(*) from public.crm_lifecycle_eligibility_evidence e where e.policy_id=p.id and e.event_type='grant'),
    'revocations',(select count(*) from public.crm_lifecycle_eligibility_evidence e where e.policy_id=p.id and e.event_type='revoke')) order by p.created_at desc)
    from public.crm_lifecycle_eligibility_policies p),'[]'),
  'scheduler',(select to_jsonb(h) from public.crm_lifecycle_scheduler_health h where singleton),
  'activation_prerequisites',jsonb_build_array('official_provider_contract','active_form_evidence_manifest','approved_notice_and_field_mapping','destination_entitlement','release_approval')
 ) into result;return result;
end $$;

create function public.crm_record_lifecycle_scheduler_run(p_status text,p_counts jsonb default '{}',p_error_code text default null) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 perform crm_security.require_meta_worker();
 if p_status not in ('started','success','failed') or jsonb_typeof(p_counts)<>'object' or octet_length(p_counts::text)>2048
  or (p_status='failed' and p_error_code not in ('worker_unavailable','storage_unavailable','deadline_exceeded'))
  or (p_status<>'failed' and p_error_code is not null) then raise exception 'Invalid scheduler health' using errcode='22023';end if;
 update public.crm_lifecycle_scheduler_health set last_started_at=case when p_status='started' then clock_timestamp() else last_started_at end,
  last_success_at=case when p_status='success' then clock_timestamp() else last_success_at end,last_error_at=case when p_status='failed' then clock_timestamp() else last_error_at end,
  last_error_code=case when p_status='success' then null when p_status='failed' then p_error_code else last_error_code end,last_counts=case when p_status in ('success','failed') then p_counts else last_counts end where singleton;
end $$;

create or replace function crm_security.protect_lifecycle_evidence() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare retention_redaction boolean;
begin
 if tg_op='DELETE' then raise exception 'Lifecycle evidence history is immutable' using errcode='42501';end if;
 retention_redaction:=old.redacted_at is null and new.redacted_at is not null and new.submission_id is null and new.source_external_id is null and new.source_projection is null
  and (to_jsonb(new)-array['submission_id','source_external_id','source_projection','redacted_at'])=(to_jsonb(old)-array['submission_id','source_external_id','source_projection','redacted_at']);
 if retention_redaction then return new;end if;raise exception 'Lifecycle evidence history is immutable' using errcode='42501';
end $$;
drop trigger crm_lifecycle_evidence_append_only on public.crm_lifecycle_eligibility_evidence;
create trigger crm_lifecycle_evidence_immutable before update or delete on public.crm_lifecycle_eligibility_evidence for each row execute function crm_security.protect_lifecycle_evidence();

create function public.crm_cleanup_lifecycle_retention(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare payloads integer:=0;attempts integer:=0;evidence integer:=0;checks integer:=0;terminated integer:=0;redacted_revocations integer:=0;r record;
begin
 perform crm_security.require_meta_worker();if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid cleanup limit' using errcode='22023';end if;
 for r in select * from public.crm_external_deliveries where status in ('blocked','retry','unknown','sending') and
  ((send_deadline is not null and send_deadline<=now()) or (activation_epoch_id is not null and exists(select 1 from public.crm_lifecycle_activation_epochs e where e.id=activation_epoch_id and e.ended_at is not null))
    or (delivery_mode in ('mock','mock_legacy') and created_at<=now()-interval '90 days'))
  order by updated_at,id limit p_limit for update skip locked loop
  if r.status='sending' then update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired' where delivery_id=r.id and finished_at is null;end if;
  update public.crm_external_deliveries set status='suppressed',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,
   last_error_code=case when r.send_deadline is not null and r.send_deadline<=now() then 'provider_age_expired' when r.delivery_mode in ('mock','mock_legacy') then 'retention_expired' else 'activation_ended' end,updated_at=now() where id=r.id;terminated:=terminated+1;
 end loop;
 with due as (select id from public.crm_external_deliveries where terminal_at<=now()-interval '30 days' and payload_erased_at is null order by terminal_at,id limit p_limit for update skip locked)
 update public.crm_external_deliveries d set payload=null,payload_hash=null,matching_submission_id=null,payload_erased_at=clock_timestamp(),updated_at=now() from due where d.id=due.id;
 get diagnostics payloads=row_count;
 with due as (select id from public.crm_external_delivery_attempts where finished_at<=now()-interval '90 days' and diagnostics_erased_at is null order by finished_at,id limit p_limit for update skip locked)
 update public.crm_external_delivery_attempts a set started_at=null,finished_at=null,outcome=null,http_status=null,provider_request_id=null,response_summary=null,error_code=null,diagnostics_erased_at=clock_timestamp() from due where a.id=due.id;
 get diagnostics attempts=row_count;
 with due as (select c.id from public.crm_lifecycle_eligibility_checks c join public.crm_lifecycle_eligibility_policies p on p.id=c.policy_id
  where not c.eligible and c.redacted_at is null and least(p.effective_until,coalesce(p.retired_at,p.effective_until))<=now()-interval '90 days'
  order by c.checked_at,c.id limit p_limit for update of c skip locked)
 update public.crm_lifecycle_eligibility_checks c set submission_id=null,evidence_digest=null,redacted_at=clock_timestamp() from due where c.id=due.id;
 get diagnostics checks=row_count;
 for r in select e.* from public.crm_lifecycle_eligibility_evidence e where e.event_type='grant' and e.redacted_at is null and (
   (exists(select 1 from public.crm_external_deliveries d where d.eligibility_evidence_id=e.id) and not exists(select 1 from public.crm_external_deliveries d where d.eligibility_evidence_id=e.id and (d.terminal_at is null or d.terminal_at>now()-interval '90 days')))
   or (not exists(select 1 from public.crm_external_deliveries d where d.eligibility_evidence_id=e.id) and
      (select least(
        p.effective_until,coalesce(p.retired_at,p.effective_until),
        coalesce((select min(rv.effective_at) from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=e.id and rv.event_type='revoke'),p.effective_until),
        case when exists(select 1 from public.crm_lifecycle_activation_epochs open_epoch where open_epoch.connection_id=e.connection_id and open_epoch.ended_at is null)
          then p.effective_until else coalesce((select max(ep.ended_at) from public.crm_lifecycle_activation_epochs ep where ep.connection_id=e.connection_id),p.effective_until) end,
        coalesce(e.effective_at+make_interval(secs=>(select min(pc.maximum_event_age_seconds)::integer from public.crm_lifecycle_activation_epochs ep
          join public.crm_lifecycle_provider_contracts pc on pc.id=ep.provider_contract_id where ep.connection_id=e.connection_id)),p.effective_until))
       from public.crm_lifecycle_eligibility_policies p where p.id=e.policy_id)<=now()-interval '90 days'))
   order by e.recorded_at,e.id limit p_limit for update skip locked loop
  update public.crm_lifecycle_eligibility_checks set submission_id=null,evidence_digest=null,redacted_at=clock_timestamp()
   where submission_id=r.submission_id and policy_id=r.policy_id and redacted_at is null;
  update public.crm_lifecycle_eligibility_evidence set submission_id=null,source_external_id=null,source_projection=null,redacted_at=clock_timestamp()
   where supersedes_evidence_id=r.id and redacted_at is null;get diagnostics redacted_revocations=row_count;
  update public.crm_lifecycle_eligibility_evidence set submission_id=null,source_external_id=null,source_projection=null,redacted_at=clock_timestamp() where id=r.id;evidence:=evidence+1+redacted_revocations;
 end loop;
 return jsonb_build_object('terminated',terminated,'payloads_erased',payloads,'attempts_erased',attempts,'checks_erased',checks,'evidence_erased',evidence);
end $$;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_configure_lifecycle(uuid,bigint,jsonb),public.crm_activate_lifecycle_destination(uuid,bigint,uuid),public.crm_disable_lifecycle(uuid,bigint),
 public.crm_reconcile_external_deliveries(integer),public.crm_claim_external_deliveries(integer),public.crm_claim_external_deliveries(integer,boolean),
 public.crm_get_external_delivery(uuid,uuid),public.crm_prepare_external_delivery(uuid,uuid,jsonb),public.crm_begin_external_attempt(uuid,uuid),public.crm_finish_external_attempt(uuid,uuid,jsonb),
 public.crm_retry_external_delivery(uuid),public.crm_list_external_deliveries(integer,integer),public.crm_lifecycle_diagnostics(),
 public.crm_record_lifecycle_scheduler_run(text,jsonb,text),public.crm_cleanup_lifecycle_retention(integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_configure_lifecycle(uuid,bigint,jsonb),public.crm_disable_lifecycle(uuid,bigint),public.crm_retry_external_delivery(uuid),
 public.crm_list_external_deliveries(integer,integer),public.crm_lifecycle_diagnostics(),public.crm_reconcile_external_deliveries(integer) to authenticated;
grant execute on function public.crm_activate_lifecycle_destination(uuid,bigint,uuid),public.crm_reconcile_external_deliveries(integer),
 public.crm_claim_external_deliveries(integer),public.crm_claim_external_deliveries(integer,boolean),public.crm_get_external_delivery(uuid,uuid),
 public.crm_prepare_external_delivery(uuid,uuid,jsonb),public.crm_begin_external_attempt(uuid,uuid),public.crm_finish_external_attempt(uuid,uuid,jsonb),
 public.crm_record_lifecycle_scheduler_run(text,jsonb,text),public.crm_cleanup_lifecycle_retention(integer) to service_role;

notify pgrst,'reload schema';
commit;
