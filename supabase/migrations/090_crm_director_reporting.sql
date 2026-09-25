-- Phase 11 director-only acquisition-cohort reporting. Reads CRM history only.
begin;
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
  'spend_complete',complete,'last_synced_at',last_sync,'sync_warning',warning,'live_sync_enabled',false,'reach',null,
  'summary',(select to_jsonb(t)||jsonb_build_object('cpl',spend/nullif(attributed_leads,0),'cpql',spend/nullif(attributed_qualified,0),'cac',spend/nullif(attributed_converted,0),'roas',case when currency='MAD' then attributed_revenue/nullif(spend,0) end) from totals t),
  'total',(select count(*) from named),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by page.spend desc nulls last,page.name,page.bucket) from (select bucket,object_key,attribution_kind,channel,name,objective,historical_names,spend,leads,engaged,qualified,tests_booked,tests_attended,results,converted,review_required,revenue,cpl,cpql,cac,roas,impressions,clicks,link_clicks from named order by spend desc nulls last,name,bucket limit p_limit offset p_offset)page),'[]')) into result;
 return result;
end $$;
revoke all on function public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
