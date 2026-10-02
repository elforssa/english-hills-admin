-- Stateful compatibility upgrade: synthetic prepared payloads, no provider call.
\set ON_ERROR_STOP on
\ir test-crm-r4-advisory-setup.sql
select pg_temp.ok((select max(version::integer)=103 from supabase_migrations.schema_migrations),'starts at 103');
insert into fx values('equal',pg_temp.intake('886801',false,now()-interval '10 seconds')),('after',pg_temp.intake('886802'));
set local session_replication_role=replica;
update public.crm_activities set occurred_at=now()-interval '10 seconds' where lead_id=(select id from fx where k='equal') and event_type='lead_created';
set local session_replication_role=origin;
select pg_temp.actor(1);select pg_temp.qualify((select id from fx where k='equal'));
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
create temp table claims as select x.* from jsonb_to_recordset(public.crm_claim_external_deliveries(3,true)) x(id uuid,lease_token uuid);
select pg_temp.ok((select count(*)=2 from claims),'103 claims both equal and +1s Intake');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join claims c on c.id=d.id;
select pg_temp.ok((select count(*)=2 from public.crm_external_deliveries where payload is not null),'both payloads genuinely prepared through 103 RPC');
create table public.h3_upgrade_snapshot(k text primary key,data jsonb);
do $$declare t text;begin
 foreach t in array array['crm_submissions','crm_submission_attribution','crm_activities','crm_integration_connections','crm_lifecycle_provider_contracts',
  'crm_lifecycle_eligibility_policies','crm_lifecycle_eligibility_evidence','crm_lifecycle_eligibility_checks','crm_lifecycle_producer_boundaries',
  'crm_lifecycle_producer_ownership','crm_lifecycle_activation_epochs','crm_external_deliveries','crm_external_delivery_attempts','crm_lifecycle_sharing_stops','crm_lifecycle_retry_audit'] loop
  execute format('insert into public.h3_upgrade_snapshot select %L,coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t',t,t);
 end loop;
end $$;
insert into public.h3_upgrade_snapshot select 'acl',jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'acl',p.proacl,'owner',p.proowner,'definer',p.prosecdef,'config',p.proconfig) order by p.oid::regprocedure::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security') and p.proname in
 ('lifecycle_hold','crm_reconcile_external_deliveries','crm_get_external_delivery','crm_prepare_external_delivery','crm_begin_external_attempt','crm_retry_external_delivery');
commit;
\echo PASS synthetic 103 prepared equality/+1s and unchanged-inventory/ACL snapshot
