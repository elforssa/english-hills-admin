-- CRM Meta funnel revision 4: dormant reconciliation, chronological attempt
-- ordering, producer controls, no-uncertain-replay and safe diagnostics.
begin;

create or replace function public.crm_publish_lifecycle_policy(p_connection uuid,p_connection_version bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;m public.crm_form_mappings;p public.crm_lifecycle_eligibility_policies;next_version integer;effective timestamptz;
begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_connection_version then raise exception 'Refresh connection' using errcode='40001';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['form_mapping_id','notice_version','notice_text_digest','adult_field_key','adult_accepted_values','sharing_field_key','sharing_accepted_values','notice_field_key','notice_accepted_values','effective_from','effective_until']<>'{}'::jsonb then
  raise exception 'Invalid policy fields' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=(p_data->>'form_mapping_id')::uuid and connection_id=c.id and channel='meta_instant_form';
 if not found or m.form_key='1086266294126723' then raise exception 'Separately compliant Meta form mapping required' using errcode='22023';end if;
 effective:=(p_data->>'effective_from')::timestamptz;
 if effective<clock_timestamp() or (p_data->>'effective_until')::timestamptz<=effective then raise exception 'Prospective policy interval required' using errcode='22023';end if;
 if coalesce(p_data->>'notice_version','')='' or coalesce(p_data->>'notice_text_digest','')!~'^[a-f0-9]{64}$'
  or coalesce(p_data->>'adult_field_key','')='' or coalesce(p_data->>'sharing_field_key','')=''
  or not crm_security.valid_lifecycle_values(p_data->'adult_accepted_values') or not crm_security.valid_lifecycle_values(p_data->'sharing_accepted_values')
  or ((p_data->>'notice_field_key') is null)<>((p_data->'notice_accepted_values') is null)
  or (p_data->'notice_accepted_values' is not null and not crm_security.valid_lifecycle_values(p_data->'notice_accepted_values')) then
  raise exception 'Exact five-event evidence manifest required' using errcode='22023';end if;
 select coalesce(max(version),0)+1 into next_version from public.crm_lifecycle_eligibility_policies where connection_id=c.id and form_mapping_id=m.id;
 insert into public.crm_lifecycle_eligibility_policies(connection_id,form_mapping_id,version,notice_version,notice_text_digest,adult_field_key,adult_accepted_values,
  sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by,lifecycle_model,allowed_event_kinds)
 values(c.id,m.id,next_version,p_data->>'notice_version',p_data->>'notice_text_digest',p_data->>'adult_field_key',p_data->'adult_accepted_values',p_data->>'sharing_field_key',
  p_data->'sharing_accepted_values',p_data->>'notice_field_key',p_data->'notice_accepted_values',effective,(p_data->>'effective_until')::timestamptz,auth.uid(),
  'r4_stage_entry','["intake","not_qualified","lost","qualified","converted"]'::jsonb) returning * into p;
 update public.crm_integration_connections set version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
 return to_jsonb(p)-array['adult_accepted_values','sharing_accepted_values','notice_accepted_values'];
end $$;

create function public.crm_publish_lifecycle_producer_boundary(p_connection uuid,p_mapping uuid,p_valid_from timestamptz,p_valid_until timestamptz,
 p_exclusion_valid_until timestamptz,p_exclusion_reference text,p_verified_by text) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;m public.crm_form_mappings;contract public.crm_lifecycle_provider_contracts;
 policy public.crm_lifecycle_eligibility_policies;cfg jsonb;result uuid;
begin
 perform crm_security.require_meta_worker();
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=p_connection and channel='meta_instant_form' for share;
 cfg:=c.lifecycle_settings;
 select * into contract from public.crm_lifecycle_provider_contracts where id=(cfg->>'contract_id')::uuid and active
  and lifecycle_model='r4_stage_entry' and uncertainty_policy='no_uncertain_replay' and action_source='system_generated'
  and maximum_event_age_seconds between 1 and 604800 for share;
 select * into policy from public.crm_lifecycle_eligibility_policies where connection_id=p_connection and form_mapping_id=p_mapping
  and lifecycle_model='r4_stage_entry' and retired_at is null and effective_from<=p_valid_from and effective_until>=p_valid_until
  order by version desc limit 1 for share;
 if c.id is null or m.id is null or m.form_key='1086266294126723' or p_valid_from<clock_timestamp()
  or p_valid_until<=p_valid_from or p_exclusion_valid_until<p_valid_until
  or c.page_id!~'^[0-9]{1,32}$' or cfg->>'mode' is distinct from 'live' or coalesce((cfg->>'enabled')::boolean,false)
  or cfg->>'dataset_id'!~'^[0-9]{1,32}$' or contract.id is null or policy.id is null
  or contract.required_constants is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
  or contract.event_map is distinct from '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb
  or length(btrim(coalesce(p_exclusion_reference,''))) not between 8 and 200
  or length(btrim(coalesce(p_verified_by,''))) not between 3 and 100 then
  raise exception 'Verified prospective producer boundary required' using errcode='22023';end if;
 insert into public.crm_lifecycle_producer_boundaries(connection_id,form_mapping_id,form_key,page_id,dataset_id,provider_contract_id,eligibility_policy_id,
  policy_version,notice_version,notice_text_digest,lifecycle_model,permitted_producer,valid_from,valid_until,
  legacy_exclusion_verified,legacy_exclusion_reference,legacy_exclusion_verified_at,legacy_exclusion_valid_until,verified_by)
 values(c.id,m.id,m.form_key,c.page_id,cfg->>'dataset_id',contract.id,policy.id,policy.version,policy.notice_version,policy.notice_text_digest,
  'r4_stage_entry','eh_native',p_valid_from,p_valid_until,true,btrim(p_exclusion_reference),clock_timestamp(),p_exclusion_valid_until,btrim(p_verified_by))
 returning id into result;
 return result;
end $$;

create function crm_security.lifecycle_event_candidates(p_lead uuid default null)
returns table(activity_id uuid,lead_id uuid,event_kind text,event_time timestamptz,activity_created_at timestamptz)
language sql stable set search_path=pg_catalog,pg_temp as $$
 select a.id,a.lead_id,
  case a.event_type when 'lead_created' then 'intake' when 'lead_not_qualified' then 'not_qualified'
   when 'lead_lost' then 'lost' when 'lead_qualified' then 'qualified' when 'lead_converted' then 'converted' end,
  a.occurred_at,a.created_at
 from public.crm_activities a
 join public.crm_leads l on l.id=a.lead_id
 join public.crm_lifecycle_producer_ownership o on o.lead_id=l.id and o.producer='eh_native'
 where (p_lead is null or a.lead_id=p_lead)
  and ((a.event_type='lead_created' and a.to_status='NEW' and a.source_key='external-intake:'||l.first_submission_id||':lead')
   or (a.event_type='lead_not_qualified' and a.to_status='NOT_QUALIFIED')
   or (a.event_type='lead_lost' and a.to_status='LOST')
   or (a.event_type='lead_qualified' and a.to_status='QUALIFIED')
   or (a.event_type='lead_converted' and a.to_status='CONVERTED'))
  and (a.event_type not in ('lead_not_qualified','lead_lost','lead_qualified')
    or not exists(select 1 from public.crm_activities prior where prior.lead_id=a.lead_id and prior.event_type=a.event_type
      and row(prior.occurred_at,prior.created_at,prior.id)<row(a.occurred_at,a.created_at,a.id))
    or exists(select 1 from public.crm_activities reopened where reopened.lead_id=a.lead_id and reopened.event_type='lead_reopened'
      and row(reopened.occurred_at,reopened.created_at,reopened.id)<row(a.occurred_at,a.created_at,a.id)
      and exists(select 1 from public.crm_activities prior where prior.lead_id=a.lead_id and prior.event_type=a.event_type
        and row(prior.occurred_at,prior.created_at,prior.id)<row(reopened.occurred_at,reopened.created_at,reopened.id))
      and not exists(select 1 from public.crm_activities prior where prior.lead_id=a.lead_id and prior.event_type=a.event_type
        and row(prior.occurred_at,prior.created_at,prior.id)>row(reopened.occurred_at,reopened.created_at,reopened.id)
        and row(prior.occurred_at,prior.created_at,prior.id)<row(a.occurred_at,a.created_at,a.id))))
 order by a.occurred_at,a.created_at,a.id
$$;

create function crm_security.lifecycle_producer_eligible(p_lead uuid,p_connection uuid,p_boundary uuid,p_epoch uuid) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare l public.crm_leads;s public.crm_submissions;a public.crm_submission_attribution;m public.crm_form_mappings;c public.crm_integration_connections;b public.crm_lifecycle_producer_boundaries;
 e public.crm_lifecycle_activation_epochs;p public.crm_lifecycle_eligibility_policies;g public.crm_lifecycle_eligibility_evidence;o public.crm_lifecycle_producer_ownership;
begin
 perform crm_security.require_meta_worker();
 select * into l from public.crm_leads where id=p_lead for update;
 select * into s from public.crm_submissions where id=l.first_submission_id for share;
 select * into a from public.crm_submission_attribution where submission_id=s.id for share;
 select * into m from public.crm_form_mappings where id=s.form_mapping_id for share;
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for share;
 select * into b from public.crm_lifecycle_producer_boundaries where id=p_boundary and connection_id=p_connection for share;
 select * into e from public.crm_lifecycle_activation_epochs where id=p_epoch and connection_id=p_connection and ended_at is null for share;
 select * into p from public.crm_lifecycle_eligibility_policies where connection_id=p_connection and form_mapping_id=m.id and lifecycle_model='r4_stage_entry'
  and s.occurred_at>=effective_from and s.occurred_at<effective_until and (retired_at is null or s.occurred_at<retired_at) for share;
 select * into g from public.crm_lifecycle_eligibility_evidence g0 where g0.submission_id=s.id and g0.connection_id=p_connection and g0.policy_id=p.id and g0.event_type='grant'
  and g0.redacted_at is null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence r where r.supersedes_evidence_id=g0.id) for share;
 if l.id is null or s.id is null or a.submission_id is null or m.id is null or c.id is null or b.id is null or e.id is null or p.id is null or g.id is null
  or s.channel<>'meta_instant_form' or s.match_status<>'resolved' or s.lead_id is distinct from l.id or a.provider<>'meta' or a.redacted_at is not null
  or a.external_submission_id!~'^[0-9]{1,32}$' or a.page_id is distinct from c.page_id
  or a.form_id is distinct from b.form_key or m.id is distinct from b.form_mapping_id or m.form_key is distinct from b.form_key or b.form_key='1086266294126723'
  or b.page_id is distinct from c.page_id or b.dataset_id is distinct from c.lifecycle_settings->>'dataset_id'
  or b.provider_contract_id is distinct from e.provider_contract_id or b.provider_contract_id is distinct from (c.lifecycle_settings->>'contract_id')::uuid
  or b.eligibility_policy_id is distinct from p.id or b.policy_version is distinct from p.version
  or b.notice_version is distinct from p.notice_version or b.notice_text_digest is distinct from p.notice_text_digest
  or b.revoked_at is not null or not b.legacy_exclusion_verified or clock_timestamp()>=b.legacy_exclusion_valid_until
  or s.occurred_at<greatest(b.valid_from,e.started_at,p.effective_from,m.effective_from)
  or s.occurred_at>=least(b.valid_until,p.effective_until,coalesce(m.retired_at,b.valid_until)) then
  raise exception 'Producer ownership admission held' using errcode='22023';end if;
 select * into o from public.crm_lifecycle_producer_ownership where lead_id=l.id and connection_id=p_connection for update;
 if found then
  if o.producer<>'eh_native' or o.boundary_id is distinct from b.id or o.activation_epoch_id is distinct from e.id then
   raise exception 'Immutable producer ownership conflict' using errcode='42501';end if;
  return o.id;
 end if;
 insert into public.crm_lifecycle_producer_ownership(lead_id,connection_id,boundary_id,activation_epoch_id,producer)
 values(l.id,p_connection,b.id,e.id,'eh_native') returning id into o.id;
 return o.id;
end $$;

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
end $$;

create or replace function public.crm_activate_lifecycle_destination(p_connection uuid,p_version bigint,p_contract uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;contract public.crm_lifecycle_provider_contracts;epoch uuid;started timestamptz:=clock_timestamp();
begin
 perform crm_security.require_meta_worker();
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 select * into contract from public.crm_lifecycle_provider_contracts where id=p_contract and active and lifecycle_model='r4_stage_entry' and uncertainty_policy='no_uncertain_replay' for share;
 if c.id is null or c.version is distinct from p_version or contract.id is null or c.lifecycle_settings->>'mode' is distinct from 'live'
  or (c.lifecycle_settings->>'contract_id')::uuid is distinct from contract.id or coalesce((c.lifecycle_settings->>'enabled')::boolean,false)
  or exists(select 1 from public.crm_lifecycle_activation_epochs where connection_id=c.id and ended_at is null)
  or contract.action_source<>'system_generated' or contract.maximum_event_age_seconds not between 1 and 604800
  or not exists(select 1 from public.crm_lifecycle_producer_boundaries b join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id
    where b.connection_id=c.id and b.revoked_at is null and b.legacy_exclusion_verified and b.form_key<>'1086266294126723'
      and b.page_id=c.page_id and b.dataset_id=c.lifecycle_settings->>'dataset_id' and b.provider_contract_id=contract.id
      and b.policy_version=p.version and b.notice_version=p.notice_version and b.notice_text_digest=p.notice_text_digest
      and b.valid_from<=started and b.valid_until>started and b.legacy_exclusion_valid_until>started and p.lifecycle_model='r4_stage_entry'
      and p.effective_from<=started and p.effective_until>started and p.retired_at is null) then
  raise exception 'Destination is not ready for prospective revision-4 activation' using errcode='22023';end if;
 insert into public.crm_lifecycle_activation_epochs(connection_id,provider_contract_id,started_at,activated_by)
 values(c.id,contract.id,started,'release_operator') returning id into epoch;
 update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object('enabled',true,'live_started_at',started,'activation_epoch_id',epoch),
  version=version+1,updated_at=now() where id=c.id;
 return epoch;
end $$;

create or replace function crm_security.lifecycle_route(p_lead uuid) returns jsonb
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare l public.crm_leads;s public.crm_submissions;a public.crm_submission_attribution;m public.crm_form_mappings;c public.crm_integration_connections;source public.crm_integration_connections;
 cfg jsonb;grant_row public.crm_lifecycle_eligibility_evidence;policy public.crm_lifecycle_eligibility_policies;epoch public.crm_lifecycle_activation_epochs;
 contract public.crm_lifecycle_provider_contracts;boundary public.crm_lifecycle_producer_boundaries;ownership public.crm_lifecycle_producer_ownership;
begin
 select * into strict l from public.crm_leads where id=p_lead;
 select * into s from public.crm_submissions where id=l.first_submission_id;
 select * into m from public.crm_form_mappings where id=s.form_mapping_id;
 select * into source from public.crm_integration_connections where id=m.connection_id;
 if s.channel='meta_instant_form' and source.provider='meta' then c:=source;
 elsif s.channel='website' and source.provider='website' then select * into c from public.crm_integration_connections where id=source.lifecycle_destination_id and provider='meta';
 else return jsonb_build_object('reason','no_destination');end if;
 if c.id is null then return jsonb_build_object('reason','no_destination');end if;
 cfg:=c.lifecycle_settings;
 if cfg->>'mode'='live' then
  if s.channel<>'meta_instant_form' or source.id is distinct from c.id then return jsonb_build_object('connection_id',c.id,'reason','scope_excluded');end if;
  select * into a from public.crm_submission_attribution where submission_id=s.id;
  select * into epoch from public.crm_lifecycle_activation_epochs where id=(cfg->>'activation_epoch_id')::uuid and connection_id=c.id and ended_at is null;
  select * into contract from public.crm_lifecycle_provider_contracts where id=(cfg->>'contract_id')::uuid and active and lifecycle_model='r4_stage_entry';
  select * into policy from public.crm_lifecycle_eligibility_policies p where p.connection_id=c.id and p.form_mapping_id=m.id and p.lifecycle_model='r4_stage_entry'
   and s.occurred_at>=p.effective_from and s.occurred_at<p.effective_until and (p.retired_at is null or s.occurred_at<p.retired_at) order by p.version desc limit 1;
  select * into boundary from public.crm_lifecycle_producer_boundaries b where b.connection_id=c.id and b.form_mapping_id=m.id
   and b.form_key=m.form_key and b.page_id=c.page_id and b.dataset_id=cfg->>'dataset_id' and b.provider_contract_id=contract.id
   and b.eligibility_policy_id=policy.id and b.policy_version=policy.version and b.notice_version=policy.notice_version
   and b.notice_text_digest=policy.notice_text_digest and b.lifecycle_model='r4_stage_entry' and b.permitted_producer='eh_native'
   and s.occurred_at>=b.valid_from and s.occurred_at<b.valid_until order by b.valid_from desc limit 1;
  select e.* into grant_row from public.crm_lifecycle_eligibility_evidence e where e.submission_id=s.id and e.connection_id=c.id and e.policy_id=policy.id
   and e.event_type='grant' and e.redacted_at is null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence r where r.supersedes_evidence_id=e.id and r.event_type='revoke') limit 1;
  select * into ownership from public.crm_lifecycle_producer_ownership o where o.lead_id=l.id and o.connection_id=c.id;
  return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'source_generated_at',s.occurred_at,'mapping',cfg,'epoch_id',epoch.id,'epoch_started_at',epoch.started_at,
   'contract_id',contract.id,'evidence_id',grant_row.id,'evidence_effective_at',grant_row.effective_at,'policy_id',policy.id,'boundary_id',boundary.id,'ownership_id',ownership.id,
   'reason',case when a.redacted_at is not null then 'identity_redacted'
    when a.provider<>'meta' or a.external_submission_id!~'^[0-9]{1,32}$' or a.page_id is distinct from c.page_id or a.form_id is distinct from m.form_key then 'no_matching_identity'
    when m.form_key='1086266294126723' then 'scope_excluded'
    when epoch.id is null then 'outbound_disabled' when contract.id is null then 'provider_contract_unverified'
    when policy.id is null or grant_row.id is null then 'sharing_evidence_missing'
    when boundary.id is null then 'producer_boundary_missing'
    when boundary.revoked_at is not null or not boundary.legacy_exclusion_verified or clock_timestamp()<boundary.valid_from
      or clock_timestamp()>=least(boundary.valid_until,boundary.legacy_exclusion_valid_until) then 'producer_boundary_invalid'
    when s.occurred_at<greatest(boundary.valid_from,epoch.started_at,policy.effective_from,m.effective_from)
      or s.occurred_at>=least(boundary.valid_until,policy.effective_until,coalesce(m.retired_at,boundary.valid_until)) then 'historical_event'
    when ownership.id is null then 'producer_ownership_unknown'
    when ownership.producer<>'eh_native' then 'legacy_owned'
    when ownership.boundary_id is distinct from boundary.id or ownership.activation_epoch_id is distinct from epoch.id then 'producer_ownership_mismatch'
    else null end);
 end if;
 if s.channel='website' and coalesce((cfg->>'allow_later_meta')::boolean,false) then
  select s0.* into s from public.crm_submissions s0 join public.crm_form_mappings m0 on m0.id=s0.form_mapping_id
   where s0.lead_id=l.id and s0.match_status='resolved' and s0.channel='meta_instant_form' and m0.connection_id=c.id order by s0.occurred_at,s0.received_at,s0.id limit 1;
  if not found then select * into s from public.crm_submissions where id=l.first_submission_id;end if;
 end if;
 select * into a from public.crm_submission_attribution where submission_id=s.id;
 return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'source_generated_at',s.occurred_at,'mapping',cfg,'reason',case when a.redacted_at is not null then 'identity_redacted'
  when a.provider='meta' and (a.external_submission_id is null or a.page_id is distinct from c.page_id) then 'no_matching_identity'
  when a.provider='website' and nullif(a.fbc,'') is null and nullif(a.fbp,'') is null then 'no_matching_identity'
  when a.provider not in ('meta','website') or a.provider is null then 'no_matching_identity'
  when a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then 'sharing_evidence_missing' else null end);
end $$;

create or replace function crm_security.protect_delivery() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare retention_erasure boolean;terminal_backfill boolean;evidence_repair boolean:=false;repair_route jsonb;boundary_advance boolean;
begin
 if tg_op='DELETE' then raise exception 'Delivery history immutable' using errcode='42501';end if;
 terminal_backfill:=old.status in ('sent','dead','suppressed') and old.terminal_at is null and new.terminal_at is not null
  and (to_jsonb(new)-array['terminal_at','updated_at'])=(to_jsonb(old)-array['terminal_at','updated_at']);
 if terminal_backfill then return new;end if;
 retention_erasure:=old.terminal_at is not null and old.terminal_at<=clock_timestamp()-interval '30 days'
  and old.payload_erased_at is null and new.payload_erased_at is not null and new.payload is null and new.payload_hash is null and new.matching_submission_id is null
  and (to_jsonb(new)-array['payload','payload_hash','matching_submission_id','payload_erased_at','updated_at'])
    =(to_jsonb(old)-array['payload','payload_hash','matching_submission_id','payload_erased_at','updated_at']);
 if retention_erasure then return new;end if;
 if old.delivery_mode='live' and old.status='blocked' and old.last_error_code='sharing_evidence_missing'
  and old.eligibility_evidence_id is null and new.eligibility_evidence_id is not null and old.attempt_count=0 and new.attempt_count=0
  and old.payload is null and new.payload is null and old.provider_event_name is null and new.provider_event_name is null
  and old.terminal_at is null and new.status='pending' and new.last_error_code is null
  and not exists(select 1 from public.crm_external_delivery_attempts a where a.delivery_id=old.id)
  and (to_jsonb(new)-array['eligibility_evidence_id','status','next_attempt_at','last_error_code','updated_at'])
    =(to_jsonb(old)-array['eligibility_evidence_id','status','next_attempt_at','last_error_code','updated_at']) then
   repair_route:=crm_security.lifecycle_route(old.lead_id);
   evidence_repair:=(repair_route->>'reason') is null and (repair_route->>'evidence_id')::uuid is not distinct from new.eligibility_evidence_id;
 end if;
 if evidence_repair then return new;end if;
 boundary_advance := (old.attempt_boundary_state='not_started' and new.attempt_boundary_state='started' and new.attempt_boundary_at is not null)
  or (old.attempt_boundary_state='started' and new.attempt_boundary_state in ('confirmed','unknown') and new.attempt_boundary_at=old.attempt_boundary_at)
  or (old.attempt_boundary_state=new.attempt_boundary_state and new.attempt_boundary_at is not distinct from old.attempt_boundary_at);
 if not boundary_advance then raise exception 'Attempt boundary is irreversible' using errcode='42501';end if;
 if row(new.activity_id,new.lead_id,new.connection_id,new.event_kind,new.event_time,new.provider_event_id,new.attribution_submission_id,new.matching_submission_id,new.created_at,
        new.delivery_mode,new.provider_contract_id,new.activation_epoch_id,new.eligibility_evidence_id,new.send_deadline,new.lifecycle_model,new.producer_ownership_id)
    is distinct from
    row(old.activity_id,old.lead_id,old.connection_id,old.event_kind,old.event_time,old.provider_event_id,old.attribution_submission_id,old.matching_submission_id,old.created_at,
        old.delivery_mode,old.provider_contract_id,old.activation_epoch_id,old.eligibility_evidence_id,old.send_deadline,old.lifecycle_model,old.producer_ownership_id)
  or (old.payload is not null and row(new.payload,new.payload_hash,new.provider_event_name,new.mapping_version,new.mapping_snapshot,new.max_attempts)
    is distinct from row(old.payload,old.payload_hash,old.provider_event_name,old.mapping_version,old.mapping_snapshot,old.max_attempts))
  or old.status in ('sent','dead','suppressed') then raise exception 'Frozen delivery identity/payload' using errcode='42501';end if;
 return new;
end $$;

create function crm_security.lifecycle_predecessor_hold(d public.crm_external_deliveries) returns text
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare current_created timestamptz;intake record;prior record;
begin
 if d.lifecycle_model<>'r4_stage_entry' then return null;end if;
 select created_at into current_created from public.crm_activities where id=d.activity_id;
 select * into intake from crm_security.lifecycle_event_candidates(d.lead_id) c where c.event_kind='intake' order by c.event_time,c.activity_created_at,c.activity_id limit 1;
 if intake.activity_id is null then return 'intake_provenance_missing';end if;
 if row(intake.event_time,intake.activity_created_at,intake.activity_id)>row(d.event_time,current_created,d.activity_id) then return 'contradictory_chronology';end if;
 if exists(select 1 from crm_security.lifecycle_event_candidates(d.lead_id) c
   where c.activity_id<>intake.activity_id and row(c.event_time,c.activity_created_at,c.activity_id)<row(intake.event_time,intake.activity_created_at,intake.activity_id)) then
  return 'contradictory_chronology';end if;
 for prior in select c.*,p.id delivery_id,p.status,p.attempt_boundary_state,p.lease_until
  from crm_security.lifecycle_event_candidates(d.lead_id) c
  left join public.crm_external_deliveries p on p.activity_id=c.activity_id and p.connection_id=d.connection_id and p.lifecycle_model='r4_stage_entry'
  where row(c.event_time,c.activity_created_at,c.activity_id)<row(d.event_time,current_created,d.activity_id)
  order by c.event_time,c.activity_created_at,c.activity_id loop
  if prior.delivery_id is null then return 'unattempted_predecessor';end if;
  if prior.attempt_boundary_state='not_started' then return 'unattempted_predecessor';end if;
  if prior.attempt_boundary_state='started' and prior.status='sending' then return 'active_predecessor';end if;
 end loop;
 return null;
end $$;

create or replace function public.crm_reconcile_external_deliveries(p_limit integer default 100) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare candidate record;admit record;r jsonb;cfg jsonb;reason text;state text;n integer:=0;l public.crm_leads;deadline timestamptz;kind text;
 new_delivery public.crm_external_deliveries;ordering text;
begin
 if auth.role() is distinct from 'service_role' then perform crm_security.require_reader(true);end if;
 if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:lifecycle:reconcile',0));

 -- Admit only a separately compliant prospective first-submission cohort. No
 -- row is created for historical/current-Yearly, website or later-Meta leads.
 if auth.role()='service_role' then
  for admit in select lead_source.id lead_id,b.connection_id,b.id boundary_id,e.id epoch_id
   from public.crm_leads lead_source join public.crm_submissions s on s.id=lead_source.first_submission_id
   join public.crm_submission_attribution a on a.submission_id=s.id and a.provider='meta' and a.redacted_at is null
   join public.crm_form_mappings m on m.id=s.form_mapping_id
   join public.crm_lifecycle_producer_boundaries b on b.form_mapping_id=m.id and b.connection_id=m.connection_id and b.form_key=m.form_key
   join public.crm_integration_connections c on c.id=b.connection_id and c.provider='meta' and c.page_id=b.page_id
    and c.lifecycle_settings->>'mode'='live' and coalesce((c.lifecycle_settings->>'enabled')::boolean,false)
    and c.lifecycle_settings->>'dataset_id'=b.dataset_id and (c.lifecycle_settings->>'contract_id')::uuid=b.provider_contract_id
   join public.crm_lifecycle_activation_epochs e on e.connection_id=b.connection_id and e.provider_contract_id=b.provider_contract_id and e.ended_at is null
   join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id and p.connection_id=b.connection_id and p.form_mapping_id=m.id
    and p.lifecycle_model='r4_stage_entry' and p.version=b.policy_version and p.notice_version=b.notice_version and p.notice_text_digest=b.notice_text_digest
    and s.occurred_at>=p.effective_from and s.occurred_at<p.effective_until and (p.retired_at is null or s.occurred_at<p.retired_at)
   join public.crm_lifecycle_eligibility_evidence g on g.submission_id=s.id and g.connection_id=b.connection_id and g.policy_id=p.id
    and g.event_type='grant' and g.redacted_at is null
   where s.channel='meta_instant_form' and s.match_status='resolved' and s.occurred_at>=greatest(b.valid_from,e.started_at,m.effective_from)
    and s.occurred_at<b.valid_until and b.revoked_at is null and b.legacy_exclusion_valid_until>clock_timestamp()
    and a.page_id=(select page_id from public.crm_integration_connections where id=b.connection_id) and a.form_id=b.form_key
    and not exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=g.id and rv.event_type='revoke')
    and not exists(select 1 from public.crm_lifecycle_producer_ownership o where o.lead_id=lead_source.id and o.connection_id=b.connection_id)
   order by s.occurred_at,s.id limit p_limit loop
   begin perform crm_security.lifecycle_producer_eligible(admit.lead_id,admit.connection_id,admit.boundary_id,admit.epoch_id);n:=n+1;
   exception when sqlstate '22023' then null;end;
  end loop;
 end if;
 if n>=p_limit then return n;end if;

 for candidate in select c.* from crm_security.lifecycle_event_candidates() c
  where not exists(select 1 from public.crm_external_deliveries d where d.activity_id=c.activity_id and d.lifecycle_model='r4_stage_entry')
  order by c.event_time,c.activity_created_at,c.activity_id limit (p_limit-n) loop
  select * into l from public.crm_leads where id=candidate.lead_id;
  r:=crm_security.lifecycle_route(candidate.lead_id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';kind:=candidate.event_kind;
  if kind='converted' and (candidate.activity_id is distinct from l.conversion_activity_id
    or (select enrollment_id from public.crm_activities where id=candidate.activity_id) is distinct from l.enrollment_id
    or not exists(select 1 from public.enrollments e where e.id=l.enrollment_id and e.student_id=l.student_id and e.status in ('Confirmed','Validated'))) then
   reason:='invalid_conversion_evidence';
  end if;
  if kind='converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
  if candidate.event_time<(r->>'source_generated_at')::timestamptz then reason:='contradictory_chronology';end if;
  deadline:=candidate.event_time+make_interval(secs=>(cfg->>'maximum_event_age_seconds')::integer);
  if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence','scope_excluded','historical_event','legacy_owned','producer_ownership_mismatch','contradictory_chronology') then state:='suppressed';
  elsif reason is not null then state:='blocked';
  elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
  elsif deadline<=clock_timestamp()+interval '8 seconds' then state:='suppressed';reason:='provider_age_expired';
  elsif exists(select 1 from public.crm_external_deliveries later join public.crm_activities la on la.id=later.activity_id
    where later.lead_id=candidate.lead_id and later.lifecycle_model='r4_stage_entry' and later.attempt_boundary_state<>'not_started'
      and row(later.event_time,la.created_at,later.activity_id)>row(candidate.event_time,candidate.activity_created_at,candidate.activity_id)) then
   state:='blocked';reason:='contradictory_chronology';end if;
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
   from public.crm_activities x where x.event_type in ('lead_qualified','lead_converted')
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
end $$;

create or replace function crm_security.lifecycle_hold(d public.crm_external_deliveries) returns text
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;epoch public.crm_lifecycle_activation_epochs;
 o public.crm_lifecycle_producer_ownership;b public.crm_lifecycle_producer_boundaries;p public.crm_lifecycle_eligibility_policies;r jsonb;ordering text;
begin
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
  select * into o from public.crm_lifecycle_producer_ownership where id=d.producer_ownership_id and lead_id=d.lead_id and connection_id=d.connection_id for share;
  if o.id is null then return 'producer_ownership_unknown';elsif o.producer<>'eh_native' then return 'legacy_owned';end if;
  select * into b from public.crm_lifecycle_producer_boundaries where id=o.boundary_id and connection_id=d.connection_id for share;
  if b.id is null or b.revoked_at is not null or not b.legacy_exclusion_verified or clock_timestamp()<b.valid_from
   or clock_timestamp()>=least(b.valid_until,b.legacy_exclusion_valid_until) then return 'producer_boundary_invalid';end if;
  select * into e from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id and event_type='grant' for share;
  select * into p from public.crm_lifecycle_eligibility_policies where id=e.policy_id and lifecycle_model='r4_stage_entry' for share;
  if e.id is null or p.id is null or not (p.allowed_event_kinds ? d.event_kind) or e.redacted_at is not null or e.effective_at>d.event_time
   or exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=e.id and rv.event_type='revoke') then return 'sharing_revoked';end if;
  if b.page_id is distinct from c.page_id or b.dataset_id is distinct from c.lifecycle_settings->>'dataset_id'
   or b.provider_contract_id is distinct from d.provider_contract_id or b.provider_contract_id is distinct from epoch.provider_contract_id
   or b.eligibility_policy_id is distinct from p.id or b.policy_version is distinct from p.version
   or b.notice_version is distinct from p.notice_version or b.notice_text_digest is distinct from p.notice_text_digest then return 'producer_boundary_invalid';end if;
  select * into a from public.crm_submission_attribution where submission_id=e.submission_id;
  if a.redacted_at is not null then return 'identity_redacted';end if;
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
end $$;

create or replace function crm_security.claim_lifecycle_deliveries(p_limit integer,p_live boolean) returns jsonb
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;reason text;ids uuid[]:=array[]::uuid[];terminal_reason boolean;attempt_started boolean;
begin
 for d in select * from public.crm_external_deliveries where (delivery_mode='live')=p_live and payload_erased_at is null
  and (((status in ('pending','retry') or (status='blocked' and lifecycle_model='r4_stage_entry'
      and last_error_code in ('unattempted_predecessor','active_predecessor'))
      or (status='unknown' and lifecycle_model='legacy_first_attainment')) and next_attempt_at<=now())
    or (status='sending' and lease_until<=now()))
  order by event_time,created_at,id limit least(100,greatest(20,p_limit*20)) for update skip locked loop
  if d.status='sending' then
   select exists(select 1 from public.crm_external_delivery_attempts x where x.delivery_id=d.id and x.lease_token=d.lease_token) into attempt_started;
   if not attempt_started then
    update public.crm_external_deliveries set status='pending',lease_token=null,lease_until=null,next_attempt_at=now(),last_error_code=null,updated_at=now() where id=d.id;
    d.status:='pending';d.lease_token:=null;d.lease_until:=null;
   elsif d.lifecycle_model='r4_stage_entry' then
    update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
     where delivery_id=d.id and lease_token=d.lease_token and finished_at is null;
    update public.crm_external_deliveries set status='unknown',attempt_boundary_state='unknown',lease_token=null,lease_until=null,next_attempt_at=null,
     last_error_code='lease_expired_after_dispatch',updated_at=now() where id=d.id;
    continue;
   elsif d.delivery_mode='mock' then
    update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
     where delivery_id=d.id and lease_token=d.lease_token and finished_at is null;
   else
    update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
     where delivery_id=d.id and lease_token=d.lease_token and finished_at is null;
    update public.crm_external_deliveries set status='unknown',lease_token=null,lease_until=null,next_attempt_at=now()+interval '30 seconds',last_error_code='lease_expired',updated_at=now() where id=d.id;
    continue;
   end if;
  end if;
  reason:=crm_security.lifecycle_hold(d);terminal_reason:=reason in ('activation_ended','provider_age_expired','identity_redacted','scope_excluded','historical_event','payload_erased','sharing_revoked','legacy_owned','producer_ownership_mismatch','contradictory_chronology');
  if d.attempt_count>=d.max_attempts then
   update public.crm_external_deliveries set status='dead',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,last_error_code='attempts_exhausted',updated_at=now() where id=d.id;
  elsif terminal_reason then
   update public.crm_external_deliveries set status='suppressed',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,last_error_code=reason,updated_at=now() where id=d.id;
  elsif reason is not null then
   update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=reason,updated_at=now() where id=d.id;
  else
   update public.crm_external_deliveries set status='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=d.id;
   ids:=array_append(ids,d.id);if cardinality(ids)>=p_limit then exit;end if;
  end if;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'lease_token',lease_token) order by event_time,created_at,id) from public.crm_external_deliveries where id=any(ids)),'[]');
end $$;

create or replace function public.crm_get_external_delivery(p_delivery uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;s public.crm_submissions;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;reason text;lead_id text;
begin
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;reason:=crm_security.lifecycle_hold(d);if reason is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if d.delivery_mode='live' then select * into e from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id;lead_id:=e.source_external_id;
 else select * into s from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=s.id;end if;
 select * into s from public.crm_submissions where id=d.attribution_submission_id;
 return jsonb_build_object('id',d.id,'event_kind',d.event_kind,'event_time',floor(extract(epoch from d.event_time))::bigint,
  'source_generated_time',floor(extract(epoch from s.occurred_at))::bigint,'event_id',d.provider_event_id,'mode',d.delivery_mode,
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
 if e->>'event_id' is distinct from d.provider_event_id or e->>'event_name' is distinct from d.mapping_snapshot->'events'->>d.event_kind
  or (e->>'event_time')::bigint is distinct from floor(extract(epoch from d.event_time))::bigint or e->>'action_source' is distinct from d.mapping_snapshot->>'action_source'
  or jsonb_typeof(u) is distinct from 'object' or u='{}' then raise exception 'Invalid event identity' using errcode='22023';end if;
 if d.delivery_mode='live' then
  if e-array['event_name','event_time','event_id','action_source','user_data','custom_data']<>'{}'
   or e->'custom_data' is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb then raise exception 'Closed CRM payload required' using errcode='22023';end if;
  select * into evidence from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id;
  if u-array['lead_id']<>'{}' or jsonb_typeof(u->'lead_id')<>'string' or u->>'lead_id' is distinct from evidence.source_external_id
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
 if d.payload is not null then if d.payload_hash<>hash then raise exception 'Frozen payload conflict' using errcode='40001';end if;return hash;end if;
 update public.crm_external_deliveries set payload=p_payload,payload_hash=hash,provider_event_name=e->>'event_name',updated_at=now() where id=d.id;return hash;
end $$;

create or replace function public.crm_begin_external_attempt(p_delivery uuid,p_lease uuid) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;n integer;ordering text;boundary_at timestamptz:=clock_timestamp();
begin
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery;
 if not found then raise exception 'Stale/unprepared delivery' using errcode='40001';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:lifecycle:lead:'||d.lead_id,0));
 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload is null or d.payload_erased_at is not null
  or (d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state<>'not_started') then raise exception 'Stale/unprepared delivery' using errcode='40001';end if;
 if d.delivery_mode='live' then
  perform 1 from public.crm_lifecycle_producer_ownership where id=d.producer_ownership_id for update;
  perform 1 from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id for update;
 end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 ordering:=crm_security.lifecycle_predecessor_hold(d);if ordering is not null then raise exception 'Chronological attempt held' using errcode='42501';end if;
 if exists(select 1 from public.crm_external_delivery_attempts where delivery_id=d.id and lease_token=p_lease) then raise exception 'Attempt already begun' using errcode='40001';end if;
 n:=d.attempt_count+1;if n>d.max_attempts then raise exception 'Attempts exhausted' using errcode='40001';end if;
 insert into public.crm_external_delivery_attempts(delivery_id,attempt_number,lease_token) values(d.id,n,p_lease);
 update public.crm_external_deliveries set attempt_count=n,
  attempt_boundary_state=case when lifecycle_model='r4_stage_entry' then 'started' else attempt_boundary_state end,
  attempt_boundary_at=case when lifecycle_model='r4_stage_entry' then boundary_at else attempt_boundary_at end,updated_at=now() where id=d.id;
 return n;
end $$;

create or replace function public.crm_finish_external_attempt(p_delivery uuid,p_lease uuid,p_result jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;state text;code text;delay integer;retry_at timestamptz;boundary_state text;
begin
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now()
  or (d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state<>'started') then raise exception 'Stale lease' using errcode='40001';end if;
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
  if coalesce((p_result->>'http_status')::int,0) between 200 and 299 and state<>'sent' then
   state:='unknown';code:='malformed_response';
  elsif (p_result->>'http_status')::int=429 then
   state:='unknown';code:='rate_limit';
  elsif (p_result->>'http_status')::int>=500 then
   state:='unknown';code:='provider_unavailable';
  elsif code in ('rate_limit','provider_unavailable','timeout','network','malformed_response') then
   state:='unknown';
  end if;
  if state in ('retry','unknown') then state:='unknown';code:=coalesce(code,'ambiguous_dispatch');boundary_state:='unknown';
  elsif state='sent' then boundary_state:='confirmed';
  else boundary_state:='confirmed';end if;
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
 if not found then raise exception 'Attempt missing' using errcode='40001';end if;
 update public.crm_external_deliveries set status=state,attempt_boundary_state=boundary_state,lease_token=null,lease_until=null,updated_at=now(),last_error_code=code,
  next_attempt_at=retry_at,sent_at=case when state='sent' then now() else sent_at end,
  terminal_at=case when state in ('sent','dead') then coalesce(terminal_at,clock_timestamp()) else terminal_at end where id=d.id;
end $$;

create or replace function public.crm_retry_external_delivery(p_delivery uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.crm_external_deliveries;cfg jsonb;hold text;
begin
 perform crm_security.require_reader(true);select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status not in ('blocked','retry','unknown') or d.attempt_count>=d.max_attempts or d.payload_erased_at is not null
  or (d.next_attempt_at is not null and d.next_attempt_at>now()) then raise exception 'Delivery not eligible for retry' using errcode='22023';end if;
 if d.lifecycle_model='r4_stage_entry' and (d.attempt_boundary_state<>'not_started' or d.attempt_count<>0
  or exists(select 1 from public.crm_external_delivery_attempts a where a.delivery_id=d.id)) then
  raise exception 'Potentially dispatched delivery cannot be replayed' using errcode='22023';end if;
 if d.payload is null then select lifecycle_settings into cfg from public.crm_integration_connections where id=d.connection_id;
  if d.delivery_mode='live' and ((cfg->>'activation_epoch_id')::uuid is distinct from d.activation_epoch_id or (cfg->>'contract_id')::uuid is distinct from d.provider_contract_id
   or cfg->>'lifecycle_model' is distinct from d.lifecycle_model) then raise exception 'Frozen live contract required' using errcode='22023';end if;
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
 select jsonb_build_object('total',(select count(*) from public.crm_external_deliveries),
  'live_available',exists(select 1 from public.crm_lifecycle_provider_contracts where active and lifecycle_model='r4_stage_entry'
    and uncertainty_policy='no_uncertain_replay' and action_source='system_generated' and maximum_event_age_seconds between 1 and 604800
    and required_constants='{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
    and event_map='{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb),
  'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.crm_external_deliveries group by status)c),
  'oldest_pending_at',(select min(event_time) from public.crm_external_deliveries where status in ('pending','retry','unknown','blocked')),
  'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into result from
 (select d.id,d.event_kind,d.delivery_mode,d.lifecycle_model,d.status,d.attempt_boundary_state,d.attempt_count,d.max_attempts,d.created_at,d.event_time,
  d.next_attempt_at,d.sent_at,d.last_error_code,d.mapping_version,d.eligibility_evidence_id,d.payload_erased_at,c.connection_key as destination_label,
  pc.contract_key,pc.revision as contract_revision,ep.started_at as activation_started_at,
  case when d.lifecycle_model='r4_stage_entry' then o.producer else null end producer_owner,
  case when d.lifecycle_model='r4_stage_entry' then crm_security.lifecycle_predecessor_hold(d) end ordering_hold,
  (d.status in ('blocked','retry','unknown') and d.payload_erased_at is null and d.attempt_boundary_state='not_started' and d.attempt_count=0
    and not exists(select 1 from public.crm_external_delivery_attempts ax where ax.delivery_id=d.id)) retry_eligible,
  (select jsonb_agg(jsonb_build_object('number',a.attempt_number,'started_at',a.started_at,'finished_at',a.finished_at,'outcome',a.outcome,
    'http_status',a.http_status,'error_code',a.error_code,'erased_at',a.diagnostics_erased_at) order by a.attempt_number)
   from public.crm_external_delivery_attempts a where a.delivery_id=d.id) attempts
  from public.crm_external_deliveries d left join public.crm_integration_connections c on c.id=d.connection_id
  left join public.crm_lifecycle_provider_contracts pc on pc.id=d.provider_contract_id
  left join public.crm_lifecycle_activation_epochs ep on ep.id=d.activation_epoch_id
  left join public.crm_lifecycle_producer_ownership o on o.id=d.producer_ownership_id
  order by d.created_at desc,d.id limit p_limit offset p_offset)x;
 return result;
end $$;

create or replace function public.crm_lifecycle_diagnostics() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 perform crm_security.require_reader(true);
 select jsonb_build_object(
  'provider_contract_ready',exists(select 1 from public.crm_lifecycle_provider_contracts where active and lifecycle_model='r4_stage_entry'
    and uncertainty_policy='no_uncertain_replay' and deduplication_window_seconds is null and lead_id_only
    and action_source='system_generated' and maximum_event_age_seconds between 1 and 604800
    and required_constants='{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
    and event_map='{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb),
  'producer_controls',jsonb_build_object(
    'valid_boundaries',(select count(*) from public.crm_lifecycle_producer_boundaries b
      join public.crm_integration_connections c on c.id=b.connection_id and c.page_id=b.page_id and c.lifecycle_settings->>'dataset_id'=b.dataset_id
       and (c.lifecycle_settings->>'contract_id')::uuid=b.provider_contract_id
      join public.crm_lifecycle_provider_contracts pc on pc.id=b.provider_contract_id and pc.active and pc.lifecycle_model='r4_stage_entry'
       and pc.uncertainty_policy='no_uncertain_replay' and pc.action_source='system_generated' and pc.maximum_event_age_seconds between 1 and 604800
      join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id and p.version=b.policy_version
       and p.notice_version=b.notice_version and p.notice_text_digest=b.notice_text_digest and p.lifecycle_model='r4_stage_entry' and p.retired_at is null
      where b.revoked_at is null and b.valid_from<=clock_timestamp() and b.valid_until>clock_timestamp() and b.legacy_exclusion_valid_until>clock_timestamp()),
    'revoked_or_expired_boundaries',(select count(*) from public.crm_lifecycle_producer_boundaries
      where revoked_at is not null or valid_until<=clock_timestamp() or legacy_exclusion_valid_until<=clock_timestamp()),
    'native_owned_opportunities',(select count(*) from public.crm_lifecycle_producer_ownership where producer='eh_native'),
    'legacy_owned_opportunities',(select count(*) from public.crm_lifecycle_producer_ownership where producer='legacy')),
  'ordering_holds',jsonb_build_object(
    'unattempted_predecessor',(select count(*) from public.crm_external_deliveries d where d.last_error_code='unattempted_predecessor'),
    'active_predecessor',(select count(*) from public.crm_external_deliveries d where d.last_error_code='active_predecessor'),
    'contradictory_chronology',(select count(*) from public.crm_external_deliveries d where d.last_error_code='contradictory_chronology')),
  'uncertain_unreplayable',(select count(*) from public.crm_external_deliveries where lifecycle_model='r4_stage_entry' and attempt_boundary_state='unknown'),
  'destinations',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'label',c.connection_key,
    'configured_mode',c.lifecycle_settings->>'mode','enabled',coalesce((c.lifecycle_settings->>'enabled')::boolean,false),'contract_key',c.lifecycle_settings->>'contract_key',
    'lifecycle_model',c.lifecycle_settings->>'lifecycle_model','activation_started_at',c.lifecycle_settings->>'live_started_at') order by c.connection_key)
    from public.crm_integration_connections c where c.provider='meta'),'[]'),
  'forms',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'connection_id',m.connection_id,'form_key',m.form_key,'form_name',m.form_name,'version',m.version) order by m.created_at desc)
    from public.crm_form_mappings m where m.channel='meta_instant_form' and m.retired_at is null),'[]'),
  'policies',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'connection_id',p.connection_id,'form_mapping_id',p.form_mapping_id,'version',p.version,
    'lifecycle_model',p.lifecycle_model,'notice_version',p.notice_version,'notice_text_digest',p.notice_text_digest,'effective_from',p.effective_from,'effective_until',p.effective_until,
    'retired_at',p.retired_at,'grants',(select count(*) from public.crm_lifecycle_eligibility_evidence e where e.policy_id=p.id and e.event_type='grant'),
    'revocations',(select count(*) from public.crm_lifecycle_eligibility_evidence e where e.policy_id=p.id and e.event_type='revoke')) order by p.created_at desc)
    from public.crm_lifecycle_eligibility_policies p),'[]'),
  'scheduler',(select to_jsonb(h) from public.crm_lifecycle_scheduler_health h where singleton),
  'activation_prerequisites',jsonb_build_array('official_provider_contract','new_compliant_form','legacy_producer_exclusion','producer_boundary','destination_entitlement','release_approval')
 ) into result;return result;
end $$;

create or replace function public.crm_cleanup_lifecycle_retention(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare payloads integer:=0;attempts integer:=0;evidence integer:=0;checks integer:=0;terminated integer:=0;redacted_revocations integer:=0;r record;
begin
 perform crm_security.require_meta_worker();if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid cleanup limit' using errcode='22023';end if;
 for r in select * from public.crm_external_deliveries where status in ('blocked','retry','unknown','sending') and
  ((send_deadline is not null and send_deadline<=now()) or (activation_epoch_id is not null and exists(select 1 from public.crm_lifecycle_activation_epochs e where e.id=activation_epoch_id and e.ended_at is not null))
    or (delivery_mode in ('mock','mock_legacy') and created_at<=now()-interval '90 days'))
  order by updated_at,id limit p_limit for update skip locked loop
  if r.status='sending' then
   update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired' where delivery_id=r.id and finished_at is null;
  end if;
  update public.crm_external_deliveries set status='suppressed',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,
   attempt_boundary_state=case when lifecycle_model='r4_stage_entry' and attempt_boundary_state='started' then 'unknown' else attempt_boundary_state end,
   last_error_code=case when r.lifecycle_model='r4_stage_entry' and r.attempt_boundary_state='started' then 'lease_expired_after_dispatch'
    when r.send_deadline is not null and r.send_deadline<=now() then 'provider_age_expired' when r.delivery_mode in ('mock','mock_legacy') then 'retention_expired' else 'activation_ended' end,
   updated_at=now() where id=r.id;terminated:=terminated+1;
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
      (select least(p.effective_until,coalesce(p.retired_at,p.effective_until),
        e.recorded_at+make_interval(secs=>coalesce((c.lifecycle_settings->>'maximum_event_age_seconds')::integer,7776000)),
        coalesce((select min(rv.effective_at) from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=e.id and rv.event_type='revoke'),p.effective_until))
       from public.crm_lifecycle_eligibility_policies p join public.crm_integration_connections c on c.id=p.connection_id where p.id=e.policy_id)<=now()-interval '90 days'))
   order by e.recorded_at,e.id limit p_limit for update skip locked loop
  update public.crm_lifecycle_eligibility_checks set submission_id=null,evidence_digest=null,redacted_at=clock_timestamp() where submission_id=r.submission_id and policy_id=r.policy_id and redacted_at is null;
  update public.crm_lifecycle_eligibility_evidence set submission_id=null,source_external_id=null,source_projection=null,redacted_at=clock_timestamp()
   where supersedes_evidence_id=r.id and redacted_at is null;get diagnostics redacted_revocations=row_count;
  update public.crm_lifecycle_eligibility_evidence set submission_id=null,source_external_id=null,source_projection=null,redacted_at=clock_timestamp() where id=r.id;
  evidence:=evidence+1+redacted_revocations;
 end loop;
 return jsonb_build_object('terminated',terminated,'payloads_erased',payloads,'attempts_erased',attempts,'checks_erased',checks,'evidence_erased',evidence);
end $$;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_publish_lifecycle_producer_boundary(uuid,uuid,timestamptz,timestamptz,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_publish_lifecycle_producer_boundary(uuid,uuid,timestamptz,timestamptz,timestamptz,text,text) to service_role;
notify pgrst,'reload schema';
commit;
