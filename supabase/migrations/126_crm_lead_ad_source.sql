-- 126: the CRM lead panel shows reception which Meta campaign, ad set and ad brought
-- an inquiry, as readable names (owner decision 2026-11-03, "approve ad names").
-- One read changes: crm_get_operational_acquisition_summary (migration 107) keeps its
-- envelope (first_inquiry / latest_inquiry with channel, source_label, occurred_at)
-- and each inquiry gains an "ad" object, or null. Nothing is written; intake, the
-- finalizer, the B1 enrichment, lifecycle, the B1/B2 analytics and the cohort read
-- are untouched. No raw UTM, fbclid, fbc, fbp, landing page, referrer, raw payload or
-- consent evidence ever leaves the database through this read.
begin;

-- Private resolver, no API grant. Instant Form rows (provider meta) answer with the
-- stored ids and name snapshots filled by intake or the B1 enrichment. Website rows
-- (provider website) carry Meta ids in their UTMs since the website release of
-- 2026-11-03 (utm_campaign = campaign id, utm_term = ad set id, utm_content = ad id);
-- the stored row stays an observation (migration 087), so the names are resolved at
-- read time against the synced Insights objects of the Meta connections, by id only:
-- (a) the ad named by utm_content, then its parent ad set and that ad set's parent
-- campaign, ignoring utm_term and utm_campaign; (b) else the ad set named by utm_term
-- and its parent campaign; (c) else the campaign named by utm_campaign. A value that
-- is not 16 to 20 digits, or that matches no synced object, gives null fields; an
-- object whose parent is not synced leaves the parent fields null. Manual rows,
-- redacted rows and rows without any resolvable value give null.
create function crm_security.inquiry_ad_source(p_submission uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare a public.crm_submission_attribution; ad public.crm_meta_objects; st public.crm_meta_objects; cp public.crm_meta_objects; r jsonb;
begin
 select * into a from public.crm_submission_attribution where submission_id=p_submission and redacted_at is null;
 if not found then return null; end if;
 if a.provider='meta' then
  r:=jsonb_build_object('campaign_name',a.campaign_name_snapshot,'adset_name',a.adset_name_snapshot,'ad_name',a.ad_name_snapshot,
   'campaign_id',a.campaign_id,'adset_id',a.adset_id,'ad_id',a.ad_id);
 elsif a.provider='website' then
  if a.utm_content ~ '^[0-9]{16,20}$' then
   select o.* into ad from public.crm_meta_objects o join public.crm_integration_connections c on c.id=o.connection_id and c.provider='meta'
   where o.object_type='ad' and o.external_id=a.utm_content order by o.last_synced_at desc,o.id limit 1;
  end if;
  if ad.id is not null then
   select o.* into st from public.crm_meta_objects o where o.connection_id=ad.connection_id and o.object_type='adset' and o.external_id=ad.parent_external_id;
  elsif a.utm_term ~ '^[0-9]{16,20}$' then
   select o.* into st from public.crm_meta_objects o join public.crm_integration_connections c on c.id=o.connection_id and c.provider='meta'
   where o.object_type='adset' and o.external_id=a.utm_term order by o.last_synced_at desc,o.id limit 1;
  end if;
  if st.id is not null then
   select o.* into cp from public.crm_meta_objects o where o.connection_id=st.connection_id and o.object_type='campaign' and o.external_id=st.parent_external_id;
  elsif ad.id is null and a.utm_campaign ~ '^[0-9]{16,20}$' then
   select o.* into cp from public.crm_meta_objects o join public.crm_integration_connections c on c.id=o.connection_id and c.provider='meta'
   where o.object_type='campaign' and o.external_id=a.utm_campaign order by o.last_synced_at desc,o.id limit 1;
  end if;
  r:=jsonb_build_object('campaign_name',cp.current_name,'adset_name',st.current_name,'ad_name',ad.current_name,
   'campaign_id',cp.external_id,'adset_id',st.external_id,'ad_id',ad.external_id);
 else
  return null;
 end if;
 return case when jsonb_strip_nulls(r)='{}'::jsonb then null else r end;
end $$;
revoke all on function crm_security.inquiry_ad_source(uuid) from public,anon,authenticated,service_role;

-- Same signature, posture, reader check and envelope as migration 107; "ad" added to
-- both inquiries. Still require_reader(false): every operational CRM role reads it.
create or replace function public.crm_get_operational_acquisition_summary(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 if p_lead is null then raise exception 'Lead required' using errcode='22023'; end if;
 select jsonb_build_object('first_inquiry',jsonb_build_object('channel',f.channel,'source_label',f.source_label,'occurred_at',f.occurred_at,'ad',crm_security.inquiry_ad_source(f.id)),
 'latest_inquiry',jsonb_build_object('channel',s.channel,'source_label',s.source_label,'occurred_at',s.occurred_at,'ad',crm_security.inquiry_ad_source(s.id))) into result
 from public.crm_leads l join public.crm_submissions f on f.id=l.first_submission_id join public.crm_submissions s on s.id=l.latest_submission_id where l.id=p_lead;
 return result;
end $$;
revoke all on function public.crm_get_operational_acquisition_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_get_operational_acquisition_summary(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
