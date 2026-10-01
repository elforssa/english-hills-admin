\set ON_ERROR_STOP on
\ir test-crm-r4-advisory-setup.sql

-- Existing policies default required; future advisory manifests may omit all D2.
select pg_temp.ok((select d2_requirement='advisory' and notice_version is null and adult_field_key is null from public.crm_lifecycle_eligibility_policies where id='8c000000-0000-0000-0000-000000000011'),'advisory mode is frozen separately from optional evidence');
select pg_temp.denied($q$update public.crm_lifecycle_eligibility_policies set d2_requirement='required' where id='8c000000-0000-0000-0000-000000000011'$q$,'42501');
insert into fx values('history',pg_temp.intake('98765432109876543210987654321012'));
create temp table stage_order(activity_id uuid primary key,ordinal integer generated always as identity);
create function pg_temp.stamp_history() returns void language sql as $$
 insert into stage_order(activity_id) select id from public.crm_activities where lead_id=(select id from fx where k='history')
 and event_type in ('lead_created','lead_reopened','lead_not_qualified','lead_lost','lead_qualified','lead_converted') and id not in(select activity_id from stage_order)
$$;
select pg_temp.stamp_history();
select pg_temp.actor(1);
select pg_temp.act('close_not_qualified',(select id from fx where k='history'),'{"reason":"outside_scope"}');
select pg_temp.stamp_history();
select pg_temp.act('reopen_lead',(select id from fx where k='history'),jsonb_build_object('reason','Synthetic renewed inquiry','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')));
select pg_temp.stamp_history();
select pg_temp.qualify((select id from fx where k='history'));
select pg_temp.stamp_history();
select pg_temp.act('close_lost',(select id from fx where k='history'),'{"reason":"price"}');
select pg_temp.stamp_history();
select pg_temp.act('reopen_lead',(select id from fx where k='history'),jsonb_build_object('reason','Synthetic renewed inquiry','next_task',jsonb_build_object('task_type','callback','due_at',now()+interval '1 day')));
select pg_temp.stamp_history();
select pg_temp.qualify((select id from fx where k='history'));
select pg_temp.stamp_history();
insert into fx values('enrollment',pg_temp.enroll((select id from fx where k='history')));
update public.enrollments set status='Confirmed' where id=(select id from fx where k='enrollment');set constraints all immediate;set constraints all deferred;
select pg_temp.stamp_history();
set local session_replication_role=replica;
with base as(select occurred_at,created_at from public.crm_activities where lead_id=(select id from fx where k='history') and event_type='lead_created') update public.crm_activities a set occurred_at=base.occurred_at+o.ordinal*interval '1 millisecond',created_at=base.created_at+o.ordinal*interval '1 microsecond' from stage_order o cross join base where a.id=o.activity_id;
set local session_replication_role=origin;
select pg_temp.actor(0);
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok((select count(distinct event_kind)=5 and count(*)=6 and bool_and(eligibility_evidence_id is null) from public.crm_external_deliveries where lead_id=(select id from fx where k='history')),'all five events and genuine Qualified reentry are admitted without a grant');
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_eligibility_evidence),'absence never becomes fabricated grant');
select pg_temp.ok((select bool_and(case when event_kind='intake' then crm_security.lifecycle_hold(d) is null else crm_security.lifecycle_hold(d)='unattempted_predecessor' end) from public.crm_external_deliveries d where lead_id=(select id from fx where k='history')),'grantless delivery retains chronological predecessor holds');

-- Every actual payload is projected from protected original attribution, not proof.
do $$ declare c record;d public.crm_external_deliveries;got jsonb;payload jsonb;n integer:=0;begin
 loop
  select x.* into c from jsonb_to_recordset(public.crm_claim_external_deliveries(1,true)) x(id uuid,lease_token uuid);exit when c.id is null;
  select * into d from public.crm_external_deliveries where id=c.id;
  got:=public.crm_get_external_delivery(c.id,c.lease_token);
  perform pg_temp.ok(got->'matching'=jsonb_build_object('lead_id','98765432109876543210987654321012'),'exact 32-character original ID with no adult fabrication');
  payload:=pg_temp.payload(d);
  perform pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',c.id,c.lease_token,jsonb_set(payload,'{data,0,user_data,lead_id}','"later-id"')),'22023');
  perform pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',c.id,c.lease_token,jsonb_set(payload,'{data,0,user_data,em}','["hash"]')),'22023');
  perform pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',c.id,c.lease_token,jsonb_set(payload,'{data,0,custom_data,value}','100')),'22023');
  perform public.crm_prepare_external_delivery(c.id,c.lease_token,payload);
  perform public.crm_begin_external_attempt(c.id,c.lease_token);
  perform public.crm_finish_external_attempt(c.id,c.lease_token,'{"outcome":"sent","http_status":200}');n:=n+1;
 end loop;
 perform pg_temp.ok(n=6,'six genuine occurrences traverse protected get/prepare/begin/finish without HTTP');
end $$;

-- Inquiry refusal is scoped to exact opportunity+destination, all later kinds.
insert into fx values('stopped',pg_temp.intake('883010'));
insert into fx values('sibling',pg_temp.intake('883011'));
update public.crm_leads set contact_id=(select contact_id from public.crm_leads where id=(select id from fx where k='stopped')) where id=(select id from fx where k='sibling');
select pg_temp.actor(1);
insert into fx values('op_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity',(select id from fx where k='stopped'),(select id from fx where k='connection'),'inquiry_refusal'));
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='stopped'),(select id from fx where k='connection'))='sharing_stopped'
 and crm_security.lifecycle_stop_hold((select id from fx where k='sibling'),(select id from fx where k='connection')) is null,'opportunity refusal does not broaden to contact');
select pg_temp.act('close_lost',(select id from fx where k='stopped'),'{"reason":"postponed"}');
select pg_temp.actor(0);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='stopped')),'stop before admission prevents ownership');
select pg_temp.actor(1);
insert into fx values('contact_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'contact',(select contact_id from public.crm_leads where id=(select id from fx where k='stopped')),null,'privacy_request',null,'verified-case-001'));
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='sibling'),(select id from fx where k='connection'))='sharing_stopped','verified broad request covers sibling opportunity');
select pg_temp.denied(format('select public.crm_stop_lifecycle_sharing(gen_random_uuid(),''contact'',%L,null,''privacy_request'')',(select contact_id from public.crm_leads where id=(select id from fx where k='stopped'))),'22023');
select pg_temp.actor(0);
insert into fx values('future_contact',pg_temp.intake('883012'));
update public.crm_leads set contact_id=(select contact_id from public.crm_leads where id=(select id from fx where k='stopped')) where id=(select id from fx where k='future_contact');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='future_contact'),gen_random_uuid())='sharing_stopped','broad contact marker applies to future opportunities and different native destinations');
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='future_contact')),'future contact scope cannot acquire native owner');

-- Grantless prepared lease is not send permission. Begin-first may finish actual outcome.
insert into fx values('prepared',pg_temp.intake('883020'));
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
create temp table prepared as select x.id,x.lease_token from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,true)) x(id uuid,lease_token uuid) join public.crm_external_deliveries d on d.id=x.id where d.lead_id=(select id from fx where k='prepared');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join prepared p on p.id=d.id;
select pg_temp.actor(1);
select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity',(select id from fx where k='prepared'),(select id from fx where k='connection'),'privacy_request');
select pg_temp.actor(0);
select pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',id,lease_token),'42501') from prepared;
select pg_temp.ok(not exists(select 1 from public.crm_external_delivery_attempts where delivery_id in(select id from prepared)),'stop-first leaves no attempt or boundary');
select pg_temp.actor(1);select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',id),'22023') from prepared;
select pg_temp.actor(0);
insert into fx values('begun',pg_temp.intake('883021'));
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
create temp table begun as select x.* from jsonb_to_recordset(crm_security.claim_lifecycle_deliveries(100,true)) x(id uuid,lease_token uuid) join public.crm_external_deliveries d using(id) where d.lead_id=(select id from fx where k='begun');
select public.crm_prepare_external_delivery(d.id,d.lease_token,pg_temp.payload(d)) from public.crm_external_deliveries d join begun p on p.id=d.id;
select public.crm_begin_external_attempt(id,lease_token) from begun;
select pg_temp.actor(1);select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity',(select id from fx where k='begun'),(select id from fx where k='connection'),'privacy_request');
select pg_temp.actor(0);select public.crm_finish_external_attempt(id,lease_token,'{"outcome":"unknown","error_code":"timeout"}') from begun;
select pg_temp.ok((select bool_and(attempt_boundary_state='unknown' and status='unknown' and attempt_count=1) from public.crm_external_deliveries where id in(select id from begun)),'begin-first preserves actual unknown rather than a false suppression receipt');
select pg_temp.actor(1);select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',id),'22023') from begun;

-- A later resolved submission is audit provenance; first-touch identity never changes.
select pg_temp.actor(0);
insert into fx values('later_target',pg_temp.intake('883030'));
insert into fx values('later_source',pg_temp.source('883031'));
select crm_security.accept_external_submission((select id from fx where k='later_source'),null,(select id from fx where k='later_target'));
create temp table original_source as select l.id,l.first_submission_id,a.external_submission_id from public.crm_leads l join public.crm_submission_attribution a on a.submission_id=l.first_submission_id where l.id=(select id from fx where k='later_target');
select pg_temp.actor(1);select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity',(select id from fx where k='later_target'),(select id from fx where k='connection'),'inquiry_refusal',(select id from fx where k='later_source'));
select pg_temp.ok((select l.first_submission_id=o.first_submission_id and a.external_submission_id=o.external_submission_id from original_source o join public.crm_leads l using(id) join public.crm_submission_attribution a on a.submission_id=l.first_submission_id),'later objection retains original acquisition and original Meta ID');

-- Pending scope remains immutable and is atomically handed off on resolution.
select pg_temp.actor(0);insert into fx values('pending_source',pg_temp.source('883040'));
select pg_temp.actor(1);insert into fx values('pending_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending',(select id from fx where k='pending_source'),(select id from fx where k='connection'),'inquiry_refusal'));
select pg_temp.actor(0);insert into fx values('pending_lead',crm_security.accept_external_submission((select id from fx where k='pending_source')));
select pg_temp.ok(exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id=(select id from fx where k='pending_stop'))
 and crm_security.lifecycle_stop_hold((select id from fx where k='pending_lead'),(select id from fx where k='connection'))='sharing_stopped','resolution commits final marker and immutable pending handoff');
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id=(select id from fx where k='pending_lead')),'pending handoff precedes native admission');

-- Optional proof is truthful: an empty manifest cannot manufacture a grant.
select public.crm_record_lifecycle_evidence_check((select first_submission_id from public.crm_leads where id=(select id from fx where k='prepared')),'8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('c',64));
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_eligibility_evidence),'SQL cannot mint an empty-manifest grant even if worker reports eligible');
select pg_temp.ok((select bool_and(crm_security.lifecycle_hold(d)='sharing_stopped') from public.crm_external_deliveries d where lead_id=(select id from fx where k='prepared')),'proof collection never releases stopped subject');

-- Source redaction independently holds an otherwise eligible grantless lead.
select pg_temp.actor(0);insert into fx values('redacted',pg_temp.intake('883050'));select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
update public.crm_submission_attribution set redacted_at=clock_timestamp(),fbclid=null,fbc=null,fbp=null,consent_evidence=null,raw_payload=null
 where submission_id=(select first_submission_id from public.crm_leads where id=(select id from fx where k='redacted'));
select pg_temp.ok((select crm_security.lifecycle_route((select id from fx where k='redacted'))->>'reason'='identity_redacted'),'source identity erasure cannot become optional-proof erasure');

-- Retention never mistakes open-epoch terminal rows for permanent closure.
select pg_temp.ok(crm_security.lifecycle_stop_closed_at((select id from fx where k='op_stop')) is null,'open epoch/no owner does not certify closure from stop alone');
select pg_temp.denied(format('update public.crm_lifecycle_sharing_stop_audit set closed_at=now()-interval ''100 days'',closure_basis=''epoch_ended'' where stop_id=%L',(select id from fx where k='op_stop')),'42501');
select pg_temp.denied(format('delete from public.crm_lifecycle_sharing_stops where id=%L',(select id from fx where k='op_stop')),'42501');
select pg_temp.denied('truncate public.crm_lifecycle_sharing_stops cascade','42501');
select pg_temp.denied(format('update public.crm_lifecycle_sharing_stop_audit set request_id=null,actor_id=null,source_class=null,source_submission_id=null,decision_reference=null,recorded_at=null,redacted_at=now() where stop_id=%L',(select id from fx where k='contact_stop')),'42501');
set local session_replication_role=replica;
update public.crm_lifecycle_sharing_stops set effective_at=clock_timestamp()-interval '91 days' where id=(select id from fx where k='contact_stop');
update public.crm_lifecycle_stop_handoffs set committed_at=clock_timestamp()-interval '91 days' where pending_stop_id=(select id from fx where k='pending_stop');
set local session_replication_role=origin;
select crm_security.lifecycle_cleanup_stop_audit(500);
select pg_temp.ok((select redacted_at is not null and closed_at is null and actor_id is null and source_class is null and request_id is null and decision_reference is null from public.crm_lifecycle_sharing_stop_audit where stop_id=(select id from fx where k='contact_stop')),'contact audit redacts at 90 days without false permanent closure');
select pg_temp.ok((select redacted_at is not null from public.crm_lifecycle_sharing_stop_audit where stop_id=(select id from fx where k='pending_stop'))
 and exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id=(select id from fx where k='pending_stop')),'pending audit redacts after handoff while minimal handoff survives');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='future_contact'),(select id from fx where k='connection'))='sharing_stopped','audit detail erasure preserves broad future suppression');

-- Director-only RPC and closed direct-access role matrix.
select pg_temp.actor(2);
select pg_temp.denied(format('select public.crm_stop_lifecycle_sharing(gen_random_uuid(),''opportunity'',%L,%L,''privacy_request'')',(select id from fx where k='history'),(select id from fx where k='connection')),'42501');
select pg_temp.denied('select public.crm_lifecycle_diagnostics()','42501');
select pg_temp.denied(format('select public.crm_publish_lifecycle_policy(%L,1,''{}'')',(select id from fx where k='connection')),'42501');
set local role authenticated;
select pg_temp.denied('select * from public.crm_lifecycle_sharing_stops','42501');
select pg_temp.denied('select * from public.crm_lifecycle_sharing_stop_audit','42501');
select pg_temp.denied('insert into public.crm_lifecycle_sharing_stops(scope,reason_class) values(''contact'',''privacy_request'')','42501');
reset role;
rollback;
\echo PASS advisory R4 grantless five events, original identity, scopes, handoff, truthful evidence, retention and authorization
