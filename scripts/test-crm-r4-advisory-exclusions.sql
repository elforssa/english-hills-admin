\set ON_ERROR_STOP on
\ir test-crm-r4-advisory-setup.sql
select pg_temp.actor(0);
insert into fx values('website_source',pg_temp.source('889001'));
set local session_replication_role=replica;
update public.crm_submissions set channel='website' where id=(select id from fx where k='website_source');
update public.crm_submission_attribution set provider='website',external_submission_id=null,page_id=null,form_id=null where submission_id=(select id from fx where k='website_source');
set local session_replication_role=origin;
insert into fx values('website_lead',crm_security.accept_external_submission((select id from fx where k='website_source')));
insert into fx values('later_meta',pg_temp.source('889002'));
select crm_security.accept_external_submission((select id from fx where k='later_meta'),null,(select id from fx where k='website_lead'));
-- Current Yearly belongs to the excluded existing cohort, even with new proof.
insert into public.crm_form_mappings(id,connection_id,channel,form_key,version,form_name,field_map,effective_from,created_by)
 values('8c000000-0000-0000-0000-000000000090',(select id from fx where k='connection'),'meta_instant_form','1086266294126723',1,'Current Yearly','{}','2020-01-01Z','8c000000-0000-0000-0000-000000000001');
insert into fx values('yearly_source',pg_temp.source('889003'));
set local session_replication_role=replica;
update public.crm_submissions set form_mapping_id='8c000000-0000-0000-0000-000000000090' where id=(select id from fx where k='yearly_source');
update public.crm_submission_attribution set form_id='1086266294126723' where submission_id=(select id from fx where k='yearly_source');
set local session_replication_role=origin;
insert into fx values('yearly_lead',crm_security.accept_external_submission((select id from fx where k='yearly_source')));
insert into fx values('old_meta',pg_temp.intake('889004',false,(select started_at from public.crm_lifecycle_activation_epochs where id=(select id from fx where k='epoch'))-interval '1 second'));
insert into fx values('late_old',pg_temp.source('889005'));
select crm_security.accept_external_submission((select id from fx where k='late_old'),null,(select id from fx where k='old_meta'));
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id in(select id from fx where k in ('website_lead','yearly_lead','old_meta'))),'website-first, later-Meta, Yearly and historical first-source remain excluded in advisory mode');
select pg_temp.ok((select first_submission_id=(select id from fx where k='website_source') from public.crm_leads where id=(select id from fx where k='website_lead')),'later Meta cannot rewrite website acquisition');
-- Disabled period source stays before the new activation floor after reopening.
select pg_temp.actor(1);select public.crm_disable_lifecycle((select id from fx where k='connection'),(select version from public.crm_integration_connections where id=(select id from fx where k='connection')));
select pg_temp.actor(0);insert into fx values('disabled_lead',pg_temp.intake('889006'));
set local session_replication_role=replica;
with ep as(insert into public.crm_lifecycle_activation_epochs(connection_id,provider_contract_id,started_at,activated_by)
 values((select id from fx where k='connection'),'8c000000-0000-0000-0000-000000000010',clock_timestamp(),'release_operator') returning id,started_at)
 update public.crm_integration_connections cc set lifecycle_settings=cc.lifecycle_settings||jsonb_build_object('enabled',true,'activation_epoch_id',ep.id,'live_started_at',ep.started_at) from ep where cc.id=(select id from fx where k='connection');
set local session_replication_role=origin;
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='disabled_lead')),'disabled-period first source cannot move into a later epoch');
-- A genuinely new source in the new epoch admits and retains independent guards.
insert into fx values('current_lead',pg_temp.intake('889007',false,clock_timestamp()));
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='current_lead')),'genuinely prospective new source admits without custom proof');
select pg_temp.denied(format('update public.crm_lifecycle_producer_ownership set producer=''legacy'' where lead_id=%L',(select id from fx where k='current_lead')),'42501');
select pg_temp.denied(format($q$insert into public.crm_lifecycle_producer_ownership(lead_id,connection_id,boundary_id,activation_epoch_id,producer)
 select lead_id,connection_id,boundary_id,activation_epoch_id,'legacy' from public.crm_lifecycle_producer_ownership where lead_id=%L$q$,(select id from fx where k='current_lead')),'23505');
create temp table deadline_before as select id,send_deadline from public.crm_external_deliveries where lead_id=(select id from fx where k='current_lead');
select pg_temp.denied(format('update public.crm_external_deliveries set send_deadline=now()+interval ''100 days'' where id=%L',(select id from deadline_before)),'42501');
-- Unverified pointers fail closed and cannot establish a new suppression identity.
insert into fx values('unverified',pg_temp.intake('889008',false,clock_timestamp()));
set local session_replication_role=replica;
update public.crm_contacts set merged_into_contact_id=(select contact_id from public.crm_leads where id=(select id from fx where k='current_lead')) where id=(select contact_id from public.crm_leads where id=(select id from fx where k='unverified'));
set local session_replication_role=origin;
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='unverified'),(select id from fx where k='connection'))='identity_unverified'
 and not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='unverified')),'unverified identity pointer fails closed for admission');
rollback;
\echo PASS advisory website/later-Meta/Yearly/old/disabled exclusions, duplicate ownership, frozen deadline and unverified identity guards
