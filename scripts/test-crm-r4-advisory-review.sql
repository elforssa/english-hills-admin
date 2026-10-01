-- Independent-review regressions. Local synthetic sources; every write rolls back.
\set ON_ERROR_STOP on
\ir test-crm-r4-advisory-setup.sql
set local session_replication_role=replica;
update public.crm_lifecycle_eligibility_policies set sharing_field_key='meta_share',sharing_accepted_values='["yes",true]',sharing_refused_values='[false]',
 prohibited_field_key='source_safety',prohibited_values='[7]',safety_decision_reference='review-safety-001'
 where id='8c000000-0000-0000-0000-000000000011';
set local session_replication_role=origin;
create function pg_temp.prepared(l uuid) returns jsonb language plpgsql as $$
declare d public.crm_external_deliveries;lease uuid;begin
 perform public.crm_reconcile_external_deliveries(100);perform public.crm_reconcile_external_deliveries(100);
 select * into strict d from public.crm_external_deliveries where lead_id=l and event_kind='intake';
 update public.crm_external_deliveries set next_attempt_at=now()+interval '1 day' where status in ('pending','retry','blocked') and attempt_boundary_state='not_started';
 update public.crm_external_deliveries set next_attempt_at=now() where id=d.id;
 select x.lease_token into strict lease from jsonb_to_recordset(public.crm_claim_external_deliveries(1,true)) x(id uuid,lease_token uuid) where x.id=d.id;
 perform public.crm_prepare_external_delivery(d.id,lease,pg_temp.payload(d));
 return jsonb_build_object('id',d.id,'lease',lease);
end $$;
select pg_temp.actor(0);
insert into fx values('later_refusal_lead',pg_temp.intake('893001')),('later_restricted_lead',pg_temp.intake('893002')),('typed_control_lead',pg_temp.intake('893003'));
create temp table original as select l.id,l.first_submission_id,to_jsonb(a) attribution,o.id ownership_id
 from public.crm_leads l join public.crm_submission_attribution a on a.submission_id=l.first_submission_id
 left join public.crm_lifecycle_producer_ownership o on o.lead_id=l.id where l.id in(select id from fx where k like 'later_%lead' or k='typed_control_lead');
create temp table prepared(k text primary key,data jsonb);
insert into prepared values('refusal',pg_temp.prepared((select id from fx where k='later_refusal_lead')));
update original set ownership_id=o.id from public.crm_lifecycle_producer_ownership o where o.lead_id=original.id;
insert into fx values('later_refusal',pg_temp.source('893004',false,now()-interval '500 milliseconds'));
set local session_replication_role=replica;
update public.crm_submissions set form_answers='[{"key":"meta_share","label":"Share","value":false,"value_type":"boolean","label_source":"provider"}]' where id=(select id from fx where k='later_refusal');
set local session_replication_role=origin;
-- Automatic/trusted accept and manual command both enter the same mandatory handoff.
select crm_security.accept_external_submission((select id from fx where k='later_refusal'),null,(select id from fx where k='later_refusal_lead'));
select pg_temp.ok((select count(*)=1 from public.crm_lifecycle_sharing_stops where lead_id=(select id from fx where k='later_refusal_lead') and reason_class='inquiry_refusal'),'later typed refusal commits stop before optional evidence collection');
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_eligibility_checks),'optional collection has not run');
select public.crm_reconcile_external_deliveries(100);
select pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',data->>'id',data->>'lease','{}'),'42501') from prepared where k='refusal';
select pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',data->>'id',data->>'lease'),'42501') from prepared where k='refusal';
select pg_temp.ok(not exists(select 1 from public.crm_external_delivery_attempts),'prepared lease provides no authority after later refusal');
-- More than the optional scheduler's 25 candidates precede the later restriction.
select pg_temp.intake('8931'||n::text,false,now()-interval '30 seconds') from generate_series(1,30) n;
insert into prepared values('restricted',pg_temp.prepared((select id from fx where k='later_restricted_lead')));
insert into fx values('later_restricted',pg_temp.source('893005',false,now()-interval '500 milliseconds'));
set local session_replication_role=replica;
update public.crm_submissions set form_answers='[{"key":"source_safety","label":"Safety","value":7,"value_type":"number","label_source":"provider"}]' where id=(select id from fx where k='later_restricted');
set local session_replication_role=origin;
select pg_temp.actor(1);
select crm_security.command('resolve_submission',gen_random_uuid(),jsonb_build_object('submission_id',(select id from fx where k='later_restricted'),
 'lead_id',(select id from fx where k='later_restricted_lead'),'expected_version',(select version from public.crm_leads where id=(select id from fx where k='later_restricted_lead'))));
select pg_temp.actor(0);
create temp table collected as select public.crm_claim_lifecycle_evidence(25,'advisory') data;
select pg_temp.ok((select jsonb_array_length(data)=25 and not exists(select 1 from jsonb_array_elements(data) x where (x->>'submission_id')::uuid=(select id from fx where k='later_restricted')) from collected),'later restriction lies beyond the optional batch limit');
select pg_temp.ok((select count(*)=1 from public.crm_lifecycle_sharing_stops where lead_id=(select id from fx where k='later_restricted_lead') and reason_class='source_restriction'),'typed later restriction does not wait for its optional batch');
select pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',data->>'id',data->>'lease'),'42501') from prepared where k='restricted';
select pg_temp.ok(not exists(select 1 from public.crm_external_delivery_attempts),'uncollected later restriction creates no attempt');
-- String values do not impersonate reviewed boolean/numeric restrictions.
insert into fx values('typed_control',pg_temp.source('893006'));
set local session_replication_role=replica;
update public.crm_submissions set form_answers='[{"key":"meta_share","label":"Share","value":"false","value_type":"string","label_source":"provider"},{"key":"source_safety","label":"Safety","value":"7","value_type":"string","label_source":"provider"}]' where id=(select id from fx where k='typed_control');
set local session_replication_role=origin;
select crm_security.accept_external_submission((select id from fx where k='typed_control'),null,(select id from fx where k='typed_control_lead'));
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_sharing_stops where lead_id=(select id from fx where k='typed_control_lead')),'typed mismatch/missing optional proof does not invent a safety stop');
insert into prepared values('control',pg_temp.prepared((select id from fx where k='typed_control_lead')));
select public.crm_begin_external_attempt((data->>'id')::uuid,(data->>'lease')::uuid) from prepared where k='control';
select public.crm_finish_external_attempt((data->>'id')::uuid,(data->>'lease')::uuid,'{"outcome":"unknown","error_code":"timeout"}') from prepared where k='control';
select pg_temp.ok(not exists(select 1 from original old join public.crm_leads l on l.id=old.id join public.crm_submission_attribution a on a.submission_id=l.first_submission_id
 where l.first_submission_id<>old.first_submission_id or to_jsonb(a)<>old.attribution),'later safety handoff preserves first acquisition and original lossless Meta ID');
select pg_temp.ok(not exists(select 1 from original old join public.crm_lifecycle_producer_ownership o on o.lead_id=old.id where old.ownership_id is not null and old.ownership_id<>o.id),'later objection never transfers immutable ownership');
-- Failure of mandatory stop storage aborts trusted binding, not just proof work.
insert into fx values('storage_failure_lead',pg_temp.intake('893009')),('storage_failure_source',pg_temp.source('893010'));
set local session_replication_role=replica;
update public.crm_submissions set form_answers='[{"key":"meta_share","label":"Share","value":false,"value_type":"boolean","label_source":"provider"}]' where id=(select id from fx where k='storage_failure_source');
set local session_replication_role=origin;
create function pg_temp.fail_stop_storage() returns trigger language plpgsql as $$ begin raise exception 'Synthetic mandatory stop storage failure' using errcode='55000';end $$;
create trigger synthetic_stop_storage_failure before insert on public.crm_lifecycle_sharing_stops for each row execute function pg_temp.fail_stop_storage();
select pg_temp.denied(format('select crm_security.accept_external_submission(%L,null,%L)',(select id from fx where k='storage_failure_source'),(select id from fx where k='storage_failure_lead')),'55000');
select pg_temp.ok((select lead_id is null and match_status='needs_review' from public.crm_submissions where id=(select id from fx where k='storage_failure_source')),'mandatory safety storage failure rolls back source binding');
drop trigger synthetic_stop_storage_failure on public.crm_lifecycle_sharing_stops;
-- Excluded acquisition does not close an unresolved objection to another scope.
select pg_temp.actor(1);
insert into fx values('yearly_mapping',(public.crm_publish_meta_form_mapping((select id from fx where k='connection'),'{"form_key":"1086266294126723","field_map":{},"effective_from":"2020-01-01Z"}')->>'id')::uuid);
select pg_temp.actor(0);
insert into fx values('excluded_broad',pg_temp.source('893007')),('excluded_opportunity',pg_temp.source('893008'));
set local session_replication_role=replica;
update public.crm_submissions set form_mapping_id=(select id from fx where k='yearly_mapping') where id in(select id from fx where k in('excluded_broad','excluded_opportunity'));
update public.crm_submission_attribution set form_id='1086266294126723' where submission_id in(select id from fx where k in('excluded_broad','excluded_opportunity'));
set local session_replication_role=origin;
select pg_temp.actor(1);
insert into fx values('excluded_broad_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending',(select id from fx where k='excluded_broad'),(select id from fx where k='connection'),'privacy_request',null,null,true)),
 ('excluded_opportunity_stop',public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending',(select id from fx where k='excluded_opportunity'),(select id from fx where k='connection'),'inquiry_refusal'));
select pg_temp.actor(0);
set local session_replication_role=replica;
update public.crm_lifecycle_sharing_stops set effective_at=now()-interval '91 days' where id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop'));
update public.crm_lifecycle_sharing_stop_audit set recorded_at=now()-interval '91 days' where stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop'));
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop'))),'excluded objections have no handoff yet');
select pg_temp.ok(not exists(select 1 from public.crm_lifecycle_stop_exclusions where stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop'))),'pending exclusion alone cannot certify impossible handoff');
select pg_temp.ok((select count(*)=2 from public.crm_lifecycle_sharing_stop_audit where stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop')) and closed_at is null and closure_basis is null and redacted_at is null),'old excluded pending audits remain open until actual handoff');
select pg_temp.denied(format('update public.crm_lifecycle_sharing_stop_audit set closed_at=now()-interval ''91 days'',closure_basis=''verified_handoff'' where stop_id=%L',(select id from fx where k='excluded_broad_stop')),'42501');
select pg_temp.actor(1);
select pg_temp.ok((public.crm_list_pending_lifecycle_stops(1,0)->>'total')::int=2 and jsonb_array_length(public.crm_list_pending_lifecycle_stops(1,1)->'rows')=1,'director deferred retrieval is bounded and paginated');
select pg_temp.ok(not(public.crm_list_pending_lifecycle_stops()::text ~ 'decision_reference|actor_id|form_answers|source_external_id'),'pending retrieval exposes only structural scope identifiers');
insert into fx values('excluded_final',public.crm_bind_pending_lifecycle_stop(gen_random_uuid(),(select id from fx where k='excluded_broad_stop'),
 (select contact_id from public.crm_leads where id=(select id from fx where k='typed_control_lead')),null,'review-bind-after-retention'));
select pg_temp.actor(0);
select crm_security.accept_external_submission((select id from fx where k='excluded_broad'),null,(select id from fx where k='typed_control_lead'));
select crm_security.accept_external_submission((select id from fx where k='excluded_opportunity'),null,(select id from fx where k='later_restricted_lead'));
select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select count(*)=2 from public.crm_lifecycle_sharing_stop_audit where stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop')) and closed_at is not null and closure_basis='verified_handoff' and redacted_at is null),'actual committed handoff supplies the truthful closure basis and fresh retention clock');
select pg_temp.ok(crm_security.lifecycle_stop_hold((select id from fx where k='typed_control_lead'),(select id from fx where k='connection'))='sharing_stopped','excluded-source broad objection binds to eligible opportunity/contact after aged cleanup');
set local session_replication_role=replica;
update public.crm_lifecycle_stop_handoffs set committed_at=now()-interval '91 days' where pending_stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop'));
update public.crm_lifecycle_sharing_stop_audit set closed_at=now()-interval '91 days' where stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop'));
set local session_replication_role=origin;
select public.crm_cleanup_lifecycle_stop_audit(100);
select pg_temp.ok((select count(*)=2 from public.crm_lifecycle_sharing_stop_audit where stop_id in(select id from fx where k in('excluded_broad_stop','excluded_opportunity_stop')) and redacted_at is not null),'pending detail erases only after actual handoff deadline');
select pg_temp.actor(1);
select pg_temp.ok(public.crm_bind_pending_lifecycle_stop(gen_random_uuid(),(select id from fx where k='excluded_broad_stop'),(select contact_id from public.crm_leads where id=(select id from fx where k='typed_control_lead')),null,'review-bind-after-retention')=(select id from fx where k='excluded_final'),'exact binding retry survives audit erasure via opaque handoff');
select pg_temp.ok((public.crm_list_pending_lifecycle_stops()->>'total')::int=0,'bound pending stops leave the deferred review list');
select pg_temp.denied('select public.crm_list_pending_lifecycle_stops(101,0)','22023');
select pg_temp.denied('select public.crm_list_pending_lifecycle_stops(25,-1)','22023');
select pg_temp.actor(2);
do $$declare other_role text;begin
 for other_role in select unnest(array['admin','receptionist','teacher','parent','student']) loop
  update public.profiles set role=other_role where id='8c000000-0000-0000-0000-000000000002';
  perform pg_temp.denied('select public.crm_list_pending_lifecycle_stops()','42501');
 end loop;
end $$;
select pg_temp.ok(not has_function_privilege('anon','public.crm_list_pending_lifecycle_stops(integer,integer)','execute') and not has_function_privilege('service_role','public.crm_list_pending_lifecycle_stops(integer,integer)','execute'),'pending retrieval denies anonymous and service-role API execution');
rollback;
\echo PASS review regressions: mandatory later typed safety, batch delay, excluded pending retention/handoff and authorized retrieval
