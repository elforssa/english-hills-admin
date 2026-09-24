-- Phase 10: asynchronous lifecycle outbox. No CRM triggers, network or live enablement.
begin;
alter table public.crm_integration_connections add column lifecycle_settings jsonb not null default '{}' check(jsonb_typeof(lifecycle_settings)='object' and octet_length(lifecycle_settings::text)<=8192);
alter table public.crm_integration_connections add column lifecycle_destination_id uuid references public.crm_integration_connections(id);
create table public.crm_external_deliveries (
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),
 activity_id uuid not null references public.crm_activities(id),lead_id uuid not null references public.crm_leads(id),connection_id uuid references public.crm_integration_connections(id),
 event_kind text not null check(event_kind in ('qualified','converted')),event_time timestamptz not null,
 provider_event_name text,provider_event_id text not null unique,mapping_version integer not null check(mapping_version>=0),mapping_snapshot jsonb not null default '{}',
 attribution_submission_id uuid references public.crm_submissions(id),matching_submission_id uuid references public.crm_submissions(id),
 payload jsonb,payload_hash text,status text not null check(status in ('pending','sending','retry','sent','blocked','dead','suppressed','unknown')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 8),max_attempts integer not null default 5 check(max_attempts between 1 and 8),
 next_attempt_at timestamptz,lease_token uuid,lease_until timestamptz,sent_at timestamptz,last_error_code text,
 unique(lead_id,event_kind),unique(activity_id,connection_id,event_kind),
 check((status='sending')=(lease_token is not null and lease_until is not null)),
 check((payload is null)=(payload_hash is null)),check(payload_hash is null or payload_hash ~ '^[a-f0-9]{64}$'),
 check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<=8192)),check(status<>'sent' or sent_at is not null)
);
create table public.crm_external_delivery_attempts (
 id uuid primary key default gen_random_uuid(),delivery_id uuid not null references public.crm_external_deliveries(id),attempt_number integer not null check(attempt_number between 1 and 8),
 lease_token uuid not null,started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 outcome text not null default 'started' check(outcome in ('started','sent','retry','blocked','dead','unknown')),
 http_status integer check(http_status between 100 and 599),provider_request_id text check(length(provider_request_id)<=100),
 response_summary jsonb,error_code text,unique(delivery_id,attempt_number),unique(delivery_id,lease_token),
 check((outcome='started')=(finished_at is null)),check(response_summary is null or response_summary-array['accepted']='{}')
);
create index crm_delivery_due on public.crm_external_deliveries(next_attempt_at,id) where status in ('pending','retry','unknown','sending');
create index crm_delivery_diagnostics on public.crm_external_deliveries(created_at desc,id);
alter table public.crm_external_deliveries enable row level security;
alter table public.crm_external_delivery_attempts enable row level security;
revoke all on public.crm_external_deliveries,public.crm_external_delivery_attempts from public,anon,authenticated,service_role;
create function crm_security.protect_delivery() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if tg_op='DELETE' then raise exception 'Delivery history immutable' using errcode='42501';end if;
 if row(new.activity_id,new.lead_id,new.connection_id,new.event_kind,new.event_time,new.provider_event_id,new.attribution_submission_id,new.matching_submission_id,new.created_at)
 is distinct from row(old.activity_id,old.lead_id,old.connection_id,old.event_kind,old.event_time,old.provider_event_id,old.attribution_submission_id,old.matching_submission_id,old.created_at)
 or (old.payload is not null and row(new.payload,new.payload_hash,new.provider_event_name,new.mapping_version,new.mapping_snapshot,new.max_attempts) is distinct from row(old.payload,old.payload_hash,old.provider_event_name,old.mapping_version,old.mapping_snapshot,old.max_attempts))
 or old.status='sent' then raise exception 'Frozen delivery identity/payload' using errcode='42501';end if;return new;
end $$;
create trigger crm_delivery_immutable before update or delete on public.crm_external_deliveries for each row execute function crm_security.protect_delivery();
create function crm_security.protect_delivery_attempt() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if tg_op='DELETE' or old.finished_at is not null then raise exception 'Final attempt immutable' using errcode='42501';end if;
 if row(new.id,new.delivery_id,new.attempt_number,new.lease_token,new.started_at) is distinct from row(old.id,old.delivery_id,old.attempt_number,old.lease_token,old.started_at) then raise exception 'Attempt identity immutable' using errcode='42501';end if;return new;
end $$;
create trigger crm_delivery_attempt_immutable before update or delete on public.crm_external_delivery_attempts for each row execute function crm_security.protect_delivery_attempt();
create trigger crm_delivery_no_truncate before truncate on public.crm_external_deliveries for each statement execute function crm_security.reject_history_mutation();
create trigger crm_delivery_attempt_no_truncate before truncate on public.crm_external_delivery_attempts for each statement execute function crm_security.reject_history_mutation();

-- Separate outbound settings: inbound enabled never enables lifecycle delivery.
-- Phase 10 supports fixture mode only. A future audited change is required for live mode.
create function public.crm_configure_lifecycle(p_connection uuid,p_version bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;k text;cfg jsonb;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
 if c.provider='website' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['destination_id']<>'{}' then raise exception 'Invalid destination' using errcode='22023';end if;
  if not exists(select 1 from public.crm_integration_connections where id=(p_data->>'destination_id')::uuid and provider='meta') then raise exception 'Meta destination required' using errcode='22023';end if;
  update public.crm_integration_connections set lifecycle_destination_id=(p_data->>'destination_id')::uuid,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 else
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','api_version','secret_ref','events','action_source','allow_later_meta','max_attempts']<>'{}'
  or p_data->>'mode' is distinct from 'mock' or coalesce(p_data->>'dataset_id','') !~ '^[0-9]{1,32}$' or coalesce(p_data->>'api_version','') !~ '^v[0-9]{1,3}\.0$'
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
 end if;
 return jsonb_build_object('id',c.id,'version',c.version,'lifecycle',c.lifecycle_settings-'secret_ref','destination_id',c.lifecycle_destination_id,'live_available',false);
end $$;

-- Resolve from protected accepted acquisition evidence. Internal attribution never changes.
create function crm_security.lifecycle_route(p_lead uuid) returns jsonb language plpgsql set search_path=pg_catalog,pg_temp as $$
declare l public.crm_leads;s public.crm_submissions;a public.crm_submission_attribution;c public.crm_integration_connections;source public.crm_integration_connections;begin
 select * into strict l from public.crm_leads where id=p_lead;
 select * into s from public.crm_submissions where id=l.first_submission_id;
 select c0.* into source from public.crm_integration_connections c0 join public.crm_form_mappings m on m.connection_id=c0.id where m.id=s.form_mapping_id;
 if s.channel='meta_instant_form' and source.provider='meta' then c:=source;
 elsif s.channel='website' and source.provider='website' then select * into c from public.crm_integration_connections where id=source.lifecycle_destination_id and provider='meta';
 else return jsonb_build_object('reason','no_destination');end if;
 if c.id is null then return jsonb_build_object('reason','no_destination');end if;
 if s.channel='website' and coalesce((c.lifecycle_settings->>'allow_later_meta')::boolean,false) then
  select s0.* into s from public.crm_submissions s0 join public.crm_form_mappings m on m.id=s0.form_mapping_id
   where s0.lead_id=l.id and s0.match_status='resolved' and s0.channel='meta_instant_form' and m.connection_id=c.id order by s0.occurred_at,s0.received_at,s0.id limit 1;
  if not found then select * into s from public.crm_submissions where id=l.first_submission_id;end if;
 end if;
 select * into a from public.crm_submission_attribution where submission_id=s.id;
 return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'mapping',c.lifecycle_settings,'identity_kind',case when a.provider='meta' then 'lead_id' else 'browser' end,
  'reason',case when a.redacted_at is not null then 'identity_redacted'
   when a.provider='meta' and (a.external_submission_id is null or a.page_id is distinct from c.page_id) then 'no_matching_identity'
   when a.provider='website' and nullif(a.fbc,'') is null and nullif(a.fbp,'') is null then 'no_matching_identity'
   when a.provider not in ('meta','website') or a.provider is null then 'no_matching_identity'
   when a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then 'sharing_evidence_missing'
   else null end);
end $$;
create function public.crm_reconcile_external_deliveries(p_limit integer default 100) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare a record;r jsonb;cfg jsonb;reason text;state text;n integer:=0;l public.crm_leads;begin
 if auth.role() is distinct from 'service_role' then perform crm_security.require_reader(true);end if;
 if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:lifecycle:reconcile',0));
 for a in select distinct on (x.lead_id,x.event_type) x.* from public.crm_activities x
  where x.event_type in ('lead_qualified','lead_converted') and not exists(select 1 from public.crm_external_deliveries d where d.lead_id=x.lead_id and d.event_kind=case x.event_type when 'lead_qualified' then 'qualified' else 'converted' end)
  order by x.lead_id,x.event_type,x.occurred_at,x.id limit p_limit loop
  select * into strict l from public.crm_leads where id=a.lead_id;
  r:=crm_security.lifecycle_route(l.id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';
  if a.event_type='lead_converted' and (a.id is distinct from l.conversion_activity_id or a.enrollment_id is distinct from l.enrollment_id) then reason:='invalid_conversion_evidence';end if;
  if a.event_type='lead_converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
  if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence') then state:='suppressed';
  elsif reason is not null then state:='blocked';
  elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
  elsif a.occurred_at<(cfg->>'not_before')::timestamptz then state:='suppressed';reason:='historical_event';
  elsif cfg->>'mode' is distinct from 'mock' then state:='blocked';reason:='configuration_missing';end if;
  insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,
   attribution_submission_id,matching_submission_id,status,next_attempt_at,last_error_code,max_attempts)
  values(a.id,l.id,(r->>'connection_id')::uuid,case a.event_type when 'lead_qualified' then 'qualified' else 'converted' end,a.occurred_at,
   'eh:'||a.id||':'||coalesce(r->>'connection_id','none'),coalesce((cfg->>'version')::int,0),cfg,l.first_submission_id,(r->>'submission_id')::uuid,state,now(),reason,coalesce((cfg->>'max_attempts')::int,5));n:=n+1;
 end loop;return n;
end $$;
-- Recheck revocation/review immediately before each attempt, even with a frozen payload.
create function crm_security.lifecycle_hold(d public.crm_external_deliveries) returns text language plpgsql set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;a public.crm_submission_attribution;begin
 select * into c from public.crm_integration_connections where id=d.connection_id;
 if not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then return 'outbound_disabled';end if;
 if c.lifecycle_settings->>'mode' is distinct from 'mock' then return 'live_not_available';end if;
 if d.event_kind='converted' and exists(select 1 from public.crm_leads where id=d.lead_id and conversion_review_required) then return 'conversion_review_required';end if;
 select * into a from public.crm_submission_attribution where submission_id=d.matching_submission_id;
 if a.submission_id is null or a.redacted_at is not null then return 'identity_redacted';end if;
 if a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then return 'sharing_evidence_missing';end if;
 if d.mapping_snapshot->>'mode' is distinct from 'mock' then return 'configuration_missing';end if;
 return null;
end $$;
create function public.crm_claim_external_deliveries(p_limit integer default 3) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare d public.crm_external_deliveries;reason text;ids uuid[]:='{}';begin
 perform crm_security.require_meta_worker();
 if p_limit is null or p_limit not between 1 and 5 then raise exception 'Invalid limit' using errcode='22023';end if;
 for d in select * from public.crm_external_deliveries where (status in ('pending','retry','unknown') and next_attempt_at<=now()) or (status='sending' and lease_until<=now())
 order by next_attempt_at,id limit p_limit for update skip locked loop
  if d.status='sending' then
   update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired' where delivery_id=d.id and finished_at is null;
  end if;
  reason:=crm_security.lifecycle_hold(d);
  if d.attempt_count>=d.max_attempts then
   update public.crm_external_deliveries set status='dead',lease_token=null,lease_until=null,last_error_code='attempts_exhausted',updated_at=now() where id=d.id;
  elsif reason is not null then
   update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=reason,updated_at=now() where id=d.id;
  else
   update public.crm_external_deliveries set status='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=d.id;
   ids:=array_append(ids,d.id);
  end if;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'lease_token',lease_token)) from public.crm_external_deliveries where id=any(ids)),'[]');
end $$;
create function public.crm_get_external_delivery(p_delivery uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare d public.crm_external_deliveries;s public.crm_submissions;a public.crm_submission_attribution;reason text;begin
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;
 reason:=crm_security.lifecycle_hold(d);if reason is not null then raise exception 'Delivery held' using errcode='42501';end if;
 select * into s from public.crm_submissions where id=d.matching_submission_id;
 select * into a from public.crm_submission_attribution where submission_id=s.id;
 return jsonb_build_object('id',d.id,'event_kind',d.event_kind,'event_time',floor(extract(epoch from d.event_time))::bigint,'event_id',d.provider_event_id,'mapping',d.mapping_snapshot,'payload',d.payload,
  'matching',case when d.payload is not null then null else jsonb_strip_nulls(jsonb_build_object('lead_id',case when a.provider='meta' then a.external_submission_id end,
   'fbc',case when a.provider='website' then a.fbc end,'fbp',case when a.provider='website' then a.fbp end,
   'email',s.core_fields->>'email','phone',crm_security.normalize_phone(s.core_fields->>'phone'),'adult_contact',true)) end);
end $$;
create function public.crm_prepare_external_delivery(p_delivery uuid,p_lease uuid,p_payload jsonb) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare d public.crm_external_deliveries;e jsonb;u jsonb;item record;hash text;a public.crm_submission_attribution;source public.crm_submissions;phone text;email text;begin
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 -- A closed allowlist prevents child/notes/financial fields even from an erroneous worker.
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['data']<>'{}' or jsonb_typeof(p_payload->'data') is distinct from 'array' or jsonb_array_length(p_payload->'data')<>1 or octet_length(p_payload::text)>8192 then raise exception 'Invalid payload' using errcode='22023';end if;
 e:=p_payload->'data'->0;u:=e->'user_data';
 if e-array['event_name','event_time','event_id','action_source','user_data']<>'{}' or e->>'event_id' is distinct from d.provider_event_id
 or e->>'event_name' is distinct from d.mapping_snapshot->'events'->>d.event_kind or (e->>'event_time')::bigint is distinct from floor(extract(epoch from d.event_time))::bigint
 or e->>'action_source' is distinct from d.mapping_snapshot->>'action_source' or jsonb_typeof(u) is distinct from 'object'
 or u-array['lead_id','em','ph','fbc','fbp']<>'{}' or u='{}' then raise exception 'Invalid event identity' using errcode='22023';end if;
 for item in select * from jsonb_each(u) loop
  if item.key in ('em','ph') then
   if jsonb_typeof(item.value) is distinct from 'array' or jsonb_array_length(item.value)<>1 or coalesce(item.value->>0,'') !~ '^[a-f0-9]{64}$' then raise exception 'Hash required' using errcode='22023';end if;
  elsif jsonb_typeof(item.value) is distinct from 'string' or length(item.value#>>'{}') not between 1 and 256 then raise exception 'Invalid match field' using errcode='22023';end if;
 end loop;
 select * into source from public.crm_submissions where id=d.matching_submission_id;
 select * into a from public.crm_submission_attribution where submission_id=source.id;
 phone:=crm_security.normalize_phone(source.core_fields->>'phone');email:=nullif(lower(btrim(source.core_fields->>'email')),'');
 if (u ? 'lead_id' and (a.provider<>'meta' or u->>'lead_id' is distinct from a.external_submission_id))
 or (u ? 'fbc' and (a.provider<>'website' or u->>'fbc' is distinct from a.fbc))
 or (u ? 'fbp' and (a.provider<>'website' or u->>'fbp' is distinct from a.fbp))
 or (not (u ?| array['lead_id','fbc','fbp']))
 or (u ? 'em' and (u->'em'->>0 is distinct from encode(sha256(convert_to(email,'UTF8')),'hex')))
 or (u ? 'ph' and (u->'ph'->>0 is distinct from encode(sha256(convert_to(substr(phone,2),'UTF8')),'hex')))
 then raise exception 'Matching identity differs from protected evidence' using errcode='22023';end if;
 hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 if d.payload is not null then
  if d.payload_hash<>hash then raise exception 'Frozen payload conflict' using errcode='40001';end if;return hash;
 end if;
 update public.crm_external_deliveries set payload=p_payload,payload_hash=hash,provider_event_name=e->>'event_name',updated_at=now() where id=d.id;return hash;
end $$;
create function public.crm_begin_external_attempt(p_delivery uuid,p_lease uuid) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare d public.crm_external_deliveries;n integer;begin
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload is null then raise exception 'Stale/unprepared delivery' using errcode='40001';end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if exists(select 1 from public.crm_external_delivery_attempts where delivery_id=d.id and lease_token=p_lease) then raise exception 'Attempt already begun' using errcode='40001';end if;
 n:=d.attempt_count+1;if n>d.max_attempts then raise exception 'Attempts exhausted' using errcode='40001';end if;
 insert into public.crm_external_delivery_attempts(delivery_id,attempt_number,lease_token) values(d.id,n,p_lease);
 update public.crm_external_deliveries set attempt_count=n where id=d.id;return n;
end $$;
create function public.crm_finish_external_attempt(p_delivery uuid,p_lease uuid,p_result jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare d public.crm_external_deliveries;state text;code text;delay integer;begin
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 state:=p_result->>'outcome';code:=p_result->>'error_code';
 if jsonb_typeof(p_result) is distinct from 'object' or p_result-array['outcome','error_code','http_status','request_id','retry_after']<>'{}'
 or state is null or state not in ('sent','retry','blocked','dead','unknown') or (code is not null and code not in ('rate_limit','provider_unavailable','provider_auth','validation','timeout','network','malformed_response'))
 or (state='sent' and (coalesce((p_result->>'http_status')::int,0) not between 200 and 299 or code is not null))
 or (p_result->>'request_id' is not null and p_result->>'request_id' !~ '^[A-Za-z0-9_-]{1,100}$') then raise exception 'Invalid attempt result' using errcode='22023';end if;
 update public.crm_external_delivery_attempts set outcome=state,finished_at=clock_timestamp(),http_status=(p_result->>'http_status')::int,provider_request_id=p_result->>'request_id',
 response_summary=case when state='sent' then '{"accepted":true}'::jsonb else null end,error_code=code where delivery_id=d.id and lease_token=p_lease and finished_at is null;
 if not found then raise exception 'Attempt missing' using errcode='40001';end if;
 delay:=least(86400,greatest(30,coalesce((p_result->>'retry_after')::int,0),least(21600,30*power(2,d.attempt_count)::int)+(random()*30)::int));
 if state in ('retry','unknown') and d.attempt_count>=d.max_attempts then state:='dead';code:='attempts_exhausted';end if;
 update public.crm_external_deliveries set status=state,lease_token=null,lease_until=null,updated_at=now(),last_error_code=code,
  next_attempt_at=case when state in ('retry','unknown') then now()+make_interval(secs=>delay) end,sent_at=case when state='sent' then now() end where id=d.id;
end $$;
create function public.crm_block_external_delivery(p_delivery uuid,p_lease uuid,p_code text) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();
 if p_code is null or p_code not in ('missing_secret','configuration_missing','delivery_held','live_not_available','invalid_identity') then raise exception 'Invalid hold' using errcode='22023';end if;
 update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=p_code,updated_at=now()
 where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now()
 and not exists(select 1 from public.crm_external_delivery_attempts where delivery_id=p_delivery and lease_token=p_lease);
 if not found then raise exception 'Stale/started lease' using errcode='40001';end if;
end $$;
create function public.crm_retry_external_delivery(p_delivery uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare d public.crm_external_deliveries;cfg jsonb;begin
 perform crm_security.require_reader(true);
 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status not in ('blocked','retry','unknown') or d.attempt_count>=d.max_attempts then raise exception 'Delivery not eligible for retry' using errcode='22023';end if;
 -- Explicit single-delivery retry may adopt fixed configuration before preparation.
 -- Once prepared, even a director cannot change its destination/name/time/identity.
 if d.payload is null then
  select lifecycle_settings into cfg from public.crm_integration_connections where id=d.connection_id;
  d.mapping_snapshot:=cfg;d.mapping_version:=coalesce((cfg->>'version')::int,0);d.max_attempts:=coalesce((cfg->>'max_attempts')::int,5);
 end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery still held' using errcode='22023';end if;
 update public.crm_external_deliveries set status='pending',next_attempt_at=now(),last_error_code=null,updated_at=now(),mapping_snapshot=d.mapping_snapshot,mapping_version=d.mapping_version,max_attempts=d.max_attempts where id=d.id;
end $$;
create function public.crm_list_external_deliveries(p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb;begin
 perform crm_security.require_reader(true);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'Invalid page' using errcode='22023';end if;
 select jsonb_build_object('total',(select count(*) from public.crm_external_deliveries),'live_available',false,'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into result from
 (select d.id,d.event_kind,d.status,d.attempt_count,d.created_at,d.event_time,d.sent_at,d.last_error_code,d.mapping_version,c.connection_key as destination_label,
  (select jsonb_agg(jsonb_build_object('number',a.attempt_number,'started_at',a.started_at,'finished_at',a.finished_at,'outcome',a.outcome,'http_status',a.http_status,'error_code',a.error_code) order by a.attempt_number) from public.crm_external_delivery_attempts a where a.delivery_id=d.id) as attempts
 from public.crm_external_deliveries d left join public.crm_integration_connections c on c.id=d.connection_id order by d.created_at desc,d.id limit p_limit offset p_offset)x;
 return result;
end $$;
revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_configure_lifecycle(uuid,bigint,jsonb),public.crm_reconcile_external_deliveries(integer),public.crm_claim_external_deliveries(integer),
 public.crm_get_external_delivery(uuid,uuid),public.crm_prepare_external_delivery(uuid,uuid,jsonb),public.crm_begin_external_attempt(uuid,uuid),public.crm_finish_external_attempt(uuid,uuid,jsonb),
 public.crm_block_external_delivery(uuid,uuid,text),public.crm_retry_external_delivery(uuid),public.crm_list_external_deliveries(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_configure_lifecycle(uuid,bigint,jsonb),public.crm_retry_external_delivery(uuid),public.crm_list_external_deliveries(integer,integer),public.crm_reconcile_external_deliveries(integer) to authenticated;
grant execute on function public.crm_reconcile_external_deliveries(integer),public.crm_claim_external_deliveries(integer),public.crm_get_external_delivery(uuid,uuid),public.crm_prepare_external_delivery(uuid,uuid,jsonb),
 public.crm_begin_external_attempt(uuid,uuid),public.crm_finish_external_attempt(uuid,uuid,jsonb),public.crm_block_external_delivery(uuid,uuid,text) to service_role;

-- Preserve the established inbound configuration response contract.
create or replace function public.crm_save_meta_connection(p_data jsonb,p_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections; begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','page_id','account_id','api_version','access_token_secret_ref','enabled']<>'{}' then raise exception 'Invalid connection fields' using errcode='22023'; end if;
 if p_id is null then
  insert into public.crm_integration_connections(connection_key,page_id,account_id,api_version,access_token_secret_ref,created_by,updated_by)
  values(p_data->>'connection_key',p_data->>'page_id',p_data->>'account_id',p_data->>'api_version',p_data->>'access_token_secret_ref',auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='40001'; end if;
  if p_data->>'page_id' is distinct from c.page_id or p_data->>'connection_key' is distinct from c.connection_key then raise exception 'Connection identity immutable' using errcode='22023'; end if;
  update public.crm_integration_connections set account_id=p_data->>'account_id',api_version=p_data->>'api_version',access_token_secret_ref=p_data->>'access_token_secret_ref',
   enabled=coalesce((p_data->>'enabled')::boolean,false),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into c;
 end if;
 return to_jsonb(c)-array['lifecycle_settings','lifecycle_destination_id'];
end $$;
create or replace function public.crm_save_website_connection(p_data jsonb,p_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','origin','enabled']<>'{}' then raise exception 'Invalid website settings' using errcode='22023';end if;
 if p_id is null then
  insert into public.crm_integration_connections(provider,connection_key,settings,created_by,updated_by)
  values('website',p_data->>'connection_key',jsonb_build_object('origin',p_data->>'origin'),auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id and provider='website' for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='40001';end if;
  if p_data->>'connection_key' is distinct from c.connection_key or p_data->>'origin' is distinct from c.settings->>'origin' then raise exception 'Site identity immutable; create a separate connection' using errcode='22023';end if;
  update public.crm_integration_connections set enabled=coalesce((p_data->>'enabled')::boolean,false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into c;
 end if;return to_jsonb(c)-array['lifecycle_settings','lifecycle_destination_id'];
end $$;
notify pgrst,'reload schema';
commit;
