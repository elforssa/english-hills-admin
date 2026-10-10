-- DGI-B Release B1 (migration 115): synthetic local transaction, always rolled back.
-- No provider/network call, no token, no Meta host. Covers the settings merge (F1), the
-- resolver, intake-time resolution, the sweep and its starvation rule (F2), the pending
-- window, the ID-only trusted predicate (F3), the cohort buckets, diagnostics and roles.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;
 raise exception 'Unexpected success: %',q;
end $$;
insert into auth.users(id,email,aud,role) select ('11500000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'dgi-b-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '11500000-%';
create function pg_temp.actor(i int) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub',case when i=0 then '' else '11500000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);end $$;
select pg_temp.actor(1);
create temp table fx(k text primary key,v jsonb);
create function pg_temp.conn() returns uuid language sql as $$ select (v->>'id')::uuid from fx where k='connection' $$;
create function pg_temp.ver() returns bigint language sql as $$ select version from crm_integration_connections where id=pg_temp.conn() $$;
create function pg_temp.settings() returns jsonb language sql as $$ select settings from crm_integration_connections where id=pg_temp.conn() $$;
create function pg_temp.save(extra jsonb) returns jsonb language sql as $$ select crm_save_meta_connection('{"connection_key":"dgi-b-test","page_id":"115001","api_version":"v99.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST"}'::jsonb||extra,pg_temp.conn(),pg_temp.ver()) $$;
insert into fx values('connection',crm_save_meta_connection('{"connection_key":"dgi-b-test","page_id":"115001","api_version":"v99.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST"}'));
select pg_temp.ok(pg_temp.settings()='{}'::jsonb,'new connection has no switch');
insert into fx values('mapping',crm_publish_meta_form_mapping(pg_temp.conn(),'{"form_key":"115002","form_name":"Programme annuel","field_map":{"contact_name":"parent","phone":"phone","learner_name":"child"},"default_program_interest_text":"Annual English","default_session_type":"Yearly","effective_from":"2020-01-01Z"}'));
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');

-- ===== Constant defined once; constraint shape (F1) =====
select pg_temp.ok(crm_security.attribution_pending_window()=interval '14 days','ATTRIBUTION_PENDING_MAX_DAYS = 14');
select pg_temp.ok(not has_function_privilege('authenticated','crm_security.attribution_pending_window()','execute') and not has_function_privilege('service_role','crm_security.resolve_meta_hierarchy(uuid,text)','execute') and not has_function_privilege('anon','crm_security.attribution_enrichment_started(crm_integration_connections)','execute'),'private helpers have no API grant');
select pg_temp.denied($q$update crm_integration_connections set settings='{"attribution_enrichment":{"enabled":true,"started_at":null}}' where id=pg_temp.conn()$q$,'23514');
select pg_temp.denied($q$update crm_integration_connections set settings='{"attribution_enrichment":{"enabled":false,"started_at":"2026-01-01T00:00:00Z"}}' where id=pg_temp.conn()$q$,'23514');
select pg_temp.denied($q$update crm_integration_connections set settings='{"attribution_enrichment":{"enabled":"true","started_at":"2026-01-01T00:00:00Z"}}' where id=pg_temp.conn()$q$,'23514');
select pg_temp.denied($q$update crm_integration_connections set settings='{"attribution_enrichment":{"enabled":true,"started_at":"2026-01-01T00:00:00Z","extra":1}}' where id=pg_temp.conn()$q$,'23514');
select pg_temp.denied($q$update crm_integration_connections set settings='{"attribution_enrichment":{"enabled":true,"started_at":7}}' where id=pg_temp.conn()$q$,'23514');
select pg_temp.denied($q$update crm_integration_connections set settings='{"other":{}}' where id=pg_temp.conn()$q$,'23514');
update crm_integration_connections set settings='{"attribution_enrichment":{"enabled":true,"started_at":"2026-01-01T00:00:00Z"},"meta_reconciliation":{"enabled":false,"started_at":null,"lookback_minutes":60}}' where id=pg_temp.conn();
update crm_integration_connections set settings='{}' where id=pg_temp.conn();

-- ===== Switch and merge semantics (D3, F1) =====
select pg_temp.denied($q$select pg_temp.save('{"attribution_enrichment":{"enabled":true,"started_at":"2020-01-01T00:00:00Z"}}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.save('{"attribution_enrichment":{"enabled":"yes"}}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.save('{"attribution_enrichment":[]}')$q$,'22023');
select pg_temp.save('{"meta_reconciliation":{"enabled":true,"lookback_minutes":60}}');
insert into fx values('recon',pg_temp.settings()->'meta_reconciliation');
select pg_temp.ok((select v->>'enabled'='true' and v->>'started_at' is not null from fx where k='recon') and not pg_temp.settings() ? 'attribution_enrichment','reconciliation enabled alone; no attribution key invented');
select pg_temp.save('{"attribution_enrichment":{"enabled":true}}');
insert into fx values('attr',pg_temp.settings()->'attribution_enrichment');
select pg_temp.ok((select v->>'enabled'='true' and (v->>'started_at')::timestamptz>=transaction_timestamp() from fx where k='attr'),'database sets attribution started_at');
select pg_temp.ok(pg_temp.settings()->'meta_reconciliation'=(select v from fx where k='recon'),'enabling attribution leaves meta_reconciliation byte-identical');
select pg_temp.ok((select crm_security.attribution_enrichment_started(c)=((select v->>'started_at' from fx where k='attr'))::timestamptz from crm_integration_connections c where c.id=pg_temp.conn()),'helper reads the switch timestamp');
select pg_sleep(0.01);
select pg_temp.save('{"attribution_enrichment":{"enabled":true}}');
select pg_temp.ok(pg_temp.settings()->'attribution_enrichment'=(select v from fx where k='attr'),'enabling twice keeps the same started_at');
select pg_temp.save('{"meta_reconciliation":{"enabled":false,"lookback_minutes":60}}');
select pg_temp.ok(pg_temp.settings()->'attribution_enrichment'=(select v from fx where k='attr') and pg_temp.settings() #>> '{meta_reconciliation,started_at}' is null,'disabling reconciliation leaves attribution and its started_at intact');
insert into fx values('all',pg_temp.settings());
select pg_temp.save('{}');
select pg_temp.ok(pg_temp.settings()=(select v from fx where k='all'),'saving neither key leaves settings unchanged');
select pg_temp.save('{"attribution_enrichment":{"enabled":false}}');
select pg_temp.ok(pg_temp.settings() #>> '{attribution_enrichment,enabled}'='false' and pg_temp.settings() #>> '{attribution_enrichment,started_at}' is null and pg_temp.settings() ? 'meta_reconciliation','disable clears started_at and keeps the other key');
select pg_sleep(0.01);
select pg_temp.save('{"attribution_enrichment":{"enabled":true}}');
select pg_temp.ok((pg_temp.settings() #>> '{attribution_enrichment,started_at}')::timestamptz>((select v->>'started_at' from fx where k='attr'))::timestamptz,'re-enabling after a disable takes a fresh timestamp');
create function pg_temp.started() returns timestamptz language sql as $$ select (pg_temp.settings() #>> '{attribution_enrichment,started_at}')::timestamptz $$;
-- Fixture only: move the switch one hour into the past so leads "after the switch" can
-- carry past timestamps inside the cohort cutoff.
update crm_integration_connections set settings=jsonb_set(settings,'{attribution_enrichment,started_at}',to_jsonb(now()-interval '1 hour')) where id=pg_temp.conn();

-- ===== Resolver (D2) =====
insert into crm_meta_objects(connection_id,account_id,object_type,external_id,parent_external_id,current_name) values
 (pg_temp.conn(),'1150','campaign','115101',null,'Campagne B1'),(pg_temp.conn(),'1150','adset','115102','115101','Ensemble B1'),(pg_temp.conn(),'1150','ad','115103','115102','Annonce B1'),
 (pg_temp.conn(),'1150','campaign','115201',null,'Campagne B2'),(pg_temp.conn(),'1150','ad','115203','115202','Annonce B2');
select pg_temp.ok(crm_security.resolve_meta_hierarchy(pg_temp.conn(),'115103')='{"campaign_id":"115101","campaign_name":"Campagne B1","adset_id":"115102","adset_name":"Ensemble B1","ad_name":"Annonce B1"}'::jsonb,'full chain resolves');
select pg_temp.ok(crm_security.resolve_meta_hierarchy(pg_temp.conn(),'115203') is null,'missing ad set breaks the chain');
select pg_temp.ok(crm_security.resolve_meta_hierarchy(pg_temp.conn(),'999999') is null and crm_security.resolve_meta_hierarchy(gen_random_uuid(),'115103') is null and crm_security.resolve_meta_hierarchy(pg_temp.conn(),'Campagne B1') is null,'unknown ad, other connection or a name never resolves');

-- ===== Intake-time resolution (D1, D4 moment 1) through the real worker path =====
create function pg_temp.payload(external_id text,ad text,happened timestamptz,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('occurred_at',happened,'core_fields',jsonb_build_object('contact_name','Sara '||external_id,'phone','06'||lpad(right(external_id,8),8,'0'),'learner_name','Adam '||external_id,'program_interest_text','Annual English','session_type','Yearly'),
 'form_answers','[]'::jsonb,'source_label','Meta • Programme annuel',
 'attribution',jsonb_build_object('external_submission_id',external_id,'page_id','115001','form_id','115002','form_name_snapshot','Programme annuel','ad_id',ad,'ad_name_snapshot','Annonce B1','attribution_status','partial','raw_payload','{}'::jsonb,'hierarchy_source',null,'hierarchy_error_code','provider_auth')||extra)
$$;
create function pg_temp.ingest(external_id text,ad text,happened timestamptz,extra jsonb default '{}') returns jsonb language plpgsql as $$ declare j crm_ingestion_jobs;r jsonb;begin
 perform pg_temp.actor(0);
 perform crm_accept_meta_events(jsonb_build_array(jsonb_build_object('page_id','115001','leadgen_id',external_id,'form_id','115002','created_time',extract(epoch from happened)::bigint)));
 update crm_ingestion_jobs set status='pending' where external_key='115001:'||external_id;
 perform crm_claim_meta_jobs();select * into j from crm_ingestion_jobs where external_key='115001:'||external_id;
 r:=crm_finalize_meta_job(j.id,j.lease_token,(select (v->>'id')::uuid from fx where k='mapping'),pg_temp.payload(external_id,ad,happened,extra));
 perform pg_temp.actor(1);return r;end $$;
create function pg_temp.attr(external_id text) returns crm_submission_attribution language sql as $$ select * from crm_submission_attribution where external_submission_id=external_id $$;
select pg_temp.actor(1);select pg_temp.save('{"enabled":true}');
-- Lead A: ad lookup failed at the provider, chain known: resolved at intake.
insert into fx values('A',pg_temp.ingest('115011','115103',pg_temp.started()+interval '1 second'));
select pg_temp.ok((select v->>'status'='done' and v->>'lead_id' is not null from fx where k='A'),'intake finalized');
select pg_temp.ok((pg_temp.attr('115011')).campaign_id='115101' and (pg_temp.attr('115011')).adset_id='115102' and (pg_temp.attr('115011')).campaign_name_snapshot='Campagne B1' and (pg_temp.attr('115011')).adset_name_snapshot='Ensemble B1'
 and (pg_temp.attr('115011')).ad_name_snapshot='Annonce B1' and (pg_temp.attr('115011')).hierarchy_source='insights_objects' and (pg_temp.attr('115011')).hierarchy_error_code='provider_auth' and (pg_temp.attr('115011')).attribution_status='complete','intake resolution fills NULL fields, keeps the error code and completes the status');
-- Lead B: chain broken at intake: stays pending.
insert into fx values('B',pg_temp.ingest('115012','115203',pg_temp.started()+interval '2 seconds'));
select pg_temp.ok((pg_temp.attr('115012')).campaign_id is null and (pg_temp.attr('115012')).hierarchy_source is null and (pg_temp.attr('115012')).attribution_status='partial','broken chain leaves the row untouched');
-- Lead C: the provider lookup succeeded: stored as provider, never re-resolved.
insert into fx values('C',pg_temp.ingest('115013','115103',pg_temp.started()+interval '3 seconds','{"campaign_id":"115101","campaign_name_snapshot":"Provider campaign name","adset_id":"115102","adset_name_snapshot":"Provider adset name","hierarchy_source":"provider","hierarchy_error_code":null,"attribution_status":"complete"}'));
select pg_temp.ok((pg_temp.attr('115013')).hierarchy_source='provider' and (pg_temp.attr('115013')).campaign_name_snapshot='Provider campaign name' and (pg_temp.attr('115013')).hierarchy_error_code is null,'provider hierarchy stored as such');
-- Lead D: created at Meta before the switch: never resolved although its chain exists.
insert into fx values('D',pg_temp.ingest('115014','115103',now()-interval '40 days'));
select pg_temp.ok((pg_temp.attr('115014')).campaign_id is null and (pg_temp.attr('115014')).hierarchy_source is null,'leads before started_at are never enriched at intake');
-- Lead E: an ad name missing from the objects: resolved but not complete.
update crm_meta_objects set current_name=null where object_type='ad' and external_id='115103';
insert into fx values('E',pg_temp.ingest('115015','115103',pg_temp.started()+interval '4 seconds','{"ad_name_snapshot":null}'));
select pg_temp.ok((pg_temp.attr('115015')).campaign_id='115101' and (pg_temp.attr('115015')).ad_name_snapshot is null and (pg_temp.attr('115015')).attribution_status='partial','complete only with every name');
update crm_meta_objects set current_name='Annonce B1' where object_type='ad' and external_id='115103';
-- Allowlist: the worker may claim only the provider source and a fixed error code.
select pg_temp.denied($q$select pg_temp.ingest('115016','115103',pg_temp.started()+interval '5 seconds','{"hierarchy_source":"insights_objects"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.ingest('115017','115103',pg_temp.started()+interval '5 seconds','{"hierarchy_error_code":"Forbidden: secret body"}')$q$,'22023');
select pg_temp.actor(1);
-- Protection trigger untouched: enriched values are immutable from now on.
select pg_temp.denied($q$update crm_submission_attribution set campaign_id='115201' where external_submission_id='115011'$q$);
select pg_temp.denied($q$update crm_submission_attribution set hierarchy_source='provider' where external_submission_id='115011'$q$);
select pg_temp.denied($q$update crm_submission_attribution set hierarchy_error_code=null where external_submission_id='115011'$q$);

-- ===== Sweep (D4 moment 2) and starvation (F2) =====
create function pg_temp.sweep(n int default 200) returns jsonb language plpgsql as $$ declare r jsonb;begin perform pg_temp.actor(0);r:=crm_enrich_meta_attribution(n);perform pg_temp.actor(1);return r;end $$;
select pg_temp.ok(pg_temp.sweep()='{"eligible":0,"resolved":0,"unresolved":0,"expired":0}'::jsonb,'nothing resolvable yet: counts only');
insert into crm_meta_objects(connection_id,account_id,object_type,external_id,parent_external_id,current_name) values(pg_temp.conn(),'1150','adset','115202','115201','Ensemble B2');
select pg_temp.ok(pg_temp.sweep()='{"eligible":1,"resolved":1,"unresolved":0,"expired":0}'::jsonb,'sweep resolves the row whose chain appeared');
select pg_temp.ok((pg_temp.attr('115012')).campaign_id='115201' and (pg_temp.attr('115012')).hierarchy_source='insights_objects' and (pg_temp.attr('115012')).attribution_status='complete','swept row enriched once');
select pg_temp.ok(pg_temp.sweep()='{"eligible":0,"resolved":0,"unresolved":0,"expired":0}'::jsonb,'a resolved row is never selected again');
select pg_temp.ok((pg_temp.attr('115014')).campaign_id is null,'row before started_at ignored by the sweep');
-- Direct fixtures for the sweep: the synthetic intake helper of Phase 11.
create function pg_temp.intake(external_id text,ad text,happened timestamptz,campaign text default null,source text default null) returns uuid language plpgsql as $$ declare s uuid;begin
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values('meta_instant_form',happened,happened,'provider',jsonb_build_object('contact_name','Parent '||external_id,'phone','07'||lpad(right(external_id,8),8,'0'),'learner_name','Child '||external_id,'program_interest_text','Annual','session_type','Yearly'),'[]','Fixture','needs_review',encode(sha256(convert_to(external_id,'UTF8')),'hex'),(select (v->>'id')::uuid from fx where k='mapping')) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,form_name_snapshot,ad_id,campaign_id,adset_id,provider_created_at,attribution_status,hierarchy_source)
 values(s,'meta',external_id,'page:115001','115001','115002','Programme annuel',ad,campaign,case when campaign is not null then '115102' end,happened,'partial',source);
 perform crm_security.accept_external_submission(s);return s;end $$;
-- Three stuck rows (ads never synced) older than one newer resolvable row; p_limit 2.
select pg_temp.intake('115021','115901',pg_temp.started()+interval '10 seconds'),pg_temp.intake('115022','115902',pg_temp.started()+interval '11 seconds'),pg_temp.intake('115023','115903',pg_temp.started()+interval '12 seconds');
select pg_temp.intake('115024','115103',pg_temp.started()+interval '13 seconds');
select pg_temp.ok(pg_temp.sweep(2)='{"eligible":1,"resolved":1,"unresolved":0,"expired":0}'::jsonb and (pg_temp.attr('115024')).campaign_id='115101','stuck rows never consume p_limit; the newer resolvable row resolves first');
select pg_temp.ok((pg_temp.attr('115021')).campaign_id is null and (pg_temp.attr('115022')).campaign_id is null and (pg_temp.attr('115023')).campaign_id is null,'unresolvable rows untouched');
select pg_temp.actor(0);select pg_temp.denied('select crm_enrich_meta_attribution(0)','22023');select pg_temp.denied('select crm_enrich_meta_attribution(null)','22023');select pg_temp.denied('select crm_enrich_meta_attribution(1001)','22023');select pg_temp.actor(1);
-- A trigger violation on one row is counted as unresolved and the sweep continues.
select pg_temp.intake('115025','115103',pg_temp.started()+interval '14 seconds'),pg_temp.intake('115026','115103',pg_temp.started()+interval '15 seconds');
create function pg_temp.block() returns trigger language plpgsql as $$ begin if new.external_submission_id='115026' then raise exception 'fixture violation' using errcode='42501';end if;return new;end $$;
create trigger zz_fixture_block before update on crm_submission_attribution for each row execute function pg_temp.block();
select pg_temp.ok(pg_temp.sweep()='{"eligible":2,"resolved":1,"unresolved":1,"expired":0}'::jsonb and (pg_temp.attr('115025')).campaign_id='115101' and (pg_temp.attr('115026')).campaign_id is null,'violation isolated to its row');
drop trigger zz_fixture_block on crm_submission_attribution;
select pg_temp.ok(pg_temp.sweep()='{"eligible":1,"resolved":1,"unresolved":0,"expired":0}'::jsonb,'row resolves once the violation is gone');
-- Redacted rows are never candidates.
select pg_temp.intake('115027','115103',pg_temp.started()+interval '16 seconds');
update crm_submission_attribution set raw_payload=null,fbclid=null,fbc=null,fbp=null,consent_evidence=null,redacted_at=now() where external_submission_id='115027';
select pg_temp.ok(pg_temp.sweep()='{"eligible":0,"resolved":0,"unresolved":0,"expired":0}'::jsonb and (pg_temp.attr('115027')).campaign_id is null,'redacted row skipped');

-- ===== Pending window (F2): expired rows are terminally unknown =====
update crm_integration_connections set settings=jsonb_set(settings,'{attribution_enrichment,started_at}',to_jsonb(now()-interval '20 days')) where id=pg_temp.conn();
select pg_temp.intake('115031','115103',now()-interval '15 days'),pg_temp.intake('115032','115904',now()-interval '13 days'),pg_temp.intake('115033','115103',now()-interval '25 days');
select pg_temp.ok(pg_temp.sweep()='{"eligible":0,"resolved":0,"unresolved":0,"expired":1}'::jsonb and (pg_temp.attr('115031')).campaign_id is null and (pg_temp.attr('115033')).campaign_id is null,'rows older than the window or before started_at are not selected even though their chain exists');
select pg_temp.ok(crm_security.attribution_enrichment_eligible(pg_temp.attr('115032'),'meta_instant_form',pg_temp.conn()) and not crm_security.attribution_enrichment_expired(pg_temp.attr('115032'),'meta_instant_form',pg_temp.conn()),'younger row inside the window is pending');
select pg_temp.ok(not crm_security.attribution_enrichment_eligible(pg_temp.attr('115031'),'meta_instant_form',pg_temp.conn()) and crm_security.attribution_enrichment_expired(pg_temp.attr('115031'),'meta_instant_form',pg_temp.conn()),'older row is expired');
select pg_temp.ok(not crm_security.attribution_enrichment_eligible(pg_temp.attr('115031'),'website',pg_temp.conn()) and not crm_security.attribution_enrichment_eligible(pg_temp.attr('115032'),'meta_instant_form',gen_random_uuid()),'eligibility requires the Meta channel and the mapping connection');

-- ===== Cohort (D5, D6, F3) =====
-- Spend for campaign 115101 through a completed run covering the cohort range.
select crm_configure_insights(pg_temp.conn(),pg_temp.ver(),'{"mode":"mock","enabled":true,"account_id":"1150","currency":"USD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}');
insert into fx values('run',to_jsonb(gen_random_uuid()));
insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at) values((select (v#>>'{}')::uuid from fx where k='run'),pg_temp.conn(),gen_random_uuid(),current_date-30,current_date,'{}','completed',now());
insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend)
 select pg_temp.conn(),(select (v#>>'{}')::uuid from fx where k='run'),d::date,'1150','Africa/Casablanca','USD','115101','115102','115103','ad-daily-v1',10 from generate_series(current_date-30,current_date,interval '1 day')d;
-- F3 fixtures: a provider-complete row with NULL hierarchy columns (every row written
-- before B1) and a constructed row claiming insights_objects without a campaign ID.
select pg_temp.intake('115041','115103',now()-interval '2 days','115101',null);
select pg_temp.intake('115042','115103',now()-interval '2 days',null,'insights_objects');
create function pg_temp.report(lev text default 'campaign') returns jsonb language sql as $$ select crm_get_marketing_cohort(current_date-30,current_date,null,pg_temp.conn(),lev) $$;
create function pg_temp.row_of(b text) returns jsonb language sql as $$ select x from jsonb_array_elements(pg_temp.report()->'rows') x where x->>'bucket'=b $$;
select pg_temp.ok(pg_temp.report()->>'spend_complete'='true' and (pg_temp.report()->'summary'->>'spend')::numeric=310,'coverage complete');
-- Trusted campaign row: A, C, E, 115024, 115025, 115026, 115041 (ID-only, hierarchy_source NULL or any value).
select pg_temp.ok(pg_temp.row_of('meta:115101')->>'attribution_kind'='trusted_meta' and (pg_temp.row_of('meta:115101')->>'leads')::int=7 and (pg_temp.row_of('meta:115101')->>'spend')::numeric=310 and (pg_temp.row_of('meta:115101')->>'cpl')::numeric=310.0/7 and pg_temp.row_of('meta:115101')->>'name'='Campagne B1','ID-only trusted rows carry spend and CPL');
select pg_temp.ok((select x->>'leads'='1' and x->>'attribution_kind'='trusted_meta' from jsonb_array_elements(pg_temp.report()->'rows') x where x->>'bucket'='meta:115201'),'swept campaign is trusted');
-- Pending: B-like rows inside the window without a campaign: 115021-115023, 115032, 115042 (hierarchy_source alone never attributes).
select pg_temp.ok(pg_temp.row_of('pending:meta_instant_form')->>'name'='Meta · attribution en attente' and pg_temp.row_of('pending:meta_instant_form')->>'attribution_kind'='unattributed' and (pg_temp.row_of('pending:meta_instant_form')->>'leads')::int=5 and pg_temp.row_of('pending:meta_instant_form')->>'spend' is null and pg_temp.row_of('pending:meta_instant_form')->>'cpl' is null,'pending bucket named, unattributed and without spend');
-- Unknown: 115033 (before the switch), 115031 (expired), 115027 (redacted); D lies outside the cohort range.
select pg_temp.ok(pg_temp.row_of('unknown:meta_instant_form')->>'name'='Meta · attribution inconnue' and (pg_temp.row_of('unknown:meta_instant_form')->>'leads')::int=3 and pg_temp.row_of('unknown:meta_instant_form')->>'spend' is null,'expired, redacted and pre-switch rows are terminally unknown');
select pg_temp.ok((pg_temp.report()->'summary'->>'pending_leads')::int=5 and (pg_temp.report()->'summary'->>'unattributed_leads')::int=8 and (pg_temp.report()->'summary'->>'attributed_leads')::int=8 and (pg_temp.report()->'summary'->>'leads')::int=16,'summary counts pending inside unattributed');
select pg_temp.ok((pg_temp.report()->'summary'->>'cpl')::numeric=310.0/8,'summary ratios use attributed denominators only');
select pg_temp.ok((select count(*)=0 from jsonb_array_elements(pg_temp.report()->'rows') x where x->>'attribution_kind'<>'trusted_meta' and (x->>'spend' is not null or x->>'cpl' is not null or x->>'cac' is not null)),'no spend or ratio outside trusted rows');
select pg_temp.ok((select x->>'leads'='5' and x->>'name'='Meta · attribution en attente' from jsonb_array_elements(pg_temp.report('adset')->'rows') x where x->>'bucket'='pending:meta_instant_form'),'pending survives every level');
select pg_temp.ok((select x->>'leads'='8' from jsonb_array_elements(pg_temp.report('source')->'rows') x where x->>'bucket'='meta:meta'),'source level groups the trusted rows');
select pg_temp.ok((select count(*)=0 from jsonb_array_elements(crm_get_marketing_cohort(current_date-30,current_date,null,pg_temp.conn(),'campaign','115101')->'rows') x where x->>'bucket' like 'pending:%' or x->>'bucket' like 'unknown:%'),'ID filters cannot match pending or unknown rows');
-- Switch off: nothing is pending any more; rows stay unknown, enriched rows stay trusted.
select pg_temp.save('{"attribution_enrichment":{"enabled":false}}');
select pg_temp.ok(pg_temp.row_of('pending:meta_instant_form') is null and (pg_temp.row_of('unknown:meta_instant_form')->>'leads')::int=8 and (pg_temp.row_of('meta:115101')->>'leads')::int=7 and pg_temp.sweep()='{"eligible":0,"resolved":0,"unresolved":0,"expired":0}'::jsonb,'disabled switch stops both moments and keeps enriched rows');
select pg_temp.save('{"attribution_enrichment":{"enabled":true}}');
update crm_integration_connections set settings=jsonb_set(settings,'{attribution_enrichment,started_at}',to_jsonb(now()-interval '20 days')) where id=pg_temp.conn();

-- ===== Diagnostics (D7) =====
create function pg_temp.diag() returns jsonb language sql as $$ select c->'attribution' from jsonb_array_elements(crm_get_meta_diagnostics()->'connections') c where c->>'id'=pg_temp.conn()::text $$;
select pg_temp.ok(pg_temp.diag()->>'enabled'='true' and (pg_temp.diag()->>'started_at')::timestamptz=pg_temp.started() and pg_temp.diag()->>'pending_max_days'='14','diagnostics expose the switch and the constant');
select pg_temp.ok((pg_temp.diag()->>'eligible_pending')::int=5 and (pg_temp.diag()->>'expired_unknown')::int=1 and (pg_temp.diag()->>'resolved_from_objects')::int=7 and (pg_temp.diag()->>'resolved_from_provider')::int=1,'diagnostics counts match the fixtures');
select pg_temp.ok(abs((pg_temp.diag()->>'oldest_pending_age_hours')::numeric-13*24)<1,'oldest pending age in hours');
select pg_temp.ok(pg_temp.diag()->'lookup_errors'='{"provider_auth":3}'::jsonb,'lookup error codes counted since started_at');
select pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(pg_temp.diag()) k)=array['eligible_pending','enabled','expired_unknown','lookup_errors','oldest_pending_age_hours','pending_max_days','resolved_from_objects','resolved_from_provider','started_at'],'diagnostics carry counts, ages and the constant only');
select pg_temp.ok((select bool_and((c ? 'attribution')=(c->>'provider'='meta')) from jsonb_array_elements(crm_get_meta_diagnostics()->'connections') c),'only Meta connections carry an attribution object');
-- Pending diagnostics with no pending row: NULL age, not 0.
update crm_integration_connections set settings=jsonb_set(settings,'{attribution_enrichment,started_at}',to_jsonb(now()+interval '1 day')) where id=pg_temp.conn();
select pg_temp.ok((pg_temp.diag()->>'eligible_pending')::int=0 and pg_temp.diag()->>'oldest_pending_age_hours' is null and pg_temp.diag()->'lookup_errors'='{}'::jsonb,'no pending row gives NULL age and empty errors');

-- ===== Roles and grants =====
do $$ declare i int;begin
 for i in 1..7 loop perform pg_temp.actor(i);
  perform pg_temp.denied('select crm_enrich_meta_attribution()');
  if i=1 then perform crm_get_meta_diagnostics();perform pg_temp.report();else perform pg_temp.denied('select crm_get_meta_diagnostics()');perform pg_temp.denied('select pg_temp.report()');perform pg_temp.denied($q$select pg_temp.save('{"attribution_enrichment":{"enabled":true}}')$q$);end if;
 end loop;
end $$;
select pg_temp.ok(not has_function_privilege('authenticated','public.crm_enrich_meta_attribution(integer)','execute') and not has_function_privilege('anon','public.crm_enrich_meta_attribution(integer)','execute') and has_function_privilege('service_role','public.crm_enrich_meta_attribution(integer)','execute'),'sweep is service-role only');
select pg_temp.ok(has_function_privilege('authenticated','public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer)','execute') and not has_function_privilege('service_role','public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer)','execute') and not has_function_privilege('authenticated','public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb)','execute'),'replaced functions keep their grants');
select pg_temp.ok(not exists(select 1 from pg_proc p where p.pronamespace='crm_security'::regnamespace and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),'no crm_security function is API-executable');
select pg_temp.ok((select tgenabled='O' and pg_get_triggerdef(oid) like '%crm_security.protect_attribution()' from pg_trigger where tgname='crm_attribution_immutable'),'protection trigger in force');
rollback;
\echo PASS DGI-B B1 SQL
