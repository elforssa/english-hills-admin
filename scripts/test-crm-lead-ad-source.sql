-- Lead ad source (migration 126): rollback-only acceptance of the "ad" object inside
-- crm_get_operational_acquisition_summary. Synthetic connection, Insights objects,
-- leads and attribution rows; no provider call, no token, no Production data.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='45s';
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL %',label; end if; end $$;
create function pg_temp.denied(s text,code text default '22023') returns void language plpgsql as $$ begin
 begin execute s; exception when others then if sqlstate=code then return; end if; raise; end; raise exception 'Unexpected success: %',s; end $$;
insert into auth.users(id,email,aud,role) select ('12600000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'ad-source-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '12600000-%';
set local request.jwt.claim.sub='12600000-0000-0000-0000-000000000001';
create temp table policy as select (public.crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]}}')->>'policy_id')::uuid id;
-- Two Meta connections: the synced objects live on the first; the second holds a stale
-- copy of one campaign under another name to prove the newest synced row wins.
create temp table conn as select gen_random_uuid() id,gen_random_uuid() other;
insert into public.crm_integration_connections(id,connection_key,page_id,api_version,created_by,updated_by)
 select id,'ad-source-test','126001','v99.0','12600000-0000-0000-0000-000000000001'::uuid,'12600000-0000-0000-0000-000000000001'::uuid from conn
 union all select other,'ad-source-other','126002','v99.0','12600000-0000-0000-0000-000000000001'::uuid,'12600000-0000-0000-0000-000000000001'::uuid from conn;
-- Chain A: campaign 1261 → ad set 1262 → ad 1263 (ids are 16 digits). Ad 1264 has an
-- ad set that was never synced. Ad set 1265 belongs to campaign 1266.
insert into public.crm_meta_objects(connection_id,account_id,object_type,external_id,parent_external_id,current_name,last_synced_at)
 select id,'1260','campaign','1261000000000000',null,'Rentrée 2026 — adultes',now() from conn
 union all select id,'1260','adset','1262000000000000','1261000000000000','Casablanca 25-45',now() from conn
 union all select id,'1260','ad','1263000000000000','1262000000000000','Vidéo témoignage',now() from conn
 union all select id,'1260','ad','1264000000000000','1299000000000000','Orphelin',now() from conn
 union all select id,'1260','campaign','1266000000000000',null,'Kids summer',now() from conn
 union all select id,'1260','adset','1265000000000000','1266000000000000','Parents 30-50',now() from conn
 union all select other,'1270','campaign','1261000000000000',null,'Stale copy',now()-interval '1 day' from conn;
-- Leads: one per case. first_touch is the website submission, last_touch the latest.
create temp table fx as select k,gen_random_uuid() lead,gen_random_uuid() first_touch,gen_random_uuid() last_touch,gen_random_uuid() contact from unnest(array['ad','orphan','adset','campaign','bad','unknown','twenty','twentyone','meta','meta_empty','manual','none','redacted']) k;
insert into public.crm_contacts(id,contact_kind,display_name,phone_e164) select contact,'guardian','Ad source parent '||k,'+2126'||lpad((row_number() over ())::text,8,'0') from fx;
insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,resolved_at)
 select first_touch,lead,case when k in ('meta','meta_empty','redacted') then 'meta_instant_form' when k='manual' then 'manual' else 'website' end,now()-interval '2 days',now()-interval '2 days','server','{}'::jsonb,'[]'::jsonb,'Ad source first '||k,'resolved',encode(sha256(convert_to(k||'first','UTF8')),'hex'),now() from fx
 union all select last_touch,lead,'meta_instant_form',now(),now(),'server','{}'::jsonb,'[]'::jsonb,'Ad source latest '||k,'resolved',encode(sha256(convert_to(k||'latest','UTF8')),'hex'),now() from fx;
insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,status,first_submission_id,latest_submission_id,followup_policy_id)
 select lead,contact,'Ad source learner '||k,'ad source learner '||k,'NEW',first_touch,last_touch,(select id from policy) from fx;
-- Website rows with secrets that must never leave the database through this read.
insert into public.crm_submission_attribution(submission_id,provider,attribution_status,landing_page,referrer,utm_source,utm_medium,utm_campaign,utm_term,utm_content,fbclid,fbc,fbp,raw_payload,consent_evidence)
 select first_touch,'website','partial','https://example.invalid/secret-landing-'||k,'https://example.invalid/secret-referrer','facebook','paid',
  case k when 'ad' then '1266000000000000' when 'orphan' then '1261000000000000' when 'adset' then '1261000000000000' when 'campaign' then '1261000000000000' when 'bad' then '126100000000000' when 'unknown' then '1299000000000000' when 'twenty' then '12610000000000000000' when 'twentyone' then '126100000000000000000' end,
  case k when 'ad' then '1265000000000000' when 'adset' then '1265000000000000' when 'bad' then 'not-digits' end,
  case k when 'ad' then '1263000000000000' when 'orphan' then '1264000000000000' when 'bad' then '1263000000000000x' end,
  'SECRET-FBCLID-'||k,'fb.1.1.SECRET-FBC','fb.1.1.SECRET-FBP','{"secret":"raw-payload"}'::jsonb,'{"secret":"consent"}'::jsonb from fx where k in ('ad','orphan','adset','campaign','bad','unknown','twenty','twentyone');
-- Instant Form rows: snapshots (B1-style), an empty one, and a redacted one.
insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,form_name_snapshot,campaign_id,campaign_name_snapshot,adset_id,adset_name_snapshot,ad_id,ad_name_snapshot,attribution_status,raw_payload)
 select first_touch,'meta','1261'||k,'page:126001','126001','126003','Programme annuel','1261000000000000','Snapshot campaign','1262000000000000','Snapshot ad set','1263000000000000','Snapshot ad','complete','{"secret":"raw-payload"}'::jsonb from fx where k='meta'
 union all select first_touch,'meta','1261'||k,'page:126001','126001','126003','Programme annuel',null,null,null,null,null,null,'partial',null from fx where k='meta_empty'
 union all select first_touch,'meta','1261'||k,'page:126001','126001','126003','Programme annuel','1261000000000000','Redacted campaign','1262000000000000','Redacted ad set','1263000000000000','Redacted ad','complete',null from fx where k='redacted';
insert into public.crm_submission_attribution(submission_id,provider,attribution_status) select first_touch,'manual','unavailable' from fx where k='manual';
-- Every latest submission is an Instant Form row that names the full chain, except the
-- "none" lead whose latest row has no attribution at all.
insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,form_name_snapshot,campaign_id,campaign_name_snapshot,adset_id,adset_name_snapshot,ad_id,ad_name_snapshot,attribution_status)
 select last_touch,'meta','1262'||k,'page:126001','126001','126003','Programme annuel','1266000000000000','Latest campaign','1265000000000000','Latest ad set','1267000000000000','Latest ad','complete' from fx where k<>'none';
do $$ begin perform crm_security.lifecycle_barrier(true); update public.crm_submission_attribution set redacted_at=now() where submission_id=(select first_touch from fx where k='redacted'); end $$;

create function pg_temp.first_ad(k text) returns jsonb language sql as $$ select public.crm_get_operational_acquisition_summary((select lead from fx f where f.k=$1))->'first_inquiry'->'ad' $$;
create function pg_temp.latest_ad(k text) returns jsonb language sql as $$ select public.crm_get_operational_acquisition_summary((select lead from fx f where f.k=$1))->'latest_inquiry'->'ad' $$;
set local request.jwt.claim.sub='12600000-0000-0000-0000-000000000003';
do $$ declare r jsonb; a jsonb; kind text; begin
 -- Envelope: the 107 keys are unchanged and still carry the submissions' values; "ad" is added.
 r:=public.crm_get_operational_acquisition_summary((select lead from fx f where f.k='ad'));
 perform pg_temp.ok((select array_agg(x order by x) from jsonb_object_keys(r)x)=array['first_inquiry','latest_inquiry'],'exact envelope');
 perform pg_temp.ok((select array_agg(x order by x) from jsonb_object_keys(r->'first_inquiry')x)=array['ad','channel','occurred_at','source_label'] and (select array_agg(x order by x) from jsonb_object_keys(r->'latest_inquiry')x)=array['ad','channel','occurred_at','source_label'],'inquiry keys: the three 107 values plus ad');
 perform pg_temp.ok(r->'first_inquiry'->>'channel'='website' and r->'first_inquiry'->>'source_label'='Ad source first ad' and r->'latest_inquiry'->>'channel'='meta_instant_form' and r->'latest_inquiry'->>'source_label'='Ad source latest ad' and (r->'first_inquiry'->>'occurred_at')::timestamptz<(r->'latest_inquiry'->>'occurred_at')::timestamptz,'107 values unchanged');
 perform pg_temp.ok((select array_agg(x order by x) from jsonb_object_keys(r->'first_inquiry'->'ad')x)=array['ad_id','ad_name','adset_id','adset_name','campaign_id','campaign_name'],'ad object has exactly six keys');
 -- (a) website row with a synced ad: the whole chain from the ad, utm_term/utm_campaign ignored.
 a:=pg_temp.first_ad('ad');
 perform pg_temp.ok(a->>'ad_name'='Vidéo témoignage' and a->>'adset_name'='Casablanca 25-45' and a->>'campaign_name'='Rentrée 2026 — adultes' and a->>'ad_id'='1263000000000000' and a->>'adset_id'='1262000000000000' and a->>'campaign_id'='1261000000000000','ad id resolves the full chain; the other utm ids are ignored');
 -- (a) ad found but its ad set was never synced: ad only; utm_campaign still ignored.
 a:=pg_temp.first_ad('orphan');
 perform pg_temp.ok(a->>'ad_name'='Orphelin' and a->>'ad_id'='1264000000000000' and a->'adset_name'='null'::jsonb and a->'adset_id'='null'::jsonb and a->'campaign_name'='null'::jsonb and a->'campaign_id'='null'::jsonb,'unsynced parent leaves parent fields null and never falls back to utm_campaign');
 -- (b) ad set by utm_term plus its own parent campaign, not the utm_campaign one.
 a:=pg_temp.first_ad('adset');
 perform pg_temp.ok(a->'ad_name'='null'::jsonb and a->'ad_id'='null'::jsonb and a->>'adset_name'='Parents 30-50' and a->>'adset_id'='1265000000000000' and a->>'campaign_name'='Kids summer' and a->>'campaign_id'='1266000000000000','ad set id resolves the ad set and its parent campaign');
 -- (c) campaign by utm_campaign; the newest synced row wins over the stale copy.
 a:=pg_temp.first_ad('campaign');
 perform pg_temp.ok(a->'ad_name'='null'::jsonb and a->'adset_name'='null'::jsonb and a->>'campaign_name'='Rentrée 2026 — adultes' and a->>'campaign_id'='1261000000000000','campaign id alone resolves the campaign, newest sync first');
 -- Non-digit, too short, too long or unknown values give null.
 perform pg_temp.ok(pg_temp.first_ad('bad')='null'::jsonb,'non-digit, 15-digit and suffixed values give ad null');
 perform pg_temp.ok(pg_temp.first_ad('unknown')='null'::jsonb,'an unknown 16-digit id gives ad null');
 perform pg_temp.ok(pg_temp.first_ad('twenty')='null'::jsonb,'a 20-digit value is accepted as an id but matches nothing');
 perform pg_temp.ok(pg_temp.first_ad('twentyone')='null'::jsonb,'a 21-digit value is rejected');
 -- Instant Form rows answer with their snapshots and ids; empty, manual, absent and redacted rows give null.
 a:=pg_temp.first_ad('meta');
 perform pg_temp.ok(a->>'campaign_name'='Snapshot campaign' and a->>'adset_name'='Snapshot ad set' and a->>'ad_name'='Snapshot ad' and a->>'campaign_id'='1261000000000000' and a->>'adset_id'='1262000000000000' and a->>'ad_id'='1263000000000000','Instant Form snapshots');
 perform pg_temp.ok(pg_temp.first_ad('meta_empty')='null'::jsonb,'Instant Form row without ids or names gives null');
 perform pg_temp.ok(pg_temp.first_ad('manual')='null'::jsonb,'manual row gives null');
 perform pg_temp.ok(pg_temp.first_ad('none')='null'::jsonb and pg_temp.latest_ad('none')='null'::jsonb,'no attribution row gives null');
 perform pg_temp.ok(pg_temp.first_ad('redacted')='null'::jsonb,'redacted row gives null');
 a:=pg_temp.latest_ad('ad');
 perform pg_temp.ok(a->>'campaign_name'='Latest campaign' and a->>'adset_name'='Latest ad set' and a->>'ad_name'='Latest ad','latest inquiry resolves on its own');
 -- Nothing technical leaves: no utm, click id, landing page, referrer, raw payload or consent.
 for kind in select unnest(array['ad','orphan','adset','campaign','bad','unknown','twenty','twentyone','meta','meta_empty','manual','none','redacted']) loop
  r:=public.crm_get_operational_acquisition_summary((select lead from fx f where f.k=kind));
  perform pg_temp.ok(r::text !~* '(utm|fbclid|fbc|fbp|landing|referrer|raw|payload|consent|secret|facebook|paid|external_submission|page_id|form_id|hierarchy|status)','no technical key or value for '||kind);
 end loop;
 perform pg_temp.denied('select public.crm_get_operational_acquisition_summary(null)');
 perform pg_temp.ok(public.crm_get_operational_acquisition_summary(gen_random_uuid()) is null,'missing lead gives null');
end $$;
-- Roles: director, admin and receptionist read it; teacher, parent, student and pending are denied.
do $$ declare i int; begin
 for i in 1..3 loop
  perform set_config('request.jwt.claim.sub','12600000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
  perform pg_temp.ok(pg_temp.first_ad('ad')->>'ad_name'='Vidéo témoignage','role '||i||' reads the ad names');
 end loop;
 for i in 4..7 loop
  perform set_config('request.jwt.claim.sub','12600000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
  perform pg_temp.denied(format('select public.crm_get_operational_acquisition_summary(%L)',(select lead from fx f where f.k='ad')),'42501');
 end loop;
end $$;
select pg_temp.ok(not has_function_privilege('authenticated','crm_security.inquiry_ad_source(uuid)','execute') and not has_function_privilege('anon','crm_security.inquiry_ad_source(uuid)','execute') and not has_function_privilege('service_role','crm_security.inquiry_ad_source(uuid)','execute'),'the resolver has no API grant');
select pg_temp.ok(has_function_privilege('authenticated','public.crm_get_operational_acquisition_summary(uuid)','execute') and not has_function_privilege('anon','public.crm_get_operational_acquisition_summary(uuid)','execute') and not has_function_privilege('service_role','public.crm_get_operational_acquisition_summary(uuid)','execute'),'the read keeps its 107 grant');
rollback;
\echo PASS lead ad source: envelope unchanged plus ad, website id resolution (a)/(b)/(c), Instant Form snapshots, nulls, no technical leak, roles
