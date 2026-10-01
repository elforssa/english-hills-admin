\set ON_ERROR_STOP on
\ir test-crm-r4-advisory-setup.sql
-- Configure reviewed exact typed facts on a synthetic manifest, before admission.
set local session_replication_role=replica;
update public.crm_lifecycle_eligibility_policies set adult_field_key='adult_confirmed',adult_accepted_values='["yes"]',
 sharing_field_key='meta_share',sharing_accepted_values='["yes",true]',sharing_refused_values='["no",false]',
 prohibited_field_key='source_safety',prohibited_values='["restricted"]',safety_decision_reference='synthetic-review-001'
 where id='8c000000-0000-0000-0000-000000000011';
set local session_replication_role=origin;
-- New policies validate future-only groups, closed mode and disjoint safety maps.
select pg_temp.actor(1);
select pg_temp.denied(format('select public.crm_publish_lifecycle_policy(%L,%s,%L::jsonb)',
 (select id from fx where k='connection'),(select version from public.crm_integration_connections where id=(select id from fx where k='connection')),
 jsonb_build_object('form_mapping_id',(select id from fx where k='mapping'),'d2_requirement','unknown','effective_from',now()+interval '8 days','effective_until',now()+interval '9 days')),'22023');
select pg_temp.denied(format('select public.crm_publish_lifecycle_policy(%L,%s,%L::jsonb)',
 (select id from fx where k='connection'),(select version from public.crm_integration_connections where id=(select id from fx where k='connection')),
 jsonb_build_object('form_mapping_id',(select id from fx where k='mapping'),'d2_requirement','advisory','adult_field_key','adult','effective_from',now()+interval '8 days','effective_until',now()+interval '9 days')),'22023');
select pg_temp.denied(format('select public.crm_publish_lifecycle_policy(%L,%s,%L::jsonb)',
 (select id from fx where k='connection'),(select version from public.crm_integration_connections where id=(select id from fx where k='connection')),
 jsonb_build_object('form_mapping_id',(select id from fx where k='mapping'),'d2_requirement','advisory','effective_from',now()-interval '1 day','effective_until',now()+interval '9 days')),'22023');
select pg_temp.actor(0);
insert into fx values('missing_source',pg_temp.source('884001')),('ambiguous_source',pg_temp.source('884002')),
 ('refusal_source',pg_temp.source('884003')),('restricted_source',pg_temp.source('884004')),('truth_source',pg_temp.source('884005'));
set local session_replication_role=replica;
update public.crm_submissions set form_answers='[]' where id=(select id from fx where k='missing_source');
update public.crm_submissions set form_answers='[{"key":"adult_confirmed","value":"yes","label":"adult_confirmed","value_type":"string","label_source":"provider"},{"key":"adult_confirmed","value":"yes","label":"adult_confirmed","value_type":"string","label_source":"provider"}]' where id=(select id from fx where k='ambiguous_source');
update public.crm_submissions set form_answers='[{"key":"meta_share","value":false,"label":"meta_share","value_type":"boolean","label_source":"provider"}]' where id=(select id from fx where k='refusal_source');
update public.crm_submissions set form_answers='[{"key":"source_safety","value":"restricted","label":"source_safety","value_type":"string","label_source":"provider"}]' where id=(select id from fx where k='restricted_source');
set local session_replication_role=origin;
insert into fx select replace(k,'_source','_lead'),crm_security.accept_external_submission(id) from fx where k in ('missing_source','ambiguous_source','refusal_source','restricted_source','truth_source') order by k;
-- No evaluator ran: safety SQL still persists actual facts and blocks admission.
select public.crm_reconcile_external_deliveries(100);select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok((select count(*)=3 from public.crm_lifecycle_producer_ownership where lead_id in(select id from fx where k in ('missing_lead','ambiguous_lead','truth_lead'))),'missing/ambiguous optional proofs do not prevent ownership');
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id in(select id from fx where k in ('refusal_lead','restricted_lead'))),'typed refusal and independently prohibited facts prevent ownership');
select pg_temp.ok((select count(*)=2 from public.crm_lifecycle_sharing_stops where lead_id in(select id from fx where k in ('refusal_lead','restricted_lead'))),'refusal/restriction persist without optional evaluator');
select public.crm_record_lifecycle_evidence_check((select id from fx where k='missing_source'),'8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('c',64));
select public.crm_record_lifecycle_evidence_check((select id from fx where k='ambiguous_source'),'8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('c',64));
select pg_temp.ok((select count(*)=2 and bool_and(not eligible) from public.crm_lifecycle_eligibility_checks),'worker cannot fabricate missing/ambiguous proof');
select public.crm_record_lifecycle_evidence_check((select id from fx where k='truth_source'),'8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('c',64));
select pg_temp.ok((select count(*)=1 from public.crm_lifecycle_eligibility_evidence where event_type='grant'),'complete exact configured proof has an honest optional grant');
select pg_temp.actor(1);select public.crm_revoke_lifecycle_evidence(gen_random_uuid(),(select id from public.crm_lifecycle_eligibility_evidence where event_type='grant'),'privacy_request');
select pg_temp.actor(0);select public.crm_record_lifecycle_evidence_check((select id from fx where k='truth_source'),'8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('c',64));
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='truth_lead'),(select id from fx where k='connection'))='sharing_stopped','regrant/idempotent evidence cannot release withdrawal');
-- Broad pending request cannot be automatically narrowed on identity resolution.
insert into fx values('broad_source',pg_temp.source('884010'));
select pg_temp.actor(1);insert into fx values('broad_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending',
 (select id from fx where k='broad_source'),(select id from fx where k='connection'),'privacy_request',null,null,true));
select pg_temp.actor(0);
select pg_temp.denied(format('select crm_security.accept_external_submission(%L)',(select id from fx where k='broad_source')),'22023');
select pg_temp.ok((select lead_id is null and match_status='needs_review' from public.crm_submissions where id=(select id from fx where k='broad_source')),'failed broad handoff rolls back identity and remains unresolved');
select pg_temp.actor(1);insert into fx values('broad_final',public.crm_bind_pending_lifecycle_stop(gen_random_uuid(),(select id from fx where k='broad_stop'),
 (select contact_id from public.crm_leads where id=(select id from fx where k='missing_lead')),null,'verified-review-001'));
select pg_temp.actor(0);
select pg_temp.denied(format('select crm_security.accept_external_submission(%L,null,%L)',(select id from fx where k='broad_source'),(select id from fx where k='truth_lead')),'22023');
select crm_security.accept_external_submission((select id from fx where k='broad_source'),null,(select id from fx where k='missing_lead'));
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='missing_lead'),(select id from fx where k='connection'))='sharing_stopped','verified broad binding survives trusted resolution');
-- Immutable alias/root continuity and monotonic carries; no fuzzy matching.
insert into fx values('alias_target',pg_temp.intake('884011'));
update public.crm_contacts set merged_into_contact_id=(select contact_id from public.crm_leads where id=(select id from fx where k='alias_target'))
 where id=(select contact_id from public.crm_leads where id=(select id from fx where k='missing_lead'));
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='alias_target'),(select id from fx where k='connection'))='sharing_stopped'
 and exists(select 1 from public.crm_lifecycle_stop_carries),'verified merge carries broad stop before identity commit');
select pg_temp.denied(format('update public.crm_contacts set merged_into_contact_id=%L where id=%L',
 (select contact_id from public.crm_leads where id=(select id from fx where k='missing_lead')),(select contact_id from public.crm_leads where id=(select id from fx where k='alias_target'))),'22023');
-- Distinct native destination is affected by broad contact, not opportunity stop.
select pg_temp.actor(1);insert into fx values('connection2',(public.crm_save_meta_connection('{"connection_key":"r4-second","page_id":"882101","api_version":"v99.0"}')->>'id')::uuid);
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='alias_target'),(select id from fx where k='connection2'))='sharing_stopped','broad request covers a different actual Meta destination');
select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity',(select id from fx where k='ambiguous_lead'),(select id from fx where k='connection'),'inquiry_refusal');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='ambiguous_lead'),(select id from fx where k='connection2')) is null,'inquiry refusal is exact-destination only');
select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'contact',(select contact_id from public.crm_leads where id=(select id from fx where k='ambiguous_lead')),(select id from fx where k='connection'),'privacy_request',null,'verified-limited-001');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='ambiguous_lead'),(select id from fx where k='connection2')) is null,'explicitly destination-limited contact request is not broadened');
select pg_temp.actor(0);insert into fx values('opp_alias_target',pg_temp.intake('884012'));
update public.crm_leads set merged_into_lead_id=(select id from fx where k='opp_alias_target') where id=(select id from fx where k='ambiguous_lead');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='opp_alias_target'),(select id from fx where k='connection'))='sharing_stopped'
 and exists(select 1 from public.crm_lifecycle_stop_carries cc join public.crm_lifecycle_sharing_stops final on final.id=cc.final_stop_id where final.lead_id=(select id from fx where k='opp_alias_target')),'opportunity stop carries to verified canonical lead successor');
select pg_temp.ok(crm_security.lifecycle_route((select id from fx where k='ambiguous_lead'))->>'reason'='scope_excluded','merged original native owner cannot send as an obsolete canonical opportunity');
-- Later inbound Meta source on another connection can object to the verified
-- original outbound opportunity; original acquisition is never substituted.
select pg_temp.actor(1);insert into fx values('mapping2',(public.crm_publish_meta_form_mapping((select id from fx where k='connection2'),'{"form_key":"884102","field_map":{},"effective_from":"2020-01-01Z"}')->>'id')::uuid);
select pg_temp.actor(0);insert into fx values('cross_pending',pg_temp.source('884013'));
set local session_replication_role=replica;
update public.crm_submissions set form_mapping_id=(select id from fx where k='mapping2') where id=(select id from fx where k='cross_pending');
update public.crm_submission_attribution set page_id='882101',form_id='884102' where submission_id=(select id from fx where k='cross_pending');
set local session_replication_role=origin;
select pg_temp.actor(1);select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending',(select id from fx where k='cross_pending'),(select id from fx where k='connection'),'inquiry_refusal');
select pg_temp.actor(0);select crm_security.accept_external_submission((select id from fx where k='cross_pending'),null,(select id from fx where k='truth_lead'));
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='truth_lead'),(select id from fx where k='connection'))='sharing_stopped'
 and (select a.external_submission_id='884005' from public.crm_leads l join public.crm_submission_attribution a on a.submission_id=l.first_submission_id where l.id=(select id from fx where k='truth_lead')),'pending later-connection objection binds verified scope and preserves original provider identity');
-- Bound audit clocks and minimal markers survive proof and diagnostic erasure.
select pg_temp.actor(0);
set local session_replication_role=replica;
update public.crm_lifecycle_eligibility_checks set checked_at=now()-interval '91 days';
update public.crm_lifecycle_eligibility_evidence set recorded_at=now()-interval '101 days',effective_at=now()-interval '91 days';
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_retention(100);
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='truth_lead'),(select id from fx where k='connection'))='sharing_stopped','proof cleanup cannot release stop');
select pg_temp.ok((select bool_and(redacted_at is not null and source_external_id is null and source_projection is null) from public.crm_lifecycle_eligibility_evidence),'optional grant/revoke details actually erased while stop survives');
-- Advisory exclusion is first-source only; delayed pre-cutoff import remains old.
insert into fx values('precutoff',pg_temp.intake('884020',false,(select started_at from public.crm_lifecycle_activation_epochs where id=(select id from fx where k='epoch'))-interval '1 day'));
insert into fx values('boundaryend',pg_temp.intake('884021',false,(select valid_until from public.crm_lifecycle_producer_boundaries where id='8c000000-0000-0000-0000-000000000012')));
select public.crm_reconcile_external_deliveries(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_producer_ownership where lead_id in(select id from fx where k in ('precutoff','boundaryend'))),'advisory does not backfill delayed pre-cutoff or out-of-boundary imports');
-- Other roles and direct API table access remain closed, including service role.
insert into auth.users(id,email,aud,role) values('8c000000-0000-0000-0000-000000000003','advisory-admin@example.invalid','authenticated','authenticated');
update public.profiles set role='admin' where id='8c000000-0000-0000-0000-000000000003';
select pg_temp.actor(3);select pg_temp.denied('select public.crm_lifecycle_diagnostics()');
select pg_temp.denied(format('select public.crm_bind_pending_lifecycle_stop(gen_random_uuid(),%L,%L,null,''verified-review-001'')',(select id from fx where k='broad_stop'),(select contact_id from public.crm_leads where id=(select id from fx where k='alias_target'))));
do $$declare other_role text;begin
 for other_role in select unnest(array['admin','receptionist','teacher','parent','student']) loop
  update public.profiles set role=other_role where id='8c000000-0000-0000-0000-000000000003';
  perform pg_temp.denied('select public.crm_lifecycle_diagnostics()');
  perform pg_temp.denied(format('select public.crm_stop_lifecycle_sharing(gen_random_uuid(),''opportunity'',%L,%L,''privacy_request'')',(select id from fx where k='truth_lead'),(select id from fx where k='connection')));
  perform pg_temp.denied(format('select public.crm_publish_lifecycle_policy(%L,1,''{}'')',(select id from fx where k='connection')));
 end loop;
end $$;
do $$declare t text;r text;begin
 for t in select unnest(array['crm_lifecycle_sharing_stops','crm_lifecycle_sharing_stop_audit','crm_lifecycle_stop_handoffs','crm_lifecycle_stop_carries','crm_lifecycle_identity_links','crm_lifecycle_pending_intents','crm_lifecycle_stop_exclusions']) loop
  for r in select unnest(array['anon','authenticated','service_role']) loop
   perform pg_temp.ok(not has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'closed direct role matrix '||r||'/'||t);
  end loop;
 end loop;
end $$;
rollback;
\echo PASS advisory missing/ambiguous proof, typed safety facts, broad pending review, identity continuity, cleanup, exclusions and ACL matrix
