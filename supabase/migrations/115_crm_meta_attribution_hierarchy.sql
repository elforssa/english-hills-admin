-- DGI-B-r1 Release B1: lead-level Meta campaign attribution resolved from the synced
-- Insights object hierarchy (D1-D7). Additive and forward only. Builds on the latest
-- cumulative definitions: 103 for crm_finalize_meta_job and crm_save_meta_connection
-- (the 094 bodies wrapped by the lifecycle barrier), 114 for crm_get_marketing_cohort,
-- 086 for crm_get_meta_diagnostics. No data backfill, no row rewrite, no change to the
-- attribution protection trigger, no new grant to any browser role.
begin;

-- D1: record the ad-lookup outcome. Both columns stay NULL on existing rows.
alter table public.crm_submission_attribution add column hierarchy_source text check (hierarchy_source in ('provider','insights_objects'));
alter table public.crm_submission_attribution add column hierarchy_error_code text check (hierarchy_error_code ~ '^[a-z_]{1,40}$');

-- D3/F2: ATTRIBUTION_PENDING_MAX_DAYS = 14, defined exactly once. Read by the eligibility
-- predicate, the sweep, the cohort report and the diagnostics. A plan constant, not an
-- owner decision; a later forward migration may change it.
create function crm_security.attribution_pending_window() returns interval
language sql immutable set search_path=pg_catalog,pg_temp as $$ select interval '14 days' $$;
revoke all on function crm_security.attribution_pending_window() from public,anon,authenticated,service_role;

-- D3: the switch keeps the reconciliation shape rule: enabled boolean and
-- (enabled = true) <=> (started_at IS NOT NULL). Same 2048-byte bound, exactly two keys.
alter table public.crm_integration_connections drop constraint crm_connection_provider_shape;
alter table public.crm_integration_connections add constraint crm_connection_provider_shape check(
 (provider='meta' and page_id is not null and api_version is not null
  and jsonb_typeof(settings)='object' and octet_length(settings::text)<=2048
  and settings-array['meta_reconciliation','attribution_enrichment']='{}'::jsonb
  and (not settings ? 'meta_reconciliation' or (
    jsonb_typeof(settings->'meta_reconciliation')='object'
    and (settings->'meta_reconciliation')-array['enabled','started_at','lookback_minutes']='{}'::jsonb
    and jsonb_typeof(settings #> '{meta_reconciliation,enabled}')='boolean'
    and (settings #>> '{meta_reconciliation,lookback_minutes}')::integer between 10 and 1440
    and ((settings #>> '{meta_reconciliation,enabled}')='true')=(settings #>> '{meta_reconciliation,started_at}' is not null)))
  and (not settings ? 'attribution_enrichment' or (
    jsonb_typeof(settings->'attribution_enrichment')='object'
    and (settings->'attribution_enrichment')-array['enabled','started_at']='{}'::jsonb
    and jsonb_typeof(settings #> '{attribution_enrichment,enabled}')='boolean'
    and (settings #>> '{attribution_enrichment,started_at}' is null or jsonb_typeof(settings #> '{attribution_enrichment,started_at}')='string')
    and ((settings #>> '{attribution_enrichment,enabled}')='true')=(settings #>> '{attribution_enrichment,started_at}' is not null))))
 or (provider='website' and page_id is null and api_version is null and account_id is null and access_token_secret_ref is null
 and settings ? 'origin' and jsonb_typeof(settings->'origin')='string' and settings-array['origin']='{}'::jsonb
 and settings->>'origin' ~ '^(https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?)$'));

create function crm_security.attribution_enrichment_started(c public.crm_integration_connections) returns timestamptz
language sql stable set search_path=pg_catalog,pg_temp as $$
 select case when c.provider='meta' and c.settings #>> '{attribution_enrichment,enabled}'='true'
 then nullif(c.settings #>> '{attribution_enrichment,started_at}','')::timestamptz end
$$;
revoke all on function crm_security.attribution_enrichment_started(public.crm_integration_connections) from public,anon,authenticated,service_role;

-- D3 eligibility without the time window: provider meta, not redacted, no campaign yet,
-- an ad ID, a meta_instant_form submission whose mapping connection has the switch on,
-- and a lead created at Meta on or after started_at (going forward only).
create function crm_security.attribution_enrichment_candidate(a public.crm_submission_attribution,p_channel text,p_connection uuid) returns boolean
language sql stable set search_path=pg_catalog,pg_temp as $$
 select coalesce(a.provider='meta' and a.redacted_at is null and a.campaign_id is null and a.ad_id is not null and p_channel='meta_instant_form'
  and exists(select 1 from public.crm_integration_connections c where c.id=p_connection
   and a.provider_created_at>=crm_security.attribution_enrichment_started(c)),false)
$$;
-- Pending: a candidate still inside ATTRIBUTION_PENDING_MAX_DAYS. Expired: a candidate
-- that left the window unresolved and is terminally unknown (F2).
create function crm_security.attribution_enrichment_eligible(a public.crm_submission_attribution,p_channel text,p_connection uuid) returns boolean
language sql stable set search_path=pg_catalog,pg_temp as $$
 select crm_security.attribution_enrichment_candidate(a,p_channel,p_connection) and a.provider_created_at>=now()-crm_security.attribution_pending_window()
$$;
create function crm_security.attribution_enrichment_expired(a public.crm_submission_attribution,p_channel text,p_connection uuid) returns boolean
language sql stable set search_path=pg_catalog,pg_temp as $$
 select crm_security.attribution_enrichment_candidate(a,p_channel,p_connection) and a.provider_created_at<now()-crm_security.attribution_pending_window()
$$;
revoke all on function crm_security.attribution_enrichment_candidate(public.crm_submission_attribution,text,uuid),crm_security.attribution_enrichment_eligible(public.crm_submission_attribution,text,uuid),crm_security.attribution_enrichment_expired(public.crm_submission_attribution,text,uuid) from public,anon,authenticated,service_role;

-- D2: in-database resolver. Matches only (connection, ad external_id) and requires the
-- full ad -> ad set -> campaign chain on the same connection; never a name.
create function crm_security.resolve_meta_hierarchy(p_connection uuid,p_ad text) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('campaign_id',cp.external_id,'campaign_name',cp.current_name,'adset_id',st.external_id,'adset_name',st.current_name,'ad_name',ad.current_name)
 from public.crm_meta_objects ad
 join public.crm_meta_objects st on st.connection_id=ad.connection_id and st.object_type='adset' and st.external_id=ad.parent_external_id
 join public.crm_meta_objects cp on cp.connection_id=ad.connection_id and cp.object_type='campaign' and cp.external_id=st.parent_external_id
 where p_connection is not null and p_ad ~ '^[0-9]{1,32}$' and ad.connection_id=p_connection and ad.object_type='ad' and ad.external_id=p_ad
$$;
revoke all on function crm_security.resolve_meta_hierarchy(uuid,text) from public,anon,authenticated,service_role;

-- D4 update rule, shared by intake-time resolution and the sweep: NULL fields only,
-- hierarchy_source = insights_objects, status complete only with every name. The
-- protection trigger (unchanged) still guards every write. Returns true on a hit.
create function crm_security.enrich_attribution_from_objects(p_submission uuid,p_connection uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare a public.crm_submission_attribution;h jsonb;begin
 select * into a from public.crm_submission_attribution where submission_id=p_submission for update;
 if not found or a.campaign_id is not null or a.redacted_at is not null then return false;end if;
 h:=crm_security.resolve_meta_hierarchy(p_connection,a.ad_id);
 if h is null then return false;end if;
 update public.crm_submission_attribution set
  campaign_id=h->>'campaign_id',adset_id=coalesce(adset_id,h->>'adset_id'),
  campaign_name_snapshot=coalesce(campaign_name_snapshot,h->>'campaign_name'),adset_name_snapshot=coalesce(adset_name_snapshot,h->>'adset_name'),ad_name_snapshot=coalesce(ad_name_snapshot,h->>'ad_name'),
  hierarchy_source=coalesce(hierarchy_source,'insights_objects'),
  attribution_status=case when coalesce(adset_id,h->>'adset_id') is not null and coalesce(campaign_name_snapshot,h->>'campaign_name') is not null
   and coalesce(adset_name_snapshot,h->>'adset_name') is not null and coalesce(ad_name_snapshot,h->>'ad_name') is not null and form_name_snapshot is not null then 'complete' else attribution_status end
 where submission_id=p_submission;
 return true;
end $$;
revoke all on function crm_security.enrich_attribution_from_objects(uuid,uuid) from public,anon,authenticated,service_role;

-- D3/F1: crm_save_meta_connection (103 cumulative body) accepts attribution_enrichment
-- {"enabled": boolean}. Keys are merged (c.settings || passed keys), never replaced:
-- passing only one key leaves the other, including its started_at, byte-identical, and
-- passing neither leaves settings unchanged. started_at is database-set on a disabled ->
-- enabled transition only, kept while enabled, cleared on disable; callers cannot set it.
create or replace function public.crm_save_meta_connection(p_data jsonb,p_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections; r jsonb; e jsonb; old_enabled boolean; new_enabled boolean; lookback integer; old_attr boolean; new_attr boolean; patch jsonb:='{}'::jsonb; begin
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
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='40001'; end if;
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
end $$;

-- D1/D4: crm_finalize_meta_job (103 cumulative body) stores hierarchy_source and
-- hierarchy_error_code from the normalized payload after allowlist validation, then
-- resolves the hierarchy from crm_meta_objects at intake when the new row is eligible.
-- Same transaction, same service-role path, no network, no new grant.
create or replace function public.crm_finalize_meta_job(p_job uuid,p_lease uuid,p_mapping uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare source_id uuid;source_connection uuid;j public.crm_ingestion_jobs;c public.crm_integration_connections;m public.crm_form_mappings;s public.crm_submissions;
 d jsonb;a jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;occurred timestamptz;ambiguous boolean:=false;attribution public.crm_submission_attribution;begin
 perform crm_security.lifecycle_barrier(true);

 select coalesce(submission_id,gen_random_uuid()),connection_id into source_id,source_connection from public.crm_ingestion_jobs where id=p_job;
 if source_id is not null then perform crm_security.lifecycle_preidentity_keys(source_id,source_connection);end if;
 perform crm_security.require_meta_worker();
 -- Connection before job: configuration changes cannot race finalization.
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job for share of c0;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if not found or j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
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
end $$;

-- D4 moment 2 / F2: the service-role sweep. Candidates are eligible rows (switch on,
-- created after started_at, inside the pending window, no campaign, not redacted) whose
-- full ad -> ad set -> campaign chain already exists in crm_meta_objects, newest first,
-- so rows that cannot resolve never occupy p_limit. A trigger violation on one row is
-- counted as unresolved and the sweep continues. Counts only.
create function public.crm_enrich_meta_attribution(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare x record;eligible integer:=0;resolved integer:=0;unresolved integer:=0;expired integer;begin
 perform crm_security.require_meta_worker();
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid batch size' using errcode='22023';end if;
 for x in
  select a.submission_id,m.connection_id
  from public.crm_submission_attribution a
  join public.crm_submissions s on s.id=a.submission_id
  join public.crm_form_mappings m on m.id=s.form_mapping_id
  join public.crm_meta_objects ad on ad.connection_id=m.connection_id and ad.object_type='ad' and ad.external_id=a.ad_id
  join public.crm_meta_objects st on st.connection_id=m.connection_id and st.object_type='adset' and st.external_id=ad.parent_external_id
  join public.crm_meta_objects cp on cp.connection_id=m.connection_id and cp.object_type='campaign' and cp.external_id=st.parent_external_id
  where crm_security.attribution_enrichment_eligible(a,s.channel,m.connection_id)
  order by a.provider_created_at desc,a.submission_id limit p_limit for update of a skip locked
 loop
  eligible:=eligible+1;
  begin
   if crm_security.enrich_attribution_from_objects(x.submission_id,x.connection_id) then resolved:=resolved+1;else unresolved:=unresolved+1;end if;
  exception when sqlstate '42501' then unresolved:=unresolved+1;
  end;
 end loop;
 select count(*) into expired from public.crm_submission_attribution a join public.crm_submissions s on s.id=a.submission_id join public.crm_form_mappings m on m.id=s.form_mapping_id
  where crm_security.attribution_enrichment_expired(a,s.channel,m.connection_id);
 return jsonb_build_object('eligible',eligible,'resolved',resolved,'unresolved',unresolved,'expired',expired);
end $$;

-- D6/F3: crm_get_marketing_cohort (114 cumulative body, same signature). The trusted
-- predicate stays ID-only (campaign_id / adset_id / ad_id on a meta_instant_form lead of
-- the selected connection); hierarchy_source and hierarchy_error_code are never read.
-- A Meta lead without an advertising key is "pending" while eligible under D3 and
-- inside the window, "unknown" otherwise; both stay unattributed without spend.
create or replace function public.crm_get_marketing_cohort(p_from date,p_to date,p_cutoff_date date default null,p_connection uuid default null,p_level text default 'campaign',p_campaign text default null,p_adset text default null,p_ad text default null,p_channel text default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare cfg jsonb;tz text:='Africa/Casablanca';currency text;cutoff timestamptz;complete boolean:=false;last_sync timestamptz;warning boolean;result jsonb;begin
 perform crm_security.require_reader(true);
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>365 or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0
 or p_level is null or p_level not in ('campaign','adset','ad','source') or (p_channel is not null and p_channel not in ('meta_instant_form','website','manual')) then raise exception 'Invalid cohort request' using errcode='22023';end if;
 if p_connection is not null then
  select insights_settings into cfg from public.crm_integration_connections where id=p_connection and provider='meta' and insights_settings ? 'account_id';
  if not found then raise exception 'Unknown reporting account' using errcode='22023';end if;
  tz:=cfg->>'timezone';currency:=cfg->>'currency';
 end if;
 cutoff:=case when p_cutoff_date is null then clock_timestamp() else least(clock_timestamp(),((p_cutoff_date+1)::timestamp at time zone tz)-interval '1 microsecond') end;
 if not isfinite(cutoff) or cutoff<(p_from::timestamp at time zone tz) then raise exception 'Cutoff precedes cohort' using errcode='22023';end if;
 if p_connection is not null then
  select not exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')day where not exists(select 1 from public.crm_meta_sync_runs r where r.connection_id=p_connection and r.status='completed' and r.query_version='ad-daily-v1' and day::date between r.date_from and r.date_to)) into complete;
  select max(completed_at) into last_sync from public.crm_meta_sync_runs where connection_id=p_connection and status='completed' and daterange(date_from,date_to,'[]') && daterange(p_from,p_to,'[]');
 end if;
 select exists(select 1 from public.crm_meta_sync_runs r where r.connection_id=p_connection and r.status<>'completed' and daterange(r.date_from,r.date_to,'[]') && daterange(p_from,p_to,'[]') and (r.status in ('pending','running') or exists(select 1 from generate_series(greatest(r.date_from,p_from)::timestamp,least(r.date_to,p_to)::timestamp,interval '1 day')day where not exists(select 1 from public.crm_meta_sync_runs newer where newer.connection_id=r.connection_id and newer.status='completed' and newer.completed_at>r.created_at and day::date between newer.date_from and newer.date_to)))) into warning;
 with cohort as (
  select l.id,l.first_submission_id,l.conversion_activity_id,l.conversion_review_required,s.channel,s.source_label,a.campaign_id,a.adset_id,a.ad_id,
   a.campaign_name_snapshot,a.adset_name_snapshot,a.ad_name_snapshot,m.connection_id,
   case when s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection then
     case p_level when 'campaign' then a.campaign_id when 'adset' then a.adset_id when 'ad' then a.ad_id when 'source' then case when a.campaign_id is not null then 'meta' end end end as advertising_key,
   coalesce(s.channel='meta_instant_form' and crm_security.attribution_enrichment_eligible(a,s.channel,m.connection_id),false) as pending
  from public.crm_leads l join public.crm_submissions s on s.id=l.first_submission_id
  left join public.crm_submission_attribution a on a.submission_id=s.id left join public.crm_form_mappings m on m.id=s.form_mapping_id
  where l.merged_into_lead_id is null and s.occurred_at>=p_from::timestamp at time zone tz and s.occurred_at<(p_to+1)::timestamp at time zone tz and s.occurred_at<=cutoff
   and (p_channel is null or s.channel=p_channel)
   and (s.channel<>'meta_instant_form' or p_connection is null or m.connection_id=p_connection or m.connection_id is null)
   and (p_campaign is null or (s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection and a.campaign_id=p_campaign))
   and (p_adset is null or (s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection and a.adset_id=p_adset))
   and (p_ad is null or (s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection and a.ad_id=p_ad))
 ), per_lead as (
  select c.*,
   case when advertising_key is not null then 'meta:'||advertising_key when pending then 'pending:'||channel else 'unknown:'||channel end as bucket,
   case p_level when 'campaign' then campaign_name_snapshot when 'adset' then adset_name_snapshot when 'ad' then ad_name_snapshot end as historical_name,
   exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type='lead_engaged' and a.occurred_at<=cutoff)::int as engaged,
   exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type='lead_qualified' and a.occurred_at<=cutoff)::int as qualified,
   exists(select 1 from public.crm_activities a where a.id=c.conversion_activity_id and a.lead_id=c.id and a.event_type='lead_converted' and a.occurred_at<=cutoff)::int as converted,
   (select count(distinct a.placement_test_id) from public.crm_activities a where a.lead_id=c.id and a.event_type='placement_test_booked' and a.occurred_at<=cutoff) as tests_booked,
   (select count(distinct a.placement_test_id) from public.crm_activities a where a.lead_id=c.id and a.event_type='placement_test_attended' and a.occurred_at<=cutoff) as tests_attended,
   (select count(distinct a.placement_test_id) from public.crm_activities a where a.lead_id=c.id and a.event_type='placement_result_entered' and a.occurred_at<=cutoff) as results,
   (select coalesce(sum(r.amount_delta),0) from public.crm_revenue_entries r where r.lead_id=c.id and r.attribution_submission_id=c.first_submission_id and r.effective_at<=cutoff) as revenue
  from cohort c
 ), crm as (
  select bucket,max(advertising_key) as object_key,max(channel) as channel,count(*) as leads,sum(engaged) as engaged,sum(qualified) as qualified,sum(converted) as converted,
   sum(tests_booked) as tests_booked,sum(tests_attended) as tests_attended,sum(results) as results,sum(revenue) as revenue,
   count(*) filter(where conversion_review_required) as review_required,array_agg(distinct historical_name) filter(where historical_name is not null) as historical_names
  from per_lead group by bucket
 ), spend as (
  select 'meta:'||case p_level when 'campaign' then d.campaign_id when 'adset' then d.adset_id when 'ad' then d.ad_id when 'source' then 'meta' end as bucket,
   max(case p_level when 'campaign' then d.campaign_id when 'adset' then d.adset_id when 'ad' then d.ad_id when 'source' then 'meta' end) as object_key,
   sum(d.spend) as spend,sum(d.impressions) as impressions,sum(d.clicks) as clicks,sum(d.link_clicks) as link_clicks
  from public.crm_meta_daily_insights d join public.crm_meta_sync_runs r on r.id=d.sync_run_id and r.status='completed'
  where d.connection_id=p_connection and d.insight_date between p_from and p_to and d.query_version='ad-daily-v1' and d.level='ad' and d.breakdown_key=''
   and (p_campaign is null or d.campaign_id=p_campaign) and (p_adset is null or d.adset_id=p_adset) and (p_ad is null or d.ad_id=p_ad)
   and (p_channel is null or p_channel='meta_instant_form') group by 1
 ), combined as (
  select coalesce(c.bucket,s.bucket) as bucket,coalesce(c.object_key,s.object_key) as object_key,
   case when coalesce(c.bucket,s.bucket) like 'meta:%' then 'trusted_meta' else 'unattributed' end as attribution_kind,
   coalesce(c.channel,'meta_instant_form') as channel,coalesce(c.leads,0) as leads,coalesce(c.engaged,0) as engaged,coalesce(c.qualified,0) as qualified,coalesce(c.converted,0) as converted,
   coalesce(c.tests_booked,0) as tests_booked,coalesce(c.tests_attended,0) as tests_attended,coalesce(c.results,0) as results,coalesce(c.revenue,0) as revenue,coalesce(c.review_required,0) as review_required,c.historical_names,
   case when coalesce(c.bucket,s.bucket) like 'meta:%' and complete then coalesce(s.spend,0) end as spend,s.impressions,s.clicks,s.link_clicks
  from crm c full join spend s using(bucket)
 ), named as (
  select x.*,coalesce(o.current_name,case when p_level='source' and x.attribution_kind='trusted_meta' then 'Meta Instant Form' end,case when x.attribution_kind='trusted_meta' then x.historical_names[1] end,case when x.attribution_kind='trusted_meta' then case p_level when 'campaign' then 'Campagne ' when 'adset' then 'Ensemble ' else 'Annonce ' end||x.object_key end,case x.channel when 'website' then 'Site web · attribution observée' when 'manual' then 'Saisie manuelle / téléphone / recommandation' else case when x.bucket like 'pending:%' then 'Meta · attribution en attente' else 'Meta · attribution inconnue' end end) as name,o.objective,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.leads,0) end as cpl,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.qualified,0) end as cpql,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.converted,0) end as cac,
   case when x.attribution_kind='trusted_meta' and currency='MAD' then x.revenue/nullif(x.spend,0) end as roas
  from combined x left join public.crm_meta_objects o on o.connection_id=p_connection and o.object_type=p_level and o.external_id=x.object_key
 ), totals as (
  select coalesce(sum(leads),0) as leads,coalesce(sum(engaged),0) as engaged,coalesce(sum(qualified),0) as qualified,coalesce(sum(converted),0) as converted,
   coalesce(sum(tests_booked),0) as tests_booked,coalesce(sum(tests_attended),0) as tests_attended,coalesce(sum(results),0) as results,coalesce(sum(revenue),0) as revenue,
   coalesce(sum(leads) filter(where attribution_kind='unattributed'),0) as unattributed_leads,
   coalesce(sum(leads) filter(where bucket like 'pending:%'),0) as pending_leads,
   coalesce(sum(leads) filter(where attribution_kind='trusted_meta'),0) as attributed_leads,coalesce(sum(qualified) filter(where attribution_kind='trusted_meta'),0) as attributed_qualified,
   coalesce(sum(converted) filter(where attribution_kind='trusted_meta'),0) as attributed_converted,coalesce(sum(revenue) filter(where attribution_kind='trusted_meta'),0) as attributed_revenue,
   case when complete and (p_channel is null or p_channel='meta_instant_form') then coalesce(sum(spend),0) end as spend
  from named
 ) select jsonb_build_object('mode','acquisition_cohort','acquisition_from',p_from,'acquisition_to',p_to,'outcome_cutoff',cutoff,'timezone',tz,'spend_currency',currency,'revenue_currency','MAD','currency_mismatch',currency is not null and currency<>'MAD',
  'spend_complete',complete,'last_synced_at',last_sync,'sync_warning',warning,'live_sync_enabled',coalesce(cfg->>'mode'='live' and coalesce((cfg->>'enabled')::boolean,false),false),'reach',null,
  'summary',(select to_jsonb(t)||jsonb_build_object('cpl',spend/nullif(attributed_leads,0),'cpql',spend/nullif(attributed_qualified,0),'cac',spend/nullif(attributed_converted,0),'roas',case when currency='MAD' then attributed_revenue/nullif(spend,0) end) from totals t),
  'total',(select count(*) from named),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by page.spend desc nulls last,page.name,page.bucket) from (select bucket,object_key,attribution_kind,channel,name,objective,historical_names,spend,leads,engaged,qualified,tests_booked,tests_attended,results,converted,review_required,revenue,cpl,cpql,cac,roas,impressions,clicks,link_clicks from named order by spend desc nulls last,name,bucket limit p_limit offset p_offset)page),'[]')) into result;
 return result;
end $$;

-- D7: enrichment counters per Meta connection. Counts, ages and the constant only;
-- no ID, name or payload.
create function crm_security.attribution_diagnostics(c public.crm_integration_connections) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 with rows as (
  select a as attr,s.channel from public.crm_submission_attribution a join public.crm_submissions s on s.id=a.submission_id join public.crm_form_mappings m on m.id=s.form_mapping_id
  where m.connection_id=c.id and s.channel='meta_instant_form' and a.provider='meta'
 )
 select jsonb_build_object(
  'enabled',coalesce(c.settings #>> '{attribution_enrichment,enabled}'='true',false),
  'started_at',crm_security.attribution_enrichment_started(c),
  'pending_max_days',extract(day from crm_security.attribution_pending_window())::integer,
  'eligible_pending',(select count(*) from rows r where crm_security.attribution_enrichment_eligible(r.attr,r.channel,c.id)),
  'oldest_pending_age_hours',(select round(extract(epoch from now()-min((r.attr).provider_created_at))/3600,1) from rows r where crm_security.attribution_enrichment_eligible(r.attr,r.channel,c.id)),
  'expired_unknown',(select count(*) from rows r where crm_security.attribution_enrichment_expired(r.attr,r.channel,c.id)),
  'resolved_from_objects',(select count(*) from rows r where (r.attr).hierarchy_source='insights_objects'),
  'resolved_from_provider',(select count(*) from rows r where (r.attr).hierarchy_source='provider'),
  'lookup_errors',coalesce((select jsonb_object_agg(x.code,x.n) from (select (r.attr).hierarchy_error_code as code,count(*) as n from rows r
    where (r.attr).hierarchy_error_code is not null and crm_security.attribution_enrichment_started(c) is not null and (r.attr).provider_created_at>=crm_security.attribution_enrichment_started(c) group by 1) x),'{}'::jsonb))
$$;
revoke all on function crm_security.attribution_diagnostics(public.crm_integration_connections) from public,anon,authenticated,service_role;

create or replace function public.crm_get_meta_diagnostics(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb;begin
 perform crm_security.require_reader(true);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('connections',(select coalesce(jsonb_agg(to_jsonb(c)||case when c.provider='meta' then jsonb_build_object('attribution',crm_security.attribution_diagnostics(c)) else '{}'::jsonb end order by c.connection_key),'[]') from public.crm_integration_connections c),
 'mappings',(select coalesce(jsonb_agg(to_jsonb(m) order by m.connection_id,m.form_key,m.version),'[]') from public.crm_form_mappings m),
 'total',(select count(*) from public.crm_ingestion_jobs),'jobs',coalesce(jsonb_agg(jsonb_build_object('id',j.id,'connection_id',j.connection_id,'status',j.status,'attempt_count',j.attempt_count,
 'received_at',j.created_at,'next_attempt_at',j.next_attempt_at,'last_error_code',j.last_error_code,'submission_id',j.submission_id) order by j.created_at desc,j.id),'[]')) into result
 from(select * from public.crm_ingestion_jobs order by created_at desc,id limit p_limit offset p_offset)j;return result;
end $$;

-- Grants re-stated for every replaced function; the sweep is service-role only.
revoke all on function public.crm_save_meta_connection(jsonb,uuid,bigint),public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb),public.crm_get_meta_diagnostics(integer,integer),
 public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer),public.crm_enrich_meta_attribution(integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_save_meta_connection(jsonb,uuid,bigint),public.crm_get_meta_diagnostics(integer,integer),public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb),public.crm_enrich_meta_attribution(integer) to service_role;
notify pgrst,'reload schema';
commit;
