-- Local synthetic regression for migration 092. Every fixture rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
select pg_temp.ok(not exists(select 1 from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')),'no external worker wake-up');
select pg_temp.ok(not exists(select 1 from crm_followup_policies),'clean local policy baseline');
create temp table center_before as select jsonb_build_array((select count(*) from students),(select count(*) from enrollments),
 (select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),
 (select count(*) from financial_events)) counts;
insert into auth.users(id,email,aud,role) values('92000000-0000-0000-0000-000000000001','phase92-director@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='92000000-0000-0000-0000-000000000001';
create function pg_temp.actor(worker boolean default false) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',case when worker then '' else '92000000-0000-0000-0000-000000000001' end,true);
 perform set_config('request.jwt.claim.role',case when worker then 'service_role' else 'authenticated' end,true);
end $$;
select pg_temp.actor();
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
create temp table fx(k text primary key,v jsonb);
insert into fx values('site',crm_save_website_connection('{"connection_key":"phase92-site","origin":"https://school.example"}'));
select crm_save_website_connection('{"connection_key":"phase92-site","origin":"https://school.example","enabled":true}',(select (v->>'id')::uuid from fx where k='site'),1);
select crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"general_contact_v1","field_map":{"program_interest_text":"program_interest"},"effective_from":"2020-01-01Z"}');
select crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"campaign_adult_lead_v1","field_map":{"program_interest_text":"program_interest"},"effective_from":"2020-01-01Z"}');
select crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"campaign_parent_lead_v1","field_map":{"learner_name":"learner_name","program_interest_text":"program_interest"},"effective_from":"2020-01-01Z"}');

create function pg_temp.ingest(form text,contact_name text,email text,learner text,program text) returns jsonb
language plpgsql as $$ declare request uuid:=gen_random_uuid();j crm_ingestion_jobs;m jsonb;begin
 perform crm_accept_website_inquiry('phase92-site',form,request,jsonb_build_object('form_key',form,
  'contact',jsonb_build_object('name',contact_name,'email',email),
  'answers',jsonb_build_object('program_interest',program,'learner_name',learner,'company_size','10-20'),
  'attribution','{}'::jsonb,'consent',true));
 perform crm_claim_ingestion_jobs(1,'website');
 select * into strict j from crm_ingestion_jobs where external_key=form||':'||request;
 m:=crm_get_website_job_mapping(j.id,j.lease_token);
 return crm_finalize_website_job(j.id,j.lease_token,(m->>'id')::uuid,
  jsonb_build_object('core_fields',jsonb_build_object('contact_name',contact_name,'email',email,
   'learner_name',learner,'program_interest_text',program),
   'form_answers','[]'::jsonb,'source_label','Site web'));
end $$;

select pg_temp.actor(true);
insert into fx values('general',pg_temp.ingest('general_contact_v1','Business contact','business@example.invalid',null,'Formation entreprise'));
select pg_temp.ok((select l.learner_name is null and l.learner_name_normalized is null and l.status='NEW'
 from crm_leads l where l.id=(select (v->>'lead_id')::uuid from fx where k='general')),'general form creates unnamed NEW lead');
select pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=(select (v->>'lead_id')::uuid from fx where k='general') and task_type='first_contact'),'normal first-contact task');
insert into fx values('repeat',pg_temp.ingest('general_contact_v1','Business contact','business@example.invalid',null,'Formation entreprise'));
select pg_temp.ok((select (select v->>'lead_id' from fx where k='general')=(v->>'lead_id') from fx where k='repeat'),'repeat inquiry reuses unnamed opportunity');
select pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=(select (v->>'lead_id')::uuid from fx where k='general')),'repeat creates no duplicate task');
insert into fx values('adult',pg_temp.ingest('campaign_adult_lead_v1','Adult contact','adult@example.invalid',null,'Adult English'));
select pg_temp.ok((select learner_name is null from crm_leads where id=(select (v->>'lead_id')::uuid from fx where k='adult')),'adult form does not infer learner from contact');

insert into fx values('parent',pg_temp.ingest('campaign_parent_lead_v1','Parent contact','parent@example.invalid','Child A','Annual'));
insert into fx values('sibling',pg_temp.ingest('campaign_parent_lead_v1','Parent contact','parent@example.invalid','Child B','Annual'));
select pg_temp.ok((select count(*)=2 from crm_leads l join crm_contacts c on c.id=l.contact_id where c.email_normalized='parent@example.invalid' and l.learner_name in ('Child A','Child B')),'named siblings remain separate');
insert into fx values('ambiguous',pg_temp.ingest('general_contact_v1','Parent contact','parent@example.invalid',null,'Annual'));
select pg_temp.ok((select v->>'status'='done' and v->>'lead_id' is null from fx where k='ambiguous'),'unnamed inquiry never attaches to child');
select pg_temp.ok((select match_status='needs_review' and cardinality(candidate_lead_ids)=2 from crm_submissions where id=(select (v->>'submission_id')::uuid from fx where k='ambiguous')),'existing active opportunities require review');
insert into fx values('parent-missing',pg_temp.ingest('campaign_parent_lead_v1','Other parent','other@example.invalid',null,'Annual'));
select pg_temp.ok((select v->>'lead_id' is null from fx where k='parent-missing'),'parent form still requires learner');
insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash)
 values('meta_instant_form',now(),now(),'server','{"contact_name":"Meta contact","email":"meta@example.invalid","program_interest_text":"Annual"}','[]','Meta','needs_review',repeat('a',64));
select pg_temp.ok((select crm_security.resolve_external_submission(id) is null from crm_submissions where source_label='Meta' and match_status='needs_review'),'Meta no-learner behavior unchanged');

select pg_temp.actor();
select pg_temp.ok((select rows->0->>'contact_name'='Business contact' and rows->0->>'learner_name' is null from
 (select crm_search_leads('Business contact')->'rows' rows) x),'Prospects read model keeps contact name and null learner');
select pg_temp.ok((select exists(select 1 from jsonb_array_elements(crm_get_today()->'needs_attention') item
 where item->>'id'=(select v->>'lead_id' from fx where k='general') and item->>'contact_name'='Business contact' and item->>'learner_name' is null)),'Today read model handles unnamed lead');
select pg_temp.ok((select exists(select 1 from jsonb_array_elements(crm_list_intake_review()->'rows') item
 where item->>'id'=(select v->>'submission_id' from fx where k='ambiguous') and item->>'learner_optional'='true')),'review marks eligible website form optional');
select pg_temp.ok((select exists(select 1 from jsonb_array_elements(crm_list_intake_review()->'rows') item
 where item->>'id'=(select v->>'submission_id' from fx where k='parent-missing') and item->>'learner_optional'='false')),'review keeps parent learner required');
select crm_resolve_external_intake(gen_random_uuid(),(select (v->>'submission_id')::uuid from fx where k='ambiguous'),'new',
 '{"contact_name":"Parent contact","learner_name":null,"program_interest_text":"Annual"}');
select pg_temp.ok((select l.learner_name is null and s.match_status='resolved' from crm_submissions s join crm_leads l on l.id=s.lead_id
 where s.id=(select (v->>'submission_id')::uuid from fx where k='ambiguous')),'authenticated command resolves retained submission without invented learner');
select pg_temp.ok((select counts from center_before)=jsonb_build_array((select count(*) from students),(select count(*) from enrollments),
 (select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),
 (select count(*) from financial_events)),'no center or finance side effects');
rollback;
\echo 'PASS optional website learner, conservative matching, Meta/parent guard, recovery and receptionist reads'
