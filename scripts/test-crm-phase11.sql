-- Synthetic local fixtures. Every change, including trigger controls, rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;raise exception 'Unexpected success: %',q;end $$;
insert into auth.users(id,email,aud,role) select ('8b000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase11-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::int] where id::text like '8b000000-%';
create function pg_temp.actor(i int) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub',case when i=0 then '' else '8b000000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);end $$;
select pg_temp.actor(1);
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
create temp table fx(k text primary key,v jsonb);
insert into fx values('meta',crm_save_meta_connection('{"connection_key":"phase11-meta","page_id":"110001","api_version":"v99.0"}'));
insert into fx values('mm',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"110002","field_map":{},"effective_from":"2020-01-01Z"}'));
create function pg_temp.conn() returns uuid language sql as $$ select (v->>'id')::uuid from fx where k='meta' $$;
select crm_configure_insights(pg_temp.conn(),1,'{"mode":"mock","enabled":true,"account_id":"1100","currency":"MAD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}');
create function pg_temp.report(cut date default null,lev text default 'campaign') returns jsonb language sql as $$ select crm_get_marketing_cohort('2026-01-01','2026-01-02',cut,pg_temp.conn(),lev) $$;
select pg_temp.ok(pg_temp.report()->>'spend_complete'='false' and pg_temp.report()->'summary'->>'spend' is null,'no snapshot means unavailable');
insert into fx values('request',to_jsonb(gen_random_uuid()));
insert into fx values('run',to_jsonb(crm_request_insights_sync(pg_temp.conn(),(select (v#>>'{}')::uuid from fx where k='request'),'2026-01-01','2026-01-02')));
select pg_temp.ok(crm_request_insights_sync(pg_temp.conn(),(select (v#>>'{}')::uuid from fx where k='request'),'2026-01-01','2026-01-02')=(select (v#>>'{}')::uuid from fx where k='run'),'idempotent request');
select pg_temp.denied($q$select crm_request_insights_sync(pg_temp.conn(),gen_random_uuid(),'2026-01-02','2026-01-03')$q$,'40001');
select pg_temp.actor(0);insert into fx values('claim',crm_claim_insights_sync());
create function pg_temp.payload() returns jsonb language sql as $$ select '{"account_id":"1100","currency":"MAD","timezone":"Africa/Casablanca","objects":[{"type":"campaign","id":"101","name":"Current campaign A","objective":"OUTCOME_LEADS"},{"type":"campaign","id":"201","name":"Awareness B","objective":"OUTCOME_AWARENESS"}],"rows":[{"date":"2026-01-01","campaign_id":"101","adset_id":"102","ad_id":"103","spend":"100","reach":50,"clicks":10},{"date":"2026-01-02","campaign_id":"101","adset_id":"102","ad_id":"104","spend":"50","reach":40},{"date":"2026-01-01","campaign_id":"201","adset_id":"202","ad_id":"203","spend":"30"}]}'::jsonb $$;
select crm_finish_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,pg_temp.payload()) from fx where k='claim';
select pg_temp.denied($q$select crm_finish_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,pg_temp.payload()) from fx where k='claim'$q$,'40001');
select pg_temp.actor(1);
select pg_temp.ok(pg_temp.report()->'summary'->>'spend'='180.000000' and pg_temp.report()->>'spend_complete'='true','ad/day additive spend');
select pg_temp.ok(pg_temp.report()->'summary'->>'cpl' is null and pg_temp.report()->>'reach' is null,'zero denominator and non-additive reach unavailable');
-- Four opportunities; multiple submissions must not multiply spend or lead counts.
create function pg_temp.intake(channel text default 'meta_instant_form',campaign text default '101',at_time timestamptz default '2026-01-01 12:00Z') returns uuid language plpgsql as $$ declare s uuid;l uuid;begin
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values(channel,at_time,at_time,'server','{"contact_name":"Phase11 parent","phone":"0612345678","learner_name":"Phase11 child","program_interest_text":"Annual","session_type":"Yearly"}','[]','Fixture','needs_review',repeat('b',64),case when channel='meta_instant_form' then (select (v->>'id')::uuid from fx where k='mm') end) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,campaign_id,adset_id,ad_id,campaign_name_snapshot,utm_campaign,attribution_status)
 values(s,case when channel='meta_instant_form' then 'meta' else 'website' end,null,null,case when channel='meta_instant_form' then campaign end,case when campaign is not null and channel='meta_instant_form' then '102' end,case when campaign is not null and channel='meta_instant_form' then '103' end,'Historical campaign A',case when channel='website' then 'Current campaign A' end,'partial');
 l:=crm_security.accept_external_submission(s);return l;end $$;
insert into fx values('lead1',to_jsonb(pg_temp.intake())),('lead2',to_jsonb(pg_temp.intake())),('website',to_jsonb(pg_temp.intake('website'))),('unknown',to_jsonb(pg_temp.intake('meta_instant_form',null)));
create function pg_temp.lead(k0 text) returns uuid language sql as $$ select (v#>>'{}')::uuid from fx where k=k0 $$;
create function pg_temp.act(cmd text,l uuid,data jsonb) returns jsonb language plpgsql as $$ declare r jsonb;begin execute format('select crm_%I($1,$2)',cmd) into r using gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l))||data;return r;end $$;
select pg_temp.act('qualify_lead',pg_temp.lead('lead1'),jsonb_build_object('conversation_channel','phone','note','Qualified','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
-- Add later Meta touch to website opportunity, and website touch to Meta opportunity.
do $$ declare s uuid; l uuid; ch text; begin
 foreach ch in array array['website','meta_instant_form'] loop
 l:=pg_temp.lead(case when ch='website' then 'lead1' else 'website' end);
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash) values(ch,now(),now(),'server','{}','[]','Later','needs_review',repeat('c',64)) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,campaign_id,attribution_status) values(s,case when ch='website' then 'website' else 'meta' end,case when ch='meta_instant_form' then '101' end,'partial');
 perform crm_security.resolve_submission(l,s,(select version from crm_leads where id=l),gen_random_uuid());end loop;end $$;
select pg_temp.ok(pg_temp.report()->'summary'->>'leads'='4' and pg_temp.report()->'summary'->>'attributed_leads'='2','first touch distinct opportunities');
select pg_temp.ok(pg_temp.report()->'summary'->>'spend'='180.000000','many submissions never fan out spend');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(pg_temp.report()->'rows') x where x->>'object_key'='101' and (x->>'cpl')::numeric=75 and (x->>'cpql')::numeric=150 and x->>'name'='Current campaign A' and x->'historical_names' ? 'Historical campaign A'),'campaign formulas and distinct current/historical names');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(pg_temp.report()->'rows') x where x->>'object_key'='201' and x->>'leads'='0' and x->>'cpl' is null),'parallel awareness spend zero leads');
select pg_temp.ok((select count(*)=2 from jsonb_array_elements(pg_temp.report()->'rows') x where x->>'attribution_kind'='unattributed' and x->>'spend' is null),'unknown and website buckets visible without guessed spend');
select pg_temp.ok(pg_temp.report('2026-01-02')->'summary'->>'qualified'='0','outcome cutoff excludes later qualification');
select pg_temp.ok(pg_temp.report(null,'adset')->'summary'->>'leads'='4' and pg_temp.report(null,'ad')->'summary'->>'spend'='180.000000','adset/ad drill preserves totals');
select pg_temp.ok(pg_temp.report(null,'source')->'summary'->>'unattributed_leads'='2','source distinguishes unattributed');
-- Real linked enrollment, collected receipts and a reversal drive metrics.
alter table receipts disable trigger on_receipt_created;
do $$ declare r jsonb;l uuid:=pg_temp.lead('lead1');s uuid;e uuid;receipt uuid;begin
 r:=crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'student_choice','new','learner_name','Phase11 child','birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2','candidate_review',crm_security.candidate_token(l,'Phase11 child','2014-05-10'),'confirm_new',true));
 s:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
 r:=create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));receipt:=(r->>'receipt_id')::uuid;
 set constraints all immediate;set constraints all deferred;
 perform pg_temp.ok(pg_temp.report()->'summary'->>'converted'='1' and (pg_temp.report()->'summary'->>'revenue')::numeric=500,'trusted conversion and collected revenue');
 perform pg_temp.ok((pg_temp.report()->'summary'->>'cac')::numeric=180 and abs((pg_temp.report()->'summary'->>'roas')::numeric-500.0/180)<0.000001,'CAC and ROAS ratios');
 perform pg_temp.ok(pg_temp.report('2026-01-02')->'summary'->>'converted'='0' and (pg_temp.report('2026-01-02')->'summary'->>'revenue')::numeric=0,'cutoff excludes late conversion and payment');
 perform void_financial_receipt(receipt,'Phase11 synthetic reversal',gen_random_uuid());set constraints all immediate;set constraints all deferred;
 perform pg_temp.ok((pg_temp.report()->'summary'->>'revenue')::numeric=0 and pg_temp.report()->'summary'->>'converted'='1','signed revenue reversal does not invent conversion correction');
end $$;
-- Placement counts use distinct linked tests, not timeline edit count.
select pg_temp.act('qualify_lead',pg_temp.lead('lead2'),jsonb_build_object('conversation_channel','phone','note','Placement','qualification_step','placement_test','next_task',jsonb_build_object('task_type','confirm_placement_test','due_at',now()+interval '1 day')));
do $$ declare l uuid:=pg_temp.lead('lead2');p uuid;r jsonb;begin
 r:=crm_book_placement_test(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'date_test',current_date+2,'heure','10:30','examinateur','Fixture','task_id',(select id from crm_tasks where lead_id=l and status='open' and task_type='confirm_placement_test' limit 1),'expected_task_version',(select version from crm_tasks where lead_id=l and status='open' and task_type='confirm_placement_test' limit 1)));
 p:=(r->'placement'->>'id')::uuid;
 update placement_tests set status='Résultat saisi',niveau_recommande='A2',score=72 where id=p;
 update placement_tests set notes='Edited result' where id=p;
 perform pg_temp.ok(pg_temp.report()->'summary'->>'tests_booked'='1' and pg_temp.report()->'summary'->>'tests_attended'='1' and pg_temp.report()->'summary'->>'results'='1','distinct placement milestones');
end $$;
-- Requalification is still one opportunity; report dates never become event-period dates.
select pg_temp.act('close_lost',pg_temp.lead('lead2'),'{"reason":"postponed","note":"Later"}');
select pg_temp.act('reopen_lead',pg_temp.lead('lead2'),jsonb_build_object('reason','Asked again','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')));
select pg_temp.act('qualify_lead',pg_temp.lead('lead2'),jsonb_build_object('conversation_channel','phone','note','Again','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
select pg_temp.ok(pg_temp.report()->'summary'->>'qualified'='2','repeat qualification counts distinct opportunities');
select pg_temp.ok(crm_get_marketing_cohort(current_date,current_date,null,pg_temp.conn())->'summary'->>'converted'='0','current conversion event does not move January acquisition into current cohort');
-- Failed refresh leaves the previous completed rows intact and warns.
insert into fx values('refresh',to_jsonb(crm_request_insights_sync(pg_temp.conn(),gen_random_uuid(),'2026-01-01','2026-01-02')));
select pg_temp.actor(0);update fx set v=crm_claim_insights_sync() where k='claim';
select pg_temp.denied($q$select crm_finish_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,jsonb_set(pg_temp.payload(),'{currency}','"USD"')) from fx where k='claim'$q$,'22023');
select pg_temp.denied($q$select crm_finish_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,jsonb_set(pg_temp.payload(),'{rows}',(pg_temp.payload()->'rows')||jsonb_build_array(pg_temp.payload()->'rows'->0))) from fx where k='claim'$q$,'23505');
select crm_fail_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,'provider_unavailable',1) from fx where k='claim';
select pg_temp.actor(1);
select pg_temp.ok(pg_temp.report()->'summary'->>'spend'='180.000000' and pg_temp.report()->>'sync_warning'='true','partial range never contaminates previous snapshot');
select crm_retry_insights_sync((select (v#>>'{}')::uuid from fx where k='refresh'));
select pg_temp.actor(0);update fx set v=crm_claim_insights_sync() where k='claim';
select crm_finish_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,jsonb_set(pg_temp.payload(),'{rows}','[]')) from fx where k='claim';
select pg_temp.actor(1);select pg_temp.ok((pg_temp.report()->'summary'->>'spend')::numeric=0 and pg_temp.report()->'summary'->>'roas' is null,'empty completed refresh removes vanished rows');
-- Currency and timezone are explicit. Fixture configuration alteration only.
update crm_integration_connections set insights_settings=jsonb_set(insights_settings,'{currency}','"USD"') where id=pg_temp.conn();
select pg_temp.ok(pg_temp.report()->>'currency_mismatch'='true' and pg_temp.report()->'summary'->>'roas' is null,'no cross-currency ROAS');
select pg_temp.intake('meta_instant_form','101','2025-12-31 23:30Z');
select pg_temp.ok(pg_temp.report()->'summary'->>'leads'='5','Casablanca account date rather than UTC acquisition date');
-- Database role authorization and table/worker privileges.
do $$ declare i int;t text;begin
 for i in 2..7 loop perform pg_temp.actor(i);perform pg_temp.denied($q$select pg_temp.report()$q$);perform pg_temp.denied($q$select crm_insights_diagnostics()$q$);perform pg_temp.denied($q$select crm_request_insights_sync(pg_temp.conn(),gen_random_uuid())$q$);end loop;
 foreach t in array array['crm_meta_objects','crm_meta_sync_runs','crm_meta_daily_insights'] loop
 perform pg_temp.ok((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'RLS enabled');
 perform pg_temp.ok(not has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'no direct table access');end loop;
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_claim_insights_sync()','EXECUTE') and has_function_privilege('service_role','crm_claim_insights_sync()','EXECUTE'),'worker-only execute');
end $$;
-- ===== DGI-A-r2 live mode (migration 114): a second synthetic connection, rolled back. =====
select pg_temp.actor(1);
select pg_temp.ok((select count(*) from crm_meta_sync_runs where status in ('pending','running'))=0,'no unrelated synchronization queue');
insert into fx values('live',crm_save_meta_connection('{"connection_key":"phase11-live","page_id":"220001","api_version":"v99.0"}'));
insert into fx values('lm',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='live'),'{"form_key":"220002","field_map":{},"effective_from":"2020-01-01Z"}'));
create function pg_temp.live() returns uuid language sql as $$ select (v->>'id')::uuid from fx where k='live' $$;
create function pg_temp.ver() returns bigint language sql as $$ select version from crm_integration_connections where id=pg_temp.live() $$;
create function pg_temp.cfg(extra jsonb default '{}') returns jsonb language sql as $$ select '{"mode":"live","enabled":true,"account_id":"2200","currency":"USD","timezone":"Africa/Casablanca","api_version":"v25.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE"}'::jsonb||extra $$;
create function pg_temp.configure(extra jsonb default '{}') returns jsonb language sql as $$ select crm_configure_insights(pg_temp.live(),pg_temp.ver(),pg_temp.cfg(extra)) $$;
create function pg_temp.run(k0 text) returns uuid language sql as $$ select (v#>>'{}')::uuid from fx where k=k0 $$;
create function pg_temp.st(k0 text) returns crm_meta_sync_runs language sql as $$ select * from crm_meta_sync_runs where id=pg_temp.run(k0) $$;
create function pg_temp.claim() returns jsonb language plpgsql as $$ declare j jsonb;begin perform pg_temp.actor(0);j:=crm_claim_insights_sync();delete from fx where k='claim';if j is not null then insert into fx values('claim',j);end if;perform pg_temp.actor(1);return j;end $$;
create function pg_temp.fail(code text,n int default 0) returns void language plpgsql as $$ begin perform pg_temp.actor(0);perform crm_fail_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,code,n) from fx where k='claim';perform pg_temp.actor(1);end $$;
create function pg_temp.due(k0 text) returns void language sql as $$ update crm_meta_sync_runs set next_attempt_at=now()-interval '1 second' where id=pg_temp.run(k0) $$;
create function pg_temp.enqueue() returns integer language plpgsql as $$ declare n integer;begin perform pg_temp.actor(0);n:=crm_enqueue_insights_refresh();perform pg_temp.actor(1);return n;end $$;
-- D2: live configuration with 28-day/6-hour defaults and no secret echo; invalid shapes rejected.
insert into fx values('cfg',pg_temp.configure());
select pg_temp.ok((select v->>'live_available'='true' and v->'insights'->>'mode'='live' and v->'insights'->>'refresh_days'='28' and v->'insights'->>'refresh_interval_hours'='6' and not (v->'insights' ? 'secret_ref') from fx where k='cfg'),'live configuration, defaults and no secret echo');
select pg_temp.denied($q$select pg_temp.configure('{"refresh_interval_hours":0}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"refresh_interval_hours":25}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"refresh_days":32}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"mode":"other"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"access_token":"x"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"secret_ref":"CRM_META_LIFECYCLE_TOKEN_EH_R4"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"timezone":"Mars/Olympus"}')$q$,'22023');
-- A clean connection (no run) may still correct identity and mode.
select pg_temp.configure('{"timezone":"UTC"}');select pg_temp.configure('{"mode":"mock","account_id":"2201"}');select pg_temp.configure();
select pg_temp.ok((select insights_settings->>'timezone'='Africa/Casablanca' and insights_settings->>'mode'='live' and insights_settings->>'account_id'='2200' from crm_integration_connections where id=pg_temp.live()),'clean connection identity correction');
-- B1: the request RPC accepts live mode; a pending run blocks identity and mode changes.
insert into fx values('a',to_jsonb(crm_request_insights_sync(pg_temp.live(),gen_random_uuid(),'2026-01-01','2026-01-02')));
select pg_temp.ok((pg_temp.st('a')).config_snapshot->>'mode'='live' and (pg_temp.st('a')).next_attempt_at=now(),'live explicit request queued and immediately eligible');
select pg_temp.denied($q$select pg_temp.configure('{"currency":"EUR"}')$q$,'40001');
select pg_temp.denied($q$select pg_temp.configure('{"mode":"mock"}')$q$,'40001');
select pg_temp.configure('{"refresh_days":14,"api_version":"v26.0","enabled":false}');select pg_temp.configure();
select pg_temp.ok((select insights_settings->>'refresh_days'='28' and insights_settings->>'api_version'='v25.0' from crm_integration_connections where id=pg_temp.live()),'non-identity fields stay editable with a queued run');
select pg_temp.claim();
select pg_temp.ok((select v->>'id'=pg_temp.run('a')::text and v->>'attempt_count'='1' and v->'config'->>'mode'='live' from fx where k='claim'),'live run claimed with its attempt count');
select pg_temp.denied($q$select pg_temp.configure('{"timezone":"UTC"}')$q$,'40001');
-- D5: transient live failures back off 30 minutes, then 2 hours, on both claim paths.
select pg_temp.fail('rate_limit');
select pg_temp.ok((pg_temp.st('a')).status='pending' and (pg_temp.st('a')).error_code='rate_limit' and (pg_temp.st('a')).next_attempt_at=now()+interval '30 minutes' and (pg_temp.st('a')).lease_token is null,'first transient failure deferred 30 minutes');
select pg_temp.ok(pg_temp.claim() is null,'backoff gates the pending path');
select pg_temp.denied($q$select crm_retry_insights_sync(pg_temp.run('a'))$q$,'22023');
select pg_temp.due('a');select pg_temp.claim();select pg_temp.fail('timeout',2);
select pg_temp.ok((pg_temp.st('a')).status='pending' and (pg_temp.st('a')).attempt_count=2 and (pg_temp.st('a')).rows_processed=2 and (pg_temp.st('a')).next_attempt_at=now()+interval '2 hours','second transient failure deferred 2 hours with visible rows');
select pg_temp.due('a');select pg_temp.claim();
update crm_meta_sync_runs set lease_until=now()-interval '1 second',next_attempt_at=now()+interval '1 hour' where id=pg_temp.run('a');
select pg_temp.ok(pg_temp.claim() is null,'future next_attempt_at blocks the expired-lease reclaim');
select pg_temp.ok((pg_temp.st('a')).status='running','expired run left for a later reclaim');
select pg_temp.due('a');select pg_temp.ok(pg_temp.claim() is null,'exhausted reclaim returns nothing');
select pg_temp.ok((pg_temp.st('a')).status='failed' and (pg_temp.st('a')).error_code='attempts_exhausted','reclaim after three attempts is terminal');
insert into fx values('b',to_jsonb(crm_request_insights_sync(pg_temp.live(),gen_random_uuid(),'2026-01-03','2026-01-04')));
do $$ begin for i in 1..3 loop perform pg_temp.due('b');perform pg_temp.claim();perform pg_temp.fail('network');end loop;end $$;
select pg_temp.ok((pg_temp.st('b')).status='failed' and (pg_temp.st('b')).attempt_count=3 and (pg_temp.st('b')).error_code='network','third transient failure is terminal');
select pg_temp.denied($q$select crm_retry_insights_sync(pg_temp.run('b'))$q$,'22023');
-- Terminal codes, including live_not_available, fail immediately; unknown codes are refused.
do $$ declare code text;r uuid;begin foreach code in array array['provider_auth','invalid_data','limit_exceeded','missing_secret','live_not_available','async_pending'] loop
 r:=crm_request_insights_sync(pg_temp.live(),gen_random_uuid(),'2026-01-05','2026-01-06');perform pg_temp.claim();
 perform pg_temp.ok((select v->>'id' from fx where k='claim')=r::text,'claimed '||code);perform pg_temp.fail(code);
 perform pg_temp.ok((select status='failed' and error_code=code and attempt_count=1 and next_attempt_at=now() from crm_meta_sync_runs where id=r),'terminal code '||code);
end loop;end $$;
insert into fx values('c',(select to_jsonb(id) from crm_meta_sync_runs where connection_id=pg_temp.live() and error_code='async_pending'));
select pg_temp.actor(0);select pg_temp.denied($q$select crm_fail_insights_sync(pg_temp.run('c'),gen_random_uuid(),'bogus')$q$,'22023');select pg_temp.actor(1);
-- A director retry resets the backoff and is claimable at the next tick.
update crm_meta_sync_runs set next_attempt_at=now()+interval '5 hours' where id=pg_temp.run('c');
select crm_retry_insights_sync(pg_temp.run('c'));
select pg_temp.ok((pg_temp.st('c')).status='pending' and (pg_temp.st('c')).next_attempt_at=now() and (pg_temp.st('c')).error_code is null,'director retry resets next_attempt_at');
select pg_temp.claim();select pg_temp.ok((select v->>'id' from fx where k='claim')=pg_temp.run('c')::text,'retried run claimable immediately');
select pg_temp.fail('provider_auth');
-- Identity may change again once the run failed; a retry then cannot requeue the old identity.
select pg_temp.configure('{"currency":"EUR"}');
select pg_temp.denied($q$select crm_retry_insights_sync(pg_temp.run('c'))$q$,'22023');
select pg_temp.configure();select crm_retry_insights_sync(pg_temp.run('c'));select pg_temp.claim();select pg_temp.fail('invalid_data');
-- A completed live publish: USD spend, MAD revenue, ROAS hidden, CPL/CPQL/CAC in USD.
create function pg_temp.live_intake() returns uuid language plpgsql as $$ declare s uuid;begin
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values('meta_instant_form','2026-01-01 12:00Z','2026-01-01 12:00Z','server','{"contact_name":"Phase11 live parent","phone":"0612345679","learner_name":"Phase11 livechild","program_interest_text":"Annual","session_type":"Yearly"}','[]','Fixture','needs_review',repeat('d',64),(select (v->>'id')::uuid from fx where k='lm')) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,campaign_id,adset_id,ad_id,campaign_name_snapshot,attribution_status) values(s,'meta','301','302','303','Live campaign','partial');
 return crm_security.accept_external_submission(s);end $$;
insert into fx values('live_lead',to_jsonb(pg_temp.live_intake()));
select pg_temp.act('qualify_lead',pg_temp.lead('live_lead'),jsonb_build_object('conversation_channel','phone','note','Qualified','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
do $$ declare r jsonb;l uuid:=pg_temp.lead('live_lead');s uuid;e uuid;begin
 r:=crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'student_choice','new','learner_name','Phase11 livechild','birth_date','2015-03-12','session_type','Yearly','school_year','2026/2027','level','Child 2','candidate_review',crm_security.candidate_token(l,'Phase11 livechild','2015-03-12'),'confirm_new',true));
 s:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
 perform create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',600,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 set constraints all immediate;set constraints all deferred;
end $$;
insert into fx values('d',to_jsonb(crm_request_insights_sync(pg_temp.live(),gen_random_uuid(),'2026-01-01','2026-01-02')));
select pg_temp.claim();select pg_temp.actor(0);
select crm_finish_insights_sync((v->>'id')::uuid,(v->>'lease_token')::uuid,'{"account_id":"2200","currency":"USD","timezone":"Africa/Casablanca","objects":[{"type":"campaign","id":"301","name":"Live campaign"}],"rows":[{"date":"2026-01-01","campaign_id":"301","adset_id":"302","ad_id":"303","spend":"120"}]}'::jsonb) from fx where k='claim';
select pg_temp.actor(1);
create function pg_temp.live_report() returns jsonb language sql as $$ select crm_get_marketing_cohort('2026-01-01','2026-01-02',null,pg_temp.live()) $$;
select pg_temp.ok(pg_temp.live_report()->>'live_sync_enabled'='true' and pg_temp.live_report()->>'spend_currency'='USD' and pg_temp.live_report()->>'currency_mismatch'='true' and pg_temp.live_report()->>'spend_complete'='true','live flag, USD spend and currency mismatch');
select pg_temp.ok((pg_temp.live_report()->'summary'->>'spend')::numeric=120 and (pg_temp.live_report()->'summary'->>'cpl')::numeric=120 and (pg_temp.live_report()->'summary'->>'cpql')::numeric=120 and (pg_temp.live_report()->'summary'->>'cac')::numeric=120,'summary CPL/CPQL/CAC in USD');
select pg_temp.ok((pg_temp.live_report()->'summary'->>'attributed_revenue')::numeric=600 and pg_temp.live_report()->'summary'->>'roas' is null,'MAD revenue never produces a USD ROAS');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(pg_temp.live_report()->'rows') x where x->>'object_key'='301' and (x->>'cac')::numeric=120 and x->>'roas' is null),'row ratios in USD without ROAS');
select pg_temp.ok(crm_get_marketing_cohort('2026-01-03','2026-01-04',null,pg_temp.live())->>'spend_complete'='false' and crm_get_marketing_cohort('2026-01-03','2026-01-04',null,pg_temp.live())->'summary'->>'spend' is null,'uncovered dates are unavailable, never zero');
select pg_temp.ok(pg_temp.report()->>'live_sync_enabled'='false' and crm_get_marketing_cohort('2026-01-01','2026-01-02')->>'live_sync_enabled'='false','mock and unselected reports are not live');
-- After a completed run, identity and mode are immutable; other fields stay editable.
select pg_temp.denied($q$select pg_temp.configure('{"currency":"EUR"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"mode":"mock"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.configure('{"account_id":"2299"}')$q$,'22023');
select pg_temp.configure('{"refresh_days":21}');select pg_temp.configure();
-- D9 diagnostics fields; only the reference name is ever stored or returned.
insert into fx values('diag',crm_insights_diagnostics());
select pg_temp.ok((select v->>'live_available'='true' from fx where k='diag') and exists(select 1 from fx,jsonb_array_elements(v->'connections') c where k='diag' and c->>'id'=pg_temp.live()::text and c->>'mode'='live' and c->>'refresh_days'='28' and c->>'refresh_interval_hours'='6' and c->>'api_version'='v25.0' and c->>'secret_ref'='CRM_META_INSIGHTS_TOKEN_FIXTURE' and c->>'last_completed_at' is not null),'diagnostics connection fields');
select pg_temp.ok(exists(select 1 from fx,jsonb_array_elements(v->'runs') r where k='diag' and r->>'id'=pg_temp.run('d')::text and r ? 'next_attempt_at' and r->>'mode'='live'),'diagnostics run fields');
select pg_temp.ok((select position('access_token' in v::text)=0 and position('fixture-secret' in v::text)=0 from fx where k='diag') and position('access_token' in pg_temp.live_report()::text)=0 and position('CRM_META_INSIGHTS_TOKEN' in pg_temp.live_report()::text)=0,'no token or token key in diagnostics or cohort');
-- D3 rolling refresh: due once per interval, 28-day window, never mock, disabled or overlapping.
select pg_temp.ok(pg_temp.enqueue()=0,'a run created within the interval postpones the refresh');
update crm_meta_sync_runs set created_at=created_at-interval '7 hours' where connection_id in (pg_temp.live(),pg_temp.conn());
create temp table before_enqueue as select count(*) n from crm_meta_sync_runs where connection_id=pg_temp.conn();
select pg_temp.ok(pg_temp.enqueue()=1,'one due live connection enqueued');
select pg_temp.ok(pg_temp.enqueue()=0,'second tick within the interval is a no-op');
select pg_temp.ok((select date_to=(now() at time zone 'Africa/Casablanca')::date and date_to-date_from=27 and status='pending' and config_snapshot->>'mode'='live' and config_snapshot->>'secret_ref'='CRM_META_INSIGHTS_TOKEN_FIXTURE' from crm_meta_sync_runs where connection_id=pg_temp.live() order by created_at desc limit 1),'28-day rolling window ending today in the account timezone');
select pg_temp.ok((select count(*) from crm_meta_sync_runs where connection_id=pg_temp.conn())=(select n from before_enqueue),'mock connection never auto-enqueued');
update crm_meta_sync_runs set created_at=created_at-interval '7 hours' where connection_id=pg_temp.live();
select pg_temp.ok(pg_temp.enqueue()=0,'an overlapping pending run blocks the rolling refresh');
select pg_temp.denied($q$select crm_request_insights_sync(pg_temp.live(),gen_random_uuid())$q$,'40001');
select pg_temp.claim();select pg_temp.fail('provider_auth');
select pg_temp.configure('{"enabled":false}');
update crm_meta_sync_runs set created_at=created_at-interval '7 hours' where connection_id=pg_temp.live();
select pg_temp.ok(pg_temp.enqueue()=0,'disabled connection never enqueued');
select pg_temp.ok(pg_temp.live_report()->>'live_sync_enabled'='false' and (pg_temp.live_report()->'summary'->>'spend')::numeric=120,'switch off is reported and keeps published snapshots');
select pg_temp.denied($q$select crm_request_insights_sync(pg_temp.live(),gen_random_uuid())$q$,'22023');
select pg_temp.configure('{"refresh_days":14,"refresh_interval_hours":12}');
select pg_temp.ok(pg_temp.enqueue()=1,'enabled connection enqueued again');
select pg_temp.ok((select date_to-date_from=13 and config_snapshot->>'refresh_interval_hours'='12' from crm_meta_sync_runs where connection_id=pg_temp.live() order by created_at desc limit 1),'configured window respected');
select pg_temp.claim();select pg_temp.fail('missing_secret');
insert into fx values('roll',to_jsonb(crm_request_insights_sync(pg_temp.live(),gen_random_uuid())));
select pg_temp.ok((pg_temp.st('roll')).date_to-(pg_temp.st('roll')).date_from=13 and (pg_temp.st('roll')).date_to=(now() at time zone 'Africa/Casablanca')::date,'live request without dates uses the rolling window');
-- Roles: director-only RPCs deny roles 2-7 and anon; worker RPCs are service-role only.
do $$ declare i int;begin
 for i in 2..8 loop
  if i=8 then perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claim.role','anon',true);else perform pg_temp.actor(i);end if;
  perform pg_temp.denied($q$select crm_configure_insights(pg_temp.live(),pg_temp.ver(),pg_temp.cfg())$q$);
  perform pg_temp.denied($q$select crm_request_insights_sync(pg_temp.live(),gen_random_uuid())$q$);
  perform pg_temp.denied($q$select crm_retry_insights_sync(pg_temp.run('c'))$q$);
  perform pg_temp.denied($q$select crm_insights_diagnostics()$q$);
  perform pg_temp.denied($q$select crm_get_marketing_cohort('2026-01-01','2026-01-02',null,pg_temp.live())$q$);
  perform pg_temp.denied($q$select crm_enqueue_insights_refresh()$q$);
  perform pg_temp.denied($q$select crm_claim_insights_sync()$q$);
  perform pg_temp.denied($q$select crm_fail_insights_sync(pg_temp.run('roll'),gen_random_uuid(),'network')$q$);
 end loop;
 perform pg_temp.actor(1);perform pg_temp.denied($q$select crm_enqueue_insights_refresh()$q$);perform pg_temp.denied($q$select crm_claim_insights_sync()$q$);
 perform pg_temp.actor(0);perform pg_temp.denied($q$select crm_insights_diagnostics()$q$);perform pg_temp.denied($q$select crm_configure_insights(pg_temp.live(),pg_temp.ver(),pg_temp.cfg())$q$);
 perform pg_temp.actor(1);
end $$;
select pg_temp.ok(has_function_privilege('service_role','crm_enqueue_insights_refresh()','EXECUTE') and not has_function_privilege('authenticated','crm_enqueue_insights_refresh()','EXECUTE') and not has_function_privilege('anon','crm_enqueue_insights_refresh()','EXECUTE') and not exists(select 1 from aclexplode((select proacl from pg_proc where oid='crm_enqueue_insights_refresh()'::regprocedure)) where grantee=0),'enqueue is service-role only');
select pg_temp.ok(not has_function_privilege('anon','crm_security.invoke_crm_insights_scheduler()','EXECUTE') and not has_function_privilege('authenticated','crm_security.invoke_crm_insights_scheduler()','EXECUTE') and not has_function_privilege('service_role','crm_security.invoke_crm_insights_scheduler()','EXECUTE'),'no API role executes the scheduler invoker');
select pg_temp.ok((select count(*)=1 and bool_and(not active) and bool_and(schedule='*/30 * * * *') and bool_and(command='select crm_security.invoke_crm_insights_scheduler()') from cron.job where jobname='crm-insights-primary'),'scheduler job exists and is inactive');
-- The Vault invoker accepts only the exact Production URL (Vault stubbed in this rolled-back transaction).
select pg_temp.ok(position($u$'https://admin.english-hills.com/api/cron/crm-insights'$u$ in pg_get_functiondef('crm_security.invoke_crm_insights_scheduler()'::regprocedure))>0,'invoker pins the exact Production URL');
select pg_temp.denied($q$select crm_security.invoke_crm_insights_scheduler()$q$,'22023');
select vault.create_secret('https://admin.english-hills.com/api/cron/crm-intake','crm_insights_scheduler_url','phase11 synthetic');
select vault.create_secret('synthetic-scheduler-bearer','crm_insights_scheduler_token','phase11 synthetic');
do $$ declare u text;begin foreach u in array array['https://admin.english-hills.com/api/cron/crm-intake','https://admin.english-hills.com/api/cron/crm-insights/','http://admin.english-hills.com/api/cron/crm-insights','https://admin.english-hills.com/api/cron/crm-insights?x=1','https://evil.invalid/api/cron/crm-insights','https://ADMIN.english-hills.com/api/cron/crm-insights',' https://admin.english-hills.com/api/cron/crm-insights'] loop
 perform vault.update_secret((select id from vault.secrets where name='crm_insights_scheduler_url'),u);
 perform pg_temp.denied($q$select crm_security.invoke_crm_insights_scheduler()$q$,'22023');
end loop;end $$;
select vault.update_secret((select id from vault.secrets where name='crm_insights_scheduler_url'),'https://admin.english-hills.com/api/cron/crm-insights');
select vault.update_secret((select id from vault.secrets where name='crm_insights_scheduler_token'),repeat('x',4097));
select pg_temp.denied($q$select crm_security.invoke_crm_insights_scheduler()$q$,'22023');
select pg_temp.ok((select count(*) from net.http_request_queue where url like '%crm-insights%')=0,'no scheduler request queued');
rollback;
\echo 'PASS Phase 11 schema, snapshots, first touch, fan-out, cohort, ratios, finance, cutoff, currency, timezone and security; live mode, identity rule, backoff, enqueue, USD ratios, diagnostics, roles and pinned scheduler URL'
