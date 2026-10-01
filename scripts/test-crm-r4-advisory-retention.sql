\set ON_ERROR_STOP on
\ir test-crm-r4-advisory-setup.sql
select pg_temp.actor(0);
insert into fx values('lease_lead',pg_temp.intake('888001'));
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
create temp table lease as select * from jsonb_to_recordset(public.crm_claim_external_deliveries(1,true)) x(id uuid,lease_token uuid);
select pg_temp.ok((select count(*)=1 from lease),'retention fixture has a real lease');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join lease using(id);
select public.crm_begin_external_attempt(id,lease_token) from lease;
select pg_temp.actor(1);
insert into fx values('lease_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity',(select id from fx where k='lease_lead'),(select id from fx where k='connection'),'privacy_request'));
select pg_temp.ok(crm_security.lifecycle_stop_closed_at((select id from fx where k='lease_stop')) is null,'started lease/open epoch prevents closure');
select public.crm_disable_lifecycle((select id from fx where k='connection'),(select version from public.crm_integration_connections where id=(select id from fx where k='connection')));
select pg_temp.ok(crm_security.lifecycle_stop_closed_at((select id from fx where k='lease_stop')) is null,'ended epoch still cannot close live lease or unfinished attempt');
select pg_temp.actor(0);
select public.crm_cleanup_lifecycle_retention(100);select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select status='sending' and attempt_boundary_state='started' from public.crm_external_deliveries where id=(select id from lease)),'cleanup preserves actual in-flight lease after epoch end');
update public.crm_external_deliveries set lease_until=now()-interval '1 second' where id=(select id from lease);
select public.crm_cleanup_lifecycle_retention(100);select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select status='unknown' and attempt_boundary_state='unknown' and attempt_count=1 from public.crm_external_deliveries where id=(select id from lease))
 and (select outcome='unknown' and finished_at is not null from public.crm_external_delivery_attempts where delivery_id=(select id from lease)),'expired start finalized honestly unknown and permanently nonreplayable');
select pg_temp.ok(crm_security.lifecycle_stop_closed_at((select id from fx where k='lease_stop')) is not null,'ended immutable epoch plus finalized unknown meets complete closure predicate');
select pg_temp.ok((select closed_at is not null and redacted_at is null from public.crm_lifecycle_sharing_stop_audit where stop_id=(select id from fx where k='lease_stop')),'new closure audit retained for 90 days');
-- Test the deadline without waiting: only synthetic clock columns are aged.
set local session_replication_role=replica;
update public.crm_lifecycle_sharing_stop_audit set closed_at=clock_timestamp()-interval '90 days'+interval '1 hour' where stop_id=(select id from fx where k='lease_stop');
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select redacted_at is null from public.crm_lifecycle_sharing_stop_audit where stop_id=(select id from fx where k='lease_stop')),'opportunity audit retained before exact 90-day deadline');
set local session_replication_role=replica;
update public.crm_lifecycle_sharing_stop_audit set closed_at=clock_timestamp()-interval '90 days'-interval '1 second' where stop_id=(select id from fx where k='lease_stop');
update public.crm_external_deliveries set terminal_at=clock_timestamp()-interval '91 days' where id=(select id from lease);
update public.crm_external_delivery_attempts set finished_at=clock_timestamp()-interval '91 days' where delivery_id=(select id from lease);
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_retention(100);select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select redacted_at is not null and request_id is null and actor_id is null and source_submission_id is null and closure_basis is null and closed_at is null from public.crm_lifecycle_sharing_stop_audit where stop_id=(select id from fx where k='lease_stop')),'audit fully redacts at deadline; payload cleanup does not reset frozen closure');
select pg_temp.ok((select attempt_boundary_state='unknown' and attempt_count=1 and payload_erased_at is not null from public.crm_external_deliveries where id=(select id from lease)), 'D6 payload erasure preserves unknown identity');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='lease_lead'),(select id from fx where k='connection'))='sharing_stopped','minimal opportunity marker survives all cleanup passes');
select pg_temp.actor(1);select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',(select id from lease)),'22023');
-- Contact and handoff details have separate exact clocks, no fake closure.
insert into fx values('contact_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'contact',(select contact_id from public.crm_leads where id=(select id from fx where k='lease_lead')),null,'privacy_request',null,'verified-clock-001'));
select pg_temp.actor(0);insert into fx values('pending',pg_temp.source('888002'));
select pg_temp.actor(1);insert into fx values('pending_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending',(select id from fx where k='pending'),(select id from fx where k='connection'),'privacy_request'));
select pg_temp.actor(0);select crm_security.accept_external_submission((select id from fx where k='pending'));
set local session_replication_role=replica;
update public.crm_lifecycle_sharing_stops set effective_at=clock_timestamp()-interval '90 days'+interval '1 hour' where id=(select id from fx where k='contact_stop');
update public.crm_lifecycle_stop_handoffs set committed_at=clock_timestamp()-interval '90 days'+interval '1 hour' where pending_stop_id=(select id from fx where k='pending_stop');
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select count(*)=2 from public.crm_lifecycle_sharing_stop_audit where stop_id in(select id from fx where k in ('contact_stop','pending_stop')) and redacted_at is null),'contact/pending audit survives before 90 days');
set local session_replication_role=replica;
update public.crm_lifecycle_sharing_stops set effective_at=clock_timestamp()-interval '90 days'-interval '1 second' where id=(select id from fx where k='contact_stop');
update public.crm_lifecycle_stop_handoffs set committed_at=clock_timestamp()-interval '90 days'-interval '1 second' where pending_stop_id=(select id from fx where k='pending_stop');
update public.crm_lifecycle_sharing_stop_audit set closed_at=clock_timestamp()-interval '90 days'-interval '1 second' where stop_id=(select id from fx where k='pending_stop');
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select count(*)=2 from public.crm_lifecycle_sharing_stop_audit where stop_id in(select id from fx where k in ('contact_stop','pending_stop')) and redacted_at is not null and closed_at is null),'contact/pending audit redacts at 90 days, no residual closure detail');
select pg_temp.ok(exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id=(select id from fx where k='pending_stop')),'opaque handoff survives audit erasure');
rollback;
\echo PASS full closure, active lease, expired unknown, exact 90-day clocks, D6 erasure and permanent tombstones
