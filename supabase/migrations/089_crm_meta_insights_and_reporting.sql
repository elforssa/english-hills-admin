-- Phase 11: mock-only Insights synchronization. No acquisition/lifecycle mutation.
begin;
alter table public.crm_integration_connections add column insights_settings jsonb not null default '{}' check(jsonb_typeof(insights_settings)='object' and octet_length(insights_settings::text)<=4096);
-- One configured source per advertising account prevents duplicate account spend.
create unique index crm_insights_account_owner on public.crm_integration_connections((insights_settings->>'account_id')) where insights_settings ? 'account_id';
create table public.crm_meta_objects (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references public.crm_integration_connections(id),account_id text not null check(account_id ~ '^[0-9]{1,32}$'),
 object_type text not null check(object_type in ('campaign','adset','ad')),external_id text not null check(external_id ~ '^[0-9]{1,32}$'),parent_external_id text check(parent_external_id ~ '^[0-9]{1,32}$'),
 current_name text check(length(current_name)<=300),objective text check(length(objective)<=100),effective_status text check(length(effective_status)<=100),
 first_seen_at timestamptz not null default now(),last_synced_at timestamptz not null default now(),unique(connection_id,object_type,external_id)
);
create table public.crm_meta_sync_runs (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references public.crm_integration_connections(id),request_key uuid not null,
 date_from date not null,date_to date not null,query_version text not null default 'ad-daily-v1' check(query_version='ad-daily-v1'),config_snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','completed','failed','partial')),
 provider_report_id text check(provider_report_id ~ '^[0-9]{1,32}$'),cursor text check(length(cursor)<=500),
 started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 rows_processed integer not null default 0 check(rows_processed between 0 and 5000),attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 lease_token uuid,lease_until timestamptz,error_code text,unique(connection_id,request_key),
 check(date_to>=date_from and date_to-date_from<=30),check((status='running')=(lease_token is not null and lease_until is not null)),check(status<>'completed' or completed_at is not null)
);
create table public.crm_meta_daily_insights (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references public.crm_integration_connections(id),sync_run_id uuid not null references public.crm_meta_sync_runs(id),
 insight_date date not null,account_id text not null,account_timezone text not null,currency text not null check(currency ~ '^[A-Z]{3}$'),
 level text not null default 'ad' check(level='ad'),campaign_id text not null check(campaign_id ~ '^[0-9]{1,32}$'),adset_id text not null check(adset_id ~ '^[0-9]{1,32}$'),ad_id text not null check(ad_id ~ '^[0-9]{1,32}$'),
 object_id uuid references public.crm_meta_objects(id),breakdown_key text not null default '' check(breakdown_key=''),query_version text not null check(query_version='ad-daily-v1'),
 spend numeric(18,6) not null check(spend>=0 and spend<'Infinity'::numeric),impressions bigint check(impressions>=0),reach bigint check(reach>=0),clicks bigint check(clicks>=0),link_clicks bigint check(link_clicks>=0),
 actions jsonb not null default '[]' check(jsonb_typeof(actions)='array' and octet_length(actions::text)<=8192),name_snapshot text check(length(name_snapshot)<=300),fetched_at timestamptz not null default now(),
 unique(connection_id,insight_date,level,ad_id,breakdown_key,query_version)
);
create index crm_insights_reporting on public.crm_meta_daily_insights(connection_id,insight_date,campaign_id,adset_id,ad_id);
create index crm_sync_queue on public.crm_meta_sync_runs(created_at,id) where status in ('pending','running');
create index crm_sync_coverage on public.crm_meta_sync_runs(connection_id,date_from,date_to,completed_at) where status='completed';
alter table public.crm_meta_objects enable row level security;
alter table public.crm_meta_sync_runs enable row level security;
alter table public.crm_meta_daily_insights enable row level security;
revoke all on public.crm_meta_objects,public.crm_meta_sync_runs,public.crm_meta_daily_insights from public,anon,authenticated,service_role;
create function public.crm_configure_insights(p_connection uuid,p_version bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['mode','enabled','account_id','currency','timezone','api_version','secret_ref','refresh_days']<>'{}'
 or p_data->>'mode' is distinct from 'mock' or coalesce(p_data->>'account_id','') !~ '^[0-9]{1,32}$' or coalesce(p_data->>'currency','') !~ '^[A-Z]{3}$'
 or not exists(select 1 from pg_timezone_names where name=p_data->>'timezone') or coalesce(p_data->>'api_version','') !~ '^v[0-9]{1,3}\.0$'
 or coalesce(p_data->>'secret_ref','') !~ '^CRM_META_INSIGHTS_TOKEN_[A-Z0-9_]{1,64}$' or coalesce((p_data->>'refresh_days')::int,7) not between 1 and 31
 then raise exception 'Invalid mock Insights configuration' using errcode='22023';end if;
 if c.insights_settings ? 'account_id' and row(c.insights_settings->>'account_id',c.insights_settings->>'currency',c.insights_settings->>'timezone') is distinct from row(p_data->>'account_id',p_data->>'currency',p_data->>'timezone') then raise exception 'Account/currency/timezone immutable; use reviewed reconciliation' using errcode='22023';end if;
 update public.crm_integration_connections set insights_settings=p_data||jsonb_build_object('enabled',coalesce((p_data->>'enabled')::boolean,false),'refresh_days',coalesce((p_data->>'refresh_days')::int,7)),version=version+1,updated_at=now(),updated_by=auth.uid() where id=c.id returning * into c;
 return jsonb_build_object('id',c.id,'version',c.version,'insights',c.insights_settings-'secret_ref','live_available',false);
end $$;
create function public.crm_request_insights_sync(p_connection uuid,p_request uuid,p_from date default null,p_to date default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;r public.crm_meta_sync_runs;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or c.insights_settings->>'mode' is distinct from 'mock' or not coalesce((c.insights_settings->>'enabled')::boolean,false) or p_request is null then raise exception 'Mock synchronization unavailable' using errcode='22023';end if;
 if p_from is null and p_to is null then p_to:=(now() at time zone (c.insights_settings->>'timezone'))::date;p_from:=p_to-(c.insights_settings->>'refresh_days')::int+1;end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>30 or p_to>(now() at time zone (c.insights_settings->>'timezone'))::date then raise exception 'Range must be 1–31 non-future account dates' using errcode='22023';end if;
 select * into r from public.crm_meta_sync_runs where connection_id=c.id and request_key=p_request;
 if found then if row(r.date_from,r.date_to) is distinct from row(p_from,p_to) then raise exception 'Request conflict' using errcode='22023';end if;return r.id;end if;
 if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Overlapping synchronization already queued' using errcode='40001';end if;
 insert into public.crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot) values(c.id,p_request,p_from,p_to,c.insights_settings) returning id into r.id;return r.id;
end $$;
create function public.crm_retry_insights_sync(p_run uuid) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare r public.crm_meta_sync_runs;c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 select c0.* into c from public.crm_integration_connections c0 join public.crm_meta_sync_runs r0 on r0.connection_id=c0.id where r0.id=p_run for update of c0;
 select * into r from public.crm_meta_sync_runs where id=p_run for update;
 if not found or r.status not in ('failed','partial') or r.attempt_count>=3 or not coalesce((c.insights_settings->>'enabled')::boolean,false) then raise exception 'Run cannot retry' using errcode='22023';end if;
 if exists(select 1 from public.crm_meta_sync_runs where connection_id=r.connection_id and id<>r.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(r.date_from,r.date_to,'[]')) then raise exception 'Overlapping run' using errcode='40001';end if;
 update public.crm_meta_sync_runs set status='pending',error_code=null,cursor=null,provider_report_id=null where id=r.id;
end $$;
create function public.crm_claim_insights_sync() returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare r public.crm_meta_sync_runs;begin
 perform crm_security.require_meta_worker();
 select r0.* into r from public.crm_meta_sync_runs r0 join public.crm_integration_connections c on c.id=r0.connection_id
 where (r0.status='pending' or (r0.status='running' and r0.lease_until<=now())) and coalesce((c.insights_settings->>'enabled')::boolean,false) and c.insights_settings->>'mode'='mock'
 order by r0.created_at,r0.id limit 1 for update of r0 skip locked;
 if not found then return null;end if;
 if r.attempt_count>=3 then update public.crm_meta_sync_runs set status='failed',error_code='attempts_exhausted',lease_token=null,lease_until=null where id=r.id;return null;end if;
 update public.crm_meta_sync_runs set status='running',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',started_at=clock_timestamp(),completed_at=null,error_code=null where id=r.id returning * into r;
 return jsonb_build_object('id',r.id,'lease_token',r.lease_token,'date_from',r.date_from,'date_to',r.date_to,'query_version',r.query_version,'config',r.config_snapshot);
end $$;
create function public.crm_finish_insights_sync(p_run uuid,p_lease uuid,p_data jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare r public.crm_meta_sync_runs;c public.crm_integration_connections;x jsonb;oid uuid;begin
 perform crm_security.require_meta_worker();
 select c0.* into c from public.crm_integration_connections c0 join public.crm_meta_sync_runs r0 on r0.connection_id=c0.id where r0.id=p_run for share of c0;
 select * into r from public.crm_meta_sync_runs where id=p_run for update;
 if not found or r.status<>'running' or r.lease_token is distinct from p_lease or r.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
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
end $$;
create function public.crm_fail_insights_sync(p_run uuid,p_lease uuid,p_code text,p_rows integer default 0) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();
 if p_code is null or p_code not in ('rate_limit','provider_unavailable','provider_auth','invalid_data','network','timeout','limit_exceeded','missing_secret','storage_unavailable','async_pending') or p_rows is null or p_rows not between 0 and 5000 then raise exception 'Invalid failure' using errcode='22023';end if;
 update public.crm_meta_sync_runs set status=case when p_rows>0 then 'partial' else 'failed' end,error_code=p_code,rows_processed=p_rows,lease_token=null,lease_until=null
 where id=p_run and status='running' and lease_token=p_lease and lease_until>now();if not found then raise exception 'Stale lease' using errcode='40001';end if;
end $$;
create function public.crm_insights_diagnostics(p_connection uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_reader(true);
 return jsonb_build_object('live_available',false,'connections',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',connection_key,'account_id',insights_settings->>'account_id','currency',insights_settings->>'currency','timezone',insights_settings->>'timezone','enabled',insights_settings->'enabled') order by connection_key) from public.crm_integration_connections where provider='meta' and insights_settings ? 'account_id'),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,connection_id,date_from,date_to,status,created_at,started_at,completed_at,rows_processed,attempt_count,error_code from public.crm_meta_sync_runs where p_connection is null or connection_id=p_connection order by created_at desc,id limit 25)x),'[]'));
end $$;
revoke all on function public.crm_configure_insights(uuid,bigint,jsonb),public.crm_request_insights_sync(uuid,uuid,date,date),public.crm_retry_insights_sync(uuid),public.crm_claim_insights_sync(),public.crm_finish_insights_sync(uuid,uuid,jsonb),public.crm_fail_insights_sync(uuid,uuid,text,integer),public.crm_insights_diagnostics(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_configure_insights(uuid,bigint,jsonb),public.crm_request_insights_sync(uuid,uuid,date,date),public.crm_retry_insights_sync(uuid),public.crm_insights_diagnostics(uuid) to authenticated;
grant execute on function public.crm_claim_insights_sync(),public.crm_finish_insights_sync(uuid,uuid,jsonb),public.crm_fail_insights_sync(uuid,uuid,text,integer) to service_role;

-- Preserve the existing acquisition configuration response.
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
 return to_jsonb(c)-array['lifecycle_settings','lifecycle_destination_id','insights_settings'];
end $$;

-- Preserve the existing acquisition configuration response.
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
 end if;return to_jsonb(c)-array['lifecycle_settings','lifecycle_destination_id','insights_settings'];
end $$;
notify pgrst,'reload schema';
commit;
