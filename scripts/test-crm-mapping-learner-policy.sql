-- Local synthetic fixtures only; every row rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '22023') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;end if;raise;end;
 raise exception 'Unexpected success: %',q;
end $$;
select pg_temp.ok(not exists(select 1 from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')),'no external worker');
select pg_temp.ok(not exists(select 1 from crm_followup_policies),'clean local baseline');
insert into auth.users(id,email,aud,role) values('93000000-0000-0000-0000-000000000001','policy@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='93000000-0000-0000-0000-000000000001';
create function pg_temp.actor(worker boolean default false) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',case when worker then '' else '93000000-0000-0000-0000-000000000001' end,true);
 perform set_config('request.jwt.claim.role',case when worker then 'service_role' else 'authenticated' end,true);
end $$;
select pg_temp.actor();
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
create temp table fx(k text primary key,v jsonb);
insert into fx values('meta',crm_save_meta_connection('{"connection_key":"policy-meta","page_id":"93001","api_version":"v99.0"}')),
 ('site',crm_save_website_connection('{"connection_key":"policy-site","origin":"https://school.example"}'));
select crm_save_meta_connection('{"connection_key":"policy-meta","page_id":"93001","api_version":"v99.0","enabled":true}',(select (v->>'id')::uuid from fx where k='meta'),1);
insert into fx values('optional',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"93002","field_map":{"contact_name":"full_name","phone":"phone_number","whatsapp":"whatsapp_number"},"learner_policy":"optional","default_session_type":"Yearly","default_program_interest_text":"Programme annuel","effective_from":"2020-01-01Z"}')),
 ('required',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"93003","field_map":{},"learner_policy":"required","effective_from":"2020-01-01Z"}'));
select pg_temp.ok((crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"93004","field_map":{}}')->>'learner_policy')='required','old Meta payload defaults required');
select pg_temp.ok((crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"general_contact_v1","field_map":{}}')->>'learner_policy')='required','new website payload has no key exception');
select pg_temp.ok((crm_publish_website_form_mapping((select (v->>'id')::uuid from fx where k='site'),'{"form_key":"campaign_parent_lead_v1","field_map":{},"learner_policy":"optional"}')->>'learner_policy')='optional','explicit website parent policy supported');
do $$ declare provider text; bad jsonb; payload jsonb; begin
 foreach provider in array array['meta','website'] loop
  foreach bad in array array['null'::jsonb,'true'::jsonb,'7'::jsonb,'{}'::jsonb,'[]'::jsonb,'"OPTIONAL"'::jsonb,'""'::jsonb] loop
   payload:=jsonb_build_object('form_key',case when provider='meta' then '93005' else 'custom' end,'field_map','{}'::jsonb,'learner_policy',bad);
   perform pg_temp.denied(format('select crm_publish_%s_form_mapping(%L,%L)',provider,(select v->>'id' from fx where k=case when provider='meta' then 'meta' else 'site' end),payload));
  end loop;
  payload:=jsonb_build_object('form_key',case when provider='meta' then '93005' else 'custom' end,'field_map','{}'::jsonb,'unexpected',true);
  perform pg_temp.denied(format('select crm_publish_%s_form_mapping(%L,%L)',provider,(select v->>'id' from fx where k=case when provider='meta' then 'meta' else 'site' end),payload));
 end loop;
end $$;
select pg_temp.denied($q$update crm_form_mappings set learner_policy='required' where id=(select (v->>'id')::uuid from fx where k='optional')$q$,'42501');
select pg_temp.denied($q$delete from crm_form_mappings where id=(select (v->>'id')::uuid from fx where k='optional')$q$,'42501');

create function pg_temp.ingest(form text,contact_name text,phone text,learner text default null,program text default 'Programme annuel',session text default 'Yearly') returns jsonb
language plpgsql as $$ declare external text:=floor(random()*1e15)::bigint::text;j crm_ingestion_jobs;m jsonb;event jsonb;begin
 event:=jsonb_build_array(jsonb_build_object('page_id','93001','leadgen_id',external,'form_id',form,'created_time',1700000000));
 perform crm_accept_meta_events(event);perform crm_accept_meta_events(event);
 perform crm_claim_meta_jobs(1);
 select * into strict j from crm_ingestion_jobs where external_key='93001:'||external;
 m:=crm_get_meta_job_mapping(j.id,j.lease_token,form,'2023-11-14Z');
 return crm_finalize_meta_job(j.id,j.lease_token,(m->>'id')::uuid,jsonb_build_object('occurred_at','2023-11-14T10:00:00Z',
  'core_fields',jsonb_build_object('contact_name',contact_name,'phone',phone,'whatsapp',phone,'learner_name',learner,'program_interest_text',program,'session_type',session),
  'form_answers','[{"key":"âge_de_l''enfant","label":"Age","value":"7-8","value_type":"string","label_source":"provider_key"},{"key":"travel","label":"Travel","value":"Oui","value_type":"string","label_source":"provider_key"}]'::jsonb,
  'source_label','Meta','attribution',jsonb_build_object('external_submission_id',external,'page_id','93001','form_id',form,'attribution_status','partial')));
end $$;
select pg_temp.actor(true);
insert into fx values('new',pg_temp.ingest('93002','Policy parent','0612345011'));
select pg_temp.ok((select status='NEW' and learner_name is null and learner_name_normalized is null and learner_age is null from crm_leads where id=(select (v->>'lead_id')::uuid from fx where k='new')),'optional Meta creates unnamed NEW lead');
select pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=(select (v->>'lead_id')::uuid from fx where k='new') and task_type='first_contact'),'normal first contact task');
insert into fx values('repeat',pg_temp.ingest('93002','Policy parent','0612345011'));
select pg_temp.ok((select v->>'lead_id' from fx where k='repeat')=(select v->>'lead_id' from fx where k='new'),'one unnamed opportunity reused');
select pg_temp.ok((select count(*)=1 from crm_tasks where lead_id=(select (v->>'lead_id')::uuid from fx where k='new')),'no repeat task');
insert into fx values('required-missing',pg_temp.ingest('93003','Required parent','0612345012')),
 ('wrong-program',pg_temp.ingest('93002','Policy parent','0612345011',null,'Other')),
 ('wrong-session',pg_temp.ingest('93002','Policy parent','0612345011',null,'Programme annuel','Adults')),
 ('uncertain',pg_temp.ingest('93002','Different name','0612345011')),
 ('child',pg_temp.ingest('93003','Named parent','0612345013','Child A')),
 ('named-conflict',pg_temp.ingest('93002','Named parent','0612345013')),
 ('sibling',pg_temp.ingest('93003','Named parent','0612345013','Child B')),
 ('multiple',pg_temp.ingest('93002','Named parent','0612345013'));
select pg_temp.ok((select bool_and(s.match_status='needs_review' and s.lead_id is null) from fx join crm_submissions s on s.id=(v->>'submission_id')::uuid where k in ('required-missing','wrong-program','wrong-session','uncertain','named-conflict','multiple')),'required, sibling, contact and context safeguards');
select pg_temp.ok((select count(*)=2 from crm_leads l join crm_contacts c on c.id=l.contact_id where c.phone_e164=crm_security.normalize_phone('0612345013')),'named siblings unchanged');
select pg_temp.ok((select count(*)=10 from crm_ingestion_jobs),'duplicate callbacks preserved exactly once');
select pg_temp.ok((select s.form_answers->0->>'value'='7-8' and s.core_fields->>'learner_age' is null from crm_submissions s where id=(select (v->>'submission_id')::uuid from fx where k='new')),'age range retained without integer age');
select pg_temp.actor();
select pg_temp.ok((select bool_and((item->>'learner_optional')::boolean=(item->>'id'<>(select v->>'submission_id' from fx where k='required-missing'))) from jsonb_array_elements(crm_list_intake_review()->'rows') item),'review flags follow Meta mapping policy');
select pg_temp.denied($q$select crm_resolve_external_intake(gen_random_uuid(),(select (v->>'submission_id')::uuid from fx where k='required-missing'),'new','{}')$q$);
select pg_temp.ok((select exists(select 1 from jsonb_array_elements(crm_list_intake_review()->'rows') item where item->>'id'=(select v->>'submission_id' from fx where k='named-conflict') and item->'answers'->0->>'value'='7-8')),'review preserves age range answer');
-- Later versions do not reinterpret a retained submission's original mapping.
insert into fx values('v2',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fx where k='meta'),'{"form_key":"93002","field_map":{},"learner_policy":"required","effective_from":"2025-01-01Z"}'));
select pg_temp.ok((select v->>'version'='2' from fx where k='v2'),'version advances');
select pg_temp.ok(crm_security.mapping_learner_optional((select (v->>'submission_id')::uuid from fx where k='named-conflict')),'retained optional submission remains optional');
select crm_resolve_external_intake(gen_random_uuid(),(select (v->>'submission_id')::uuid from fx where k='named-conflict'),'new','{"learner_name":null}');
select pg_temp.ok((select learner_name is null from crm_leads where id=(select lead_id from crm_submissions where id=(select (v->>'submission_id')::uuid from fx where k='named-conflict'))),'manual optional Meta resolution keeps NULL');
select pg_temp.ok(to_regprocedure('crm_security.website_learner_optional(uuid)') is null,'old policy removed');
rollback;
\echo 'PASS mapping policy validation, immutability, Meta intake, conservative matching, review and version pinning'
