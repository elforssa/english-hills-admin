-- DGI-B Release B2 (migration 116): synthetic local transaction, always rolled back.
-- No provider/network call, no token, no Meta host. Covers the cohort v2 funnel counts
-- (contacted, reached, converted_paid, lead-level test stages) with repeated events,
-- cutoff, merged leads and multi-submission fan-out; the program level and filter with
-- the NULL bucket and spend suppression; the D11 NULL-versus-zero rules; the dropped
-- 11-parameter signature, the named-argument call of the previous page, grants and roles.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;
 raise exception 'Unexpected success: %',q;
end $$;
insert into auth.users(id,email,aud,role) select ('11600000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'dgi-b2-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '11600000-%';
create function pg_temp.actor(i int) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub',case when i=0 then '' else '11600000-0000-0000-0000-'||lpad(i::text,12,'0') end,true);perform set_config('request.jwt.claim.role',case when i=0 then 'service_role' else 'authenticated' end,true);end $$;
select pg_temp.actor(1);
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
create temp table fx(k text primary key,v jsonb);
insert into fx values('connection',crm_save_meta_connection('{"connection_key":"dgi-b2-test","page_id":"116001","api_version":"v99.0"}'));
create function pg_temp.conn() returns uuid language sql as $$ select (v->>'id')::uuid from fx where k='connection' $$;
insert into fx values('mapping',crm_publish_meta_form_mapping(pg_temp.conn(),'{"form_key":"116002","field_map":{},"effective_from":"2020-01-01Z"}'));
select crm_configure_insights(pg_temp.conn(),(select version from crm_integration_connections where id=pg_temp.conn()),'{"mode":"mock","enabled":true,"account_id":"1160","currency":"USD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}');

-- Spend: complete coverage for 2026-03-01..02. Campaign 116101 spends 100 + 20 over two
-- days (daily rows must not multiply by leads), 116201 spends exactly 0 (genuine zero),
-- 116301 spends 30 and acquires no lead. 2026-03-03 has no completed run.
insert into fx values('run',to_jsonb(gen_random_uuid()));
insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at) values((select (v#>>'{}')::uuid from fx where k='run'),pg_temp.conn(),gen_random_uuid(),'2026-03-01','2026-03-02','{}','completed',now());
insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend,impressions,clicks)
 select pg_temp.conn(),(select (v#>>'{}')::uuid from fx where k='run'),d::date,'1160','Africa/Casablanca','USD',c,c||'2',c||'3','ad-daily-v1',s,10,1
 from (values('2026-03-01','116101',100),('2026-03-02','116101',20),('2026-03-01','116201',0),('2026-03-02','116201',0),('2026-03-01','116301',30)) x(d,c,s);
insert into crm_meta_objects(connection_id,account_id,object_type,external_id,current_name,objective) values(pg_temp.conn(),'1160','campaign','116101','Annuel B2','OUTCOME_LEADS'),(pg_temp.conn(),'1160','campaign','116201','Gratuit B2','OUTCOME_LEADS'),(pg_temp.conn(),'1160','campaign','116301','Notoriété B2','OUTCOME_AWARENESS');

-- Leads, all acquired 2026-03-01 12:00Z. session_type comes from the submission core fields.
create function pg_temp.intake(k0 text,channel text,campaign text,session text) returns uuid language plpgsql as $$ declare s uuid;l uuid;begin
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values(channel,'2026-03-01 12:00Z','2026-03-01 12:00Z','server',jsonb_build_object('contact_name','B2 parent '||k0,'phone','06116'||lpad((ascii(right(k0,1))%100)::text,5,'0'),'learner_name','B2 child '||k0,'program_interest_text','Annual')||case when session is null then '{}'::jsonb else jsonb_build_object('session_type',session) end,
  '[]','Fixture','needs_review',encode(sha256(convert_to(k0,'UTF8')),'hex'),case when channel='meta_instant_form' then (select (v->>'id')::uuid from fx where k='mapping') end) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,campaign_id,adset_id,ad_id,attribution_status)
 values(s,case when channel='meta_instant_form' then 'meta' else 'website' end,campaign,campaign||'2',campaign||'3','partial');
 l:=crm_security.accept_external_submission(s);
 insert into fx values(k0,to_jsonb(l));return l;end $$;
create function pg_temp.lead(k0 text) returns uuid language sql as $$ select (v#>>'{}')::uuid from fx where k=k0 $$;
create function pg_temp.ev(k0 text,kind text,happened timestamptz default null) returns uuid language sql as $$ select crm_security.event(pg_temp.lead(k0),kind,'dgi-b2:'||k0||':'||kind||':'||gen_random_uuid(),null,case when kind like 'whatsapp%' then 'whatsapp' else 'phone' end,null,null,happened) $$;
create function pg_temp.act(cmd text,l uuid,data jsonb) returns jsonb language plpgsql as $$ declare r jsonb;begin execute format('select crm_%I($1,$2)',cmd) into r using gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l))||data;return r;end $$;
select pg_temp.intake('L1','meta_instant_form','116101','Yearly');
select pg_temp.intake('L2','meta_instant_form','116101','Yearly');
select pg_temp.intake('L3','meta_instant_form','116201',null);
select pg_temp.intake('L4','meta_instant_form','116101','Adults');
select pg_temp.intake('L5','website',null,'Adults');
select pg_temp.intake('L6','website',null,null);
select pg_temp.intake('L7','meta_instant_form','116101','Yearly');
select pg_temp.intake('L8','meta_instant_form',null,'Yearly');
select pg_temp.ok((select count(*) filter(where session_type='Yearly')=4 and count(*) filter(where session_type is null)=2 from crm_leads where id in (select (v#>>'{}')::uuid from fx where k like 'L_')),'session_type fixtures');

-- L1: every outreach kind, repeated (one acquisition-window attempt for the cutoff case),
-- qualified twice, two linked placement tests (one attended, edited again later).
select pg_temp.ev('L1','contact_attempted','2026-03-01 15:00Z');select pg_temp.ev('L1','contact_attempted');
select pg_temp.ev('L1','conversation_recorded');select pg_temp.ev('L1','conversation_recorded');select pg_temp.ev('L1','whatsapp_sent');
select pg_temp.ev('L1','lead_qualified');select pg_temp.ev('L1','lead_qualified');
insert into placement_tests(student_name,date_test,heure,status,crm_lead_id) values('B2 child L1',current_date+5,'10:00','Planifié',pg_temp.lead('L1'));
update placement_tests set status='Passé' where crm_lead_id=pg_temp.lead('L1');
update placement_tests set notes='Edited twice' where crm_lead_id=pg_temp.lead('L1');
insert into placement_tests(student_name,date_test,heure,status,crm_lead_id) values('B2 child L1',current_date+6,'11:00','Planifié',pg_temp.lead('L1'));
-- L3: qualified at a walk-in without any outreach evidence.
select pg_temp.ev('L3','lead_qualified');
-- L5: an unanswered WhatsApp (contacted, not reached). L8: a WhatsApp conversation.
select pg_temp.ev('L5','whatsapp_sent');select pg_temp.ev('L8','whatsapp_conversation');
-- L7: contacted and qualified, then merged into L1: excluded from every count.
select pg_temp.ev('L7','contact_attempted');select pg_temp.ev('L7','lead_qualified');
update crm_leads set merged_into_lead_id=pg_temp.lead('L1') where id=pg_temp.lead('L7');
-- L1 also gets a later website submission: first touch stays Meta, no fan-out.
do $$ declare s uuid;l uuid:=pg_temp.lead('L1');begin
 insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash) values('website','2026-03-02 09:00Z','2026-03-02 09:00Z','server','{}','[]','Later','needs_review',repeat('e',64)) returning id into s;
 insert into crm_submission_attribution(submission_id,provider,attribution_status) values(s,'website','partial');
 perform crm_security.resolve_submission(l,s,(select version from crm_leads where id=l),gen_random_uuid());end $$;
-- L2 and L4: real qualification (records a conversation), enrollment and collected
-- receipt; L4's receipt is then voided (converted, not paid).
alter table receipts disable trigger on_receipt_created;
do $$ declare k text;r jsonb;l uuid;s uuid;e uuid;receipt uuid;begin
 foreach k in array array['L2','L4'] loop
  l:=pg_temp.lead(k);
  perform pg_temp.act('qualify_lead',l,jsonb_build_object('conversation_channel','phone','note','Qualified','qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
  r:=crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',(select version from crm_leads where id=l),'student_choice','new','learner_name','B2 child '||k,'birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2','candidate_review',crm_security.candidate_token(l,'B2 child '||k,'2014-05-10'),'confirm_new',true));
  s:=(r->'enrollment'->>'student_id')::uuid;e:=(r->'enrollment'->>'id')::uuid;
  r:=create_charge_payment(jsonb_build_object('student_id',s,'enrollment_id',e,'session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));receipt:=(r->>'receipt_id')::uuid;
  set constraints all immediate;set constraints all deferred;
  if k='L4' then perform void_financial_receipt(receipt,'B2 synthetic reversal',gen_random_uuid());set constraints all immediate;set constraints all deferred;end if;
 end loop;
end $$;
select pg_temp.ok((select count(*)=2 from crm_leads where id in (pg_temp.lead('L2'),pg_temp.lead('L4')) and conversion_activity_id is not null),'two trusted conversions');

create function pg_temp.report(lev text default 'campaign',session text default null,cut date default null,until date default '2026-03-02') returns jsonb language sql as $$ select crm_get_marketing_cohort('2026-03-01',until,cut,pg_temp.conn(),lev,null,null,null,null,50,0,session) $$;
create function pg_temp.row_of(r jsonb,b text) returns jsonb language sql as $$ select x from jsonb_array_elements(r->'rows') x where x->>'bucket'=b $$;
create temp table rep as select pg_temp.report() as r;
create function pg_temp.r() returns jsonb language sql as $$ select r from rep $$;
create function pg_temp.s(key text) returns text language sql as $$ select pg_temp.r()->'summary'->>key $$;

-- ===== D8 funnel counts (campaign level, no cutoff) =====
select pg_temp.ok(pg_temp.s('leads')='7','distinct canonical first-touch leads; the merged lead is excluded and the second submission does not fan out');
select pg_temp.ok(pg_temp.s('contacted')='5','contacted: attempt, conversation or WhatsApp, each lead once (L1 L2 L4 L5 L8)');
select pg_temp.ok(pg_temp.s('reached')='4','reached: recorded conversation only (L1 L2 L4 L8; L5 WhatsApp sent is not reached)');
select pg_temp.ok(pg_temp.s('qualified')='4','qualified counted once despite repeats, and without contact (L3)');
select pg_temp.ok(pg_temp.s('tests_booked')='2' and pg_temp.s('tests_attended')='1','existing test columns keep counting distinct linked tests');
select pg_temp.ok(pg_temp.s('booked_leads')='1' and pg_temp.s('attended_leads')='1','funnel test stages count the lead once');
select pg_temp.ok(pg_temp.s('converted')='2' and pg_temp.s('converted_paid')='1','converted_paid needs collected revenue; a voided receipt is converted, not paid');
select pg_temp.ok((pg_temp.s('revenue'))::numeric=500,'revenue unchanged');
select pg_temp.ok(pg_temp.s('attributed_leads')='4' and pg_temp.s('attributed_contacted')='3' and pg_temp.s('attributed_qualified')='4' and pg_temp.s('attributed_converted')='2' and pg_temp.s('unattributed_leads')='3' and pg_temp.s('pending_leads')='0','Meta-only denominators include attributed_contacted');
select pg_temp.ok((select count(*)=0 from jsonb_each(pg_temp.r()->'summary') e where e.key in ('leads','contacted','reached','engaged','qualified','tests_booked','tests_attended','booked_leads','attended_leads','results','converted','converted_paid','unattributed_leads','pending_leads','attributed_leads','attributed_contacted') and jsonb_typeof(e.value)<>'number'),'counts are never NULL');
select pg_temp.ok((pg_temp.row_of(pg_temp.r(),'meta:116101')->>'contacted')::int=3 and (pg_temp.row_of(pg_temp.r(),'meta:116101')->>'reached')::int=3 and (pg_temp.row_of(pg_temp.r(),'meta:116101')->>'converted_paid')::int=1 and (pg_temp.row_of(pg_temp.r(),'meta:116101')->>'booked_leads')::int=1,'row funnel counts');
select pg_temp.ok((pg_temp.row_of(pg_temp.r(),'unknown:website')->>'contacted')::int=1 and (pg_temp.row_of(pg_temp.r(),'unknown:website')->>'reached')::int=0,'website row funnel counts');
select pg_temp.ok((select sum((x->>'contacted')::int)=5 and sum((x->>'converted_paid')::int)=1 from jsonb_array_elements(pg_temp.r()->'rows') x),'rows partition the summary');
-- Cutoff: only the acquisition-window attempt of L1 happened by 2026-03-02.
select pg_temp.ok(pg_temp.report('campaign',null,'2026-03-02')->'summary'->>'contacted'='1' and pg_temp.report('campaign',null,'2026-03-02')->'summary'->>'reached'='0' and pg_temp.report('campaign',null,'2026-03-02')->'summary'->>'converted_paid'='0' and pg_temp.report('campaign',null,'2026-03-02')->'summary'->>'booked_leads'='0','stages respect the outcome cutoff');

-- ===== D11 NULL versus zero (trusted rows, complete coverage, USD) =====
select pg_temp.ok(pg_temp.r()->>'spend_complete'='true' and pg_temp.r()->>'spend_suppressed_reason' is null and (pg_temp.s('spend'))::numeric=150,'complete spend, no suppression');
select pg_temp.ok((pg_temp.row_of(pg_temp.r(),'meta:116101')->>'spend')::numeric=120 and (pg_temp.row_of(pg_temp.r(),'meta:116101')->>'cpl')::numeric=40 and (pg_temp.row_of(pg_temp.r(),'meta:116101')->>'cpql')::numeric=40 and (pg_temp.row_of(pg_temp.r(),'meta:116101')->>'cac')::numeric=60,'CPL/CPQL/CAC over trusted converted');
select pg_temp.ok((pg_temp.row_of(pg_temp.r(),'meta:116201')->>'spend')::numeric=0 and (pg_temp.row_of(pg_temp.r(),'meta:116201')->>'cpl')::numeric=0 and (pg_temp.row_of(pg_temp.r(),'meta:116201')->>'cpql')::numeric=0 and pg_temp.row_of(pg_temp.r(),'meta:116201')->>'cac' is null,'spend exactly 0 is a genuine 0; a zero denominator is NULL');
select pg_temp.ok((pg_temp.row_of(pg_temp.r(),'meta:116301')->>'spend')::numeric=30 and (pg_temp.row_of(pg_temp.r(),'meta:116301')->>'leads')::int=0 and pg_temp.row_of(pg_temp.r(),'meta:116301')->>'cpl' is null and pg_temp.row_of(pg_temp.r(),'meta:116301')->>'cpql' is null,'spend without leads gives NULL ratios');
select pg_temp.ok((pg_temp.s('cpl'))::numeric=37.5 and (pg_temp.s('cac'))::numeric=75 and pg_temp.s('roas') is null,'summary ratios over attributed denominators; no ROAS under USD/MAD');
select pg_temp.ok((select count(*)=0 from jsonb_array_elements(pg_temp.r()->'rows') x where x->>'attribution_kind'<>'trusted_meta' and (x->>'spend' is not null or x->>'cpl' is not null or x->>'cpql' is not null or x->>'cac' is not null or x->>'roas' is not null)),'no spend or ratio outside trusted rows');
select pg_temp.ok(pg_temp.report('campaign',null,null,'2026-03-03')->>'spend_complete'='false' and pg_temp.report('campaign',null,null,'2026-03-03')->'summary'->>'spend' is null and pg_temp.report('campaign',null,null,'2026-03-03')->'summary'->>'cpl' is null
 and pg_temp.row_of(pg_temp.report('campaign',null,null,'2026-03-03'),'meta:116201')->>'spend' is null and pg_temp.row_of(pg_temp.report('campaign',null,null,'2026-03-03'),'meta:116201')->>'cpl' is null,'an uncovered date gives NULL spend, never 0');

-- ===== D9 program level =====
create temp table prog as select pg_temp.report('program') as r;
create function pg_temp.p() returns jsonb language sql as $$ select r from prog $$;
select pg_temp.ok(pg_temp.p()->>'spend_suppressed_reason'='program_level' and pg_temp.p()->'summary'->>'spend' is null and pg_temp.p()->'summary'->>'cpl' is null and pg_temp.p()->'summary'->>'cpql' is null and pg_temp.p()->'summary'->>'cac' is null,'program level suppresses summary spend and ratios');
select pg_temp.ok((select array_agg(x->>'bucket' order by x->>'bucket' collate "C")=array['program:Adults','program:Yearly','program:none'] from jsonb_array_elements(pg_temp.p()->'rows') x) and pg_temp.p()->>'total'='3','one row per program and the NULL bucket; no spend-only row');
select pg_temp.ok((select bool_and(x->>'attribution_kind'='program' and x->>'spend' is null and x->>'impressions' is null and x->>'clicks' is null and x->>'link_clicks' is null and x->>'cpl' is null and x->>'cpql' is null and x->>'cac' is null and x->>'roas' is null and x->>'objective' is null and x->>'channel' is null) from jsonb_array_elements(pg_temp.p()->'rows') x),'program rows never carry spend, delivery or ratios');
select pg_temp.ok(pg_temp.row_of(pg_temp.p(),'program:none')->>'name'='Sans programme' and pg_temp.row_of(pg_temp.p(),'program:none')->>'object_key' is null and (pg_temp.row_of(pg_temp.p(),'program:none')->>'leads')::int=2 and (pg_temp.row_of(pg_temp.p(),'program:none')->>'contacted')::int=0 and (pg_temp.row_of(pg_temp.p(),'program:none')->>'qualified')::int=1,'NULL session_type bucket');
select pg_temp.ok(pg_temp.row_of(pg_temp.p(),'program:Yearly')->>'name'='Yearly' and pg_temp.row_of(pg_temp.p(),'program:Yearly')->>'object_key'='Yearly' and (pg_temp.row_of(pg_temp.p(),'program:Yearly')->>'leads')::int=3 and (pg_temp.row_of(pg_temp.p(),'program:Yearly')->>'contacted')::int=3 and (pg_temp.row_of(pg_temp.p(),'program:Yearly')->>'reached')::int=3 and (pg_temp.row_of(pg_temp.p(),'program:Yearly')->>'converted_paid')::int=1,'Yearly bucket across channels and attribution');
select pg_temp.ok((pg_temp.row_of(pg_temp.p(),'program:Adults')->>'leads')::int=2 and (pg_temp.row_of(pg_temp.p(),'program:Adults')->>'converted')::int=1 and (pg_temp.row_of(pg_temp.p(),'program:Adults')->>'converted_paid')::int=0 and (pg_temp.row_of(pg_temp.p(),'program:Adults')->>'revenue')::numeric=0,'Adults bucket');
select pg_temp.ok((select jsonb_object_agg(k,pg_temp.p()->'summary'->k) from unnest(array['leads','contacted','reached','qualified','booked_leads','converted','converted_paid','revenue','attributed_leads','attributed_contacted','attributed_converted','unattributed_leads']) k)
 =(select jsonb_object_agg(k,pg_temp.r()->'summary'->k) from unnest(array['leads','contacted','reached','qualified','booked_leads','converted','converted_paid','revenue','attributed_leads','attributed_contacted','attributed_converted','unattributed_leads']) k),'program level keeps the same counts, revenue and Meta-only denominators');
select pg_temp.ok(pg_temp.report('program',null,null,'2026-03-03')->'summary'->>'spend' is null,'program level never shows spend');

-- ===== D9 program filter =====
create temp table yearly as select pg_temp.report('campaign','Yearly') as r;
create function pg_temp.y() returns jsonb language sql as $$ select r from yearly $$;
select pg_temp.ok(pg_temp.y()->>'spend_suppressed_reason'='program_filter' and pg_temp.y()->>'session_type'='Yearly' and pg_temp.y()->'summary'->>'spend' is null and pg_temp.y()->'summary'->>'cpl' is null and pg_temp.y()->'summary'->>'cac' is null,'filter suppresses summary spend and ratios');
select pg_temp.ok(pg_temp.y()->'summary'->>'leads'='3' and pg_temp.y()->'summary'->>'contacted'='3' and pg_temp.y()->'summary'->>'converted'='1' and pg_temp.y()->'summary'->>'attributed_leads'='2' and (pg_temp.y()->'summary'->>'revenue')::numeric=500,'filter narrows counts and revenue exactly');
select pg_temp.ok((select array_agg(x->>'bucket' order by x->>'bucket' collate "C")=array['meta:116101','unknown:meta_instant_form'] from jsonb_array_elements(pg_temp.y()->'rows') x),'filtered rows keep their attribution buckets; no spend-only campaign');
select pg_temp.ok(pg_temp.row_of(pg_temp.y(),'meta:116101')->>'attribution_kind'='trusted_meta' and pg_temp.row_of(pg_temp.y(),'meta:116101')->>'spend' is null and pg_temp.row_of(pg_temp.y(),'meta:116101')->>'cpl' is null and pg_temp.row_of(pg_temp.y(),'meta:116101')->>'cpql' is null and pg_temp.row_of(pg_temp.y(),'meta:116101')->>'cac' is null and pg_temp.row_of(pg_temp.y(),'meta:116101')->>'impressions' is null and (pg_temp.row_of(pg_temp.y(),'meta:116101')->>'leads')::int=2,'a trusted row under the filter has NULL spend, never 0');
select pg_temp.ok(pg_temp.report('campaign','none')->'summary'->>'leads'='2' and pg_temp.report('campaign','none')->'summary'->>'qualified'='1' and pg_temp.report('campaign','none')->>'spend_suppressed_reason'='program_filter','none selects leads without a session type');
select pg_temp.ok(pg_temp.report('campaign','Other')->'summary'->>'leads'='0' and pg_temp.report('campaign','Other')->>'total'='0' and pg_temp.report('campaign','Other')->'summary'->>'spend' is null,'an empty program is zero leads, NULL spend');
select pg_temp.ok(pg_temp.report('program','Adults')->>'spend_suppressed_reason'='program_filter' and pg_temp.report('program','Adults')->>'total'='1','filter wins over level');
select pg_temp.ok(pg_temp.report('source','Yearly')->'summary'->>'spend' is null and pg_temp.report('adset','Yearly')->'summary'->>'spend' is null and pg_temp.report('ad','Yearly')->'summary'->>'spend' is null,'filter suppresses spend at every level');
select pg_temp.ok(crm_get_marketing_cohort('2026-03-01','2026-03-02',null,pg_temp.conn(),'campaign','116101',null,null,null,50,0,'Yearly')->'summary'->>'leads'='2','ID filter and program filter combine');
select pg_temp.denied($q$select pg_temp.report('campaign','yearly')$q$,'22023');
select pg_temp.denied($q$select pg_temp.report('campaign','')$q$,'22023');
select pg_temp.denied($q$select pg_temp.report('programme')$q$,'22023');

-- ===== Signature, previous page call shape, grants and roles =====
select pg_temp.ok(to_regprocedure('public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer)') is null and (select count(*)=1 from pg_proc where proname='crm_get_marketing_cohort'),'the 11-parameter signature is dropped; one function remains');
select pg_temp.ok((select prosecdef and proconfig=array['search_path=pg_catalog, pg_temp'] from pg_proc where oid='public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)'::regprocedure),'security definer with a fixed search path');
select pg_temp.ok(crm_get_marketing_cohort(p_from=>'2026-03-01',p_to=>'2026-03-02',p_cutoff_date=>null,p_connection=>pg_temp.conn(),p_level=>'campaign',p_channel=>null,p_campaign=>null,p_adset=>null,p_ad=>null,p_limit=>50,p_offset=>0)-'outcome_cutoff'=pg_temp.r()-'outcome_cutoff','the previous page call shape (named, without p_session_type) resolves to v2 unchanged');
select pg_temp.ok(has_function_privilege('authenticated','public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)','execute') and not has_function_privilege('anon','public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)','execute')
 and not has_function_privilege('service_role','public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)','execute') and not exists(select 1 from aclexplode((select proacl from pg_proc where proname='crm_get_marketing_cohort')) where grantee=0),'authenticated only; no PUBLIC, anon or service_role execute');
do $$ declare i int;begin
 for i in 2..7 loop perform pg_temp.actor(i);
  perform pg_temp.denied($q$select crm_get_marketing_cohort('2026-03-01','2026-03-02',null,pg_temp.conn(),'program')$q$);
  perform pg_temp.denied($q$select crm_get_marketing_cohort('2026-03-01','2026-03-02',null,pg_temp.conn(),'campaign',null,null,null,null,50,0,'Yearly')$q$);
 end loop;
 perform pg_temp.actor(1);
end $$;
select pg_temp.ok((select tgenabled='O' from pg_trigger where tgname='crm_attribution_immutable'),'attribution protection trigger untouched');
rollback;
\echo PASS DGI-B B2 SQL: funnel counts, repeats, cutoff, merged leads, program level and filter, NULL-versus-zero, signature, grants and roles
