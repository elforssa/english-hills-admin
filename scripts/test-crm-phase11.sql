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
rollback;
\echo 'PASS Phase 11 schema, snapshots, first touch, fan-out, cohort, ratios, finance, cutoff, currency, timezone and security'
