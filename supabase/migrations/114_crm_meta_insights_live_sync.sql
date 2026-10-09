-- DGI-A-r2 Outcome A: live Meta Insights synchronisation for the director report.
-- Additive. Extends the 089/090 cumulative Insights definitions for mode='live',
-- bounded transient retry, a rolling refresh and diagnostics; creates the
-- crm-insights-primary job inactive. Connections keep only the secret reference
-- name; no token value is accepted, stored or returned.
begin;

-- D5: bounded automatic retry. Existing rows take the migration timestamp.
alter table public.crm_meta_sync_runs add column next_attempt_at timestamptz not null default now();
drop index public.crm_sync_queue;
create index crm_sync_queue on public.crm_meta_sync_runs(next_attempt_at,created_at,id) where status in ('pending','running');

create or replace function public.crm_configure_insights(p_connection uuid,p_version bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
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
  if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status in ('pending','running')) then raise exception 'Identity change waits for queued synchronization' using errcode='40001';end if;
 end if;
 update public.crm_integration_connections set insights_settings=p_data||jsonb_build_object('enabled',coalesce((p_data->>'enabled')::boolean,false),
  'refresh_days',coalesce((p_data->>'refresh_days')::int,case when p_data->>'mode'='live' then 28 else 7 end),'refresh_interval_hours',coalesce((p_data->>'refresh_interval_hours')::int,6)),
  version=version+1,updated_at=now(),updated_by=auth.uid() where id=c.id returning * into c;
 return jsonb_build_object('id',c.id,'version',c.version,'insights',c.insights_settings-'secret_ref','live_available',true);
end $$;

create or replace function public.crm_request_insights_sync(p_connection uuid,p_request uuid,p_from date default null,p_to date default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;r public.crm_meta_sync_runs;begin
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or coalesce(c.insights_settings->>'mode','') not in ('mock','live') or not coalesce((c.insights_settings->>'enabled')::boolean,false) or p_request is null then raise exception 'Synchronization unavailable' using errcode='22023';end if;
 if p_from is null and p_to is null then p_to:=(now() at time zone (c.insights_settings->>'timezone'))::date;p_from:=p_to-(c.insights_settings->>'refresh_days')::int+1;end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>30 or p_to>(now() at time zone (c.insights_settings->>'timezone'))::date then raise exception 'Range must be 1–31 non-future account dates' using errcode='22023';end if;
 select * into r from public.crm_meta_sync_runs where connection_id=c.id and request_key=p_request;
 if found then if row(r.date_from,r.date_to) is distinct from row(p_from,p_to) then raise exception 'Request conflict' using errcode='22023';end if;return r.id;end if;
 if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Overlapping synchronization already queued' using errcode='40001';end if;
 insert into public.crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot) values(c.id,p_request,p_from,p_to,c.insights_settings) returning id into r.id;return r.id;
end $$;

create or replace function public.crm_retry_insights_sync(p_run uuid) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare r public.crm_meta_sync_runs;c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 select c0.* into c from public.crm_integration_connections c0 join public.crm_meta_sync_runs r0 on r0.connection_id=c0.id where r0.id=p_run for update of c0;
 select * into r from public.crm_meta_sync_runs where id=p_run for update;
 -- D2: a retry must not requeue an identity or mode the connection no longer has.
 if not found or r.status not in ('failed','partial') or r.attempt_count>=3 or not coalesce((c.insights_settings->>'enabled')::boolean,false)
 or row(r.config_snapshot->>'account_id',r.config_snapshot->>'currency',r.config_snapshot->>'timezone',r.config_snapshot->>'mode')
  is distinct from row(c.insights_settings->>'account_id',c.insights_settings->>'currency',c.insights_settings->>'timezone',c.insights_settings->>'mode') then raise exception 'Run cannot retry' using errcode='22023';end if;
 if exists(select 1 from public.crm_meta_sync_runs where connection_id=r.connection_id and id<>r.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(r.date_from,r.date_to,'[]')) then raise exception 'Overlapping run' using errcode='40001';end if;
 update public.crm_meta_sync_runs set status='pending',error_code=null,cursor=null,provider_report_id=null,next_attempt_at=now() where id=r.id;
end $$;

create or replace function public.crm_claim_insights_sync() returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare r public.crm_meta_sync_runs;begin
 perform crm_security.require_meta_worker();
 -- D5: the backoff date gates the pending path and the expired-lease reclaim alike.
 select r0.* into r from public.crm_meta_sync_runs r0 join public.crm_integration_connections c on c.id=r0.connection_id
 where (r0.status='pending' or (r0.status='running' and r0.lease_until<=now())) and r0.next_attempt_at<=now()
  and coalesce((c.insights_settings->>'enabled')::boolean,false) and c.insights_settings->>'mode' in ('mock','live')
 order by r0.next_attempt_at,r0.created_at,r0.id limit 1 for update of r0 skip locked;
 if not found then return null;end if;
 if r.attempt_count>=3 then update public.crm_meta_sync_runs set status='failed',error_code='attempts_exhausted',lease_token=null,lease_until=null where id=r.id;return null;end if;
 update public.crm_meta_sync_runs set status='running',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',started_at=clock_timestamp(),completed_at=null,error_code=null where id=r.id returning * into r;
 return jsonb_build_object('id',r.id,'lease_token',r.lease_token,'date_from',r.date_from,'date_to',r.date_to,'query_version',r.query_version,'attempt_count',r.attempt_count,'config',r.config_snapshot);
end $$;

create or replace function public.crm_fail_insights_sync(p_run uuid,p_lease uuid,p_code text,p_rows integer default 0) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();
 if p_code is null or p_code not in ('rate_limit','provider_unavailable','provider_auth','invalid_data','network','timeout','limit_exceeded','missing_secret','storage_unavailable','async_pending','live_not_available') or p_rows is null or p_rows not between 0 and 5000 then raise exception 'Invalid failure' using errcode='22023';end if;
 -- D5: a transient live failure returns to the queue after 30 minutes, then 2 hours;
 -- the third attempt and every other code are terminal. Mock runs keep the 089 contract.
 update public.crm_meta_sync_runs set
  status=case when config_snapshot->>'mode'='live' and p_code in ('rate_limit','provider_unavailable','network','timeout') and attempt_count<3 then 'pending' when p_rows>0 then 'partial' else 'failed' end,
  next_attempt_at=case when config_snapshot->>'mode'='live' and p_code in ('rate_limit','provider_unavailable','network','timeout') and attempt_count<3 then now()+case when attempt_count<=1 then interval '30 minutes' else interval '2 hours' end else next_attempt_at end,
  error_code=p_code,rows_processed=p_rows,lease_token=null,lease_until=null
 where id=p_run and status='running' and lease_token=p_lease and lease_until>now();if not found then raise exception 'Stale lease' using errcode='40001';end if;
end $$;

create or replace function public.crm_insights_diagnostics(p_connection uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_reader(true);
 -- secret_ref is the non-secret reference name; the value lives only in the server environment.
 return jsonb_build_object('live_available',true,'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',c.connection_key,'account_id',c.insights_settings->>'account_id','currency',c.insights_settings->>'currency','timezone',c.insights_settings->>'timezone','enabled',c.insights_settings->'enabled',
  'mode',c.insights_settings->>'mode','refresh_days',c.insights_settings->'refresh_days','refresh_interval_hours',c.insights_settings->'refresh_interval_hours','api_version',c.insights_settings->>'api_version','secret_ref',c.insights_settings->>'secret_ref',
  'last_completed_at',(select max(r.completed_at) from public.crm_meta_sync_runs r where r.connection_id=c.id and r.status='completed')) order by c.connection_key) from public.crm_integration_connections c where c.provider='meta' and c.insights_settings ? 'account_id'),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,connection_id,date_from,date_to,status,created_at,started_at,completed_at,next_attempt_at,rows_processed,attempt_count,error_code,config_snapshot->>'mode' as mode from public.crm_meta_sync_runs where p_connection is null or connection_id=p_connection order by created_at desc,id limit 25)x),'[]'));
end $$;

-- D6: the live flag comes from the selected configuration; everything else is the 090 body.
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
     case p_level when 'campaign' then a.campaign_id when 'adset' then a.adset_id when 'ad' then a.ad_id when 'source' then case when a.campaign_id is not null then 'meta' end end end as advertising_key
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
   case when advertising_key is not null then 'meta:'||advertising_key else 'unknown:'||channel end as bucket,
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
  select x.*,coalesce(o.current_name,case when p_level='source' and x.attribution_kind='trusted_meta' then 'Meta Instant Form' end,case when x.attribution_kind='trusted_meta' then x.historical_names[1] end,case when x.attribution_kind='trusted_meta' then case p_level when 'campaign' then 'Campagne ' when 'adset' then 'Ensemble ' else 'Annonce ' end||x.object_key end,case x.channel when 'website' then 'Site web · attribution observée' when 'manual' then 'Saisie manuelle / téléphone / recommandation' else 'Meta · attribution inconnue' end) as name,o.objective,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.leads,0) end as cpl,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.qualified,0) end as cpql,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.converted,0) end as cac,
   case when x.attribution_kind='trusted_meta' and currency='MAD' then x.revenue/nullif(x.spend,0) end as roas
  from combined x left join public.crm_meta_objects o on o.connection_id=p_connection and o.object_type=p_level and o.external_id=x.object_key
 ), totals as (
  select coalesce(sum(leads),0) as leads,coalesce(sum(engaged),0) as engaged,coalesce(sum(qualified),0) as qualified,coalesce(sum(converted),0) as converted,
   coalesce(sum(tests_booked),0) as tests_booked,coalesce(sum(tests_attended),0) as tests_attended,coalesce(sum(results),0) as results,coalesce(sum(revenue),0) as revenue,
   coalesce(sum(leads) filter(where attribution_kind='unattributed'),0) as unattributed_leads,
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

-- D3: create the rolling refresh run when one is due. Locks each connection row like
-- crm_request_insights_sync, so a tick and a director request serialise and the
-- overlap check of whichever runs second sees the other's run. Mock connections are
-- never auto-enqueued.
create function public.crm_enqueue_insights_refresh() returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare cid uuid;c public.crm_integration_connections;today date;inserted integer:=0;begin
 perform crm_security.require_meta_worker();
 for cid in select id from public.crm_integration_connections where provider='meta' and insights_settings->>'mode'='live' and coalesce((insights_settings->>'enabled')::boolean,false) order by id loop
  select * into c from public.crm_integration_connections where id=cid for update;
  if not found or c.insights_settings->>'mode' is distinct from 'live' or not coalesce((c.insights_settings->>'enabled')::boolean,false) then continue;end if;
  today:=(now() at time zone (c.insights_settings->>'timezone'))::date;
  if exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and created_at>now()-make_interval(hours=>coalesce((c.insights_settings->>'refresh_interval_hours')::int,6)))
  or exists(select 1 from public.crm_meta_sync_runs where connection_id=c.id and status in ('pending','running') and daterange(date_from,date_to,'[]') && daterange(today-coalesce((c.insights_settings->>'refresh_days')::int,28)+1,today,'[]')) then continue;end if;
  insert into public.crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot) values(c.id,gen_random_uuid(),today-coalesce((c.insights_settings->>'refresh_days')::int,28)+1,today,c.insights_settings);
  inserted:=inserted+1;
 end loop;
 return inserted;
end $$;

revoke all on function public.crm_configure_insights(uuid,bigint,jsonb),public.crm_request_insights_sync(uuid,uuid,date,date),public.crm_retry_insights_sync(uuid),public.crm_claim_insights_sync(),public.crm_fail_insights_sync(uuid,uuid,text,integer),public.crm_insights_diagnostics(uuid),public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer),public.crm_enqueue_insights_refresh() from public,anon,authenticated,service_role;
grant execute on function public.crm_configure_insights(uuid,bigint,jsonb),public.crm_request_insights_sync(uuid,uuid,date,date),public.crm_retry_insights_sync(uuid),public.crm_insights_diagnostics(uuid),public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.crm_claim_insights_sync(),public.crm_fail_insights_sync(uuid,uuid,text,integer),public.crm_enqueue_insights_refresh() to service_role;

-- D3: Vault-driven scheduler trigger, created inactive exactly like migration 100.
do $$
declare cron_database text := current_setting('cron.database_name', true);
begin
  if cron_database is null or cron_database = current_database() then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice 'Skipping pg_cron Insights job in %, configured cron database is %', current_database(), cron_database;
  end if;
end $$;

create or replace function crm_security.invoke_crm_insights_scheduler()
returns bigint
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare scheduler_url text;scheduler_token text;request_id bigint;
begin
  select decrypted_secret into scheduler_url from vault.decrypted_secrets where name='crm_insights_scheduler_url';
  select decrypted_secret into scheduler_token from vault.decrypted_secrets where name='crm_insights_scheduler_token';
  if scheduler_url is null or btrim(scheduler_url)='' or scheduler_token is null or btrim(scheduler_token)='' then
    raise exception 'CRM Insights scheduler Vault configuration is missing' using errcode='22023';
  end if;
  if scheduler_url is distinct from 'https://admin.english-hills.com/api/cron/crm-insights' then
    raise exception 'CRM Insights scheduler URL is invalid' using errcode='22023';
  end if;
  if octet_length(scheduler_token)>4096 then raise exception 'CRM Insights scheduler token is invalid' using errcode='22023';end if;
  select net.http_get(url=>scheduler_url,headers=>jsonb_build_object('Accept','application/json','Authorization','Bearer '||scheduler_token),timeout_milliseconds=>55000) into request_id;
  return request_id;
end $$;
revoke all on function crm_security.invoke_crm_insights_scheduler() from public,anon,authenticated,service_role;

do $$
declare insights_job bigint;
begin
  if to_regnamespace('cron') is not null then
    select cron.schedule('crm-insights-primary','*/30 * * * *','select crm_security.invoke_crm_insights_scheduler()') into insights_job;
    perform cron.alter_job(insights_job, active => false);
  end if;
end $$;

notify pgrst,'reload schema';
commit;
