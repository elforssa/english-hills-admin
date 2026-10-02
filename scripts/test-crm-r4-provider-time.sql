-- H3-02 strict exported seconds, synthetic only; no HTTP. Run with both D2 modes.
\set ON_ERROR_STOP on
\if :{?d2_requirement}
\else
\set d2_requirement advisory
\endif
\ir test-crm-r4-advisory-setup.sql
set local session_replication_role=replica;
update public.crm_lifecycle_eligibility_policies set d2_requirement=:'d2_requirement',
 adult_field_key='adult_confirmed',adult_accepted_values='["yes"]',sharing_field_key='meta_share',sharing_accepted_values='["yes"]',sharing_refused_values='["no"]',safety_decision_reference='synthetic-time-review',
 notice_version='notice-r4',notice_field_key='notice_version',notice_accepted_values='["notice-r4"]',notice_text_digest=repeat('a',64)
 where id='8c000000-0000-0000-0000-000000000011';
update public.crm_lifecycle_producer_boundaries set notice_version='notice-r4',notice_text_digest=repeat('a',64)
 where id='8c000000-0000-0000-0000-000000000012';
set local session_replication_role=origin;
create function pg_temp.time_case(external_id text,delta interval) returns uuid language plpgsql as $$
declare l uuid;begin
 l:=pg_temp.intake(external_id,true,date_trunc('second',now()-interval '20 seconds')+interval '100 milliseconds');
 -- Synthetic activity clocks only; production fact timestamps remain immutable.
 execute 'set local session_replication_role=replica';
 update public.crm_activities a set occurred_at=s.occurred_at+delta from public.crm_leads lead join public.crm_submissions s on s.id=lead.first_submission_id
 where a.lead_id=l and lead.id=l and a.event_type='lead_created';
 execute 'set local session_replication_role=origin';return l;
end $$;
insert into fx values('equal',pg_temp.time_case('886001',interval '0 seconds')),
 ('subsecond',pg_temp.time_case('886002',interval '800 milliseconds')),
 ('earlier',pg_temp.time_case('886003',interval '-1 second')),
 ('after',pg_temp.time_case('886004',interval '1 second'));
select pg_temp.actor(1);select pg_temp.qualify((select id from fx where k='equal'));
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
create temp table time_before as select id,provider_event_id,event_time,send_deadline,activity_id,attribution_submission_id,payload_hash from public.crm_external_deliveries;
select pg_temp.ok((select count(*)=3 and bool_and(status='blocked' and last_error_code='provider_time_not_after_source'
 and attempt_boundary_state='not_started' and attempt_count=0 and terminal_at is null)
 from public.crm_external_deliveries where lead_id in(select id from fx where k in ('equal','subsecond','earlier')) and event_kind='intake'),
 'equality, floored subsecond equality and -1s are held, never attempted or terminalized');
select pg_temp.ok((select crm_security.lifecycle_hold(d)='unattempted_predecessor' from public.crm_external_deliveries d
 where lead_id=(select id from fx where k='equal') and event_kind='qualified'),'later genuine stage retains existing predecessor consequence');
-- Direct calls cannot evade reconciliation/claim. Synthetic stale lease simulates an older caller.
update public.crm_external_deliveries set status='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where lead_id in(select id from fx where k in ('equal','subsecond','earlier')) and event_kind='intake';
do $$declare d public.crm_external_deliveries;begin
 for d in select * from public.crm_external_deliveries where lead_id in(select id from fx where k in ('equal','subsecond','earlier')) and event_kind='intake' loop
  perform pg_temp.ok(crm_security.lifecycle_hold(d)='provider_time_not_after_source','pure hold agrees with reconciliation');
  perform pg_temp.denied(format('select public.crm_get_external_delivery(%L,%L)',d.id,d.lease_token));
  perform pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',d.id,d.lease_token,pg_temp.payload(d)));
  -- Frozen equal-second payload from pre-104 software still cannot cross committed begin.
  execute 'set local session_replication_role=replica';
  update public.crm_external_deliveries set payload=pg_temp.payload(d),payload_hash=repeat('b',64) where id=d.id;
  execute 'set local session_replication_role=origin';
  perform pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',d.id,d.lease_token));
 end loop;
end $$;
update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null
 where lead_id in(select id from fx where k in ('equal','subsecond','earlier')) and event_kind='intake';
select pg_temp.actor(1);
select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',d.id),'22023') from public.crm_external_deliveries d
 where lead_id in(select id from fx where k in ('equal','subsecond','earlier')) and event_kind='intake';
select pg_temp.denied(format('update public.crm_external_deliveries set event_time=event_time+interval ''1 second'' where id=%L',d.id)) from public.crm_external_deliveries d where lead_id=(select id from fx where k='equal') and event_kind='intake';
select pg_temp.actor(0);
create temp table valid_claim as select x.* from jsonb_to_recordset(public.crm_claim_external_deliveries(3,true)) x(id uuid,lease_token uuid);
select pg_temp.ok((select count(*)=1 from valid_claim),'only +1s intake can be claimed; later stage cannot overtake');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join valid_claim c on c.id=d.id;
-- Revalidate source even after prepare: missing authentic generation / invalid clocks fail closed.
do $$declare d public.crm_external_deliveries;s public.crm_submissions;bad text;begin
 select dd.* into strict d from public.crm_external_deliveries dd join valid_claim c on c.id=dd.id;
 select * into strict s from public.crm_submissions where id=d.attribution_submission_id;
 foreach bad in array array['equal','server','zero','infinity'] loop
  execute 'set local session_replication_role=replica';
  update public.crm_submissions set occurred_at=case bad when 'equal' then d.event_time when 'zero' then '1970-01-01Z'::timestamptz
   when 'infinity' then 'infinity'::timestamptz else s.occurred_at end,time_source=case when bad='server' then 'server' else 'provider' end where id=s.id;
  execute 'set local session_replication_role=origin';
  perform pg_temp.ok(crm_security.lifecycle_hold(d)='provider_time_not_after_source','invalid original generation held after prepare');
  perform pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',d.id,d.lease_token,d.payload));
  perform pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',d.id,d.lease_token));
 end loop;
 execute 'set local session_replication_role=replica';
 update public.crm_submissions set occurred_at=s.occurred_at,time_source=s.time_source where id=s.id;
 execute 'set local session_replication_role=origin';
end $$;
select pg_temp.ok(not exists(select 1 from public.crm_external_delivery_attempts),'invalid timestamp paths create zero attempts');
select public.crm_begin_external_attempt(id,lease_token) from valid_claim;
select public.crm_finish_external_attempt(id,lease_token,'{"outcome":"unknown","error_code":"timeout"}') from valid_claim;
select pg_temp.actor(1);select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',id),'22023') from valid_claim;
select pg_temp.actor(0);select public.crm_claim_external_deliveries(3,true);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok((select count(*)=1 and bool_and(outcome='unknown') from public.crm_external_delivery_attempts),'uncertain +1s identity is never replayed');
select pg_temp.ok(not exists(select 1 from public.crm_external_deliveries d join time_before b using(id)
 where row(d.provider_event_id,d.event_time,d.send_deadline,d.activity_id,d.attribution_submission_id) is distinct from
 row(b.provider_event_id,b.event_time,b.send_deadline,b.activity_id,b.attribution_submission_id)),'IDs, truth clocks, deadlines and original source remain unchanged');
-- Existing stored-role/ACL restrictions still guard changed and transitive entry points.
do $$declare r text;d public.crm_external_deliveries;begin
 select dd.* into d from public.crm_external_deliveries dd join valid_claim c on c.id=dd.id;
 perform pg_temp.actor(2);
 foreach r in array array['admin','receptionist','teacher','parent','student','director'] loop
  update public.profiles set role=r where id='8c000000-0000-0000-0000-000000000002';
  perform pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',d.id,gen_random_uuid(),d.payload));
  perform pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',d.id,gen_random_uuid()));
  if r<>'director' then perform pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',d.id));end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.ok(not has_function_privilege(r,'crm_security.lifecycle_hold(public.crm_external_deliveries)','EXECUTE'),'pure hold ACL unchanged');
 end loop;
end $$;
select pg_temp.actor(0);
-- Deadline cleanup remains authoritative even for the new immutable time hold.
set local session_replication_role=replica;
update public.crm_external_deliveries set send_deadline=now()-interval '1 second' where lead_id=(select id from fx where k='equal');
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_retention(100);
select pg_temp.ok((select bool_and(status='suppressed' and terminal_at is not null and attempt_count=0)
 from public.crm_external_deliveries where lead_id=(select id from fx where k='equal')),'deadline retention closes held occurrences without fabricated attempts');
set local session_replication_role=replica;
update public.crm_external_deliveries set terminal_at=now()-interval '31 days' where lead_id=(select id from fx where k='equal');
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_retention(100);
select pg_temp.ok((select bool_and(payload is null and payload_hash is null and payload_erased_at is not null)
 from public.crm_external_deliveries where lead_id=(select id from fx where k='equal')),'held prepared payload follows existing 30-day erasure');
rollback;
\echo PASS H3-02 exported-second reconciliation/get/prepare/begin/retry, predecessor, roles, unknown and retention
