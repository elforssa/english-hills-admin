-- Local synthetic fixtures only; all changes roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin if v is not true then raise exception 'FAIL: %',label;end if;end$$;
select pg_temp.ok(crm_security.valid_answers('[{"key":"travel","label":"Distance","value":"provider_slug","display_value":"Readable","value_type":"string","label_source":"mapping"}]'),'raw and display answer accepted');
select pg_temp.ok(not crm_security.valid_answers('[{"key":"travel","label":"Distance","value":["provider_slug"],"display_value":[7],"value_type":"array","label_source":"mapping"}]'),'unsafe option display rejected');
select pg_temp.ok(crm_security.operational_answers('[{"key":"travel","label":"Distance","value":"provider_slug","display_value":"Readable","value_type":"string","label_source":"mapping"}]')->0->>'display_value'='Readable','read model exposes configured display');
insert into auth.users(id,email,aud,role) values('94000000-0000-0000-0000-000000000001','reconciliation@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='94000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table fixture(k text primary key,v jsonb);
insert into fixture values('connection',crm_save_meta_connection('{"connection_key":"reconciliation-test","page_id":"94001","api_version":"v26.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST"}'));
select pg_temp.ok((select enabled=false and settings='{}'::jsonb from crm_integration_connections where id=(select (v->>'id')::uuid from fixture where k='connection')),'realtime and reconciliation disabled by default');
insert into fixture values('mapping',crm_publish_meta_form_mapping((select (v->>'id')::uuid from fixture where k='connection'),'{"form_key":"94002","field_map":{},"learner_policy":"optional","option_labels":{"travel":{"oui,_c''est_proche_de_chez_moi":"Oui, c''est proche de chez moi"}}}'));
select pg_temp.ok((select option_labels->'travel'->>'oui,_c''est_proche_de_chez_moi'='Oui, c''est proche de chez moi' from crm_form_mappings where id=(select (v->>'id')::uuid from fixture where k='mapping')),'mapping option label persisted');
do $$ declare rejected boolean:=false; begin
 begin
  update crm_form_mappings set option_labels='{}'::jsonb where id=(select (v->>'id')::uuid from fixture where k='mapping');
 exception when sqlstate '42501' then rejected:=true; end;
 perform pg_temp.ok(rejected,'published option labels immutable');
end $$;
select crm_save_meta_connection('{"connection_key":"reconciliation-test","page_id":"94001","api_version":"v26.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST","meta_reconciliation":{"enabled":true,"lookback_minutes":60}}',(select (v->>'id')::uuid from fixture where k='connection'),1);
select pg_temp.ok((select enabled=false and settings #>> '{meta_reconciliation,enabled}'='true' and (settings #>> '{meta_reconciliation,started_at}')::timestamptz>=transaction_timestamp() from crm_integration_connections where id=(select (v->>'id')::uuid from fixture where k='connection')),'independent activation and server watermark');
do $$ declare rejected boolean:=false; begin
 begin
  perform crm_save_meta_connection(
   '{"connection_key":"reconciliation-test","page_id":"94001","api_version":"v26.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST","meta_reconciliation":{"enabled":true,"lookback_minutes":60,"started_at":"2020-01-01T00:00:00Z"}}',
   (select (v->>'id')::uuid from fixture where k='connection'),2);
 exception when sqlstate '22023' then rejected:=true; end;
 perform pg_temp.ok(rejected,'caller cannot backdate activation');
end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into fixture values('lease',crm_claim_meta_reconciliation());
select pg_temp.ok((select v->>'form_key'='94002' from fixture where k='lease'),'active form claimed');
select pg_temp.ok(crm_claim_meta_reconciliation() is null,'overlap excluded by lease');
do $$ declare rejected boolean:=false; begin
 begin
  perform crm_enqueue_meta_reconciled(
   (select (v->>'connection_id')::uuid from fixture where k='lease'),'94002',
   (select (v->>'lease_token')::uuid from fixture where k='lease'),
   jsonb_build_array(jsonb_build_object('page_id','94001','form_id','94002','leadgen_id','94999',
    'created_time',extract(epoch from clock_timestamp()-interval '2 hours')::bigint)));
 exception when sqlstate '22023' then rejected:=true; end;
 perform pg_temp.ok(rejected,'historical lead rejected below activation watermark');
end $$;
-- Webhook arrives while realtime disabled: blocked. Reconciliation promotes only this identity.
select crm_accept_meta_events(jsonb_build_array(jsonb_build_object('page_id','94001','form_id','94002','leadgen_id','94003','created_time',ceil(extract(epoch from clock_timestamp()))::bigint)));
select pg_temp.ok((select status='blocked' and reconciliation_started_at is null from crm_ingestion_jobs where external_key='94001:94003'),'webhook blocked independently');
select crm_enqueue_meta_reconciled((select (v->>'connection_id')::uuid from fixture where k='lease'),'94002',(select (v->>'lease_token')::uuid from fixture where k='lease'),jsonb_build_array(jsonb_build_object('page_id','94001','form_id','94002','leadgen_id','94003','created_time',ceil(extract(epoch from clock_timestamp()))::bigint)));
select pg_temp.ok((select count(*)=1 and bool_and(status='pending' and reconciliation_started_at is not null) from crm_ingestion_jobs where external_key='94001:94003'),'webhook-first promoted once');
select crm_enqueue_meta_reconciled((select (v->>'connection_id')::uuid from fixture where k='lease'),'94002',(select (v->>'lease_token')::uuid from fixture where k='lease'),jsonb_build_array(jsonb_build_object('page_id','94001','form_id','94002','leadgen_id','94004','created_time',ceil(extract(epoch from clock_timestamp()))::bigint)));
select crm_accept_meta_events(jsonb_build_array(jsonb_build_object('page_id','94001','form_id','94002','leadgen_id','94004','created_time',ceil(extract(epoch from clock_timestamp()))::bigint)));
select pg_temp.ok((select count(*)=2 from crm_ingestion_jobs where connection_id=(select (v->>'id')::uuid from fixture where k='connection')),'reconciliation-first and replay exactly once');
select pg_temp.ok(jsonb_array_length(crm_claim_meta_jobs(2))=2,'reconciliation jobs claim while realtime disabled');
select pg_temp.ok((select count(*)=0 from crm_submissions),'discovery never creates submissions');
select pg_temp.ok((select count(*)=0 from crm_leads),'discovery never creates leads');
select crm_finish_meta_reconciliation((select (v->>'connection_id')::uuid from fixture where k='lease'),'94002',(select (v->>'lease_token')::uuid from fixture where k='lease'),null);
select pg_temp.ok(crm_claim_meta_reconciliation() is null,'ten-minute cadence');
select set_config('request.jwt.claim.role','authenticated',true);
select crm_save_meta_connection('{"connection_key":"reconciliation-test","page_id":"94001","api_version":"v26.0","access_token_secret_ref":"CRM_META_PAGE_TOKEN_TEST","meta_reconciliation":{"enabled":false,"lookback_minutes":60}}',(select (v->>'id')::uuid from fixture where k='connection'),2);
select pg_temp.ok((select enabled=false and settings #>> '{meta_reconciliation,started_at}' is null from crm_integration_connections where id=(select (v->>'id')::uuid from fixture where k='connection')),'disabling clears watermark');
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.ok((select bool_and(not crm_security.meta_job_allowed(c,j)) from crm_ingestion_jobs j join crm_integration_connections c on c.id=j.connection_id where c.id=(select (v->>'id')::uuid from fixture where k='connection')),'disabled reconciliation revokes old job authority');
select pg_temp.ok(crm_claim_meta_reconciliation() is null,'disabled reconciliation makes no Graph work');
select crm_finalize_meta_job(j.id,j.lease_token,(select (v->>'id')::uuid from fixture where k='mapping'),'{}'::jsonb)
 from crm_ingestion_jobs j where j.external_key='94001:94003';
select pg_temp.ok((select status='blocked' from crm_ingestion_jobs where external_key='94001:94003'),'finalization fenced after reconciliation disable');
select pg_temp.ok((select count(*)=0 from crm_submissions),'disable prevents submission side effects');
rollback;
\echo 'PASS local reconciliation activation, leases, webhook idempotency, disabled realtime and zero CRM side effects'
